import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Server-only: uses ANTHROPIC_API_KEY. Never import from a client component.

/**
 * Collection and folder descriptions are written by Claude Sonnet, billed
 * directly to the Anthropic account (the same key as the site assistant).
 */
export const DESCRIPTION_MODEL = 'claude-sonnet-5';

const DescriptionsSchema = z.object({
  short_description: z.string(),
  long_description: z.string(),
});

export interface DescriptionInput {
  name: string;
  /** 'folder' describes a group of collections rather than one set of records. */
  kind: 'collection' | 'folder';
  category?: string | null;
  era?: string | null;
  region?: string | null;
  /** Spreadsheet headers and a few rows, when describing a collection being imported. */
  headers?: string[];
  sampleRows?: Record<string, unknown>[];
  /** Names of the collections inside a folder, when it has any. */
  tabNames?: string[];
}

/** A failure the admin can act on, with the HTTP status the route should answer with. */
export class DescriptionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function buildPrompt(input: DescriptionInput): string {
  const folder = input.kind === 'folder';
  const lines = [
    `${folder ? 'Folder' : 'Collection'} name: ${input.name}`,
    `Category: ${input.category || 'unspecified'}`,
    `Era: ${input.era || 'unspecified'}`,
    `Region: ${input.region || 'unspecified'}`,
  ];
  if (input.headers?.length) lines.push(`Columns: ${input.headers.join(', ')}`);
  if (input.sampleRows?.length) {
    lines.push(`Sample rows:\n${input.sampleRows.slice(0, 3).map((r) => JSON.stringify(r)).join('\n')}`);
  }
  if (folder && input.tabNames?.length) lines.push(`Collections inside it: ${input.tabNames.slice(0, 20).join(', ')}`);

  return `You write descriptions for Reparation Road, a Black history digital archive of records documenting enslaved and free people of color. Write two descriptions for ${
    folder ? 'a folder that groups related record collections, each shown as a tab' : 'a record collection'
  }.

${lines.join('\n')}

short_description: one sentence of about 100-140 characters saying what the ${folder ? 'folder brings together' : 'collection contains'}. It appears on the ${folder ? 'folder' : 'collection'}'s card.
long_description: 2-4 sentences, about 250-500 characters. ${
    folder
      ? 'Describe the kinds of records the folder brings together, the time period and the region.'
      : 'Describe the contents, the time period, and what each record typically captures.'
  }

Use a sober archival tone with no marketing language. Describe only what the inputs support: don't invent provenance, authors, archives or publication details.`;
}

/** Short and long descriptions for a collection or folder. */
export async function generateDescriptions(input: DescriptionInput): Promise<{ shortDescription: string; longDescription: string }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new DescriptionError('ANTHROPIC_API_KEY is not configured', 500);

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: DESCRIPTION_MODEL,
      max_tokens: 8000,
      // A short writing task: low effort is plenty and keeps it quick.
      output_config: { effort: 'low', format: zodOutputFormat(DescriptionsSchema) },
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new DescriptionError('Claude declined to write these descriptions. Try rewording the name.', 422);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new DescriptionError('Claude returned descriptions in an unexpected shape. Try again.', 502);

    return {
      shortDescription: parsed.short_description.trim(),
      longDescription: parsed.long_description.trim(),
    };
  } catch (err) {
    if (err instanceof DescriptionError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new DescriptionError('The Anthropic API key was rejected.', 500);
    if (err instanceof Anthropic.RateLimitError) throw new DescriptionError('Claude is busy right now. Try again in a minute.', 429);
    if (err instanceof Anthropic.APIError) {
      console.error('[generate-descriptions] Anthropic error', err.status, err.message);
      throw new DescriptionError(`AI request failed (${err.status ?? 'network'})`, 502);
    }
    throw err;
  }
}
