import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingSchema, MIGRATION_NEEDED } from '@/lib/ai/client';
import { accountLevel, AiLimitsSchema, getAiLimits } from '@/lib/ai/limits';
import { monthStart, spendThisMonth } from '@/lib/ai/usage';
import { remainingBudget } from '@/lib/transcription/runs';
import type { Profile } from '@/lib/types';

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : 'Something went wrong';
  if (isMissingSchema(message)) return NextResponse.json({ error: MIGRATION_NEEDED }, { status: 503 });
  console.error('[ai-usage]', message);
  return NextResponse.json({ error: message }, { status: 500 });
}

// GET — this month's AI spend, per feature and per user, with the caps in force.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();
  try {
    const [budget, byFeature, limits, users] = await Promise.all([
      remainingBudget(admin),
      spendThisMonth(admin),
      getAiLimits(admin),
      admin.rpc('ai_usage_by_user', { p_since: monthStart().toISOString() }),
    ]);
    if (users.error) throw new Error(users.error.message);

    const rows = (users.data ?? []) as { user_id: string; messages: number; cost_usd: number | string }[];
    const ids = rows.map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await admin.from('profiles').select('id, first_name, last_name, email, role, subscription_status').in('id', ids)
      : { data: [] };
    const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));

    return NextResponse.json({
      budget,
      limits,
      byFeature,
      byUser: rows
        .map((r) => {
          const p = byId.get(r.user_id) ?? null;
          return {
            userId: r.user_id,
            name: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || 'Deleted account',
            email: p?.email ?? null,
            level: accountLevel(p),
            messages: r.messages,
            costUsd: Number(r.cost_usd),
          };
        })
        .sort((a, b) => b.costUsd - a.costUsd),
    });
  } catch (err) {
    return fail(err);
  }
}

// PUT — change the caps and budget. Takes effect on the next message.
export async function PUT(request: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON request body' }, { status: 400 });
  }
  const parsed = AiLimitsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Caps must be whole numbers and the budget a positive amount' }, { status: 400 });
  if (parsed.data.assistant_pause_usd > parsed.data.monthly_budget_usd) {
    return NextResponse.json({ error: 'The assistant pause point can’t be above the monthly budget' }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key: 'ai_limits', value: parsed.data, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) return fail(new Error(error.message));
  return NextResponse.json({ limits: parsed.data });
}
