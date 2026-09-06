import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateConversation, isSharingEnabled } from '@/lib/tree-connections';

/**
 * Messages between two researchers who share people.
 *
 * Both parties must still have sharing on. Switching it off ends the ability to
 * be contacted, not just the ability to be found — otherwise opting out would
 * leave an open channel behind.
 */

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversationId = new URL(request.url).searchParams.get('conversation');
  const admin = createAdminClient();

  if (!conversationId) {
    const { data } = await admin
      .from('tree_conversations')
      .select('id, user_a, user_b, about_name, last_message_at')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false })
      .limit(50);

    const conversations = await Promise.all(
      (data ?? []).map(async (c) => {
        const otherId = c.user_a === user.id ? c.user_b : c.user_a;
        const { data: other } = await admin
          .from('profiles')
          .select('handle, display_name, avatar_url')
          .eq('id', otherId)
          .maybeSingle();
        const { count } = await admin
          .from('tree_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .is('read_at', null)
          .neq('sender_id', user.id);
        return {
          id: c.id,
          aboutName: c.about_name,
          lastMessageAt: c.last_message_at,
          unread: count ?? 0,
          other: {
            id: otherId,
            handle: other?.handle ?? null,
            displayName: other?.display_name || other?.handle || 'A researcher',
            avatarUrl: other?.avatar_url ?? null,
          },
        };
      }),
    );

    return NextResponse.json({ conversations });
  }

  const { data: conversation } = await admin
    .from('tree_conversations')
    .select('id, user_a, user_b, about_name')
    .eq('id', conversationId)
    .maybeSingle();

  if (
    !conversation ||
    (conversation.user_a !== user.id && conversation.user_b !== user.id)
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: messages } = await admin
    .from('tree_messages')
    .select('id, sender_id, body, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at');

  // Opening the thread is what marks it read.
  await admin
    .from('tree_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id)
    .is('read_at', null);

  return NextResponse.json({ conversation, messages: messages ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (!text) return NextResponse.json({ error: 'Write a message first' }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: 'That message is too long' }, { status: 400 });
  }

  const admin = createAdminClient();
  let conversationId: string | undefined = body.conversationId;

  if (!conversationId) {
    if (!body.toUserId) {
      return NextResponse.json({ error: 'No recipient' }, { status: 400 });
    }
    // Contact is a consequence of both trees being visible, so it is gated on
    // the same condition as discovery.
    const [mine, theirs] = await Promise.all([
      isSharingEnabled(user.id),
      isSharingEnabled(body.toUserId),
    ]);
    if (!mine || !theirs) {
      return NextResponse.json(
        { error: 'Both researchers need tree sharing switched on.' },
        { status: 403 },
      );
    }

    const conversation = await getOrCreateConversation(user.id, body.toUserId, {
      individualId: body.aboutIndividualId,
      name: body.aboutName,
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Could not start that conversation' }, { status: 500 });
    }
    conversationId = conversation.id;
  } else {
    const { data: conversation } = await admin
      .from('tree_conversations')
      .select('user_a, user_b')
      .eq('id', conversationId)
      .maybeSingle();
    if (
      !conversation ||
      (conversation.user_a !== user.id && conversation.user_b !== user.id)
    ) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const { data: message, error } = await admin
    .from('tree_messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: text })
    .select('id, sender_id, body, created_at')
    .single();

  if (error) {
    console.error('[tree-connections] could not send message:', error);
    return NextResponse.json({ error: 'Could not send' }, { status: 500 });
  }

  // Drives ordering of the conversation list.
  await admin
    .from('tree_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return NextResponse.json({ conversationId, message });
}
