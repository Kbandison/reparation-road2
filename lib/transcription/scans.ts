import type { SupabaseClient } from '@supabase/supabase-js';
import { referenceKey } from '@/lib/storage/references';
import { getColumnTypes } from '@/lib/import/table-schema';
import { isPdfPath } from '@/lib/collections/helpers';
import type { Collection } from '@/lib/types';

// Server-only: reads collection tables with the service-role client.

/** Claude reads images up to 2576px on the long edge; larger ones would be scaled down anyway. */
const MAX_EDGE = 2576;

/** The bucket holding the "image coming soon" stand-in many records point at. */
const PLACEHOLDER_BUCKET = 'placeholder';

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/**
 * The scan as Claude should see it. Originals run up to ~35 MB; Supabase's
 * transform endpoint returns a JPEG under ~1 MB at full model resolution.
 */
export function transcriptionImageUrl(key: string): string {
  const params = new URLSearchParams({ width: String(MAX_EDGE), height: String(MAX_EDGE), resize: 'contain', quality: '85' });
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${RENDER_SEGMENT}${encodeKey(key)}?${params}`;
}

/** Every way a record's image_path can spell this scan, for finding the records on a page. */
export function storedFormsOf(key: string): string[] {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${OBJECT_SEGMENT}`;
  return [...new Set([key, `/${key}`, `${base}${key}`, `${base}${encodeKey(key)}`])];
}

/** The scan a stored image_path points at, when it's one Claude can transcribe. */
export function transcribableKey(imagePath: unknown): string | null {
  const value = String(imagePath ?? '').trim();
  if (!value || isPdfPath(value)) return null;
  const key = referenceKey(value);
  if (!key || key.startsWith(`${PLACEHOLDER_BUCKET}/`)) return null;
  return key;
}

type ScanCollection = Pick<Collection, 'slug' | 'table_name' | 'discriminator_column' | 'discriminator_value'>;

export interface ScanSummary {
  key: string;
  /** How many of the collection's records sit on this page. */
  records: number;
  /** At least one of those records already has OCR text. */
  hasOcr: boolean;
  transcribed: boolean;
}

export interface CollectionScans {
  scans: ScanSummary[];
  /** Records whose image can't be transcribed: no image, a PDF, the placeholder, or a bare filename. */
  recordsWithoutScan: number;
}

const PAGE = 1000;

/** Every distinct scan in a collection, with whether it's transcribed and whether its records have OCR text. */
export async function listCollectionScans(admin: SupabaseClient, collection: ScanCollection): Promise<CollectionScans> {
  const table = collection.table_name;
  if (!table) return { scans: [], recordsWithoutScan: 0 };

  const columns = await getColumnTypes(table);
  if (!columns?.has('image_path')) return { scans: [], recordsWithoutScan: 0 };
  const hasOcrColumn = columns.has('ocr_text');
  // Stable paging needs an order; a few older tables have no id column.
  const orderBy = columns.has('id') ? 'id' : 'image_path';

  const scoped = (select: string) => {
    let q = admin.from(table).select(select);
    if (collection.discriminator_column && collection.discriminator_value) {
      q = q.ilike(collection.discriminator_column, collection.discriminator_value);
    }
    return q;
  };

  // Only the image column is read.
  const byKey = new Map<string, ScanSummary>();
  let recordsWithoutScan = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await scoped('image_path').order(orderBy).range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as { image_path: unknown }[];
    for (const row of rows) {
      const key = transcribableKey(row.image_path);
      if (!key) {
        recordsWithoutScan++;
        continue;
      }
      const scan = byKey.get(key);
      if (scan) scan.records++;
      else byKey.set(key, { key, records: 1, hasOcr: false, transcribed: false });
    }
    if (rows.length < PAGE) break;
  }

  // Which pages already have OCR text on at least one of their records. Reads
  // image paths only, never the OCR text itself.
  if (hasOcrColumn) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await scoped('image_path')
        .not('ocr_text', 'is', null)
        .neq('ocr_text', '')
        .order(orderBy)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Couldn't read OCR status in ${table}: ${error.message}`);
      const rows = (data ?? []) as unknown as { image_path: unknown }[];
      for (const row of rows) {
        const scan = byKey.get(transcribableKey(row.image_path) ?? '');
        if (scan) scan.hasOcr = true;
      }
      if (rows.length < PAGE) break;
    }
  }

  for (const key of await transcribedKeys(admin, [...byKey.keys()])) byKey.get(key)!.transcribed = true;

  return { scans: [...byKey.values()], recordsWithoutScan };
}

/** The subset of these scans that already have a transcript. */
export async function transcribedKeys(admin: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  // Keys can be long; 100 per request keeps the URL well under limits.
  for (let i = 0; i < keys.length; i += 100) {
    const { data, error } = await admin.from('scan_transcriptions').select('image_key').in('image_key', keys.slice(i, i + 100));
    if (error) throw new Error(`Couldn't read transcripts: ${error.message}`);
    for (const row of data ?? []) done.add(row.image_key as string);
  }
  return done;
}
