import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Collection } from '@/lib/types';

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

export async function POST() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();

  // Get all collections that have a table_name
  const { data: collections } = await supabase
    .from('collections')
    .select('id, slug, table_name, discriminator_column, discriminator_value, record_count')
    .not('table_name', 'is', null);

  if (!collections) {
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }

  const updates: { slug: string; old: number; new: number }[] = [];

  // Count all collections in parallel
  const results = await Promise.all(
    (collections as Collection[]).filter((c) => c.table_name).map(async (col) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from(col.table_name!)
        .select('id', { count: 'exact', head: true });

      if (col.discriminator_column && col.discriminator_value) {
        query = query.ilike(col.discriminator_column, col.discriminator_value);
      }

      const { count } = await query;
      return { col, liveCount: count || 0 };
    })
  );

  // Update stale leaf counts in parallel
  const countMap = new Map<string, number>();
  await Promise.all(
    results
      .map(async ({ col, liveCount }) => {
        countMap.set(col.slug, liveCount);
        if (liveCount !== col.record_count) {
          await supabase
            .from('collections')
            .update({ record_count: liveCount })
            .eq('id', col.id);
          updates.push({ slug: col.slug, old: col.record_count, new: liveCount });
        }
      })
  );

  // Also sync parent collections — sum their children's counts
  const { data: allCollections } = await supabase
    .from('collections')
    .select('id, slug, table_name, parent_slug, record_count');

  if (allCollections) {
    const parents = (allCollections as Collection[]).filter((c) => !c.table_name);

    for (const parent of parents) {
      const childSum = (allCollections as Collection[])
        .filter((c) => c.parent_slug === parent.slug)
        .reduce((sum, c) => sum + (countMap.get(c.slug) ?? c.record_count), 0);

      if (childSum !== parent.record_count) {
        await supabase
          .from('collections')
          .update({ record_count: childSum })
          .eq('id', parent.id);
        updates.push({ slug: parent.slug, old: parent.record_count, new: childSum });
      }
    }
  }

  return NextResponse.json({
    success: true,
    synced: updates.length,
    total: collections.length,
    updates,
  });
}
