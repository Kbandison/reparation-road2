import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — the persisted archive matches for one individual. By default excludes
// dismissed ones; pass ?all=1 to include them.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeAll = request.nextUrl.searchParams.get('all') === '1';

  let query = supabase
    .from('tree_individual_matches')
    .select('*')
    .eq('individual_id', id)
    .eq('user_id', user.id)
    .order('score', { ascending: false });
  if (!includeAll) query = query.neq('status', 'dismissed');

  const { data, error } = await query;
  if (error) {
    // Table not migrated yet — degrade to empty rather than erroring the UI.
    return NextResponse.json({ matches: [] });
  }
  return NextResponse.json({ matches: data ?? [] });
}
