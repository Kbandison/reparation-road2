-- ============================================================================
-- Reparation Road — Newsletter issues (The Road Report)
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Requires newsletter_migration.sql to have been run first.
--
-- An issue is stored rather than composed and thrown away so that:
--   * a draft survives the browser being closed
--   * what was actually sent stays readable after the fact
--   * each send records the archive size it saw, which is what lets the NEXT
--     issue say "2,417 records added since last time" without anyone counting
-- ============================================================================

create table if not exists public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),

  subject text not null default '',
  -- Preview/preheader line. Shown next to the subject in most inboxes; left
  -- empty, clients fall back to scraping the first words of the body.
  preview_text text,

  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent')),

  -- The written half of the issue: from_archives, mystery, research_tip,
  -- updates, services. Stored as JSON so sections can be added without a
  -- migration — this is editorial structure, not relational data.
  sections jsonb not null default '{}'::jsonb,

  -- The generated half, frozen at send time. Recomputing it later would
  -- silently rewrite history: an issue that said "12 new collections" must keep
  -- saying that even after twenty more are added.
  auto_stats jsonb,

  segment text not null default 'all',
  recipient_count integer,

  -- Archive size when this issue went out. The next issue diffs against the
  -- most recent sent one to work out how much is new.
  total_records_snapshot bigint,

  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_issues_status_idx
  on public.newsletter_issues (status, created_at desc);

-- Finding the previous sent issue is the hot path for stats generation.
create index if not exists newsletter_issues_sent_idx
  on public.newsletter_issues (sent_at desc)
  where status = 'sent';

alter table public.newsletter_issues enable row level security;

drop policy if exists "newsletter_issues_no_public_access" on public.newsletter_issues;

-- Admin routes verify the caller's role and then use the service-role client,
-- so nothing here needs to be reachable from a browser session.
create policy "newsletter_issues_no_public_access"
  on public.newsletter_issues
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop trigger if exists newsletter_issues_touch on public.newsletter_issues;

create trigger newsletter_issues_touch
  before update on public.newsletter_issues
  for each row
  execute function public.newsletter_subscribers_touch_updated_at();
