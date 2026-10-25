/**
 * The assistant's chat shapes, shared by /api/assistant/* and the chat UI.
 * Safe to import from client components.
 */

/** One piece of a message as the chat shows it. */
export type ChatPart =
  | { type: 'text'; text: string }
  | {
      type: 'tool';
      id: string;
      name: string;
      input: unknown;
      state: 'running' | 'done' | 'error';
      output?: unknown;
    };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: ChatPart[];
}

/** How much of the assistant someone has used, and their caps (null = no cap, for admins). */
export interface AllowanceView {
  level: 'free' | 'member' | 'admin';
  caps: { day: number; month: number } | null;
  usedToday: number;
  usedMonth: number;
}

export type CapReason = 'day' | 'month' | 'budget';

/**
 * What POST /api/assistant/chat streams back, one JSON object per line.
 * text deltas extend the current text part; a tool-start begins a tool part
 * that a tool-end with the same id completes.
 */
export type ChatEvent =
  | { type: 'start'; messageId: string }
  | { type: 'text'; text: string }
  | { type: 'tool-start'; id: string; name: string; input: unknown }
  | { type: 'tool-end'; id: string; output: unknown; error: boolean }
  | { type: 'done'; allowance: AllowanceView }
  | { type: 'error'; message: string };

/** The answer when a message is refused for a cap, before anything streams. */
export interface CapRefusal {
  error: string;
  reason: CapReason;
  allowance: AllowanceView;
}

/** What assistant_messages.parts holds for messages written by this version. */
export interface StoredParts {
  v: 2;
  /** What the chat shows. */
  ui: ChatPart[];
  /**
   * The exact Messages API turns this message produced (assistant content
   * blocks and tool results), replayed as history on later turns. User
   * messages store none; their text is enough.
   */
  api?: unknown[];
}
