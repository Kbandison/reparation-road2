import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Send-time segmentation.
 *
 * There is one Resend audience, not one per segment. Membership tier, billing
 * interval, and signup date already live in Supabase and change there first, so
 * mirroring them into several parallel lists would only create a set of copies
 * to keep in sync — and they would drift the first time a webhook was missed.
 *
 * Instead the audience carries consent, and the recipient list for any given
 * send is computed from the member database at the moment of sending.
 */

export type NewsletterSegment =
  | 'all'
  | 'members'
  | 'free_accounts'
  | 'former_members'
  | 'donors'
  | 'no_account';

export const SEGMENT_LABELS: Record<NewsletterSegment, string> = {
  all: 'Everyone subscribed',
  members: 'Active premium members',
  free_accounts: 'Free accounts',
  former_members: 'Former members',
  donors: 'Donors',
  no_account: 'Newsletter-only (no account)',
};

export interface Recipient {
  email: string;
  firstName: string | null;
  hasAccount: boolean;
}

// Supabase caps a single response, so every query here pages to the end rather
// than silently returning the first slice. A truncated recipient list looks
// exactly like a successful send.
const PAGE_SIZE = 1000;

type ProfileRow = {
  email: string | null;
  first_name: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
};

function matchesSegment(row: ProfileRow, segment: NewsletterSegment): boolean {
  switch (segment) {
    case 'members':
      return row.subscription_status === 'paid';
    case 'donors':
      return row.subscription_status === 'donor';
    case 'free_accounts':
      // Never held a paid membership — no Stripe customer was ever created.
      return row.subscription_status === 'free' && !row.stripe_customer_id;
    case 'former_members':
      // Back on the free tier but Stripe knows them, so they paid at some point.
      return row.subscription_status === 'free' && Boolean(row.stripe_customer_id);
    case 'no_account':
      return false;
    case 'all':
    default:
      return true;
  }
}

/** Everyone who should receive a send to this segment, deduplicated by address. */
export async function getRecipients(
  segment: NewsletterSegment = 'all',
): Promise<Recipient[]> {
  const supabase = createAdminClient();
  const byEmail = new Map<string, Recipient>();

  if (segment !== 'no_account') {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, first_name, subscription_status, stripe_customer_id')
        .eq('newsletter_status', 'subscribed')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`[newsletter] recipient query failed: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data as ProfileRow[]) {
        if (!row.email) continue;
        if (!matchesSegment(row, segment)) continue;
        byEmail.set(row.email.toLowerCase(), {
          email: row.email.toLowerCase(),
          firstName: row.first_name,
          hasAccount: true,
        });
      }

      if (data.length < PAGE_SIZE) break;
    }
  }

  if (segment === 'all' || segment === 'no_account') {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('email, first_name')
        .eq('status', 'subscribed')
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`[newsletter] recipient query failed: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        const email = row.email.toLowerCase();
        // A profile row for the same address wins — it carries the better name.
        if (!byEmail.has(email)) {
          byEmail.set(email, { email, firstName: row.first_name, hasAccount: false });
        }
      }

      if (data.length < PAGE_SIZE) break;
    }
  }

  return [...byEmail.values()];
}

export interface SegmentCounts {
  segments: Record<NewsletterSegment, number>;
  /** Consent states other than 'subscribed', for list-health at a glance. */
  unsubscribed: number;
  cleaned: number;
  pendingConfirmation: number;
  unsynced: number;
}

/** List health for the admin panel. */
export async function getSegmentCounts(): Promise<SegmentCounts> {
  const supabase = createAdminClient();

  const segments = {} as Record<NewsletterSegment, number>;
  for (const segment of Object.keys(SEGMENT_LABELS) as NewsletterSegment[]) {
    segments[segment] = (await getRecipients(segment)).length;
  }

  const count = async (
    table: 'profiles' | 'newsletter_subscribers',
    column: string,
    value: string,
  ) => {
    const { count: n } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, value);
    return n ?? 0;
  };

  const [
    profilesUnsubscribed,
    subscribersUnsubscribed,
    profilesCleaned,
    subscribersCleaned,
    pendingConfirmation,
  ] = await Promise.all([
    count('profiles', 'newsletter_status', 'unsubscribed'),
    count('newsletter_subscribers', 'status', 'unsubscribed'),
    count('profiles', 'newsletter_status', 'cleaned'),
    count('newsletter_subscribers', 'status', 'cleaned'),
    count('newsletter_subscribers', 'status', 'pending'),
  ]);

  // Consent recorded here but not yet mirrored into Resend. Anything above zero
  // for long means the reconcile cron is not running.
  const { count: unsyncedProfiles } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('newsletter_status', 'subscribed')
    .is('newsletter_synced_at', null);

  const { count: unsyncedSubscribers } = await supabase
    .from('newsletter_subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'subscribed')
    .is('synced_at', null);

  return {
    segments,
    unsubscribed: profilesUnsubscribed + subscribersUnsubscribed,
    cleaned: profilesCleaned + subscribersCleaned,
    pendingConfirmation,
    unsynced: (unsyncedProfiles ?? 0) + (unsyncedSubscribers ?? 0),
  };
}
