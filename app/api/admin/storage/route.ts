import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  // Verify the user is authenticated and is an admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get('bucket');
  const folder = searchParams.get('folder') || '';

  if (!bucket) {
    return NextResponse.json({ error: 'bucket is required' }, { status: 400 });
  }

  // Use service role client to bypass storage RLS
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from(bucket)
    .list(folder || undefined, {
      limit: 500,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  const items = (data || [])
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => {
      const isFolder = f.id === null;
      const relativePath = folder ? `${folder}/${f.name}` : f.name;

      return {
        name: f.name,
        isFolder,
        // Folders: relative path for navigation. Files: full public URL for storage.
        fullPath: isFolder
          ? relativePath
          : `${supabaseUrl}/storage/v1/object/public/${bucket}/${relativePath}`,
      };
    });

  return NextResponse.json({ items, bucket, folder });
}
