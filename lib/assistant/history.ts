import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatPart, StoredParts } from './types';

/** A row of assistant_messages. */
export interface StoredMessage {
  id: string;
  role: string;
  content: string | null;
  parts: unknown;
}

/** Turns from earlier in a thread that are sent back to Claude, newest last. Older ones are left out to bound cost. */
const HISTORY_MESSAGES = 30;

const isStoredParts = (parts: unknown): parts is StoredParts =>
  !!parts && typeof parts === 'object' && !Array.isArray(parts) && (parts as { v?: unknown }).v === 2;

/**
 * A stored message as the chat shows it. Messages from the first version of
 * the assistant (May 2026 tests, AI SDK format) show as their plain text.
 */
export function toChatMessage(row: StoredMessage): ChatMessage {
  const role = row.role === 'user' ? 'user' : 'assistant';
  const parts: ChatPart[] = isStoredParts(row.parts) ? row.parts.ui : [{ type: 'text', text: row.content ?? '' }];
  return { id: row.id, role, parts };
}

/**
 * Earlier turns as Messages API history. An assistant message replays the
 * exact content blocks it produced (text, thinking, tool calls and their
 * results), so Claude sees what it actually did; anything older or from the
 * first version replays as plain text.
 */
export function toApiHistory(rows: StoredMessage[]): Anthropic.MessageParam[] {
  let recent = rows.slice(-HISTORY_MESSAGES);
  // History must open on a user turn.
  const firstUser = recent.findIndex((r) => r.role === 'user');
  recent = firstUser === -1 ? [] : recent.slice(firstUser);

  const out: Anthropic.MessageParam[] = [];
  for (const row of recent) {
    if (row.role === 'user') {
      const text = row.content?.trim();
      if (text) out.push({ role: 'user', content: text });
      continue;
    }
    const api = isStoredParts(row.parts) ? row.parts.api : undefined;
    if (Array.isArray(api) && api.length) {
      out.push(...(api as Anthropic.MessageParam[]));
    } else if (row.content?.trim()) {
      out.push({ role: 'assistant', content: row.content.trim() });
    }
  }
  return out;
}

/**
 * Closes off a turn that stopped mid-tool (the user left, or something
 * failed): a tool call with no result would make every later request in the
 * thread invalid, so each one gets an "interrupted" result.
 */
export function closeTurn(turn: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = turn[turn.length - 1];
  if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return turn;
  const pending = last.content.filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use');
  if (pending.length === 0) return turn;
  return [
    ...turn,
    {
      role: 'user',
      content: pending.map((call) => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: 'Interrupted before this ran.',
        is_error: true,
      })),
    },
  ];
}

/** The plain text of a message, for assistant_messages.content and thread titles. */
export function plainText(parts: ChatPart[]): string {
  return parts
    .filter((p): p is Extract<ChatPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n')
    .trim();
}
