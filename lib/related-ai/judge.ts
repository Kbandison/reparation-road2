import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { Collection, CollectionRecord } from '@/lib/types';
import { getRecordTitle } from '@/lib/collections/helpers';
import type { Candidate } from './retrieval';

// The model is addressed directly through @ai-sdk/anthropic (hyphenated id),
// so usage bills to the Anthropic account — NOT through the Vercel gateway.
export const JUDGE_MODEL = 'claude-sonnet-4-6';

export const RELATIONSHIP_TYPES = [
  'same_person',
  'family',
  'enslaver_enslaved',
  'same_household',
  'same_event',
  'same_place',
  'associated',
  'none',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export interface Verdict {
  candidateId: string;
  relationshipType: RelationshipType;
  confidence: number;
  reasoning: string;
}

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      candidate_id: z.string().describe('The id of the candidate being judged.'),
      relationship_type: z
        .enum(RELATIONSHIP_TYPES)
        .describe('The most specific relationship that holds, or "none".'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('0–1 likelihood the relationship is real. Be conservative.'),
      reasoning: z
        .string()
        .describe('One sentence of concrete evidence (shared names, places, dates).'),
    }),
  ),
});

const SYSTEM = `You are an archival genealogist evaluating whether historical records refer to related people. These are Black history records — enslaved persons, free people of color, Native American agency records, military and census records.

You will see a SOURCE record and a list of CANDIDATE records from across the archive. For each candidate, decide whether it genuinely relates to the source and how.

Judge carefully:
- Recognize period name variants and abbreviations: "Jno."=John, "Wm."=William, "Thos."=Thomas, "Geo."=George, "Eliz."=Elizabeth; spelling drift (Mordica/Nordico), and matronymic/patronymic naming.
- A shared common first name alone (John, Mary) is NOT a relationship — require corroborating evidence (surname, place, date, or context).
- "same_person": strong evidence it's the same individual across collections.
- "family": parent/child/sibling/spouse or shared surname + place.
- "enslaver_enslaved": one record's person is named as enslaver/owner of the other.
- "same_household"/"same_event"/"same_place": appear together in the same household, transaction, or locale.
- "associated": clearly connected but none of the above.
- "none": no real relationship.

A candidate matched because the source's name appears in one of its fields (e.g. a name appearing in another record's remarks). Weigh WHICH field matched and whether it's meaningful.

Confidence calibration — use the FULL 0–1 range; do NOT cluster everything low:
- 0.85–1.0: near-certain — the same person with corroborating name + place/date, or an explicit enslaver/enslaved naming.
- 0.65–0.85: strong lead — shared surname + shared place, a clear family/household link, or the same distinctive event.
- 0.45–0.65: plausible lead worth surfacing — a period name-variant match, or the same distinctive place/era with some supporting detail.
- below 0.45: weak or "none".

Researchers WANT plausible leads to follow, not only certainties — surface genuine connections, don't suppress them. But a shared COMMON place alone ("Creek Nation", "Georgia", a state/nation) or a shared common given name alone is NOT a relationship — score those below 0.45 or "none". Reserve confidence for distinctive evidence: surnames, full names, specific localities, dates, explicit roles.

Return a verdict for EVERY candidate.`;

function compactRecord(record: CollectionRecord, collection: Collection): string {
  const skip = new Set(['id', 'slug', 'image_path', 'ocr_text', 'created_at', 'updated_at', 'embedding', 'tsv']);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(record)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    parts.push(`${k}: ${String(v).slice(0, 240)}`);
  }
  return `${getRecordTitle(record, collection)} [${collection.name}]\n${parts.join('\n')}`;
}

function describeCandidate(c: Candidate): string {
  const fields = Object.entries(c.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `id: ${c.id}\ncollection: ${c.collectionName}\nmatched_columns: ${c.matchedColumns.join(', ') || '(none)'}\n${fields}`;
}

interface JudgeOptions {
  batchSize?: number;
}

/**
 * Ask the model to judge each candidate against the source record. Candidates
 * are chunked so a large pool never blows the context window; verdicts are
 * concatenated across chunks.
 */
export async function judgeCandidates(
  sourceCollection: Collection,
  sourceRecord: CollectionRecord,
  candidates: Candidate[],
  opts: JudgeOptions = {},
): Promise<Verdict[]> {
  if (candidates.length === 0) return [];
  const { batchSize = 20 } = opts;

  const sourceBlock = compactRecord(sourceRecord, sourceCollection);
  const verdicts: Verdict[] = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const prompt = `SOURCE RECORD:\n${sourceBlock}\n\nCANDIDATE RECORDS (${batch.length}):\n\n${batch
      .map((c, idx) => `--- Candidate ${idx + 1} ---\n${describeCandidate(c)}`)
      .join('\n\n')}\n\nReturn a verdict for every candidate by its id.`;

    try {
      const { object } = await generateObject({
        model: anthropic(JUDGE_MODEL),
        schema: VerdictSchema,
        system: SYSTEM,
        prompt,
      });

      const valid = new Set(batch.map((c) => c.id));
      for (const v of object.verdicts) {
        if (!valid.has(v.candidate_id)) continue;
        verdicts.push({
          candidateId: v.candidate_id,
          relationshipType: v.relationship_type,
          confidence: v.confidence,
          reasoning: v.reasoning,
        });
      }
    } catch {
      // A failed batch yields no verdicts for those candidates rather than
      // failing the whole run.
    }
  }

  return verdicts;
}
