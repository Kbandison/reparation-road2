import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection } from '@/lib/types';

export interface AccessResult {
  hasAccess: boolean;
  reason?: 'login' | 'subscribe';
}

/** Who is looking: signed in or not, and whether they hold a paid or donor membership. */
export interface ViewerAccess {
  signedIn: boolean;
  member: boolean;
}

/**
 * The current viewer's membership, read once so a request covering many
 * collections (search, the assistant) doesn't look the profile up per collection.
 */
export async function getViewerAccess(supabase: SupabaseClient): Promise<ViewerAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, member: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .single();

  return {
    signedIn: true,
    member: profile?.subscription_status === 'paid' || profile?.subscription_status === 'donor',
  };
}

/** The paywall rule: free collections are open to all, every other tier needs a membership. */
export function accessFor(collection: Pick<Collection, 'access_tier'>, viewer: ViewerAccess): AccessResult {
  if (collection.access_tier === 'free' || viewer.member) return { hasAccess: true };
  return { hasAccess: false, reason: viewer.signedIn ? 'subscribe' : 'login' };
}

export async function checkCollectionAccess(
  supabase: SupabaseClient,
  collection: Collection
): Promise<AccessResult> {
  if (collection.access_tier === 'free') return { hasAccess: true };
  return accessFor(collection, await getViewerAccess(supabase));
}
