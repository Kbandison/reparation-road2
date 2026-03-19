import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectionSlug = searchParams.get('collection');
  const recordId = searchParams.get('id');

  if (!collectionSlug || !recordId) {
    return NextResponse.json({ error: 'collection and id are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // collection_slug may be hierarchical (parent/sub/record-slug)
  // Try each segment to find a leaf collection with a table_name
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

  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  // Try fetching by id first, then by slug
  let query = supabase.from(collection.table_name!).select('*').eq('id', recordId);

  if (collection.discriminator_column && collection.discriminator_value) {
    query = query.ilike(collection.discriminator_column, collection.discriminator_value);
  }

  let { data: record } = await query.maybeSingle();

  // Fallback: try by slug if id didn't match
  if (!record) {
    let slugQuery = supabase.from(collection.table_name!).select('*').eq('slug', recordId);

    if (collection.discriminator_column && collection.discriminator_value) {
      slugQuery = slugQuery.ilike(collection.discriminator_column, collection.discriminator_value);
    }

    const { data: bySlug } = await slugQuery.maybeSingle();
    record = bySlug;
  }

  if (!record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  return NextResponse.json({ collection, record });
}
