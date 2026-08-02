import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

// DELETE - remove one or more collection ENTRIES (metadata only).
// The underlying data table and its records are left untouched — several
// collections can share one table, and a table can be re-attached later.
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, ids } = await request.json();
  const targetIds = [
    ...new Set(
      [...(id ? [id] : []), ...(Array.isArray(ids) ? ids : [])]
        .map((v) => String(v))
        .filter(Boolean)
    ),
  ];
  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'id or ids is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve the slugs of the collections being deleted so we can check for
  // children that would be orphaned.
  const { data: targets, error: tErr } = await supabase
    .from('collections')
    .select('id, slug')
    .in('id', targetIds);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  const targetSlugs = (targets || []).map((t) => t.slug).filter(Boolean);

  // Guard: refuse if any collection being deleted still has child collections
  // that aren't also part of this delete — otherwise those children would
  // dangle off a missing parent and vanish from the browse tree.
  if (targetSlugs.length > 0) {
    const { data: children, error: cErr } = await supabase
      .from('collections')
      .select('id, name, parent_slug')
      .in('parent_slug', targetSlugs);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

    const orphaned = (children || []).filter((c) => !targetIds.includes(c.id));
    if (orphaned.length > 0) {
      const names = orphaned.map((c) => c.name).join(', ');
      return NextResponse.json(
        {
          error:
            `Can't delete — this would orphan ${orphaned.length} child ` +
            `collection${orphaned.length === 1 ? '' : 's'}: ${names}. ` +
            `Delete or re-parent ${orphaned.length === 1 ? 'it' : 'them'} first.`,
        },
        { status: 409 }
      );
    }
  }

  // Batched delete to keep the request URL within PostgREST limits.
  for (let i = 0; i < targetIds.length; i += 100) {
    const chunk = targetIds.slice(i, i + 100);
    const { error } = await supabase.from('collections').delete().in('id', chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, deleted: targetIds.length });
}
