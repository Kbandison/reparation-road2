import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { getIssueStats, renderIssueHtml } from '@/lib/newsletter-issue';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: issue } = await supabase
    .from('newsletter_issues')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A sent issue shows the numbers it actually went out with; a draft shows
  // current ones, because that is what it will send with.
  const stats = issue.status === 'sent' ? issue.auto_stats : await getIssueStats();

  const preview = renderIssueHtml(
    { subject: issue.subject || 'Untitled issue', sections: issue.sections, auto_stats: stats },
    { email: 'preview@reparationroad.org' },
  );

  return NextResponse.json({ issue, stats, preview });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('newsletter_issues')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A sent issue is a record of what people received. Editing it would make
  // the archive disagree with their inboxes.
  if (existing.status === 'sent') {
    return NextResponse.json(
      { error: 'This issue has already been sent and cannot be edited.' },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.subject === 'string') updates.subject = body.subject;
  if (typeof body.preview_text === 'string') updates.preview_text = body.preview_text;
  if (typeof body.segment === 'string') updates.segment = body.segment;
  if (body.sections && typeof body.sections === 'object') updates.sections = body.sections;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('newsletter_issues')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[newsletter] failed to update issue:', error);
    return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  }

  return NextResponse.json({ issue: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('newsletter_issues')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  if (existing?.status === 'sent') {
    return NextResponse.json(
      { error: 'Sent issues are kept as a record of what went out.' },
      { status: 409 },
    );
  }

  await supabase.from('newsletter_issues').delete().eq('id', id);
  return NextResponse.json({ success: true });
}
