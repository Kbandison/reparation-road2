import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection } from '@/lib/types';
import type { ScoredResult } from '@/lib/collections/matching';
import { getRecordTitle } from '@/lib/collections/helpers';
import { nameEquivalents } from '@/lib/names/nicknames';
import { matchWord, variantLabel, wordsOf, type WordMatch } from '@/lib/names/variants';

/**
 * The spelling-variant half of archive matching: finds records where the
 * person's name is spelled differently (Pinckard for Pinkard), sounds the same,
 * or appears as a nickname or clerk's abbreviation (Wm for William).
 *
 * The database function `match_name_variants` (family_tree_name_variants.sql)
 * finds candidates across a whole collection table; each candidate is then
 * judged here with the same rules as the family-tree search. If the function
 * hasn't been installed, this finds nothing and matching stays exact-only.
 */

// Only columns that hold people's names are compared: places ("Hanging Dog
// Creek"), ship names ("Othello"), OCR pages and remarks are full of words that
// sound like names. Recognised by column name, e.g. name, soldier_name,
// to_whom_sold, enslaved_persons, former_slave_owner, head_of_family.
const NAME_COLUMN = /(^|_)(names?|first|last|surname|child|guardian|enslavers?|enslaved|owners?|sold|possession|head_of_family|whom|claimed|persons?|principal|recipient|soldier)(_|$)/i;
const NOT_NAME_COLUMN = /(vessel|ship|date|state|place|county|town|city)/i;

export function isNameColumn(column: string): boolean {
  return NAME_COLUMN.test(column) && !NOT_NAME_COLUMN.test(column);
}

// Name parts some tables keep in separate columns; joined back into one name.
const FIRST_NAME_COLUMN = /^(first_?name|given_?names?)$/i;
const LAST_NAME_COLUMN = /^(last_?name|surname)$/i;

// Points per name word: exact matches keep the exact search's 3, variants
// count a little less so an exact record always outranks its variant twin.
const EXACT_POINTS = 3;
const VARIANT_POINTS = 2;
const MULTI_WORD_BONUS = 5;
const LOCATION_POINTS = 2;

// Candidate pool per collection; judging below trims it to the best few.
const CANDIDATE_LIMIT = 40;

