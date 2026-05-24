import { NextResponse } from 'next/server';
import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from '@/lib/assistant/system-prompt';
import type { Profile } from '@/lib/types';

// Allow up to ~60s for a streamed response to complete.
export const maxDuration = 60;

type TextPart = { type: 'text'; text: string };

function extractText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

function deriveTitle(message: UIMessage): string {
  const text = extractText(message);
  if (!text) return 'New conversation';
  return text.length > 60 ? text.slice(0, 57) + '…' : text;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    message?: UIMessage;
    id?: string;
  };
  const { message, id: threadId } = body;
  if (!message || !threadId) {
    return NextResponse.json(
      { error: 'message and id are required' },
      { status: 400 },
    );
  }

  // Admin client for the persistence work — RLS-bypassed but we verify
  // ownership manually so users can never write across threads.
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('assistant_threads')
    .select('id, user_id, title')
    .eq('id', threadId)
    .maybeSingle();

  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!existing) {
    const { error: createErr } = await admin
      .from('assistant_threads')
      .insert({
        id: threadId,
        user_id: user.id,
        title: deriveTitle(message),
      });
    if (createErr) {
      console.error('[assistant] create thread failed', createErr);
      return NextResponse.json(
        { error: 'Failed to create thread' },
        { status: 500 },
      );
    }
  }

  // Load prior turns so the model has the full conversation, even though the
  // client only sent the newest message (`prepareSendMessagesRequest` pattern).
  const { data: prior } = await admin
    .from('assistant_messages')
    .select('id, role, content, parts, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const priorMessages: UIMessage[] = (prior ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as UIMessage['role'],
    parts:
      (m.parts as UIMessage['parts']) ?? [
        { type: 'text', text: (m.content as string) ?? '' },
      ],
  }));

  const conversation: UIMessage[] = [...priorMessages, message];

  // Profile for the system prompt (name + tier personalization).
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const profile = profileData as Profile | null;

  // Persist the user's new message before streaming so we don't lose it if the
  // model call fails mid-flight.
  await admin.from('assistant_messages').insert({
    thread_id: threadId,
    role: message.role,
    content: extractText(message),
    parts: message.parts,
  });

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: buildSystemPrompt({ profile }),
    messages: await convertToModelMessages(conversation),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: conversation,
    onFinish: async ({ messages: outMessages }) => {
      // Persist whatever the model added on this turn (typically one assistant
      // message; with tools later this could be a tool-call sequence).
      const added = outMessages.slice(conversation.length);
      for (const m of added) {
        try {
          await admin.from('assistant_messages').insert({
            thread_id: threadId,
            role: m.role,
            content: extractText(m),
            parts: m.parts,
          });
        } catch (err) {
          console.error('[assistant] save assistant msg failed', err);
        }
      }
    },
  });
}
