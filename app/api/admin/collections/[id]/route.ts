import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { descendantSlugs } from '@/lib/collections/folders';

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

const ALLOWED_FIELDS = new Set([
  'name',
  'short_description',
  'long_description',
  'category',
  'era',
  'region',
  'parent_slug',
  'sort_order',
  'access_tier',
  'display_type',
  'is_published',
  'has_images',
  'has_ocr',
  'has_transcription',
  'display_columns',
  'search_columns',
  'title_columns',
  'sort_columns',
  'citation_template',
  'source_information',
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const body = (await request.json()) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Moving into a folder: the parent must exist, hold no records of its own
  // (tabs under a list never show), and can't be the collection itself or
  // anything inside it.
  if ('parent_slug' in updates) {
    const parentSlug = updates.parent_slug ? String(updates.parent_slug) : null;
    updates.parent_slug = parentSlug;
    if (parentSlug) {
      const { data: all, error: listError } = await supabase
        .from('collections')
        .select('id, slug, name, parent_slug, table_name');
      if (listError) return NextResponse.json({ error: listError.message }, { status: 400 });
      const self = (all || []).find((c) => c.id === id);
      const parent = (all || []).find((c) => c.slug === parentSlug);
      if (!self) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
      if (!parent) return NextResponse.json({ error: `No folder with the slug "${parentSlug}"` }, { status: 400 });
      if (parent.table_name) {
        return NextResponse.json(
          { error: `"${parent.name}" holds records, so collections inside it wouldn't show. Pick a folder.` },
          { status: 400 },
        );
      }
      if (parent.slug === self.slug || descendantSlugs(self.slug, all || []).has(parent.slug)) {
        return NextResponse.json({ error: 'A folder can’t go inside itself.' }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, collection: data });
}
