import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection } from '@/lib/types';

interface AccessResult {
  hasAccess: boolean;
  reason?: 'login' | 'subscribe';
}

export async function checkCollectionAccess(
  supabase: SupabaseClient,
  collection: Collection
): Promise<AccessResult> {
  if (collection.access_tier === 'free') return { hasAccess: true };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasAccess: false, reason: 'login' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single();

  if (profile?.subscription_status === 'paid' || profile?.subscription_status === 'donor') return { hasAccess: true };
  return { hasAccess: false, reason: 'subscribe' };
}
