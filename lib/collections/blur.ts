import type { Collection } from '@/lib/types';

/**
 * Blurred images: collections whose scans can't be shown in full (rights,
 * licensing, or the terms agreed with a document's owner).
 *
 * When a collection is blurred, a heavily blurred copy of each scan goes into
 * BLURRED_BUCKET and every link to the scan is pointed at it, so every page
 * that shows the image shows the copy. The original moves to RESTRICTED_BUCKET,
 * which is private. Safe to import on the server or in the browser.
 */

export const BLURRED_BUCKET = 'blurred-images';
export const RESTRICTED_BUCKET = 'restricted-images';

const OBJECT_SEGMENT = '/storage/v1/object/public/';

/** The bucket a stored scan link points into: "bucket/path" or a public object URL. */
export function scanBucket(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    const at = path.indexOf(OBJECT_SEGMENT);
    if (at === -1) return null;
    const segment = path.slice(at + OBJECT_SEGMENT.length).split('/')[0] ?? '';
    try {
      return decodeURIComponent(segment) || null;
    } catch {
      return segment || null; // a stray "%": compare it as written
    }
  }
  const trimmed = path.replace(/^\/+/, '');
  return trimmed.includes('/') ? trimmed.split('/')[0] : null;
}

export const isBlurredScan = (path: string | null | undefined) => scanBucket(path) === BLURRED_BUCKET;

/**
 * How a record's scan may be shown:
 * - open: show it as usual
 * - blurred: it's the blurred copy
 * - pending: the collection is blurred but this scan hasn't been processed
 *   yet, so the original must not be shown at all
 */
export type ScanState = 'open' | 'blurred' | 'pending';

export function scanState(
  collection: Pick<Collection, 'blur_images'> | null | undefined,
  path: string | null | undefined,
): ScanState {
  if (isBlurredScan(path)) return 'blurred';
  return collection?.blur_images && path ? 'pending' : 'open';
}

/** An http(s) link that's safe to put in an href, or null. "www.x.org" gains https://. */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Where a blurred record's image leads: the record's own link (from the
 * collection's link column), else the collection's link. Null when the
 * collection isn't blurred, or neither is set, so the image keeps its usual
 * zoom / open-the-PDF behaviour.
 */
export function sourceImageLink(
  collection: Pick<Collection, 'blur_images' | 'image_link' | 'image_link_column'> | null | undefined,
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!collection?.blur_images) return null;
  const column = collection.image_link_column;
  const own = column && record ? safeExternalUrl(record[column]) : null;
  return own ?? safeExternalUrl(collection.image_link);
}

/** The site's host name for a link, for "View the original image at …". */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Where a scan's blurred copy is stored, as a "bucket/path" key. Images become
 * JPEGs (the original's name is kept and ".jpg" added, so "p1.png" and
 * "p1.jpg" in one folder can't collide); a PDF stays a PDF.
 */
export function blurredKeyFor(originalKey: string, kind: 'image' | 'pdf'): string {
  if (kind === 'pdf' || /\.jpe?g$/i.test(originalKey)) return `${BLURRED_BUCKET}/${originalKey}`;
  return `${BLURRED_BUCKET}/${originalKey}.jpg`;
}

/** Where the original is kept privately. */
export const restrictedKeyFor = (originalKey: string) => `${RESTRICTED_BUCKET}/${originalKey}`;
