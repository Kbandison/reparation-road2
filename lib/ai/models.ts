/**
 * The Claude models the site uses, and what each call costs. Prices are USD
 * per million tokens from platform.claude.com/docs/en/about-claude/pricing
 * (checked 2026-10-25). Safe to import anywhere: no keys, no network.
 */

/** The research assistant, mapping suggestions and descriptions. */
export const SONNET = 'claude-sonnet-5';
/** The stronger (and dearer) option for hard handwriting. */
export const OPUS = 'claude-opus-5-5';

export const ASSISTANT_MODEL = SONNET;
export const MAPPING_MODEL = SONNET;

/** The models the transcription pilot compares, cheapest first. */
export const TRANSCRIPTION_MODELS = [SONNET, OPUS] as const;
export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number];

export const MODEL_LABELS: Record<string, string> = {
  [SONNET]: 'Claude Sonnet 5',
  [OPUS]: 'Claude Opus 5.5',
};

interface ModelPrice {
  input: number;
  output: number;
  /** Writing a prefix to the 5-minute prompt cache. */
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrice> = {
  [SONNET]: { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  [OPUS]: { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
};

/** The Batch API halves every token price, cache reads and writes included. */
const BATCH_DISCOUNT = 0.5;

/** Token counts as the Messages API reports them (`response.usage`). */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
}

/** Adds two usage reports together, e.g. the steps of one assistant turn. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_creation: {
      ephemeral_5m_input_tokens: (a.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (b.cache_creation?.ephemeral_5m_input_tokens ?? 0),
      ephemeral_1h_input_tokens: (a.cache_creation?.ephemeral_1h_input_tokens ?? 0) + (b.cache_creation?.ephemeral_1h_input_tokens ?? 0),
    },
  };
}

export const EMPTY_USAGE: TokenUsage = { input_tokens: 0, output_tokens: 0 };

/** What a call cost in USD. Throws for a model with no known price, so spend is never undercounted. */
export function costOf(model: string, usage: TokenUsage, { batch = false } = {}): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price on file for ${model}`);

  const cacheWrites = usage.cache_creation_input_tokens ?? 0;
  // The breakdown says how much went to the 1-hour cache; without it, every
  // write is a 5-minute write (what the site asks for).
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = usage.cache_creation ? usage.cache_creation.ephemeral_5m_input_tokens : cacheWrites;

  const dollars =
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      write5m * price.cacheWrite5m +
      write1h * price.cacheWrite1h) /
    1_000_000;
  return batch ? dollars * BATCH_DISCOUNT : dollars;
}

/**
 * A planning figure for one scan, before any real runs have been measured:
 * a full-resolution page is up to ~4,800 image tokens plus the prompt, and a
 * busy register page can take a few thousand tokens to transcribe.
 */
export const SCAN_TOKEN_ESTIMATE: TokenUsage = { input_tokens: 5_500, output_tokens: 2_500 };
