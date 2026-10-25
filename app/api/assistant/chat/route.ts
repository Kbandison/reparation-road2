import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingSchema, MIGRATION_NEEDED } from '@/lib/ai/client';
import { accountLevel, reserveAssistantMessage, type Allowance, type CapReason } from '@/lib/ai/limits';
import { toApiHistory, type StoredMessage } from '@/lib/assistant/history';
import { runAssistantTurn } from '@/lib/assistant/turn';
import type { AllowanceView, CapRefusal, ChatEvent, StoredParts } from '@/lib/assistant/types';
import type { Profile } from '@/lib/types';

// A question can take several tool steps, each a streamed Claude call (lib/assistant/turn.ts).
export const maxDuration = 300;

const MAX_QUESTION = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const view = (a: Allowance): AllowanceView => ({ level: a.level, caps: a.caps, usedToday: a.usedToday, usedMonth: a.usedMonth });

function capMessage(reason: CapReason, a: Allowance): string {
  if (reason === 'budget') return "The assistant is resting until the 1st: this month's AI budget is spent.";
  const free = a.level === 'free';
  if (reason === 'day') {
    return `You've used today's ${a.caps?.day} questions. More tomorrow${free ? ', or become a member for 40 a day' : ''}.`;
  }
  return `You've used this month's ${a.caps?.month} questions. They reset on the 1st${free ? ', or become a member for 400 a month' : ''}.`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to use the assistant' }, { status: 401 });

  let body: { threadId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body' }, { status: 400 });
  }
  const threadId = String(body.threadId ?? '');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!UUID.test(threadId) || !text) return NextResponse.json({ error: 'threadId and text are required' }, { status: 400 });
  if (text.length > MAX_QUESTION) return NextResponse.json({ error: `Questions can be up to ${MAX_QUESTION} characters` }, { status: 400 });

  const admin = createAdminClient();
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('role, subscription_status, first_name, email')
    .eq('id', user.id)
    .single();
  const profile = profileRow as Pick<Profile, 'role' | 'subscription_status' | 'first_name' | 'email'> | null;
  const level = accountLevel(profile);

  const { data: thread } = await admin.from('assistant_threads').select('id, user_id').eq('id', threadId).maybeSingle();
  if (thread && thread.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Claim this message against the user's caps before any work is done.
  let reservation;
  try {
    reservation = await reserveAssistantMessage(admin, user.id, level);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (isMissingSchema(message)) return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 });
    console.error('[assistant] reserve failed', message);
    return NextResponse.json({ error: 'The assistant is unavailable right now.' }, { status: 503 });
  }
  if (!reservation.allowed) {
    const refusal: CapRefusal = { error: capMessage(reservation.reason, reservation), reason: reservation.reason, allowance: view(reservation) };
    return NextResponse.json(refusal, { status: 429 });
  }
  if (!thread) {
    await admin.from('assistant_threads').insert({ id: threadId, user_id: user.id, title: text.length > 60 ? `${text.slice(0, 57)}…` : text });
  }
  const { data: prior } = await admin
    .from('assistant_messages')
    .select('id, role, content, parts')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  const history = toApiHistory((prior ?? []) as StoredMessage[]);

  const userParts: StoredParts = { v: 2, ui: [{ type: 'text', text }] };
  await admin.from('assistant_messages').insert({ thread_id: threadId, role: 'user', content: text, parts: userParts });

  const encoder = new TextEncoder();
  const messageId = randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the reader went away
        }
      };
      await runAssistantTurn({
        admin,
        userClient: supabase,
        userId: user.id,
        profile,
        level,
        threadId,
        text,
        history,
        reservation,
        messageId,
        signal: request.signal,
        send,
      });
      open = false;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
