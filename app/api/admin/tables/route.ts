import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dropUnusedTable, listUnusedTables, peekTable, whyNotDroppable } from '@/lib/collections/unused-tables';

/**
 * Unused records tables (lib/collections/unused-tables.ts).
 *
 * GET                  every unused table, with row counts
 * GET ?peek=table      a few of its rows
 * DELETE { table, confirm }   drop it; `confirm` must repeat the table name
 */

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const admin = createAdminClient();
  const peek = new URL(request.url).searchParams.get('peek');

  try {
    if (peek) {
      // Only unused tables can be peeked here; anything else has its own page.
      const reason = await whyNotDroppable(admin, peek);
      if (reason) return fail(reason);
      return NextResponse.json({ rows: await peekTable(admin, peek) });
    }
    return NextResponse.json({ tables: await listUnusedTables(admin) });
  } catch (err) {
    console.error('[admin/tables] read failed', err);
    return fail(err instanceof Error ? err.message : 'Could not read the tables', 502);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const { table, confirm } = (await request.json().catch(() => ({}))) as { table?: unknown; confirm?: unknown };
  if (typeof table !== 'string' || !table) return fail('table is required');
  if (confirm !== table) return fail('Type the table name exactly to confirm.');

  try {
    const problem = await dropUnusedTable(createAdminClient(), table);
    if (problem) return fail(problem, 409);
    return NextResponse.json({ success: true, dropped: table });
  } catch (err) {
    console.error('[admin/tables] drop failed', table, err);
    return fail(err instanceof Error ? err.message : 'Removing the table failed', 502);
  }
}
