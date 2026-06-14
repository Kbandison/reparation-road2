import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseGedcom } from '@/lib/family-tree/gedcom';
import { computeLayout, type LayoutEdge } from '@/lib/family-tree/layout';

export const maxDuration = 60;

const MAX_INDIVIDUALS = 5000;
const MAX_BYTES = 8 * 1024 * 1024;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// POST — import a GEDCOM (.ged) file into an existing tree. Accepts either a
// multipart upload (field "file") or the raw file text as the request body.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> }
) {
  const { treeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tree } = await supabase
    .from('family_trees')
    .select('id')
    .eq('id', treeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!tree) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Read the file text from a multipart upload or the raw body.
  let text: string;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 8MB).' }, { status: 413 });
    }
    text = await file.text();
  } else {
    text = await request.text();
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
  }

  const parsed = parseGedcom(text);
  if (parsed.individuals.length === 0) {
    return NextResponse.json(
      { error: 'No individuals were found in this GEDCOM file.', warnings: parsed.warnings },
      { status: 422 }
    );
  }
  if (parsed.individuals.length > MAX_INDIVIDUALS) {
    return NextResponse.json(
      { error: `This file has ${parsed.individuals.length} people, which exceeds the ${MAX_INDIVIDUALS} limit.` },
      { status: 413 }
    );
  }

  // Lay the tree out by GEDCOM xref *before* inserting, so positions go in with
  // the initial rows and we avoid a second mass-update pass.
  const layout = computeLayout(
    parsed.individuals.map((i) => ({ id: i.xref })),
    parsed.relationships.map((r) => ({
      type: r.type,
      from_id: r.from_xref,
      to_id: r.to_xref,
    }))
  );

  const rows = parsed.individuals.map((p) => ({
    tree_id: treeId,
    user_id: user.id,
    given_name: p.given_name,
    surname: p.surname,
    sex: p.sex,
    birth_date: p.birth_date,
    birth_place: p.birth_place,
    death_date: p.death_date,
    death_place: p.death_place,
    occupation: p.occupation,
    notes: p.notes,
    gedcom_xref: p.xref,
    pos_x: layout[p.xref]?.x ?? 0,
    pos_y: layout[p.xref]?.y ?? 0,
  }));

  const xrefToId = new Map<string, string>();
  for (const part of chunk(rows, 500)) {
    const { data, error } = await supabase
      .from('tree_individuals')
      .insert(part)
      .select('id, gedcom_xref');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    for (const r of data ?? []) {
      if (r.gedcom_xref) xrefToId.set(r.gedcom_xref as string, r.id as string);
    }
  }

  const relRows = parsed.relationships
    .map((r) => ({
      from_id: xrefToId.get(r.from_xref),
      to_id: xrefToId.get(r.to_xref),
      type: r.type,
    }))
    .filter((r): r is { from_id: string; to_id: string; type: LayoutEdge['type'] } =>
      Boolean(r.from_id && r.to_id)
    )
    .map((r) => ({
      tree_id: treeId,
      user_id: user.id,
      type: r.type,
      from_id: r.from_id,
      to_id: r.to_id,
    }));

  for (const part of chunk(relRows, 500)) {
    if (part.length === 0) continue;
    const { error } = await supabase.from('tree_relationships').insert(part);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await supabase
    .from('family_trees')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', treeId)
    .eq('user_id', user.id);

  return NextResponse.json({
    added: rows.length,
    relationships: relRows.length,
    warnings: parsed.warnings,
  });
}
