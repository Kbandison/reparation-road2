import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingSchema, MIGRATION_NEEDED } from '@/lib/ai/client';
import { accountLevel, assistantAllowance } from '@/lib/ai/limits';
import type { AllowanceView } from '@/lib/assistant/types';

// GET — how many assistant questions the signed-in user has used, and their caps.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, subscription_status').eq('id', user.id).single();
  try {
    const allowance = await assistantAllowance(createAdminClient(), user.id, accountLevel(profile));
    const body: AllowanceView = { level: allowance.level, caps: allowance.caps, usedToday: allowance.usedToday, usedMonth: allowance.usedMonth };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (isMissingSchema(message)) return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 });
    console.error('[assistant] usage failed', message);
    return NextResponse.json({ error: 'Could not read usage' }, { status: 500 });
  }
}
