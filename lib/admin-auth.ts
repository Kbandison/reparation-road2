import { createClient } from '@/lib/supabase/server';

/**
 * Confirm the caller is an admin.
 *
 * The same six lines were already repeated across several admin routes; the
 * newsletter routes would have made it eight. Returns the user id so callers
 * can attribute writes, or null when the caller is not an admin.
 */
export async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' ? user.id : null;
}
