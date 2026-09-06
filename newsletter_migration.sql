-- ============================================================================
-- Reparation Road — Newsletter / subscriber consent
-- Run this once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Design notes:
--   * The account and the newsletter subscription are SEPARATE agreements.
--     `subscription_status` (billing) and `newsletter_status` (consent) never
--     imply one another.
--   * Consent is stored as a RECORD, not just a flag: when, from where, and
--     every subsequent change is appended to `newsletter_events`.
--   * Resend is authoritative for consent *changes made in the inbox*
--     (unsubscribe / bounce / complaint). Those arrive via webhook and are
--     written back here, so this stays the readable source of truth.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Consent columns on the member record
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists newsletter_status text not null default 'unsubscribed',
  add column if not exists newsletter_opted_in_at timestamptz,
  add column if not exists newsletter_opt_in_source text,
  -- Consent was given on the signup form, but the account's own email address
  -- has not been verified yet. Held here rather than pushed to Resend so an
  -- unverified (or mistyped) address never enters the sending audience.
  add column if not exists newsletter_pending_opt_in boolean not null default false,
  add column if not exists newsletter_unsubscribed_at timestamptz,
  add column if not exists resend_contact_id text,
  add column if not exists newsletter_synced_at timestamptz,
  add column if not exists newsletter_sync_error text;

-- 'subscribed'   — consented, receiving
-- 'unsubscribed' — no consent, or consent withdrawn
-- 'cleaned'      — removed by us after a hard bounce or spam complaint.
--                  Distinct from 'unsubscribed' so we never re-mail them and
--                  never mistake a deliverability removal for a user choice.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_newsletter_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_newsletter_status_check
      check (newsletter_status in ('subscribed', 'unsubscribed', 'cleaned'));
  end if;
end $$;

create index if not exists profiles_newsletter_status_idx
  on public.profiles (newsletter_status);

-- Reconcile job scans for rows that never made it to Resend.
create index if not exists profiles_newsletter_sync_idx
  on public.profiles (newsletter_synced_at)
  where newsletter_status = 'subscribed';

-- ---------------------------------------------------------------------------
-- 2. Subscribers with no account (footer form)
-- ---------------------------------------------------------------------------

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,

  -- 'pending' — submitted the form, has NOT clicked the confirmation link yet.
  --             Public forms attract junk and typo'd addresses, so nothing is
  --             sent to a pending address except the confirmation itself.
  status text not null default 'pending'
    check (status in ('pending', 'subscribed', 'unsubscribed', 'cleaned')),

  confirm_token text unique,
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,

  opt_in_source text,
  opt_in_ip text,
  opt_in_user_agent text,
  unsubscribed_at timestamptz,

  resend_contact_id text,
  synced_at timestamptz,
  sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per address, case-insensitively. Emails are lowercased on write.
create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status);

-- Locked down: only the service role touches this table. There is no reason
-- for a browser to read the subscriber list, and the signup route runs
-- server-side with the admin client.
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "newsletter_subscribers_no_public_access"
  on public.newsletter_subscribers;

create policy "newsletter_subscribers_no_public_access"
  on public.newsletter_subscribers
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 3. Consent audit trail
-- ---------------------------------------------------------------------------
-- Append-only. "newsletter_status = subscribed" proves nothing on its own;
-- this is the row you point at if a subscription is ever questioned.

create table if not exists public.newsletter_events (
  id uuid primary key default gen_random_uuid(),

  -- Exactly one of these is set, depending on whether the person has an account.
  profile_id uuid references public.profiles (id) on delete set null,
  subscriber_id uuid references public.newsletter_subscribers (id) on delete set null,

  email text not null,

  event text not null check (event in (
    'subscribed',       -- consent given
    'confirmed',        -- double opt-in link clicked
    'unsubscribed',     -- consent withdrawn
    'bounced',          -- hard bounce, removed for deliverability
    'complained',       -- marked as spam, removed immediately
    'resubscribed'      -- came back after unsubscribing
  )),

  -- 'signup_checkbox' | 'footer_form' | 'account_settings'
  --   | 'email_unsubscribe_link' | 'resend_webhook' | 'admin' | 'import'
  source text not null,

  ip text,
  user_agent text,
  metadata jsonb,

  created_at timestamptz not null default now()
);

create index if not exists newsletter_events_email_idx
  on public.newsletter_events (lower(email), created_at desc);

create index if not exists newsletter_events_profile_idx
  on public.newsletter_events (profile_id, created_at desc);

alter table public.newsletter_events enable row level security;

drop policy if exists "newsletter_events_no_public_access"
  on public.newsletter_events;

create policy "newsletter_events_no_public_access"
  on public.newsletter_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 4. updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.newsletter_subscribers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists newsletter_subscribers_touch on public.newsletter_subscribers;

create trigger newsletter_subscribers_touch
  before update on public.newsletter_subscribers
  for each row
  execute function public.newsletter_subscribers_touch_updated_at();
