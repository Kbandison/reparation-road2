import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getRelatedRecordsMode,
  setRelatedRecordsMode,
  getConfidenceCutoff,
  setConfidenceCutoff,
  type RelatedRecordsMode,
} from '@/lib/related-ai/settings';

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

// GET — current related-records mode + AI confidence cutoff.
export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const supabase = createAdminClient();
  const [mode, cutoff] = await Promise.all([
    getRelatedRecordsMode(supabase),
    getConfidenceCutoff(supabase),
  ]);
  return NextResponse.json({ mode, cutoff });
}

// PATCH — set the mode (reversible toggle) and/or the confidence cutoff.
export async function PATCH(request: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));

  if (body.mode === 'ai' || body.mode === 'algorithmic') {
    await setRelatedRecordsMode(supabase, body.mode as RelatedRecordsMode);
  }
  if (typeof body.cutoff === 'number') {
    await setConfidenceCutoff(supabase, body.cutoff);
  }

  const [mode, cutoff] = await Promise.all([
    getRelatedRecordsMode(supabase),
    getConfidenceCutoff(supabase),
  ]);
  return NextResponse.json({ mode, cutoff });
}
