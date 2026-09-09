-- ============================================================================
-- Reparation Road — Fix the issue-sends unique index
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The index was created on (issue_id, lower(email)). ON CONFLICT can only use a
-- unique index whose columns it names exactly, so the upsert that records each
-- delivered batch failed with 42P10 every time — and because the route only
-- logs that error, sends would have looked fine while recording nothing. Resume
-- would then have been broken at exactly the moment it was needed.
--
-- Every write path normalises the address before insert, so a plain unique
-- index on the raw column is equivalent in practice and is one ON CONFLICT can
-- actually match.
-- ============================================================================

drop index if exists public.newsletter_issue_sends_unique_idx;

create unique index if not exists newsletter_issue_sends_unique_idx
  on public.newsletter_issue_sends (issue_id, email);
