import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSegmentCounts, SEGMENT_LABELS } from '@/lib/newsletter-segments';

/** List health for the admin panel: segment sizes and anything stuck. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const counts = await getSegmentCounts();
    return NextResponse.json({ ...counts, labels: SEGMENT_LABELS });
  } catch (e) {
    console.error('[newsletter] segment counts failed:', e);
    return NextResponse.json(
      { error: 'Could not load newsletter stats' },
      { status: 500 },
    );
  }
}
