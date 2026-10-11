import { areNameEquivalents } from './nicknames';

/**
 * Spelling-variant comparison for names in old records, where one person turns
 * up as Pinkard, Pinckard and Pinkerd, or as Elijah and Eilja. Used by the
 * family-tree search, the "Save to family tree" picker and archive matching.
 *
 * Three ways two words can be the same name, besides an exact match:
 *  - nickname: formal names, nicknames and clerks' abbreviations (Polly/Mary, Wm/William);
 *  - sound-alike: same American Soundex code (the system census indexes use)
 *    and spelled within a letter or two;
 *  - letter slip: a letter added, dropped or swapped with its neighbour, as
 *    handwriting transcriptions often are.
 */

/** American Soundex: first letter plus three digits ("Pinckard" → "P526"). */
export function soundex(word: string): string {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return '';
  const code = (c: string) =>
    'BFPV'.includes(c) ? '1'
      : 'CGJKQSXZ'.includes(c) ? '2'
        : 'DT'.includes(c) ? '3'
          : c === 'L' ? '4'
            : 'MN'.includes(c) ? '5'
              : c === 'R' ? '6'
                : '';
  let out = letters[0];
  let last = code(letters[0]);
  for (let i = 1; i < letters.length && out.length < 4; i++) {
    const c = letters[i];
    const digit = code(c);
    if (digit && digit !== last) out += digit;
    // H and W don't separate letters with the same code; vowels do.
    if (c !== 'H' && c !== 'W') last = digit;
  }
  return out.padEnd(4, '0');
}

/**
 * How far a same-Soundex word may be spelled from the name. Soundex alone is
 * too loose: it ignores vowels and stops after four letters, so John = Jim =
 * June and Charles = Charleston. Sound-alikes must also be spelled close and
 * be about the same length.
 */
export function soundAlikeBudget(length: number): number {
  return length >= 6 ? 2 : 1;
}

/**
 * One letter added, dropped, or two neighbours swapped (Johnson/Johnston,
 * Pinkard/Pinckard, Jefferson/Jeffeson), keeping the first letter. Swapping one
 * letter for a different one isn't a slip: that usually makes another real
 * name (Waller/Walker, Clara/Clark, Mills/Wills). Five letters or more, since
 * shorter names one letter apart are usually different names.
 */
export function isLetterSlip(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || a[0] !== b[0] || a === b) return false;
  if (a.length === b.length) {
    const diff = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.length - short.length !== 1) return false;
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  }
  return false;
}

/**
 * Edit distance (insertions, deletions, substitutions and swapped neighbours),
 * stopping early once it can't be within `max`.
 */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length] <= max;
}

export type WordMatch = 'exact' | 'prefix' | 'nickname' | 'sound' | 'slip';

/** Variant matching needs a few letters to mean anything. */
export const MIN_VARIANT_LENGTH = 4;

/**
 * How a typed or recorded name word matches another word, best first, or null.
 * Both are lowercase letters. `allowPrefix` is for search-as-you-type.
 */
export function matchWord(query: string, word: string, wordSoundex?: string, allowPrefix = false): WordMatch | null {
  if (query === word) return 'exact';
  if (allowPrefix && word.startsWith(query)) return 'prefix';
  if (areNameEquivalents(query, word)) return 'nickname';
  if (query.length < MIN_VARIANT_LENGTH || word.length < MIN_VARIANT_LENGTH) return null;
  if (
    (wordSoundex ?? soundex(word)) === soundex(query) &&
    Math.abs(query.length - word.length) <= 1 &&
    withinEdits(query, word, soundAlikeBudget(query.length))
  ) {
    return 'sound';
  }
  if (isLetterSlip(query, word)) return 'slip';
  return null;
}

/** Lowercase letter runs of a text, the way archive matching splits record fields into words. */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** The label shown next to a variant match. */
export function variantLabel(kinds: Iterable<WordMatch>): string | null {
  const set = new Set(kinds);
  if (set.has('sound') || set.has('slip')) return 'Similar spelling';
  if (set.has('nickname')) return 'Nickname';
  return null;
}
