import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TreeList, type TreeWithCount } from '@/components/family-tree/tree-list';
import { fetchAllRows } from '@/lib/family-tree/fetch-all';
import type { FamilyTree } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Family Tree',
};

export default async function FamilyTreePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trees } = await supabase
    .from('family_trees')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false });

  // Per-tree people counts (paged so trees over 1000 people count correctly).
  const people = await fetchAllRows<{ tree_id: string }>(
    supabase,
    'tree_individuals',
    { user_id: user!.id },
    { select: 'tree_id' }
  );

  const counts = new Map<string, number>();
  for (const row of people) {
    counts.set(row.tree_id, (counts.get(row.tree_id) ?? 0) + 1);
  }

  const withCounts: TreeWithCount[] = ((trees as FamilyTree[]) ?? []).map((t) => ({
    ...t,
    count: counts.get(t.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Your research"
        title="Family Tree"
        description="Build your family tree, import a GEDCOM file, and connect your ancestors to records across the archive."
      />
      <TreeList initialTrees={withCounts} />
    </>
  );
}
