import Anthropic from '@anthropic-ai/sdk';

// Server-only: reads ANTHROPIC_API_KEY. Never import from a client component.

/** A failure an admin or visitor can act on, with the HTTP status a route should answer with. */
export class AiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Shown when the AI tables or functions aren't in the database yet. */
export const MIGRATION_NEEDED =
  'The AI features need a one-time database update first: run ai_features_migration.sql in the Supabase SQL editor.';

/** Whether a database error means ai_features_migration.sql hasn't been run (PostgREST can't find a table or function). */
export function isMissingSchema(message: string): boolean {
  return /Could not find the (table|function)|does not exist/i.test(message);
}

let client: Anthropic | null = null;

/** The shared Claude client, billed to the site's Anthropic account. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError('ANTHROPIC_API_KEY is not configured', 500);
  client ??= new Anthropic();
  return client;
}

/** Turns an Anthropic SDK error into one a route can show, or rethrows anything else. */
export function toAiError(err: unknown, context: string): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiError('The Anthropic API key was rejected.', 500);
  if (err instanceof Anthropic.RateLimitError) return new AiError('Claude is busy right now. Try again in a minute.', 429);
  if (err instanceof Anthropic.APIError) {
    console.error(`[${context}] Anthropic error`, err.status, err.message);
    return new AiError(`AI request failed (${err.status ?? 'network'})`, 502);
  }
  throw err;
}
