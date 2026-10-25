import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAnthropic, toAiError } from '@/lib/ai/client';
import type { AccountLevel, Allowance, Reservation } from '@/lib/ai/limits';
import { ASSISTANT_MODEL, addUsage, EMPTY_USAGE, type TokenUsage } from '@/lib/ai/models';
import { failUsage, finishUsage } from '@/lib/ai/usage';
import type { Profile } from '@/lib/types';
import { closeTurn, plainText } from './history';
import { ASSISTANT_INSTRUCTIONS, viewerNote } from './system-prompt';
import { ASSISTANT_TOOLS, collectionsLoader, runAssistantTool } from './tools';
import type { AllowanceView, ChatEvent, ChatPart, StoredParts } from './types';

// Server-only: one assistant answer, from the question to the saved reply.

/** Claude calls per question. The last one has to answer in words. */
const MAX_STEPS = 6;

const view = (a: Allowance): AllowanceView => ({ level: a.level, caps: a.caps, usedToday: a.usedToday, usedMonth: a.usedMonth });

export interface TurnInput {
  admin: SupabaseClient;
  /** The user's own client (their bookmarks and activity). */
  userClient: SupabaseClient;
  userId: string;
  profile: Pick<Profile, 'first_name' | 'email'> | null;
  level: AccountLevel;
  threadId: string;
  /** The question. Already saved as the thread's latest user message. */
  text: string;
  /** Earlier turns in the thread, as Messages API history. */
  history: Anthropic.MessageParam[];
  /** The cap slot this answer was given (see reserveAssistantMessage). */
  reservation: Extract<Reservation, { allowed: true }>;
  /** The id the saved answer gets. */
  messageId: string;
  /** Aborts when the user leaves or presses stop. */
  signal?: AbortSignal;
  send: (event: ChatEvent) => void;
}

/**
 * Answers one question: streams Claude's reply through send(), runs the tools
 * it asks for (up to MAX_STEPS calls), logs the real cost against the
 * reserved slot, and saves the answer to the thread.
 */
export async function runAssistantTurn({
  admin,
  userClient,
  userId,
  profile,
  level,
  threadId,
  text,
  history,
  reservation,
  messageId,
  signal,
  send,
}: TurnInput): Promise<void> {
  const { usageId } = reservation;
  const system: Anthropic.TextBlockParam[] = [
    // Cached: the same for every user and turn.
    { type: 'text', text: ASSISTANT_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: viewerNote(profile, level) },
  ];
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: text }];
  let turn: Anthropic.MessageParam[] = [];
  const ui: ChatPart[] = [];
  let usage: TokenUsage = EMPTY_USAGE;
  let steps = 0;
  const ctx = {
    admin,
    userClient,
    userId,
    // Admins see every collection, like members.
    viewer: { signedIn: true, member: level !== 'free' },
  };
  const collections = collectionsLoader(admin);
  let failure: string | null = null;

  send({ type: 'start', messageId });
  try {
    for (; steps < MAX_STEPS; ) {
      const last = steps === MAX_STEPS - 1;
      steps++;
      const call = getAnthropic().messages.stream(
        {
          model: ASSISTANT_MODEL,
          max_tokens: 16_000,
          system,
          tools: ASSISTANT_TOOLS,
          messages,
          // Conversational lookups: medium effort answers well and costs less.
          output_config: { effort: 'medium' },
          // Caches the whole prefix, so each tool step re-reads it cheaply.
          cache_control: { type: 'ephemeral' },
          ...(last && { tool_choice: { type: 'none' as const } }),
        },
        { signal },
      );

      let textPart: Extract<ChatPart, { type: 'text' }> | null = null;
      call.on('text', (delta) => {
        if (!textPart) {
          textPart = { type: 'text', text: '' };
          ui.push(textPart);
        }
        textPart.text += delta;
        send({ type: 'text', text: delta });
      });

      const message = await call.finalMessage();
      usage = addUsage(usage, message.usage);
      const said: Anthropic.MessageParam = { role: 'assistant', content: message.content };
      messages.push(said);
      turn.push(said);

      if (message.stop_reason === 'refusal') {
        const note = "I can't help with that one.";
        ui.push({ type: 'text', text: note });
        send({ type: 'text', text: note });
        break;
      }
      if (message.stop_reason !== 'tool_use') break;

      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const parts = new Map<string, Extract<ChatPart, { type: 'tool' }>>();
      for (const c of calls) {
        const part: Extract<ChatPart, { type: 'tool' }> = { type: 'tool', id: c.id, name: c.name, input: c.input, state: 'running' };
        parts.set(c.id, part);
        ui.push(part);
        send({ type: 'tool-start', id: c.id, name: c.name, input: c.input });
      }
      const results = await Promise.all(
        calls.map(async (c): Promise<Anthropic.ToolResultBlockParam> => {
          const { output, error } = await runAssistantTool(c.name, c.input, ctx, collections);
          const part = parts.get(c.id)!;
          part.state = error ? 'error' : 'done';
          part.output = output;
          send({ type: 'tool-end', id: c.id, output, error });
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(output), is_error: error };
        }),
      );
      const answered: Anthropic.MessageParam = { role: 'user', content: results };
      messages.push(answered);
      turn.push(answered);
    }
  } catch (err) {
    failure = signal?.aborted ? 'stopped' : toAiError(err, 'assistant').message;
  }

  // Log what it cost. A message that produced nothing doesn't count against the user.
  const answered = plainText(ui).length > 0;
  const meta = { thread_id: threadId, steps, tools: ui.filter((p) => p.type === 'tool').length };
  if (failure && !answered) await failUsage(admin, usageId, { model: ASSISTANT_MODEL, usage, error: failure });
  else await finishUsage(admin, usageId, { model: ASSISTANT_MODEL, usage, meta });

  if (ui.length > 0) {
    turn = closeTurn(turn);
    const parts: StoredParts = { v: 2, ui, api: turn };
    await admin.from('assistant_messages').insert({ id: messageId, thread_id: threadId, role: 'assistant', content: plainText(ui), parts });
  }
  await admin.from('assistant_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);

  if (failure && failure !== 'stopped') {
    send({ type: 'error', message: answered ? `The answer was cut short: ${failure}` : failure });
  }
  const counted = !(failure && !answered);
  send({
    type: 'done',
    allowance: view({
      ...reservation,
      usedToday: reservation.usedToday - (counted ? 0 : 1),
      usedMonth: reservation.usedMonth - (counted ? 0 : 1),
    }),
  });
}
