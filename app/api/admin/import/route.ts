import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import { SYSTEM_COLUMNS, findConflicts, prepareRows, toTableName } from '@/lib/import/records';
import { assignUniqueSlugs } from '@/lib/import/slugs';
import { describeColumns, fetchTableSchema, waitForSchema, type TableSchema } from '@/lib/import/table-schema';
import { insertRows, loadExistingSlugs, normalizeRecords } from '@/lib/import/insert';
import { canConvertToText, isBlank } from '@/lib/import/values';

// Table and column names are interpolated into SQL and select strings.
const SAFE_IDENTIFIER = /^[a-z0-9_]+$/i;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

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

// GET — fetch table schema for an existing collection
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const supabase = createAdminClient();

  if (action === 'schema') {
    const tableName = searchParams.get('table');
    if (!tableName) return NextResponse.json({ error: 'table is required' }, { status: 400 });

    // Real column types (not guessed from a sample row) so the import wizard
    // can check a file against the table before writing anything.
    let schema: TableSchema | null;
    try {
      schema = await fetchTableSchema(tableName);
    } catch (err) {
      return NextResponse.json({ error: errorMessage(err, 'Could not read the table schema') }, { status: 502 });
    }
    if (!schema) {
      return NextResponse.json({ exists: false, error: `Table "${tableName}" does not exist` }, { status: 404 });
    }

    // The wizard uses this to tell an empty leftover table from one in use.
    const { count } = await supabase.from(tableName).select('id', { count: 'exact', head: true });

    return NextResponse.json({ exists: true, ...describeColumns(schema), rowCount: count ?? null });
  }

  if (action === 'storage-buckets') {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const buckets = (data || []).map((b) => ({ name: b.name, public: b.public }));
    return NextResponse.json({ buckets });
  }

  if (action === 'storage-files') {
    const bucket = searchParams.get('bucket');
    const folder = searchParams.get('folder') || '';
    // Scans are often filed one box per subfolder, so a whole collection can be
    // gathered in one go instead of adding each box by hand.
    const recursive = searchParams.get('recursive') === 'true';
    if (!bucket) return NextResponse.json({ error: 'bucket is required' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    // Bounds on a recursive walk. A mis-picked bucket root could otherwise
    // enumerate an entire archive, and the wizard only needs a match pool.
    const MAX_FILES = 5000;
    const MAX_FOLDERS = 250;

    type Item = { name: string; isFolder: boolean; path: string; url: string };

    const toItem = (name: string, isFolder: boolean, prefix: string): Item => {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      return {
        name,
        isFolder,
        path: isFolder ? relativePath : `${bucket}/${relativePath}`,
        url: isFolder ? '' : `${supabaseUrl}/storage/v1/object/public/${bucket}/${relativePath}`,
      };
    };

    const listPrefix = async (prefix: string) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix || undefined, { limit: 2000, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(error.message);
      return (data || []).filter((f) => f.name !== '.emptyFolderPlaceholder');
    };

    try {
      if (!recursive) {
        const rows = await listPrefix(folder);
        const items = rows.map((f) => toItem(f.name, f.id === null, folder));
        return NextResponse.json({ items });
      }

      // Breadth-first so a shallow, wide layout fills the pool before a deep one.
      const items: Item[] = [];
      const queue: string[] = [folder];
      let foldersVisited = 0;
      let truncated = false;

      while (queue.length > 0) {
        const prefix = queue.shift()!;
        foldersVisited++;
        if (foldersVisited > MAX_FOLDERS) {
          truncated = true;
          break;
        }

        for (const row of await listPrefix(prefix)) {
          const isFolder = row.id === null;
          const relativePath = prefix ? `${prefix}/${row.name}` : row.name;
          if (isFolder) {
            queue.push(relativePath);
            continue;
          }
          if (items.length >= MAX_FILES) {
            truncated = true;
            break;
          }
          items.push(toItem(row.name, false, prefix));
        }

        if (truncated) break;
      }

      // Reported rather than silently capped: a short match pool would look like
      // missing scans.
      return NextResponse.json({ items, truncated, foldersVisited });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to list storage' },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST — parse xlsx, create table, or insert records
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contentType = request.headers.get('content-type') || '';

  // Handle multipart file upload (xlsx parsing)
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Parse with header row
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    // Keep each row's real spreadsheet row number so problems can be reported
    // as rows the admin can find in Excel. SheetJS skips empty rows, so the
    // array index drifts; it records the true 0-based sheet row as a
    // non-enumerable __rowNum__. Rows holding only whitespace aren't records.
    const rows: Record<string, unknown>[] = [];
    const rowNumbers: number[] = [];
    parsed.forEach((row, i) => {
      if (Object.values(row).every(isBlank)) return;
      rows.push(row);
      const sheetRow = (row as { __rowNum__?: number }).__rowNum__;
      rowNumbers.push(typeof sheetRow === 'number' ? sheetRow + 1 : i + 2);
    });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Column types are chosen in the wizard from every row (lib/import/values),
    // not guessed here from a sample.
    return NextResponse.json({
      headers,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 10),
      allRows: rows,
      rowNumbers,
    });
  }

  // Handle JSON actions
  const body = await request.json();
  const supabase = createAdminClient();

  // Create a new storage bucket for uploads.
  if (body.action === 'create-bucket') {
    const rawName = String(body.name || '').trim();
    const name = rawName.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
    if (!name) return NextResponse.json({ error: 'A valid bucket name is required' }, { status: 400 });
    const { error } = await supabase.storage.createBucket(name, {
      public: body.public !== false,
    });
    // "already exists" is fine — treat it as success so the picker just uses it.
    if (error && !/already exists/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, name });
  }

  // Issue a short-lived signed URL so the browser can upload a file straight to
  // Storage (bypassing the ~4.5MB serverless request-body limit for big scans).
  if (body.action === 'signed-upload-url') {
    const bucket = String(body.bucket || '').trim();
    const path = String(body.path || '').trim().replace(/^\/+/, '');
    if (!bucket || !path) {
      return NextResponse.json({ error: 'bucket and path are required' }, { status: 400 });
    }
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Could not create upload URL' }, { status: 400 });
    }
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path, publicUrl });
  }

  // Match uploaded filenames to records and write the storage path onto their
  // image_path. Matching is by filename: a record matches a file when its
  // chosen column's value (basename, case-insensitive) equals the file name,
  // or matches once the extension is dropped on both sides. This covers both
  // "identifier column" cases (e.g. scan_id = "desaussure_1") and repairing a
  // bare/broken image_path (e.g. image_path = "old/DeSaussure_1.jpg").
  if (body.action === 'attach-images') {
    const tableName = String(body.tableName || '').trim();
    const matchColumn = String(body.matchColumn || 'image_path').trim();
    const files = Array.isArray(body.files)
      ? (body.files as { name?: unknown; path?: unknown }[])
          .map((f) => ({ name: String(f.name || ''), path: String(f.path || '') }))
          .filter((f) => f.name && f.path)
      : [];

    if (!tableName || files.length === 0) {
      return NextResponse.json({ error: 'tableName and files are required' }, { status: 400 });
    }
    // matchColumn is interpolated into the select — keep it a plain identifier.
    if (!/^[a-z0-9_]+$/i.test(matchColumn)) {
      return NextResponse.json({ error: 'Invalid match column' }, { status: 400 });
    }

    const base = (s: string) => s.split('/').pop() || s;
    const stripExt = (s: string) => s.replace(/\.[^.]+$/, '');
    // Decode so an encoded stored URL (…/Baldwin%201.jpg) matches a raw
    // uploaded filename (Baldwin 1.jpg). Strip any trailing query string first.
    const norm = (s: string) => {
      let b = base(String(s).split('?')[0]).trim();
      try { b = decodeURIComponent(b); } catch { /* keep raw on malformed % */ }
      return b.toLowerCase();
    };
    const pushId = (map: Map<string, string[]>, key: string, id: string) => {
      const arr = map.get(key);
      if (arr) arr.push(id); else map.set(key, [id]);
    };

    // Index the table's match column: basename -> ids and basename-without-ext -> ids.
    const byFull = new Map<string, string[]>();
    const byStem = new Map<string, string[]>();
    const pageSize = 1000;
    let from = 0;
    let scanned = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(tableName)
        .select(`id, ${matchColumn}`)
        .range(from, from + pageSize - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const rows = (data as unknown as Record<string, unknown>[]) || [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const raw = row[matchColumn];
        if (raw == null || raw === '') continue;
        const id = String(row.id);
        const nb = norm(String(raw));
        if (!nb) continue;
        pushId(byFull, nb, id);
        pushId(byStem, stripExt(nb), id);
      }
      scanned += rows.length;
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    // Match each file; first file to claim a record id wins.
    const perFile: { name: string; matched: number }[] = [];
    const idToPath = new Map<string, string>();
    for (const f of files) {
      const fname = norm(f.name);
      const fstem = stripExt(fname);
      const ids = new Set<string>([...(byFull.get(fname) || []), ...(byStem.get(fstem) || [])]);
      for (const id of ids) if (!idToPath.has(id)) idToPath.set(id, f.path);
      perFile.push({ name: f.name, matched: ids.size });
    }

    // Apply — one UPDATE per distinct storage path, chunked to stay under URL limits.
    const byPath = new Map<string, string[]>();
    for (const [id, path] of idToPath) pushId(byPath, path, id);
    let updated = 0;
    const errors: string[] = [];
    for (const [path, ids] of byPath) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase.from(tableName).update({ image_path: path }).in('id', chunk);
        if (error) errors.push(error.message);
        else updated += chunk.length;
      }
    }

    return NextResponse.json({
      scanned,
      updated,
      matchedFiles: perFile.filter((r) => r.matched > 0).length,
      unmatched: perFile.filter((r) => r.matched === 0).map((r) => r.name),
      errors: errors.length ? errors : undefined,
    });
  }

  if (body.action === 'create-table') {
    const { tableName, columns } = body as {
      tableName: string;
      columns: { name: string; type: string }[];
    };

    // An empty column list is valid: a file whose only columns are built-ins
    // (slug, image_path, ocr_text) still needs its table created.
    if (!tableName || !Array.isArray(columns)) {
      return NextResponse.json({ error: 'tableName and columns are required' }, { status: 400 });
    }

    // Sanitize table name (the wizard derives the same name with the same helper)
    const safeName = toTableName(tableName);

    // Build column definitions (typed). Reused for both the CREATE TABLE
    // body and the ADD COLUMN IF NOT EXISTS pass below.
    const typedCols = columns.map((c) => {
      const safCol = c.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const pgType = c.type === 'integer' ? 'integer' : c.type === 'boolean' ? 'boolean' : 'text';
      return { safCol, pgType };
    });
    const tableDefs = [
      'id uuid NOT NULL DEFAULT gen_random_uuid()',
      "slug text NOT NULL DEFAULT ''",
      ...typedCols.map((c) => `"${c.safCol}" ${c.pgType}`),
      "image_path text DEFAULT ''",
      "ocr_text text DEFAULT ''",
      'created_at timestamptz DEFAULT now()',
      `CONSTRAINT "${safeName}_pkey" PRIMARY KEY (id)`,
    ];

    // If the table already exists from an earlier (possibly partial) run,
    // CREATE TABLE IF NOT EXISTS is a no-op — so explicitly add any missing
    // columns. This heals a schema mismatch on re-run instead of silently
    // failing every insert against a stale table.
    const alterDefs = [
      `ALTER TABLE public."${safeName}" ADD COLUMN IF NOT EXISTS slug text NOT NULL DEFAULT '';`,
      ...typedCols.map(
        (c) => `ALTER TABLE public."${safeName}" ADD COLUMN IF NOT EXISTS "${c.safCol}" ${c.pgType};`,
      ),
      `ALTER TABLE public."${safeName}" ADD COLUMN IF NOT EXISTS image_path text DEFAULT '';`,
      `ALTER TABLE public."${safeName}" ADD COLUMN IF NOT EXISTS ocr_text text DEFAULT '';`,
      `ALTER TABLE public."${safeName}" ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();`,
    ];

    const sql = `
      CREATE TABLE IF NOT EXISTS public."${safeName}" (
        ${tableDefs.join(',\n        ')}
      );

      ${alterDefs.join('\n      ')}

      ALTER TABLE public."${safeName}" ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow public read" ON public."${safeName}";
      CREATE POLICY "Allow public read" ON public."${safeName}" FOR SELECT USING (true);

      NOTIFY pgrst, 'reload schema';
    `;

    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
      return NextResponse.json({ error: `Table creation failed: ${error.message}` }, { status: 400 });
    }

    // PostgREST processes the schema reload asynchronously. Without this delay,
    // the immediately-following insert can hit the old schema cache and fail.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return NextResponse.json({ success: true, tableName: safeName });
  }

  if (body.action === 'create-collection') {
    const { slug, name, shortDescription, longDescription, category, era, region, tableName, parentSlug, displayType, accessTier, displayColumns, searchColumns, hasImages, hasOcr, discriminatorColumn, discriminatorValue, isPublished } = body;

    // Auto-assign sort_order = max(sort_order) + 1 within the same parent group,
    // so new collections land at the end of their siblings instead of all
    // piling up at the default of 99.
    let nextSortOrder = 1;
    {
      const siblingsQuery = supabase
        .from('collections')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
      const { data: maxRows } = parentSlug
        ? await siblingsQuery.eq('parent_slug', parentSlug)
        : await siblingsQuery.is('parent_slug', null);
      const currentMax = maxRows?.[0]?.sort_order;
      if (typeof currentMax === 'number') {
        nextSortOrder = currentMax + 1;
      }
    }

    const { error } = await supabase.from('collections').insert({
      slug,
      name,
      short_description: shortDescription || null,
      long_description: longDescription || null,
      category: category || 'legal',
      era: era || null,
      region: region || null,
      table_name: tableName,
      parent_slug: parentSlug || null,
      display_type: displayType || 'table',
      access_tier: accessTier || 'explorer',
      display_columns: displayColumns || [],
      search_columns: searchColumns || [],
      has_images: hasImages || false,
      has_ocr: hasOcr || false,
      has_transcription: false,
      discriminator_column: discriminatorColumn || null,
      discriminator_value: discriminatorValue || null,
      record_count: 0,
      sort_order: nextSortOrder,
      // The wizard creates collections as Drafts and publishes them once every
      // record has landed, so a failed import never shows an empty collection.
      is_published: isPublished !== false,
    });

    if (error) {
      // 23505 = unique_violation (collections.slug is unique)
      const message = error.code === '23505' ? `A collection with the slug "${slug}" already exists.` : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  // Put a Draft collection live, with its record count, once its import is complete.
  if (body.action === 'publish-collection') {
    const slug = String(body.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

    const { data: collection, error: findError } = await supabase
      .from('collections')
      .select('id, table_name, discriminator_column, discriminator_value')
      .eq('slug', slug)
      .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 400 });
    if (!collection) return NextResponse.json({ error: `No collection with the slug "${slug}"` }, { status: 404 });

    let recordCount: number | null = null;
    if (collection.table_name) {
      let countQuery = supabase.from(collection.table_name).select('id', { count: 'exact', head: true });
      // Same filter the collection page uses for tables shared between collections.
      if (collection.discriminator_column && collection.discriminator_value) {
        countQuery = countQuery.ilike(collection.discriminator_column, collection.discriminator_value);
      }
      const { count } = await countQuery;
      recordCount = count ?? null;
    }

    const { error } = await supabase
      .from('collections')
      .update({ is_published: true, ...(recordCount !== null && { record_count: recordCount }) })
      .eq('id', collection.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, recordCount });
  }

  // Give a placeholder collection (no table, no tabs, shown as "Coming Soon")
  // the table its records are going into. Only ever touches a collection that
  // has no table yet, so a configured collection can't be repointed by mistake.
  if (body.action === 'link-collection') {
    const slug = String(body.slug || '').trim();
    const tableName = String(body.tableName || '').trim();
    const discriminatorColumn = String(body.discriminatorColumn || '').trim();
    const discriminatorValue = String(body.discriminatorValue || '').trim();
    if (!slug || !SAFE_IDENTIFIER.test(tableName)) {
      return NextResponse.json({ error: 'slug and a valid tableName are required' }, { status: 400 });
    }
    if (Boolean(discriminatorColumn) !== Boolean(discriminatorValue) || (discriminatorColumn && !SAFE_IDENTIFIER.test(discriminatorColumn))) {
      return NextResponse.json({ error: 'A tab tag needs both a column and a value' }, { status: 400 });
    }

    const { data: collection, error: findError } = await supabase
      .from('collections')
      .select('id, name, table_name, display_columns, search_columns')
      .eq('slug', slug)
      .maybeSingle();
    if (findError) return NextResponse.json({ error: findError.message }, { status: 400 });
    if (!collection) return NextResponse.json({ error: `No collection with the slug "${slug}"` }, { status: 404 });
    if (collection.table_name) {
      return NextResponse.json({ error: `"${collection.name}" already has a table (${collection.table_name}).` }, { status: 409 });
    }

    const { count: tabs } = await supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('parent_slug', slug);
    if (tabs) {
      return NextResponse.json({ error: `"${collection.name}" has tabs. Import into one of its tabs instead.` }, { status: 409 });
    }

    // The same ownership rules the wizard shows, enforced here too.
    const { data: sameTable } = await supabase
      .from('collections')
      .select('name, discriminator_column, discriminator_value')
      .eq('table_name', tableName);
    const clash = (sameTable || []).find((c) =>
      discriminatorColumn
        ? !c.discriminator_column ||
          (c.discriminator_column === discriminatorColumn &&
            c.discriminator_value?.toLowerCase() === discriminatorValue.toLowerCase())
        : true,
    );
    if (clash) {
      return NextResponse.json(
        {
          error: discriminatorColumn && clash.discriminator_column
            ? `"${clash.name}" already uses ${discriminatorColumn} = ${clash.discriminator_value}.`
            : `The table ${tableName} already belongs to "${clash.name}".`,
        },
        { status: 409 },
      );
    }

    // Keep any display setup the placeholder already had; otherwise use the
    // columns this import fills, the same rule a new collection gets.
    const columnList = (value: unknown) =>
      Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string' && SAFE_IDENTIFIER.test(c)) : [];
    const displayColumns = columnList(collection.display_columns).length
      ? collection.display_columns
      : columnList(body.displayColumns);
    const searchColumns = columnList(collection.search_columns).length
      ? collection.search_columns
      : columnList(body.searchColumns);

    const { data: updated, error } = await supabase
      .from('collections')
      .update({
        table_name: tableName,
        discriminator_column: discriminatorColumn || null,
        discriminator_value: discriminatorValue || null,
        display_columns: displayColumns,
        search_columns: searchColumns,
        has_images: Boolean(body.hasImages),
      })
      .eq('id', collection.id)
      .is('table_name', null)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!updated?.length) {
      return NextResponse.json({ error: `"${collection.name}" was linked to a table by someone else. Reload and try again.` }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  }

  // Widen an existing number or yes/no column to text so values like
  // "7months" or "-" can be imported as written. Lossless: every number and
  // true/false has an exact text form.
  if (body.action === 'convert-column-to-text') {
    const tableName = String(body.tableName || '').trim();
    const column = String(body.column || '').trim();
    if (!SAFE_IDENTIFIER.test(tableName) || !SAFE_IDENTIFIER.test(column)) {
      return NextResponse.json({ error: 'Invalid table or column name' }, { status: 400 });
    }

    let schema: TableSchema | null;
    try {
      schema = await fetchTableSchema(tableName);
    } catch (err) {
      return NextResponse.json({ error: errorMessage(err, 'Could not read the table schema') }, { status: 502 });
    }
    const current = schema?.columns[column];
    if (!schema || !current) {
      return NextResponse.json({ error: `Column "${column}" not found in ${tableName}` }, { status: 404 });
    }

    // Only tables the import manages can be retyped here, never system tables
    // like profiles: one a collection uses, or an empty one a failed import
    // left behind (it carries the built-in columns create-table always adds).
    const { count: owners } = await supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('table_name', tableName);
    if (!owners) {
      const { count: rows } = await supabase.from(tableName).select('id', { count: 'exact', head: true });
      const tableColumns = schema.columns;
      const importBuilt = ['slug', 'image_path', 'ocr_text'].every((c) => c in tableColumns);
      if (!importBuilt || rows !== 0) {
        return NextResponse.json({ error: 'Only collection tables can be changed here' }, { status: 400 });
      }
    }
    if (current.type !== 'text') {
      if (!canConvertToText(current.type)) {
        return NextResponse.json(
          { error: `Only number and yes/no columns can be converted here ("${column}" is ${current.type}).` },
          { status: 400 },
        );
      }

      const { error } = await supabase.rpc('exec_sql', {
        sql_text: `ALTER TABLE public."${tableName}" ALTER COLUMN "${column}" TYPE text USING "${column}"::text; NOTIFY pgrst, 'reload schema';`,
      });
      if (error) {
        return NextResponse.json({ error: `Couldn't convert "${column}": ${error.message}` }, { status: 400 });
      }

      try {
        schema = (await waitForSchema(tableName, (s) => s?.columns[column]?.type === 'text')) ?? schema;
      } catch {
        // The ALTER is committed; only the confirming read failed.
      }
    }

    const described = describeColumns(schema);
    // The change is committed even if PostgREST's cache is still catching up.
    described.columnTypes[column] = 'text';
    return NextResponse.json({ success: true, ...described });
  }

  if (body.action === 'generate-descriptions') {
    const { name, category, era, region, headers, sampleRows } = body as {
      name: string;
      category?: string;
      era?: string;
      region?: string;
      headers?: string[];
      sampleRows?: Record<string, unknown>[];
    };

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!process.env.FIREWORKS_API_KEY) {
      return NextResponse.json({ error: 'FIREWORKS_API_KEY is not configured' }, { status: 500 });
    }

    const sampleText = sampleRows && sampleRows.length > 0
      ? `\nSample rows:\n${sampleRows.slice(0, 3).map((r) => JSON.stringify(r)).join('\n')}`
      : '';
    const headerText = headers && headers.length > 0
      ? `\nColumns: ${headers.join(', ')}`
      : '';

    const prompt = `You are an archivist writing descriptions for a Black history digital archive. Generate two descriptions for a record collection.

Collection name: ${name}
Category: ${category || 'unspecified'}
Era: ${era || 'unspecified'}
Region: ${region || 'unspecified'}${headerText}${sampleText}

Return ONLY valid JSON with this exact shape, no preamble or trailing text:
{"short_description": "...", "long_description": "..."}

Rules:
- short_description: one sentence, ~100-140 characters, describes what the collection contains.
- long_description: 2-4 sentences, ~250-500 characters, describes contents, time period, and what fields each record typically captures. Sober archival tone. No marketing language.
- Do not invent provenance, authors, or publication facts that are not implied by the inputs.`;

    try {
      const aiRes = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error('[generate-descriptions] Fireworks error', aiRes.status, errText);
        return NextResponse.json({ error: `AI request failed (${aiRes.status})` }, { status: 502 });
      }

      const aiData = await aiRes.json();
      const content = aiData?.choices?.[0]?.message?.content;
      if (!content) {
        return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
      }

      let parsed: { short_description?: string; long_description?: string };
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try to extract JSON object from the content
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
          return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 });
        }
        parsed = JSON.parse(match[0]);
      }

      return NextResponse.json({
        shortDescription: parsed.short_description || '',
        longDescription: parsed.long_description || '',
      });
    } catch (err) {
      console.error('[generate-descriptions] error', err);
      return NextResponse.json({ error: 'Failed to call AI service' }, { status: 500 });
    }
  }

  if (body.action === 'insert-records') {
    const { tableName, records, rowNumbers, columnMapping, imageMapping, fixedValues, dryRun } = body as {
      tableName: string;
      records: Record<string, unknown>[];
      rowNumbers?: number[]; // spreadsheet row of each record, for error reports
      columnMapping: Record<string, string>; // file col -> db col
      imageMapping?: Record<string, string>; // file image name -> storage path
      fixedValues?: Record<string, string>; // db col -> value written on every row (a shared table's tab tag)
      dryRun?: boolean; // check the file against the table without writing
    };

    if (!tableName || !SAFE_IDENTIFIER.test(tableName) || !Array.isArray(records) || records.length === 0 || !columnMapping) {
      return NextResponse.json({ error: 'tableName, records, and columnMapping are required' }, { status: 400 });
    }

    const fixed = fixedValues && typeof fixedValues === 'object' ? fixedValues : {};
    for (const [column, value] of Object.entries(fixed)) {
      if (!SAFE_IDENTIFIER.test(column) || SYSTEM_COLUMNS.has(column) || typeof value !== 'string' || !value.trim()) {
        return NextResponse.json({ error: `Invalid tag for column "${column}"` }, { status: 400 });
      }
    }

    const mappedColumns = [...new Set([...Object.values(columnMapping).filter(Boolean), ...Object.keys(fixed)])];
    const managed = mappedColumns.filter((c) => SYSTEM_COLUMNS.has(c));
    if (managed.length > 0) {
      return NextResponse.json(
        { error: `Can't import into ${managed.join(', ')}: the database manages ${managed.length === 1 ? 'that column' : 'those columns'} itself.` },
        { status: 400 },
      );
    }

    // create-table runs just before this, and PostgREST reloads its schema
    // cache asynchronously, so wait until every mapped column is visible.
    let schema: TableSchema | null;
    try {
      schema = await waitForSchema(
        tableName,
        (s) => !!s && mappedColumns.every((c) => c in s.columns),
        { attempts: 6 },
      );
    } catch (err) {
      return NextResponse.json({ error: errorMessage(err, 'Could not read the table schema') }, { status: 502 });
    }
    if (!schema) return NextResponse.json({ error: `Table "${tableName}" does not exist` }, { status: 404 });

    const prepared = prepareRows(records, rowNumbers, columnMapping, imageMapping, fixed);

    // Check every value against the table's real column types before writing
    // anything. A single "7months" in a whole-number column used to fail its
    // whole 500-row batch.
    const conflicts = findConflicts(prepared, mappedColumns, describeColumns(schema));
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Some values don't fit this table, so nothing was imported.", conflicts },
        { status: 422 },
      );
    }
    if (dryRun) return NextResponse.json({ success: true, total: prepared.length });

    normalizeRecords(prepared, schema);

    if ('slug' in schema.columns) {
      try {
        assignUniqueSlugs(
          prepared.map((p) => p.record),
          await loadExistingSlugs(supabase, tableName),
        );
      } catch (err) {
        return NextResponse.json({ error: errorMessage(err, 'Could not read existing slugs') }, { status: 502 });
      }
    }

    const { inserted, failures } = await insertRows(supabase, tableName, prepared);

    return NextResponse.json({
      success: failures.length === 0,
      inserted,
      total: prepared.length,
      failures,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
