const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function buildImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${imagePath}`;
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
