import type { TreeIndividual } from '@/lib/types';
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
}

export function buildSearchIndex(individuals: TreeIndividual[]): SearchEntry[] {
  return individuals.map((p) => {
    const name = fullName(p) || 'Unnamed';
    const normalized = normalizeName(name);
    return { id: p.id, name, normalized, words: normalized.split(' ').filter(Boolean) };
  });
}

/**
 * People whose name matches every typed word as the start of one of its words,
 * in any order: "bird amos" and "am bi" both find Amos Bird. Exact word matches
 * and names that begin with the query rank first, then alphabetical.
 */
export function searchPeople(index: SearchEntry[], query: string): SearchEntry[] {
  const q = normalizeName(query);
  if (!q) return [];
  const tokens = q.split(' ');

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      if (entry.words.includes(token)) score += 3;
      else if (entry.words.some((w) => w.startsWith(token))) score += 1;
      else {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (entry.normalized.startsWith(q)) score += 2;
    scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .map((s) => s.entry);
}
