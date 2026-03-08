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

  // Get collection metadata
  const { data: col } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', collectionSlug)
    .single();

  if (!col || !col.table_name) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  const collection = col as Collection;

  // Fetch the record
  let query = supabase.from(collection.table_name!).select('*').eq('id', recordId);

  if (collection.discriminator_column && collection.discriminator_value) {
    query = query.eq(collection.discriminator_column, collection.discriminator_value);
  }

  const { data: record, error } = await query.maybeSingle();

  if (error || !record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  return NextResponse.json({ collection, record });
}
