import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPdfPath } from '@/lib/collections/helpers';
import type { Collection } from '@/lib/types';

// Returns the ordered list of DISTINCT viewable page scans for a whole
// collection (not just one pagination page), so the full-screen viewer can
// flip through every page. Empty and PDF references are excluded.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectionSlug = searchParams.get('collection');
  if (!collectionSlug) {
    return NextResponse.json({ error: 'collection is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // The slug may be hierarchical (parent/sub/leaf) — resolve to the leaf
  // collection that actually has a table.
  const slugParts = collectionSlug.split('/').filter(Boolean);
  let collection: Collection | null = null;
  for (const part of slugParts) {
    const { data: col } = await supabase
      .from('collections')
      .select('*')
      .eq('slug', part)
      .single();
    if (col && col.table_name) {
      collection = col as Collection;
      break;
    }
  }

  if (!collection || !collection.table_name || !collection.has_images) {
    return NextResponse.json({ images: [] });
  }

  // Order by the collection's natural document order when defined, else the
  // first display column — so pages appear in reading order.
  const orderCols =
    collection.sort_columns && collection.sort_columns.length > 0
      ? collection.sort_columns
      : collection.display_columns && collection.display_columns.length > 0
        ? [collection.display_columns[0]]
        : [];

  const images: string[] = [];
  const seen = new Set<string>();
  const pageSize = 1000;
  const MAX_ROWS = 20000; // safety cap for very large tables
  let from = 0;

  for (;;) {
    let q = supabase.from(collection.table_name).select('image_path');
    if (collection.discriminator_column && collection.discriminator_value) {
      q = q.ilike(collection.discriminator_column, collection.discriminator_value);
    }
    for (const c of orderCols) q = q.order(c, { ascending: true });

    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) {
      // e.g. table lacks image_path — nothing to page through.
      return NextResponse.json({ images: [] });
    }

    const rows = (data as { image_path?: unknown }[]) || [];
    for (const r of rows) {
      const img = String(r.image_path ?? '').trim();
      if (!img || isPdfPath(img) || seen.has(img)) continue;
      seen.add(img);
      images.push(img);
    }

    if (rows.length < pageSize || from + pageSize >= MAX_ROWS) break;
    from += pageSize;
  }

  return NextResponse.json({ images });
}
