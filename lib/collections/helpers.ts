const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

interface ImageUrlOptions {
  /** Cap the rendered width (px) via Supabase's image transform endpoint. */
  width?: number;
  /** Image quality 20-100 (default 75 when a width is set). */
  quality?: number;
}

/**
 * True when a stored media path is a PDF. PDFs can't go through Supabase's
 * image transform endpoint (it returns 400) and won't render in an <img>, so
 * callers display them in an <iframe> instead. Tolerates a trailing query
 * string (e.g. a signed URL).
 */
export function isPdfPath(path: string | null | undefined): boolean {
  return !!path && /\.pdf(?:$|\?)/i.test(path);
}

/**
 * Resolves a record's `image_path` to a displayable URL. Passing a `width`
 * routes through Supabase's on-the-fly image transform endpoint, which is
 * essential for the archival scans — originals run 20-35 MB each, far too
 * large to ship to the browser raw.
 */
export function buildImageUrl(
  imagePath: string | null | undefined,
  options?: ImageUrlOptions,
): string | null {
  if (!imagePath) return null;

  // Resolve to a Supabase storage object URL. External (non-Supabase) URLs
  // can't be transformed, so they pass straight through.
  let url: string;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    if (!imagePath.includes(OBJECT_SEGMENT)) return imagePath;
    url = imagePath;
  } else {
    // Encode each path segment so spaces / punctuation in scan filenames
    // (e.g. "henderson 6.jpg") produce a valid URL.
    const encoded = imagePath.split('/').map(encodeURIComponent).join('/');
    url = `${SUPABASE_URL}${OBJECT_SEGMENT}${encoded}`;
  }

  // PDFs aren't supported by the image transform endpoint — always hand back
  // the raw object URL so it can be embedded in an <iframe>.
  if (!options?.width || isPdfPath(imagePath)) return url;

  const params = new URLSearchParams({
    width: String(options.width),
    quality: String(options.quality ?? 75),
    // Without an explicit mode Supabase keeps the original height and crops
    // the width to a strip — `contain` scales the whole image proportionally.
    resize: 'contain',
  });
  return `${url.replace(OBJECT_SEGMENT, RENDER_SEGMENT)}?${params}`;
}

// Common per-record name fields, in priority order. The first one with a
// non-empty string value wins. Tuned for the genealogy/archival domain.
const NAME_FIELDS = [
  'name',
  'full_name',
  'soldier_name',
  'enslaved_person',
  'head_of_family',
  'principal_name',
  'recipient_name',
  'person_name',
  'child',
  'enslaver',
  'by_whom_enslaved',
  'enslaver_family',
  'to_whom_sold',
];

function readString(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Pick a human-readable title for a record. Tries, in order:
 *   1. The collection's explicit title_columns (joined with spaces).
 *   2. Common name fields (`name`, `full_name`, `enslaved_person`, ...).
 *   3. A last_name + first_name combo if both exist.
 *   4. The collection's display_columns[0] as last resort.
 *
 * This keeps tables like `slave_merchants` (whose first display column is the
 * vessel name) from labeling every related-record card with a vessel ID
 * instead of the actual person.
 */
export function getRecordTitle(
  record: Record<string, unknown>,
  collectionOrDisplay: { display_columns?: string[]; title_columns?: string[] | null } | string[],
): string {
  const displayColumns = Array.isArray(collectionOrDisplay)
    ? collectionOrDisplay
    : collectionOrDisplay.display_columns || [];
  const titleColumns = Array.isArray(collectionOrDisplay)
    ? null
    : collectionOrDisplay.title_columns;

  // 1. Explicit title_columns from collection metadata.
  if (titleColumns && titleColumns.length > 0) {
    const parts = titleColumns
      .map((c) => readString(record, c))
      .filter((v): v is string => !!v);
    if (parts.length > 0) return parts.join(' ');
  }

  // 2. Known name fields.
  for (const field of NAME_FIELDS) {
    const v = readString(record, field);
    if (v) return v;
  }

  // 3. last_name + first_name combo.
  const last = readString(record, 'last_name');
  const first = readString(record, 'first_name');
  if (last || first) {
    return [first, last].filter(Boolean).join(' ');
  }

  // 4. First populated display column.
  for (const col of displayColumns) {
    const v = readString(record, col);
    if (v) return v;
  }

  return (record.slug as string) || (record.id as string) || 'Untitled';
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    census: 'bg-brand-gold/10 text-brand-gold',
    'church-records': 'bg-brand-sage/10 text-brand-sage',
    military: 'bg-brand-burgundy/10 text-brand-burgundy-light',
    'slave-trade': 'bg-red-500/10 text-red-400',
    legal: 'bg-blue-500/10 text-blue-400',
    immigration: 'bg-teal-500/10 text-teal-400',
    property: 'bg-amber-500/10 text-amber-400',
  };
  return colors[category] || 'bg-brand-muted/10 text-brand-muted';
}

/** The image reference a record points at (relative path or full URL), or ''. */
export function imagePathOf(record: Record<string, unknown> | null | undefined): string {
  if (!record) return '';
  return String((record.image_path as string) || (record.image_url as string) || '');
}

// Consecutive records in a listing often share one page scan (e.g. several
// registrations on the same page). These find the next/previous record whose
// image is a *different* viewable scan, so full-screen paging jumps to the next
// page rather than the next record (which would show the same image). Empty and
// PDF references are skipped. Returns null when there's no further distinct
// image in that direction.
export function nextImageIndex(
  records: Record<string, unknown>[],
  idx: number
): number | null {
  const img = imagePathOf(records[idx]);
  if (!img) return null;
  for (let j = idx + 1; j < records.length; j++) {
    const other = imagePathOf(records[j]);
    if (other && other !== img && !isPdfPath(other)) return j;
  }
  return null;
}

export function prevImageIndex(
  records: Record<string, unknown>[],
  idx: number
): number | null {
  const img = imagePathOf(records[idx]);
  if (!img) return null;
  for (let j = idx - 1; j >= 0; j--) {
    const other = imagePathOf(records[j]);
    if (other && other !== img && !isPdfPath(other)) return j;
  }
  return null;
}
