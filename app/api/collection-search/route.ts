import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getViewerAccess } from '@/lib/collections/access';
import { searchArchive } from '@/lib/collections/search';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const results = await searchArchive({
    query: searchParams.get('q') ?? '',
    collectionSlug: searchParams.get('collection'),
    offset: parseInt(searchParams.get('offset') || '0', 10) || 0,
    viewer: await getViewerAccess(await createClient()),
    supabase: createAdminClient(),
  });
  return NextResponse.json(results);
}
