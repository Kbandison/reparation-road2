import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTableSchema } from '@/lib/import/table-schema';
import { RESERVED_COLUMNS, cleanColumnName } from '@/lib/import/add-column';

/**
 * "Add a column to existing records" (Admin → Import). The browser matches
 * spreadsheet rows to records itself; this route supplies the records' key
 * values, creates the new column, and writes values by record id. Every write
 * is limited to the collection's own rows, which matters for tables that hold
 * several collections (told apart by a tag column).
 *
 * GET  ?collection=slug&columns=a,b&offset=n   key values, 5,000 records a page
 * POST { action: 'add-column', column }         a new text column
 * POST { action: 'apply', column, updates }     values by record id, ≤ 2,000 a call
 */

export const maxDuration = 300;

const SAFE_IDENTIFIER = /^[a-z0-9_]+$/i;
const PAGE = 5000;
const MAX_UPDATES = 2000;

interface TargetCollection {
  slug: string;
  name: string;
  table_name: string;
  discriminator_column: string | null;
  discriminator_value: string | null;
}

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function loadCollection(admin: SupabaseClient, slug: unknown): Promise<TargetCollection | NextResponse> {
  if (typeof slug !== 'string' || !slug) return fail('collection is required');
  const { data, error } = await admin
    .from('collections')
    .select('slug, name, table_name, discriminator_column, discriminator_value')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return fail(error.message, 502);
  if (!data) return fail('Collection not found', 404);
  if (!data.table_name || !SAFE_IDENTIFIER.test(data.table_name)) return fail(`${data.name} has no records table.`);
  if (data.discriminator_column && !SAFE_IDENTIFIER.test(data.discriminator_column)) return fail('Invalid tag column');
  return data as TargetCollection;
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const admin = createAdminClient();
  const params = new URL(request.url).searchParams;
  const collection = await loadCollection(admin, params.get('collection'));
  if (collection instanceof NextResponse) return collection;

  const columns = (params.get('columns') || '').split(',').map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0 || columns.length > 3 || !columns.every((c) => SAFE_IDENTIFIER.test(c))) {
    return fail('Pick one to three columns to match on.');
  }
  const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0);

  const schema = await fetchTableSchema(collection.table_name);
  if (!schema?.columns.id) return fail(`${collection.table_name} has no id column, so its records can't be updated one by one.`);
  const missing = columns.find((c) => !schema.columns[c]);
  if (missing) return fail(`${collection.name} has no column "${missing}".`);

  const rows: { id: string; values: string[] }[] = [];
  let total: number | null = null;
  // PostgREST hands back at most 1,000 rows a request.
  for (let from = offset; from < offset + PAGE; from += 1000) {
    let query = admin.from(collection.table_name).select(['id', ...columns].join(', '), { count: from === offset ? 'exact' : undefined });
    if (collection.discriminator_column && collection.discriminator_value) {
      query = query.ilike(collection.discriminator_column, collection.discriminator_value);
    }
    const { data, error, count } = await query.order('id').range(from, Math.min(from + 999, offset + PAGE - 1));
    if (error) return fail(error.message, 502);
    if (count !== null && count !== undefined) total = count;
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of page) {
      rows.push({ id: String(row.id), values: columns.map((c) => (row[c] === null || row[c] === undefined ? '' : String(row[c]))) });
    }
    if (page.length < 1000) {
      return NextResponse.json({ rows, total: total ?? offset + rows.length, next: null });
    }
  }
  return NextResponse.json({ rows, total, next: offset + PAGE });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin())) return fail('Forbidden', 403);
  const admin = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    collection?: string;
    column?: unknown;
    updates?: unknown;
  };
  const collection = await loadCollection(admin, body.collection);
  if (collection instanceof NextResponse) return collection;
  const table = collection.table_name;

  if (body.action === 'add-column') {
    const column = cleanColumnName(String(body.column ?? ''));
    if (!column) return fail('Give the new column a name that starts with a letter.');
    if (RESERVED_COLUMNS.has(column)) return fail(`"${column}" is used by the site itself. Pick another name.`);
    const schema = await fetchTableSchema(table);
    if (schema?.columns[column]) return fail(`${collection.name} already has a column "${column}". Choose it as an existing column instead.`);

    const { error } = await admin.rpc('exec_sql', {
      sql_text: `ALTER TABLE public."${table}" ADD COLUMN IF NOT EXISTS "${column}" text; NOTIFY pgrst, 'reload schema';`,
    });
    if (error) return fail(`Adding the column failed: ${error.message}`);
    // PostgREST reloads its schema asynchronously; give it a moment, as the import does.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return NextResponse.json({ success: true, column });
  }

  if (body.action === 'apply') {
    const column = typeof body.column === 'string' ? body.column : '';
    if (!SAFE_IDENTIFIER.test(column) || RESERVED_COLUMNS.has(column)) return fail('Invalid column');
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length === 0 || updates.length > MAX_UPDATES) return fail(`Send 1 to ${MAX_UPDATES} values at a time.`);
    const clean = updates
      .map((u) => u as { id?: unknown; value?: unknown })
      .filter((u) => typeof u.id === 'string' && u.id.length <= 64)
      .map((u) => ({ id: u.id as string, value: u.value === null || u.value === undefined ? null : String(u.value) }));
    if (clean.length !== updates.length) return fail('Every update needs a record id.');

    // Only text columns: values arrive as spreadsheet text and go in as written.
    const schema = await fetchTableSchema(table);
    const type = schema?.columns[column]?.type;
    if (!type) return fail(`${collection.name} has no column "${column}".`);
    if (type !== 'text' && type !== 'character varying') {
      return fail(`"${column}" holds ${type} values. Only text columns can be filled from a spreadsheet here.`);
    }

    const tagged = collection.discriminator_column && collection.discriminator_value
      ? ` AND r."${collection.discriminator_column}" ILIKE ${quote(collection.discriminator_value)}`
      : '';
    const values = clean.map((u) => `(${quote(u.id)}, ${u.value === null ? 'NULL' : quote(u.value)})`).join(',\n');
    const sql = `UPDATE public."${table}" AS r SET "${column}" = m.value
      FROM (VALUES ${values}) AS m(id, value)
      WHERE r.id::text = m.id${tagged};`;
    const { error } = await admin.rpc('exec_sql', { sql_text: sql });
    if (error) {
      console.error('[record-columns] apply failed', collection.slug, column, error.message);
      return fail(`Writing the values failed: ${error.message}`, 502);
    }
    return NextResponse.json({ success: true, written: clean.length });
  }

  return fail('Unknown action');
}