// "Bowers, John": a single word before the only comma is a surname-first name,
// not a list. Mirrors the check in match_name_variants.
const SURNAME_FIRST = /^\s*[\p{L}'-]+\s*,[^,]*$/u;
const BETWEEN_PEOPLE = /[,;&()]|\band\b/i;

/**
 * The separate people named in one field: "Tom, Kate & Nan" is three names and
 * "Collin Reddock (Thomas Powers)" two, so a first name from one person and a
 * surname from another never add up to a match. Mirrors match_name_variants.
 */
export function namesInField(value: string): string[] {
  const text = SURNAME_FIRST.test(value) ? value.replace(',', ' ') : value;
  return text.split(BETWEEN_PEOPLE).map((s) => s.trim()).filter(Boolean);
}

interface NameWord {
  word: string;
  surname: boolean;
}

interface WordHit {
  index: number;
  kind: WordMatch;
}

interface NameTerms {
  terms: string[];
  groups: number[];
  fuzzy: boolean[];
}

/** Each name word, plus nicknames of first names as exact-only spellings of the same word. */
function buildTerms(words: NameWord[], withNicknames: boolean): NameTerms {
  const out: NameTerms = { terms: [], groups: [], fuzzy: [] };
  words.forEach(({ word, surname }, group) => {
    out.terms.push(word);
    out.groups.push(group);
    out.fuzzy.push(true);
    // Nicknames are for first names: a surname Frank isn't Francis.
    if (!withNicknames || surname) return;
    for (const alias of nameEquivalents(word)) {
      if (alias === word) continue;
      out.terms.push(alias);
      out.groups.push(group);
      out.fuzzy.push(false);
    }
  });
  return out;
}

const RANK: Record<WordMatch, number> = { exact: 3, prefix: 2, nickname: 1, sound: 1, slip: 1 };

/** How the person's name words match one name in a record (unmatched words left out). */
function judgeName(name: string, nameWords: NameWord[], withNicknames: boolean): WordHit[] {
  const text = name.toLowerCase();
  const words = [...new Set(wordsOf(text))];
  const hits: WordHit[] = [];
  nameWords.forEach(({ word: nameWord, surname }, index) => {
    // Exact as the exact search counts it: the name appears in the text.
    if (text.includes(nameWord)) {
      hits.push({ index, kind: 'exact' });
      return;
    }
    let best: WordMatch | null = null;
    for (const word of words) {
      const kind = matchWord(nameWord, word);
      if (!kind || (kind === 'nickname' && (!withNicknames || surname))) continue;
      if (!best || RANK[kind] > RANK[best]) best = kind;
    }
    if (best) hits.push({ index, kind: best });
  });
  return hits;
}

function pointsFor(hits: WordHit[]): number {
  const base = hits.reduce((sum, h) => sum + (h.kind === 'exact' ? EXACT_POINTS : VARIANT_POINTS), 0);
  return hits.length >= 2 ? base + MULTI_WORD_BONUS : base;
}

/** Name words, letters only (matching how record fields are split), first names then surname. */
function toNameWords(given: string[], surname: string[]): NameWord[] {
  const clean = (t: string) => t.toLowerCase().replace(/[^\p{L}]/gu, '');
  const surnameWords = new Set(surname.map(clean).filter((t) => t.length > 1));
  const givenWords = given.map(clean).filter((t) => t.length > 1 && !surnameWords.has(t));
  return [
    ...[...new Set(givenWords)].map((word) => ({ word, surname: false })),
    ...[...surnameWords].map((word) => ({ word, surname: true })),
  ];
}

export interface VariantSearchInput {
  /** First and middle name words. */
  given: string[];
  surname: string[];
  locations: string[];
}

export async function searchVariantCollection(
  supabase: SupabaseClient,
  candidate: Collection,
  input: VariantSearchInput,
  maxResults: number,
): Promise<ScoredResult[]> {
  if (!candidate.table_name) return [];

  const searchCols = candidate.search_columns?.length
    ? candidate.search_columns
    : candidate.display_columns?.slice(0, 3) || [];
  const nameCols = searchCols.filter(isNameColumn);
  const firstCol = nameCols.find((c) => FIRST_NAME_COLUMN.test(c));
  const lastCol = nameCols.find((c) => LAST_NAME_COLUMN.test(c));
  const joinedCols = firstCol && lastCol ? [firstCol, lastCol] : [];
  const separateCols = nameCols.filter((c) => !joinedCols.includes(c));
  if (separateCols.length === 0 && joinedCols.length === 0) return [];

  const nameWords = toNameWords(input.given, input.surname);
  if (nameWords.length === 0) return [];

  // Someone with more than one name word needs two of them in one name in the
  // record, and when they have both a first name and a surname, the surname
  // must be one of them: two first names alone ("Anna Maria") aren't evidence.
  // Nicknames only count alongside another name word: on its own, "Polly"
  // would pull in every Mary in the archive.
  const minHits = nameWords.length >= 2 ? 2 : 1;
  const withNicknames = nameWords.length >= 2;
  const hasBoth = nameWords.some((w) => w.surname) && nameWords.some((w) => !w.surname);
  const requiredGroups = hasBoth ? nameWords.flatMap((w, i) => (w.surname ? [i] : [])) : [];
  const { terms, groups, fuzzy } = buildTerms(nameWords, withNicknames);
  const selectCols = [...new Set([
    'slug',
    ...searchCols,
    ...(candidate.display_columns || []).slice(0, 3),
    ...(candidate.title_columns || []),
  ])];

  const { data, error } = await supabase.rpc('match_name_variants', {
    p_table: candidate.table_name,
    p_match_columns: separateCols,
    p_joined_columns: joinedCols,
    p_select_columns: selectCols,
    p_terms: terms,
    p_groups: groups,
    p_fuzzy: fuzzy,
    p_min_hits: minHits,
    p_required_groups: requiredGroups,
    p_discriminator_column: candidate.discriminator_column,
    p_discriminator_value: candidate.discriminator_value,
    p_limit: CANDIDATE_LIMIT,
  });
  if (error || !Array.isArray(data)) return [];

  const results: ScoredResult[] = [];
  for (const row of data as Record<string, unknown>[]) {
    // A record can only be suggested if it can be linked to.
    if (row.id === null || row.id === undefined) continue;

    const text = (c: string) => (typeof row[c] === 'string' ? (row[c] as string) : '');
    const fields = separateCols.map(text);
    if (joinedCols.length) fields.push(joinedCols.map(text).filter(Boolean).join(' '));

    // The best-matching name anywhere in the record.
    let best: WordHit[] = [];
    for (const field of fields) {
      for (const name of namesInField(field)) {
        const hits = judgeName(name, nameWords, withNicknames);
        if (hits.length < minHits) continue;
        if (requiredGroups.length && !hits.some((h) => requiredGroups.includes(h.index))) continue;
        if (pointsFor(hits) > pointsFor(best)) best = hits;
      }
    }
    if (best.length === 0) continue;

    let score = pointsFor(best);
    const reasons = [
      best.length >= nameWords.length && nameWords.length > 1
        ? 'Full name match'
        : best.length >= 2
          ? 'Name match'
          : 'Similar name',
    ];
    const label = variantLabel(best.map((h) => h.kind));
    if (label) reasons.push(label);

    // Same location scoring as the exact search.
    for (const loc of input.locations) {
      const needle = loc.toLowerCase();
      const col = searchCols.find((c) => text(c).toLowerCase().includes(needle));
      if (col) {
        reasons.push(`Same ${col.replace(/_/g, ' ')}`);
        score += LOCATION_POINTS;
      }
    }

    const id = String(row.id);
    const slug = text('slug') || id;
    results.push({
      id,
      slug,
      name: getRecordTitle(row, candidate),
      collectionSlug: candidate.slug,
      collectionName: candidate.name,
      tableName: candidate.table_name,
      matchReasons: [...new Set(reasons)],
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/**
 * Combine one collection's exact and variant results: one entry per record,
 * keeping whichever search scored it higher, best first.
 */
export function mergeScoredResults(...lists: ScoredResult[][]): ScoredResult[] {
  const byId = new Map<string, ScoredResult>();
  for (const result of lists.flat()) {
    // Some tables have numeric ids, which the exact search passes through as numbers.
    const key = String(result.id);
    const existing = byId.get(key);
    if (!existing || result.score > existing.score) byId.set(key, result);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}
