import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { OPUS } from '@/lib/ai/models';

/** What Claude returns for one scanned page. */
export const TranscriptSchema = z.object({
  /** The page's text, as written. Empty when the page is blank or unreadable. */
  text: z.string(),
  /** How sure the reading is overall. */
  confidence: z.enum(['high', 'medium', 'low']),
  /** Anything a researcher should know that isn't part of the page itself. Empty when there's nothing. */
  notes: z.string(),
});

export type Transcript = z.infer<typeof TranscriptSchema>;

const INSTRUCTIONS = `You transcribe scanned pages for Reparation Road, a digital archive of primary-source records documenting enslaved and free people of color in the United States (registers, censuses, ship manifests, tax lists, bills of sale, church books, court and agency records), mostly from the 1700s and 1800s.

Researchers search your transcripts for ancestors' names, so a faithful reading matters more than a tidy one.

Transcribe exactly what is written:
- Keep the original spelling, capitalization, abbreviations and punctuation ("Wm", "Jno", "Do" or "ditto", "&c", "recd", "yrs"). Don't modernize, correct or expand anything.
- Transcribe period terms for people exactly as written, including terms that are offensive today. These are historical documents, and the archive depends on the record's own words.
- Write numbers, dates, ages and amounts as they appear ("7 months", "abt 30", "£12.10.6").
- Put words you can't read as [illegible]. Mark a reading you're unsure of with [?] right after it, e.g. "Pinckard [?]".
- Read the page once, top to bottom. Give your best reading of a hard word, mark it, and move on; don't go back and forth over individual words.
- Include printed headings, column headers and marginal notes. Leave out stamps, library catalogue marks and anything added after the record was made, or mention them in notes.

Layout:
- Keep the page's line breaks.
- For a table or register, write one row per line with columns separated by " | ", starting with a line of the column headings as written. Repeat ditto marks as written.
- If the page has more than one section or column of text, transcribe them in reading order with a blank line between them.

Return:
- text: the transcription alone, with no commentary.
- confidence: high when nearly everything is legible, medium when some words are uncertain, low when much of the page is hard to read.
- notes: brief remarks for researchers (damage, faded ink, a different hand, a page that continues elsewhere). Empty if there's nothing to say.

If the page is blank or contains no writing, return empty text and say so in notes.`;

// A plain JSON copy of the zod format: batch requests are serialized, and the
// helper's parse function shouldn't ride along.
const jsonFormat = JSON.parse(JSON.stringify(zodOutputFormat(TranscriptSchema))) as Anthropic.JSONOutputFormat;

/**
 * About twice what the densest pilot page needed (a full Cherokee Henderson
 * Roll page: 8,400 tokens on Sonnet 5). In the pilot, Opus 5.5 reasoned
 * through 16,000 and then 32,000 tokens on that page without finishing, so a
 * higher limit only makes a runaway page cost more.
 */
const MAX_TOKENS = 16_000;

/**
 * How hard each model works on a page. In the pilot, Opus 5.5 at high effort
 * reasoned through all 16,000 (and then 32,000) tokens on a dense Cherokee
 * Henderson Roll page without writing a word; at medium it finished in 6,300
 * tokens, for 15¢, with every column heading read. Sonnet 5 at high never ran
 * away (8,400 tokens at most).
 */
function effortFor(model: string): 'high' | 'medium' {
  return model === OPUS ? 'medium' : 'high';
}

/**
 * The Messages API request that transcribes one scan. The image goes by URL,
 * so Anthropic fetches it, and a batch of thousands stays small.
 */
export function transcriptionRequest(model: string, imageUrl: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: effortFor(model), format: jsonFormat },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: INSTRUCTIONS },
        ],
      },
    ],
  };
}

/** Reads a finished response into a transcript, or explains why it can't be used. */
export function readTranscript(message: Anthropic.Message): { ok: true; transcript: Transcript } | { ok: false; error: string } {
  if (message.stop_reason === 'refusal') return { ok: false, error: 'Claude declined to transcribe this page.' };
  if (message.stop_reason === 'max_tokens') return { ok: false, error: 'The transcription ran past its length limit.' };
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
  if (!text) return { ok: false, error: 'Claude returned no text.' };
  try {
    const parsed = TranscriptSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: 'Claude returned the transcript in an unexpected shape.' };
    return {
      ok: true,
      transcript: { text: parsed.data.text.trim(), confidence: parsed.data.confidence, notes: parsed.data.notes.trim() },
    };
  } catch {
    return { ok: false, error: 'Claude returned malformed JSON.' };
  }
}
