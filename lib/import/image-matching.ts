/**
 * Matching spreadsheet image names to the scans in storage. Shared by the
 * import wizard's image step and the "Link to existing records" action.
 *
 * Only exact matches link automatically. A near miss (one name containing the
 * other) is offered for the admin to confirm, never applied on its own: with
 * front and back scans named "…_001" and "…_001b", guessing would attach the
 * wrong page to a record, and nobody would notice.
 */

// Only real file extensions are dropped. Scan names are full of dots
// ("L20047_1845_no.2-53_001"), so "everything after the last dot" would cut
// into the name itself.
const FILE_EXTENSION = /\.(jpe?g|png|gif|webp|tiff?|bmp|avif|heic|pdf)$/i;

/**
 * The form two names are compared in: no file extension, case, spaces or
 * punctuation. "Camden 12.JPG", "camden_12" and "Camden-12.tif" all agree.
 */
export function imageKey(name: string): string {
  return name.trim().replace(FILE_EXTENSION, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A value that's already a storage path or URL, not a bare filename to look up. */
export function isStorageLink(value: string): boolean {
  return value.includes('/');
}

export interface MatchFile {
  name: string;
  /** "bucket/path": the value a record's image_path takes. */
  path: string;
}

export interface ImageMatchResult {
  /** Name → storage path, for names with exactly one file of the same name. */
  exact: Record<string, string>;
  /** Names with no exact file but similar ones, for the admin to confirm. */
  near: Record<string, MatchFile[]>;
  /** Names with nothing close in the pool. */
  unmatched: string[];
}

// Below this a key is too short for "contains" to mean anything.
const MIN_NEAR_KEY_LENGTH = 4;
const MAX_SUGGESTIONS = 3;

/** Matches each distinct name against the pool. Names that are already links are left out. */
export function matchImages(names: string[], files: MatchFile[]): ImageMatchResult {
  const byKey = new Map<string, MatchFile>();
  for (const file of files) {
    const key = imageKey(file.name);
    if (key && !byKey.has(key)) byKey.set(key, file);
  }

  const result: ImageMatchResult = { exact: {}, near: {}, unmatched: [] };
  for (const name of new Set(names)) {
    if (!name || isStorageLink(name)) continue;
    const key = imageKey(name);
    if (!key) continue;

    const hit = byKey.get(key);
    if (hit) {
      result.exact[name] = hit.path;
      continue;
    }

    const suggestions: MatchFile[] = [];
    if (key.length >= MIN_NEAR_KEY_LENGTH) {
      for (const [fileKey, file] of byKey) {
        if (fileKey.length < MIN_NEAR_KEY_LENGTH) continue;
        if (fileKey.includes(key) || key.includes(fileKey)) suggestions.push(file);
        if (suggestions.length === MAX_SUGGESTIONS) break;
      }
    }
    if (suggestions.length) result.near[name] = suggestions;
    else result.unmatched.push(name);
  }
  return result;
}
