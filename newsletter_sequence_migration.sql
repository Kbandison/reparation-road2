-- ============================================================================
-- Reparation Road — Welcome sequence
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Tracks which steps of the welcome sequence have gone to whom.
--
-- Keyed on email rather than a user id, like the rest of the consent system:
-- a subscriber may have an account, may not, and may acquire one later when
-- absorbSubscriberRow folds their row into a profile. Email is the identifier
-- that survives all three.
-- ============================================================================

create table if not exists public.newsletter_sequence_sends (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- 1 is the welcome sent at signup; the sequence proper starts at 2.
  step integer not null check (step between 1 and 10),
  sent_at timestamptz not null default now()
);

-- The guard that makes the runner safe to re-run: a cron that fires twice, or
-- retries after a partial failure, cannot send the same step again.
create unique index if not exists newsletter_sequence_sends_unique_idx
  on public.newsletter_sequence_sends (lower(email), step);

create index if not exists newsletter_sequence_sends_email_idx
  on public.newsletter_sequence_sends (lower(email));

alter table public.newsletter_sequence_sends enable row level security;

drop policy if exists "newsletter_sequence_sends_no_public_access"
  on public.newsletter_sequence_sends;

create policy "newsletter_sequence_sends_no_public_access"
  on public.newsletter_sequence_sends for all to anon, authenticated
  using (false) with check (false);
