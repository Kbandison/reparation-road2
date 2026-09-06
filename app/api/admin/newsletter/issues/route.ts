import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { getIssueStats } from '@/lib/newsletter-issue';

/** List issues, newest first, plus the stats a new draft would start with. */
export async function GET() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('newsletter_issues')
    .select('id, subject, status, segment, recipient_count, sent_at, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[newsletter] failed to list issues:', error);
    return NextResponse.json({ error: 'Could not load issues' }, { status: 500 });
  }

  return NextResponse.json({ issues: data ?? [], stats: await getIssueStats() });
}

/** Start a new draft, pre-filled with whatever the archive can supply. */
export async function POST() {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const stats = await getIssueStats();

  const { data, error } = await supabase
    .from('newsletter_issues')
    .insert({
      subject: '',
      status: 'draft',
      sections: {},
      // Stored now so the draft can show real numbers while being written, and
      // refreshed again at send time so a draft left for a week is not stale.
      auto_stats: stats,
      created_by: adminId,
    })
    .select()
    .single();

  if (error) {
    console.error('[newsletter] failed to create issue:', error);
    return NextResponse.json({ error: 'Could not create draft' }, { status: 500 });
  }

  return NextResponse.json({ issue: data });
}
