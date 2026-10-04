/**
 * Storage naming rules shared by the admin media manager (browser) and the
 * /api/admin/storage route (server). Safe to import from either side.
 */

/** The file Supabase writes to keep an otherwise-empty folder in existence. Hidden everywhere. */
export const FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

/** Buckets that site features write to by name. */
export const FORUM_MEDIA_BUCKET = 'forum-media';
export const FAMILY_TREE_MEDIA_BUCKET = 'family-tree-media';

/**
 * The media manager shows these read-only: the forum and family tree store
 * links to their files in their own tables, so renaming or deleting anything
 * in them would break posts and trees.
 */
export const LOCKED_BUCKETS: ReadonlySet<string> = new Set([FORUM_MEDIA_BUCKET, FAMILY_TREE_MEDIA_BUCKET]);

// S3-compatible bucket names top out at 63 characters.
const MAX_NAME_LENGTH = 63;

/**
 * The cleanup every bucket and folder name gets: lowercase letters, numbers and
 * single hyphens ("Box 12 (Henrico)" → "box-12-henrico"). URL-safe, so stored
 * links never need encoding.
 */
export function cleanStorageName(raw: string): string {
  return raw
    // Fold accents ("Ñuñez" → "nunez") instead of dropping the letters.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '');
}

/**
 * File renames keep the name as typed apart from characters a storage key
 * can't hold. Spreadsheets match scans by filename ("Camden 12.jpg"), so
 * lowercasing or hyphenating here would quietly break that matching.
 */
export function cleanFileStem(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name a bucket, folder ("clean") or file will really get, exactly as the server cleans it. */
export function finalStorageName(kind: 'clean' | 'file', value: string, extension = ''): string {
  if (kind === 'clean') return cleanStorageName(value);
  const stem = cleanFileStem(value);
  return stem ? stem + extension : '';
}

/** "Camden 12.jpg" → { stem: "Camden 12", ext: ".jpg" }. Dotfiles keep their whole name as the stem. */
export function splitFileName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** Joins path segments with "/", dropping empty ones. */
export function joinPath(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join('/');
}

/** "a/b/c.jpg" → "a/b"; a top-level name → "". */
export function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** "a/b/c.jpg" → "c.jpg". */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * A folder or object path from the browser is only accepted when every segment
 * is a real name: no empty segments, no "." or "..", no leading/trailing slash.
 */
export function isSafeStoragePath(path: string): boolean {
  if (!path) return true; // the bucket root
  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** Image formats Supabase's transform endpoint can thumbnail. */
const THUMBNAIL_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

export function canThumbnail(name: string): boolean {
  return THUMBNAIL_RE.test(name);
}
