-- ============================================================================
-- Reparation Road — Resumable issue sends
-- Run once in the Supabase SQL editor, after newsletter_issues_migration.sql.
-- Safe to re-run.
--
-- A send used to hold its progress in local variables. If the function hit the
-- 300s limit mid-loop, the "mark sent" write after the loop never ran, so the
-- issue sat at 'sending' forever — unretryable, because claiming requires
-- 'draft' — with no record of who had already received it. The only recovery
-- was flipping the status by hand and mailing everyone a second time.
--
-- Progress now lives in a table, so it survives the function that wrote it.
-- ============================================================================

create table if not exists public.newsletter_issue_sends (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null
    references public.newsletter_issues (id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now()
);

-- Both the resume filter and the guarantee that a resumed run cannot re-send to
-- someone who already has the issue.
create unique index if not exists newsletter_issue_sends_unique_idx
  on public.newsletter_issue_sends (issue_id, lower(email));

alter table public.newsletter_issue_sends enable row level security;

drop policy if exists "newsletter_issue_sends_no_public_access"
  on public.newsletter_issue_sends;

create policy "newsletter_issue_sends_no_public_access"
  on public.newsletter_issue_sends for all to anon, authenticated
  using (false) with check (false);

-- When the current attempt began. Distinguishes a send that is genuinely in
-- flight from one abandoned by a timeout, which is what makes a stuck issue
-- safe to pick up again.
alter table public.newsletter_issues
  add column if not exists sending_started_at timestamptz;
