import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TreeHeader } from '@/components/family-tree/tree-header';
import { TreeCanvas } from '@/components/family-tree/tree-canvas';
import type { FamilyTree, TreeIndividual, TreeRelationship } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Family Tree',
};

export default async function TreeBuilderPage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tree } = await supabase
    .from('family_trees')
    .select('*')
    .eq('id', treeId)
    .eq('user_id', user!.id)
    .maybeSingle();

  if (!tree) notFound();

  const [{ data: individuals }, { data: relationships }] = await Promise.all([
    supabase
      .from('tree_individuals')
      .select('*')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: true }),
    supabase.from('tree_relationships').select('*').eq('tree_id', treeId),
  ]);

  return (
    // Break out of the platform layout's centered, padded container so the
    // canvas fills the whole area below the top nav and right of the sidebar.
    <div className="fixed top-16 left-0 right-0 bottom-0 lg:left-[260px] flex flex-col bg-brand-bg">
      <div className="shrink-0 border-b border-brand-gold/[0.08] px-4 md:px-6 py-3">
        <TreeHeader tree={tree as FamilyTree} />
      </div>
      <div className="flex-1 min-h-0">
        <TreeCanvas
          tree={tree as FamilyTree}
          initialIndividuals={(individuals as TreeIndividual[]) ?? []}
          initialRelationships={(relationships as TreeRelationship[]) ?? []}
        />
      </div>
    </div>
  );
}
