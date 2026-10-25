import type { SupabaseClient } from '@supabase/supabase-js';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { AiError, getAnthropic, toAiError } from './client';
import { SONNET } from './models';
import { ensureBudget } from './limits';
import { recordUsage } from './usage';

// Server-only: uses ANTHROPIC_API_KEY. Never import from a client component.

/**
 * Collection and folder descriptions are written by Claude Sonnet, billed
 * directly to the Anthropic account (the same key as the site assistant).
 */
export const DESCRIPTION_MODEL = SONNET;

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

/** Short and long descriptions for a collection or folder. The call is logged against the AI budget. */
export async function generateDescriptions(
  input: DescriptionInput,
  log: { admin: SupabaseClient; userId: string },
): Promise<{ shortDescription: string; longDescription: string }> {
  try {
    await ensureBudget(log.admin);
    const response = await getAnthropic().messages.parse({
      model: DESCRIPTION_MODEL,
      max_tokens: 8000,
      // A short writing task: low effort is plenty and keeps it quick.
      output_config: { effort: 'low', format: zodOutputFormat(DescriptionsSchema) },
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });

    await recordUsage(log.admin, {
      feature: 'descriptions',
      model: DESCRIPTION_MODEL,
      usage: response.usage,
      userId: log.userId,
      meta: { name: input.name, kind: input.kind },
    });

    if (response.stop_reason === 'refusal') {
      throw new AiError('Claude declined to write these descriptions. Try rewording the name.', 422);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new AiError('Claude returned descriptions in an unexpected shape. Try again.', 502);

    return {
      shortDescription: parsed.short_description.trim(),
      longDescription: parsed.long_description.trim(),
    };
  } catch (err) {
    throw toAiError(err, 'generate-descriptions');
  }
}
