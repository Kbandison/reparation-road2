import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

// POST - upsert (or clear) a per-record citation / source override.
// Body: { tableName, recordId, citation, sourceInformation }
// When both fields are empty the override row is deleted so the record falls
// back to the collection defaults.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json()) as {
    tableName?: unknown;
    recordId?: unknown;
    citation?: unknown;
    sourceInformation?: unknown;
  };

  const tableName = String(body.tableName || '').trim();
  const recordId = String(body.recordId || '').trim();
  if (!tableName || !recordId) {
    return NextResponse.json({ error: 'tableName and recordId are required' }, { status: 400 });
  }

  const norm = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? null : s;
  };
  const citation = norm(body.citation);
  const sourceInformation = norm(body.sourceInformation);

  const supabase = createAdminClient();

  // Nothing to store → remove any existing override.
  if (citation === null && sourceInformation === null) {
    const { error } = await supabase
      .from('record_citations')
      .delete()
      .eq('table_name', tableName)
      .eq('record_id', recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, cleared: true });
  }

  const { error } = await supabase
    .from('record_citations')
    .upsert(
      {
        table_name: tableName,
        record_id: recordId,
        citation,
        source_information: sourceInformation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'table_name,record_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
