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

// Core tables that must never be dropped even if some request asks for it.
const PROTECTED_TABLES = new Set([
  'collections',
  'profiles',
  'record_citations',
  'related_records',
  'bookmarks',
]);

// DELETE - remove one or more collection ENTRIES (metadata).
// By default the underlying data table is left untouched (several collections
// can share one table). Pass `dropTables: [tableName, …]` to also DROP a data
// table — but only tables that (a) belonged to a collection in this delete and
// (b) are no longer referenced by any remaining collection are actually dropped.
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, ids, dropTables } = await request.json();
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

  const requestedDrops = new Set(
    (Array.isArray(dropTables) ? dropTables : []).map((v) => String(v))
  );

  const supabase = createAdminClient();

  // Resolve slug + table_name of the collections being deleted.
  const { data: targets, error: tErr } = await supabase
    .from('collections')
    .select('id, slug, table_name')
    .in('id', targetIds);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 });

  const targetSlugs = (targets || []).map((t) => t.slug).filter(Boolean);
  // Tables that actually belonged to a collection in this delete — the only
  // tables we'll ever consider dropping.
  const targetTables = new Set(
    (targets || []).map((t) => t.table_name).filter((t): t is string => !!t)
  );

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

  // Batched delete of the collection metadata rows.
  for (let i = 0; i < targetIds.length; i += 100) {
    const chunk = targetIds.slice(i, i + 100);
    const { error } = await supabase.from('collections').delete().in('id', chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Optionally drop data tables that are now fully unused.
  const droppedTables: string[] = [];
  const keptTables: string[] = [];
  for (const table of requestedDrops) {
    // Only tables that belonged to a deleted collection, with a safe name, not
    // on the protected list.
    if (
      !targetTables.has(table) ||
      PROTECTED_TABLES.has(table) ||
      !/^[a-z0-9_]+$/i.test(table)
    ) {
      keptTables.push(table);
      continue;
    }

    // Skip if any remaining collection still references this table.
    const { count } = await supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('table_name', table);
    if ((count ?? 0) > 0) {
      keptTables.push(table);
      continue;
    }

    const { error: dropErr } = await supabase.rpc('exec_sql', {
      sql_text: `DROP TABLE IF EXISTS public."${table}" CASCADE; NOTIFY pgrst, 'reload schema';`,
    });
    if (dropErr) {
      keptTables.push(table);
      continue;
    }

    // Clean up override / relationship rows that pointed at the dropped table.
    await supabase.from('record_citations').delete().eq('table_name', table);
    await supabase
      .from('related_records')
      .delete()
      .or(`source_table.eq.${table},target_table.eq.${table}`);

    droppedTables.push(table);
  }

  return NextResponse.json({
    success: true,
    deleted: targetIds.length,
    droppedTables,
    keptTables,
  });
}
