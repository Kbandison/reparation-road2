import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeEmail } from '@/lib/newsletter';
import {
  sendGettingStartedEmail,
  sendWhatWereBuildingEmail,
} from '@/lib/newsletter-emails';

/**
 * The welcome sequence.
 *
 * Step 1 is the welcome sent the moment someone confirms, and is not handled
 * here. Steps 2 and 3 arrive on a delay, which means something has to notice
 * they are due — the daily reconcile cron, since the Hobby plan allows very few
 * cron entries and daily granularity is ample for a two-day and a seven-day
 * email.
 */

interface Step {
  step: number;
  afterDays: number;
  send: (email: string, firstName?: string | null) => Promise<{ ok: boolean }>;
}

const STEPS: Step[] = [
  { step: 2, afterDays: 2, send: sendGettingStartedEmail },
  { step: 3, afterDays: 7, send: sendWhatWereBuildingEmail },
];

/** Kept well below the function timeout; the rest go on the next run. */
const MAX_PER_RUN = 200;

/**
 * Nobody who subscribed longer ago than this enters the sequence.
 *
 * Without it, the first run after deploying mails the entire back catalogue —
 * every subscriber ever, all at once, a "welcome" months after they joined.
 * That is a spam-complaint event and a deliverability problem, and it is the
 * kind of mistake that happens exactly once and cannot be taken back.
 */
const MAX_BACKFILL_DAYS = 30;

interface Candidate {
  email: string;
  firstName: string | null;
  subscribedAt: string;
}

/**
 * Everyone currently subscribed, from both sides of the system.
 *
 * Reading live subscription state rather than a queue is deliberate: someone
 * who unsubscribes on day three must not receive day seven. A queue built at
 * signup would have already decided to send it.
 */
async function currentSubscribers(): Promise<Candidate[]> {
  const supabase = createAdminClient();
  const out = new Map<string, Candidate>();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('email, first_name, newsletter_opted_in_at, created_at')
    .eq('newsletter_status', 'subscribed');

  for (const p of profiles ?? []) {
    if (!p.email) continue;
    out.set(normalizeEmail(p.email), {
      email: normalizeEmail(p.email),
      firstName: p.first_name,
      // Older rows predate the consent timestamp; their account date is the
      // best available anchor and only affects when a delayed email lands.
      subscribedAt: p.newsletter_opted_in_at || p.created_at,
    });
  }

  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('email, first_name, confirmed_at')
    .eq('status', 'subscribed');

  for (const s of subscribers ?? []) {
    const email = normalizeEmail(s.email);
    if (out.has(email) || !s.confirmed_at) continue;
    out.set(email, { email, firstName: s.first_name, subscribedAt: s.confirmed_at });
  }

  return [...out.values()];
}

export interface SequenceResult {
  sent: number;
  failed: number;
  due: number;
  truncated: boolean;
}

/**
 * Send whatever is due.
 *
 * At most one step per person per run. Someone who subscribed a month before
 * the sequence existed is due for both steps at once; sending them together
 * would arrive as a clump rather than a sequence, so they get step 2 today and
 * step 3 tomorrow.
 */
export async function runWelcomeSequence(): Promise<SequenceResult> {
  const supabase = createAdminClient();
  const subscribers = await currentSubscribers();
  if (subscribers.length === 0) {
    return { sent: 0, failed: 0, due: 0, truncated: false };
  }

  const { data: alreadySent } = await supabase
    .from('newsletter_sequence_sends')
    .select('email, step');

  const done = new Set(
    (alreadySent ?? []).map((r) => `${normalizeEmail(r.email)}:${r.step}`),
  );

  const now = Date.now();
  const due: { candidate: Candidate; step: Step }[] = [];

  for (const candidate of subscribers) {
    if (!candidate.subscribedAt) continue;
    const ageDays = (now - new Date(candidate.subscribedAt).getTime()) / 86_400_000;

    // Lowest unsent step whose delay has passed — order is what makes it a
    // sequence rather than a batch.
    if (ageDays > MAX_BACKFILL_DAYS) continue;

    const next = STEPS.find(
      (s) => ageDays >= s.afterDays && !done.has(`${candidate.email}:${s.step}`),
    );
    if (next) due.push({ candidate, step: next });
  }

  const batch = due.slice(0, MAX_PER_RUN);
  let sent = 0;
  let failed = 0;

  for (const { candidate, step } of batch) {
    // Claimed before sending, not after. A crash between send and record would
    // otherwise re-send on the next run; the unique index makes a duplicate
    // claim fail here instead, which is the safe direction to be wrong in.
    const { error: claimError } = await supabase
      .from('newsletter_sequence_sends')
      .insert({ email: candidate.email, step: step.step });

    if (claimError) {
      // Another run already took it.
      continue;
    }

    const result = await step.send(candidate.email, candidate.firstName);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      // Releasing the claim lets tomorrow retry a transient failure.
      await supabase
        .from('newsletter_sequence_sends')
        .delete()
        .eq('email', candidate.email)
        .eq('step', step.step);
    }
  }

  return { sent, failed, due: due.length, truncated: due.length > batch.length };
}
