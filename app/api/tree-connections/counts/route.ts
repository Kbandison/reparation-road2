import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getOverlapCountsByIndividual,
  isSharingEnabled,
} from '@/lib/tree-connections';

/**
 * How many other researchers hold each of the caller's individuals.
 *
 * Counts rather than matches: the canvas draws hundreds of people at once and
 * only needs a number per node.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isSharingEnabled(user.id))) {
    return NextResponse.json({ sharing: false, counts: {} });
  }

  return NextResponse.json({
    sharing: true,
    counts: await getOverlapCountsByIndividual(user.id),
  });
}
