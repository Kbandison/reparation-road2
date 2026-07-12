import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

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

    // Get a single row to infer columns (faster than information_schema)
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const systemCols = new Set(['id', 'created_at', 'updated_at', 'embedding', 'tsv']);
    let columns: string[] = [];

    if (data && data.length > 0) {
      columns = Object.keys(data[0]).filter((k) => !systemCols.has(k));
    } else {
      // Empty table — query information_schema
      const { data: colData } = await supabase.rpc('get_table_columns', { p_table_name: tableName });
      if (colData) {
        columns = (colData as { column_name: string }[])
          .map((c) => c.column_name)
          .filter((k) => !systemCols.has(k));
      }
    }

    return NextResponse.json({ columns });
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
    if (!bucket) return NextResponse.json({ error: 'bucket is required' }, { status: 400 });

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder || undefined, { limit: 2000, sortBy: { column: 'name', order: 'asc' } });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const items = (data || [])
      .filter((f) => f.name !== '.emptyFolderPlaceholder')
      .map((f) => {
        const isFolder = f.id === null;
        const relativePath = folder ? `${folder}/${f.name}` : f.name;
        return {
          name: f.name,
          isFolder,
          path: isFolder ? relativePath : `${bucket}/${relativePath}`,
          url: isFolder ? '' : `${supabaseUrl}/storage/v1/object/public/${bucket}/${relativePath}`,
        };
      });

    return NextResponse.json({ items });
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Infer column types from first 20 rows
    const columnTypes: Record<string, string> = {};
    for (const header of headers) {
      let isNumber = true;
      let isBoolean = true;
      for (const row of rows.slice(0, 20)) {
        const val = row[header];
        if (val === '' || val === null || val === undefined) continue;
        if (typeof val !== 'number' && isNaN(Number(val))) isNumber = false;
        if (typeof val !== 'boolean' && !['true', 'false', '0', '1'].includes(String(val).toLowerCase())) isBoolean = false;
      }
      if (isBoolean && !isNumber) columnTypes[header] = 'boolean';
      else if (isNumber) columnTypes[header] = 'integer';
      else columnTypes[header] = 'text';
    }

    // Return headers, types, row count, and sample rows
    return NextResponse.json({
      headers,
      columnTypes,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 10),
      allRows: rows,
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

  if (body.action === 'create-table') {
    const { tableName, columns } = body as {
      tableName: string;
      columns: { name: string; type: string }[];
    };

    if (!tableName || !columns?.length) {
      return NextResponse.json({ error: 'tableName and columns are required' }, { status: 400 });
    }

    // Sanitize table name
    const safeName = tableName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

    // Build column definitions (typed). Reused for both the CREATE TABLE
    // body and the ADD COLUMN IF NOT EXISTS pass below.
    const typedCols = columns.map((c) => {
      const safCol = c.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const pgType = c.type === 'integer' ? 'integer' : c.type === 'boolean' ? 'boolean' : 'text';
      return { safCol, pgType };
    });
    const colDefs = typedCols.map((c) => `"${c.safCol}" ${c.pgType}`);

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
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        slug text NOT NULL DEFAULT '',
        ${colDefs.join(',\n        ')},
        image_path text DEFAULT '',
        ocr_text text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        CONSTRAINT "${safeName}_pkey" PRIMARY KEY (id)
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
    const { slug, name, shortDescription, longDescription, category, era, region, tableName, parentSlug, displayType, accessTier, displayColumns, searchColumns, hasImages, hasOcr, discriminatorColumn, discriminatorValue } = body;

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
      is_published: true,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
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
    const { tableName, records, columnMapping, imageMapping } = body as {
      tableName: string;
      records: Record<string, unknown>[];
      columnMapping: Record<string, string>; // file col -> db col
      imageMapping?: Record<string, string>; // file image name -> storage path
    };

    if (!tableName || !records?.length || !columnMapping) {
      return NextResponse.json({ error: 'tableName, records, and columnMapping are required' }, { status: 400 });
    }

    // Transform records using column mapping
    const mapped = records.map((row, idx) => {
      const record: Record<string, unknown> = {};
      for (const [fileCol, dbCol] of Object.entries(columnMapping)) {
        if (!dbCol) continue; // unmapped column
        let val = row[fileCol];

        // Handle image path mapping
        if (dbCol === 'image_path' && imageMapping && typeof val === 'string') {
          val = imageMapping[val] || imageMapping[val.trim()] || val;
        }

        record[dbCol] = val === '' ? null : val;
      }

      // Auto-generate slug if not mapped
      if (!record.slug) {
        const firstVal = Object.values(record).find((v) => typeof v === 'string' && v.trim());
        record.slug = firstVal
          ? String(firstVal).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80) + `-${idx}`
          : `record-${idx}`;
      }

      return record;
    });

    // Insert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) {
        // Error instances have non-enumerable .message (so JSON.stringify yields "{}").
        // Walk every own-property to see what's actually there.
        const errAny = error as unknown as Record<string, unknown>;
        const allProps: Record<string, unknown> = {};
        try {
          for (const key of Object.getOwnPropertyNames(errAny)) {
            allProps[key] = errAny[key];
          }
        } catch {}
        const detail =
          (errAny.message as string) ||
          (errAny.details as string) ||
          (errAny.hint as string) ||
          (errAny.code as string) ||
          (errAny.error as string) ||
          (errAny.statusText as string) ||
          (allProps.message as string) ||
          'unknown error (see server log)';
        console.error(`[import] Batch ${batchNum} insert failed`, {
          tableName,
          errorType: error?.constructor?.name,
          allProps,
          recordKeys: Object.keys(batch[0] || {}),
          sampleRecord: batch[0],
        });
        errors.push(`Batch ${batchNum}: ${detail}`);
      } else {
        inserted += batch.length;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      inserted,
      total: mapped.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
