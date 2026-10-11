import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fullName } from '@/lib/family-tree/display';
import { resolveRecord, syncArchivePointer } from '@/lib/family-tree/saved-records';

// Archive records saved to people in the signed-in user's family trees. The
// /api/family-tree path is already limited to family-tree users by the
// middleware; every query here is also scoped to the caller's own rows.

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET ?collection=&record= — who in the caller's trees this record is saved to.
export async function GET(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection');
  const record = searchParams.get('record');
  if (!collection || !record) return NextResponse.json({ error: 'collection and record are required' }, { status: 400 });

  const { data: rows, error } = await supabase
    .from('tree_individual_matches')
    .select('id, individual_id, tree_id')
    .eq('user_id', user.id)
    .eq('collection_slug', collection)
    .eq('record_id', record)
    .eq('status', 'linked');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ saved: [] });

  const [{ data: people }, { data: trees }] = await Promise.all([
    supabase.from('tree_individuals').select('id, given_name, surname').in('id', rows.map((r) => r.individual_id)),
    supabase.from('family_trees').select('id, name').in('id', [...new Set(rows.map((r) => r.tree_id))]),
  ]);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const treeById = new Map((trees ?? []).map((t) => [t.id, t]));

  return NextResponse.json({
    saved: rows.map((r) => {
      const person = personById.get(r.individual_id);
      return {
        matchId: r.id,
        individualId: r.individual_id,
        treeId: r.tree_id,
        personName: (person && fullName(person)) || 'Unnamed',
        treeName: treeById.get(r.tree_id)?.name ?? 'Family tree',
      };
    }),
  });
}

// POST { individualId, collectionSlug, recordId } — save a record to a person.
export async function POST(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const individualId = String(body.individualId || '');
  const collectionSlug = String(body.collectionSlug || '');
  const recordId = String(body.recordId || '');
  if (!individualId || !collectionSlug || !recordId) {
    return NextResponse.json({ error: 'individualId, collectionSlug and recordId are required' }, { status: 400 });
  }

  const { data: person } = await supabase
    .from('tree_individuals')
    .select('id, tree_id, given_name, surname')
    .eq('id', individualId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: 'That person isn’t in one of your trees.' }, { status: 404 });

  const resolved = await resolveRecord(supabase, collectionSlug, recordId);
  if (!resolved) return NextResponse.json({ error: 'That record couldn’t be found in the archive.' }, { status: 404 });

  const fields = {
    status: 'linked',
    title: resolved.title,
    collection_name: resolved.collection.name,
    record_slug: resolved.recordSlug,
    detail_url: resolved.detailUrl,
  };

  // The record may already be a suggestion (or a dismissed one) for this person:
  // promote that row, keeping its match score and reasons.
  const { data: existing } = await supabase
    .from('tree_individual_matches')
    .select('id')
    .eq('individual_id', individualId)
    .eq('collection_slug', collectionSlug)
    .eq('record_id', resolved.recordId)
    .maybeSingle();

  const { data: saved, error } = existing
    ? await supabase.from('tree_individual_matches').update(fields).eq('id', existing.id).eq('user_id', user.id).select('*').single()
    : await supabase
        .from('tree_individual_matches')
        .insert({
          ...fields,
          individual_id: individualId,
          tree_id: person.tree_id,
          user_id: user.id,
          collection_slug: collectionSlug,
          record_id: resolved.recordId,
          score: 0,
          match_reasons: ['Saved from the archive'],
        })
        .select('*')
        .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await syncArchivePointer(supabase, individualId, user.id);
  return NextResponse.json({ match: saved, personName: fullName(person) || 'Unnamed' }, { status: existing ? 200 : 201 });
}

// DELETE ?matchId= — remove a saved record from a person. It's marked
// dismissed rather than deleted, so a later archive re-scan won't suggest it again.
export async function DELETE(request: NextRequest) {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const matchId = new URL(request.url).searchParams.get('matchId');
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });

  const { data: match, error } = await supabase
    .from('tree_individual_matches')
    .update({ status: 'dismissed' })
    .eq('id', matchId)
    .eq('user_id', user.id)
    .eq('status', 'linked')
    .select('individual_id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!match) return NextResponse.json({ error: 'That saved record wasn’t found.' }, { status: 404 });

  await syncArchivePointer(supabase, match.individual_id, user.id);
  return NextResponse.json({ success: true });
}
