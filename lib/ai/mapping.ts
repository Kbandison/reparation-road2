import type { SupabaseClient } from '@supabase/supabase-js';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { AiError, getAnthropic, toAiError } from './client';
import { MAPPING_MODEL } from './models';
import { ensureBudget } from './limits';
import { recordUsage } from './usage';

// Server-only: calls Claude for the import wizard's column suggestions.

const SuggestionSchema = z.object({
  columns: z.array(
    z.object({
      header: z.string(),
      /** An existing column, a new snake_case column, image_path / ocr_text / slug, or "" to skip. */
      target: z.string(),
      reason: z.string(),
    }),
  ),
  display_columns: z.array(z.string()),
  search_columns: z.array(z.string()),
});

export interface MappingInput {
  collectionName: string;
  /** 'existing' maps onto a table that already has columns. */
  mode: 'new' | 'existing';
  headers: string[];
  sampleRows: Record<string, unknown>[];
  /** The target table's columns and Postgres types, when it exists. */
  existingColumns: Record<string, string>;
  /** Columns a tab's tag fills on every row; never mapped from the file. */
  taggedColumns: string[];
}

export interface MappingSuggestion {
  /** Per spreadsheet header: where Claude would put it ("" = skip) and why. */
  columns: Record<string, { target: string; reason: string }>;
  displayColumns: string[];
  searchColumns: string[];
}

/** Columns the database manages; mirrors SYSTEM_COLUMNS in lib/import/records.ts. */
const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'embedding', 'tsv']);
const SPECIAL_TARGETS = new Set(['image_path', 'ocr_text', 'slug']);
const SAFE_COLUMN = /^[a-z][a-z0-9_]{0,62}$/;

/** Long transcriptions make the prompt big without helping it decide. */
const clip = (value: unknown) => {
  const s = String(value ?? '');
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
};

function buildPrompt(input: MappingInput): string {
  const samples = input.sampleRows
    .slice(0, 12)
    .map((row) => JSON.stringify(Object.fromEntries(input.headers.map((h) => [h, clip(row[h])]))))
    .join('\n');
  const existing = Object.entries(input.existingColumns)
    .filter(([c]) => !SYSTEM_COLUMNS.has(c))
    .map(([c, type]) => `${c} (${type})`)
    .join(', ');

  return `You help an archivist import a spreadsheet of historical records into Reparation Road, a digital archive of records documenting enslaved and free people of color. Suggest where each spreadsheet column should go.

Collection: ${input.collectionName || '(unnamed)'}
${input.mode === 'existing' && existing ? `The table already has these columns: ${existing}` : 'This is a new collection; its table will be created from the file.'}
${input.taggedColumns.length ? `These columns are filled automatically and must not be targets: ${input.taggedColumns.join(', ')}` : ''}

Spreadsheet headers: ${JSON.stringify(input.headers)}
Sample rows:
${samples}

For every header, give a target:
- An existing column that holds the same information, even under a different name ("Owner" → enslaver, "Yr" → year). Only use an existing column when the meaning really matches.
- Otherwise a new column name: lowercase snake_case, short and descriptive, made from the header ("Head of Household" → head_of_household).
- "image_path" for a column of scan or image file names, "ocr_text" for a column of transcribed page text, "slug" only for a column of URL slugs.
- "" (skip) only for columns that carry no information at all: empty columns, spreadsheet row numbers, "Unnamed" filler columns. Keep notes, remarks and transcriber's notes as their own columns; researchers rely on them.
Never use id, created_at, updated_at, embedding or tsv. Give each header a different target unless two headers are clearly halves of the same value.
reason: a few words on why, written for the archivist.

display_columns: the 4 to 8 targets most useful in the collection's table view, most important first (names before places, dates and details). search_columns: the 1 to 4 text targets people would search by: names first, then places. Never counts, amounts or dates.`;
}

/**
 * Claude's column suggestions for a spreadsheet, checked before they reach
 * the wizard: unknown headers are dropped, targets are made safe column names,
 * and display/search columns only name targets that exist.
 */
export async function suggestMapping(input: MappingInput, log: { admin: SupabaseClient; userId: string }): Promise<MappingSuggestion> {
  try {
    await ensureBudget(log.admin);
    const response = await getAnthropic().messages.parse({
      model: MAPPING_MODEL,
      max_tokens: 8000,
      // A matching task over a short prompt: low effort is plenty.
      output_config: { effort: 'low', format: zodOutputFormat(SuggestionSchema) },
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    await recordUsage(log.admin, {
      feature: 'import_mapping',
      model: MAPPING_MODEL,
      usage: response.usage,
      userId: log.userId,
      meta: { collection: input.collectionName, headers: input.headers.length },
    });

    if (response.stop_reason === 'refusal') throw new AiError('Claude declined to suggest a mapping for this file.', 422);
    const parsed = response.parsed_output;
    if (!parsed) throw new AiError('Claude returned suggestions in an unexpected shape.', 502);

    const headers = new Set(input.headers);
    const tagged = new Set(input.taggedColumns);
    const columns: MappingSuggestion['columns'] = {};
    for (const { header, target, reason } of parsed.columns) {
      if (!headers.has(header) || header in columns) continue;
      const clean = target.trim().toLowerCase();
      const safe =
        clean === '' || SPECIAL_TARGETS.has(clean) || (SAFE_COLUMN.test(clean) && !SYSTEM_COLUMNS.has(clean) && !tagged.has(clean));
      if (!safe) continue;
      columns[header] = { target: clean, reason: reason.trim() };
    }

    const targets = new Set(Object.values(columns).map((c) => c.target).filter((t) => t && !SPECIAL_TARGETS.has(t)));
    const keep = (list: string[], max: number) => [...new Set(list.map((c) => c.trim().toLowerCase()))].filter((c) => targets.has(c)).slice(0, max);

    return {
      columns,
      displayColumns: keep(parsed.display_columns, 12),
      searchColumns: keep(parsed.search_columns, 4),
    };
  } catch (err) {
    throw toAiError(err, 'suggest-mapping');
  }
}
