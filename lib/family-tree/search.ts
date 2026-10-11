import type { TreeIndividual } from '@/lib/types';
import { matchWord, soundex, variantLabel, type WordMatch } from '@/lib/names/variants';
import { fullName } from './display';

/**
 * Name search over a whole tree, run in the browser on every keystroke. Trees
 * run to ~1,400 people and are already loaded for the canvas, so there's
 * nothing to fetch.
 */

/** Lowercase, accents folded ("Ñuñez" → "nunez"), punctuation dropped. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchEntry {
  id: string;
  name: string;
  normalized: string;
  words: string[];
  /** Soundex of each word, computed once rather than per keystroke. */
  soundexes: string[];
}

export interface SearchResult extends SearchEntry {
  /** Set when the name only matched as a variant: "Similar spelling" or "Nickname". */
  variant: string | null;
}

export function buildSearchIndex(individuals: TreeIndividual[]): SearchEntry[] {
  return individuals.map((p) => {
    const name = fullName(p) || 'Unnamed';
    const normalized = normalizeName(name);
    const words = normalized.split(' ').filter(Boolean);
    return { id: p.id, name, normalized, words, soundexes: words.map(soundex) };
  });
}

// How much each kind of word match counts toward ranking. Exact and
// as-you-type matches always outrank variants.
const WEIGHT: Record<WordMatch, number> = { exact: 6, prefix: 4, nickname: 2, sound: 1, slip: 1 };

/**
 * People whose name matches every typed word, in any order, as the start of
 * one of its words or as a variant of one: "bird amos" finds Amos Bird, and
 * "pinkard" finds Pinckard too (labelled as a similar spelling). Exact
 * matches come first, then variants; alphabetical within each.
 */
export function searchPeople(index: SearchEntry[], query: string): SearchResult[] {
  const q = normalizeName(query);
  if (!q) return [];
  const tokens = q.split(' ');

  const scored: { result: SearchResult; score: number; exactOnly: boolean }[] = [];
  for (const entry of index) {
    let score = 0;
    const kinds: WordMatch[] = [];
    let matched = true;
    for (const token of tokens) {
      let best: WordMatch | null = null;
      for (let i = 0; i < entry.words.length; i++) {
        const kind = matchWord(token, entry.words[i], entry.soundexes[i], true);
        if (kind && (!best || WEIGHT[kind] > WEIGHT[best])) best = kind;
        if (best === 'exact') break;
      }
      if (!best) {
        matched = false;
        break;
      }
      score += WEIGHT[best];
      kinds.push(best);
    }
    if (!matched) continue;
    if (entry.normalized.startsWith(q)) score += 2;
    const variant = variantLabel(kinds);
    scored.push({ result: { ...entry, variant }, score, exactOnly: variant === null });
  }

  return scored
    .sort(
      (a, b) =>
        Number(b.exactOnly) - Number(a.exactOnly) ||
        b.score - a.score ||
        a.result.name.localeCompare(b.result.name),
    )
    .map((s) => s.result);
}
