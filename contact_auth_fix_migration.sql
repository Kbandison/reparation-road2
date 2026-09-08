-- ============================================================================
-- Reparation Road — Close the unauthenticated profile write
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Signup used to finish by POSTing a caller-supplied userId to /api/contact,
-- which then wrote names and donor status to that profile with no
-- authentication. Anyone holding a profile UUID could rename that account.
--
-- The work now happens in the auth callback, where a real session exists. This
-- column makes that safe to run more than once: the callback fires on every
-- confirmation link click, and without a record of the send a refresh would
-- mail the same person again.
-- ============================================================================

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;
