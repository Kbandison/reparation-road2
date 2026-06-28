import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/family-tree/fetch-all';
import { fullName, lifespan } from '@/lib/family-tree/display';
import { PersonProfile, type RelRef, type ProfileEvent } from '@/components/family-tree/person-profile';
import type {
  FamilyTree,
  TreeIndividual,
  TreeRelationship,
  TreeArchiveMatch,
  TreeEvent,
  TreeSource,
  TreeCitation,
  TreeMedia,
} from '@/lib/types';

function yearOf(date: string | null): number {
  const m = date?.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

interface Props {
  params: Promise<{ treeId: string; personId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { treeId, personId } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from('tree_individuals')
    .select('given_name, surname')
    .eq('id', personId)
    .eq('tree_id', treeId)
    .maybeSingle();
  return { title: person ? `${fullName(person) || 'Person'} — Family Tree` : 'Person' };
}

export default async function PersonProfilePage({ params }: Props) {
  const { treeId, personId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: tree } = await supabase
    .from('family_trees')
    .select('*')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) notFound();

  const { data: person } = await supabase
    .from('tree_individuals')
    .select('*')
    .eq('id', personId)
    .eq('tree_id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!person) notFound();

  const [allInds, rels] = await Promise.all([
    fetchAllRows<TreeIndividual>(supabase, 'tree_individuals', { tree_id: treeId }),
    fetchAllRows<TreeRelationship>(supabase, 'tree_relationships', { tree_id: treeId }),
  ]);

  // Persisted archive matches (suggested + linked; dismissed excluded).
  let matches: TreeArchiveMatch[] = [];
  {
    const { data } = await supabase
      .from('tree_individual_matches')
      .select('*')
      .eq('individual_id', personId)
      .neq('status', 'dismissed')
      .order('score', { ascending: false });
    matches = (data as TreeArchiveMatch[]) ?? [];
  }

  // Life events for this person (degrades to empty before the full-import
  // migration is run).
  let events: TreeEvent[] = [];
  {
    const { data } = await supabase
      .from('tree_events')
      .select('*')
      .eq('individual_id', personId)
      .eq('user_id', user.id)
      .order('position');
    events = (data as TreeEvent[]) ?? [];
  }

  // Resolve the sources cited by this person (events + direct citations).
  const citedXrefs = new Set<string>();
  for (const e of events) for (const c of e.sources ?? []) if (c.source_xref) citedXrefs.add(c.source_xref);
  for (const c of ((person as TreeIndividual).citations ?? []) as TreeCitation[]) {
    if (c?.source_xref) citedXrefs.add(c.source_xref);
  }

  let sources: TreeSource[] = [];
  if (citedXrefs.size > 0) {
    const { data } = await supabase
      .from('tree_sources')
      .select('*')
      .eq('tree_id', treeId)
      .in('gedcom_xref', [...citedXrefs]);
    sources = (data as TreeSource[]) ?? [];
  }
  const sourceByXref = new Map(sources.map((s) => [s.gedcom_xref, s]));

  // Photos for this person (degrades to empty before the media migration).
  let media: TreeMedia[] = [];
  {
    const { data } = await supabase
      .from('tree_media')
      .select('*')
      .eq('individual_id', personId)
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at');
    media = (data as TreeMedia[]) ?? [];
  }

  // ── Relatives ──────────────────────────────────────────────────────────
  const byId = new Map(allInds.map((i) => [i.id, i]));
  const ref = (id: string, parentType?: string | null): RelRef | null => {
    const p = byId.get(id);
    if (!p) return null;
    return { id, name: fullName(p) || 'Unnamed', lifespan: lifespan(p), parentType: parentType ?? null };
  };

  const parentIds = new Set<string>();
  const childIds = new Set<string>();
  const spouseIds = new Set<string>();
  const parentTypeById = new Map<string, string | null>();

  for (const r of rels) {
    if (r.type === 'parent') {
      if (r.to_id === personId) {
        parentIds.add(r.from_id);
        parentTypeById.set(r.from_id, r.parent_type ?? null);
      }
      if (r.from_id === personId) childIds.add(r.to_id);
    } else if (r.type === 'spouse') {
      if (r.from_id === personId) spouseIds.add(r.to_id);
      else if (r.to_id === personId) spouseIds.add(r.from_id);
    }
  }

  // Siblings: anyone who shares a parent with this person.
  const siblingIds = new Set<string>();
  for (const r of rels) {
    if (r.type === 'parent' && parentIds.has(r.from_id) && r.to_id !== personId) {
      siblingIds.add(r.to_id);
    }
  }

  const dedupe = (refs: (RelRef | null)[]): RelRef[] => {
    const seen = new Set<string>();
    const out: RelRef[] = [];
    for (const r of refs) {
      if (r && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
    return out;
  };

  const relatives = {
    parents: dedupe([...parentIds].map((id) => ref(id, parentTypeById.get(id)))),
    spouses: dedupe([...spouseIds].map((id) => ref(id))),
    children: dedupe([...childIds].map((id) => ref(id))),
    siblings: dedupe([...siblingIds].map((id) => ref(id))),
  };

  // Display-ready events: resolve the marriage partner's name + source titles,
  // and sort by year (undated events keep their original order at the end).
  const profileEvents: ProfileEvent[] = events
    .map((e, i) => ({
      id: e.id,
      label: e.label,
      type: e.type,
      date: e.date,
      place: e.place,
      value: e.value,
      note: e.note,
      relatedName: e.related_individual_id
        ? (() => {
            const r = byId.get(e.related_individual_id);
            return r ? fullName(r) || 'Unnamed' : null;
          })()
        : null,
      citations: (e.sources ?? []).map((c) => ({
        title: c.source_xref ? sourceByXref.get(c.source_xref)?.title ?? c.source_xref : null,
        page: c.page,
        text: c.text,
      })),
      _sort: [yearOf(e.date), e.position, i] as [number, number, number],
    }))
    .sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1] - b._sort[1] || a._sort[2] - b._sort[2])
    .map(({ _sort, ...e }) => {
      void _sort;
      return e;
    });

  return (
    <PersonProfile
      treeId={treeId}
      treeName={(tree as FamilyTree).name}
      initialPerson={person as TreeIndividual}
      relatives={relatives}
      initialMatches={matches}
      events={profileEvents}
      sources={sources}
      media={media}
    />
  );
}
