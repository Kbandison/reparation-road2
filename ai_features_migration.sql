-- ============================================================================
-- Reparation Road — AI features: usage caps, scan transcription, activity
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- What it adds:
--   ai_usage               every Claude call, its tokens and its cost; drives
--                          the per-account caps and the monthly budget
--   scan_transcriptions    one transcript per scan image ("bucket/path")
--   transcription_jobs     batch transcription runs sent to Anthropic
--   transcription_trials   the pilot: the same scans through two models
--   user_activity          what each signed-in user viewed, for the assistant
--   app_settings rows      ai_limits, transcription_model
--
-- Nothing here is readable by visitors. The site reads and writes these tables
-- with the service key, after checking who is asking, except user_activity,
-- where each signed-in user can only see and write their own rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_usage
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  feature text not null
    check (feature in ('assistant', 'transcription', 'transcription_pilot', 'import_mapping', 'descriptions')),
  model text not null,
  -- 'pending' holds an assistant message's place in the user's cap while it
  -- runs; a 'failed' message never counts against the user's cap, though
  -- whatever it spent before failing still counts toward the budget.
  status text not null default 'done' check (status in ('pending', 'done', 'failed')),
  batch boolean not null default false,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  meta jsonb
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at);
create index if not exists ai_usage_user_feature_idx on public.ai_usage (user_id, feature, created_at);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_no_public_access" on public.ai_usage;
create policy "ai_usage_no_public_access"
  on public.ai_usage for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Reserve one assistant message against a user's caps
-- ---------------------------------------------------------------------------
-- Counting and reserving happen under one per-user lock. Counting first and
-- inserting later would let two messages sent together both squeeze under the
-- cap. A null limit means no cap (admins). p_pause_at pauses the assistant
-- once the month's spend on every AI feature reaches it; pass null to exempt
-- the caller (admins keep working).

create or replace function public.ai_reserve_assistant_message(
  p_user_id uuid,
  p_model text,
  p_day_limit integer,
  p_month_limit integer,
  p_pause_at numeric
)
returns table (allowed boolean, reason text, used_today integer, used_month integer, usage_id uuid)
language plpgsql
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_today integer;
  v_month integer;
  v_spend numeric;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ai_assistant:' || p_user_id::text));

  select count(*) filter (where u.created_at >= v_day_start), count(*)
    into v_today, v_month
    from public.ai_usage u
   where u.user_id = p_user_id
     and u.feature = 'assistant'
     and u.status <> 'failed'
     and u.created_at >= v_month_start;

  if p_pause_at is not null then
    -- Every dollar spent counts, failed calls included.
    select coalesce(sum(u.cost_usd), 0) into v_spend
      from public.ai_usage u
     where u.created_at >= v_month_start;
    if v_spend >= p_pause_at then
      return query select false, 'budget'::text, v_today, v_month, null::uuid;
      return;
    end if;
  end if;

  if p_month_limit is not null and v_month >= p_month_limit then
    return query select false, 'month'::text, v_today, v_month, null::uuid;
    return;
  end if;
  if p_day_limit is not null and v_today >= p_day_limit then
    return query select false, 'day'::text, v_today, v_month, null::uuid;
    return;
  end if;

  insert into public.ai_usage (user_id, feature, model, status)
  values (p_user_id, 'assistant', p_model, 'pending')
  returning id into v_id;

  return query select true, null::text, v_today + 1, v_month + 1, v_id;
end;
$$;

-- What a user has used this month, without reserving anything (for showing
-- "12 of 50 left" before they type).
create or replace function public.ai_assistant_usage(p_user_id uuid)
returns table (used_today integer, used_month integer)
language sql
stable
as $$
  select
    (count(*) filter (where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'))::integer,
    count(*)::integer
  from public.ai_usage
  where user_id = p_user_id
    and feature = 'assistant'
    and status <> 'failed'
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

-- Spend since a moment, per feature (budget checks and the admin page). Calls
-- counts only the ones that worked; cost includes failed calls, which still cost.
create or replace function public.ai_spend_by_feature(p_since timestamptz)
returns table (feature text, calls integer, cost_usd numeric)
language sql
stable
as $$
  select u.feature, (count(*) filter (where u.status <> 'failed'))::integer, coalesce(sum(u.cost_usd), 0)
  from public.ai_usage u
  where u.created_at >= p_since
  group by u.feature;
$$;

-- Assistant messages (the ones that count against caps) and AI spend per user
-- since a moment (the admin page).
create or replace function public.ai_usage_by_user(p_since timestamptz)
returns table (user_id uuid, messages integer, cost_usd numeric)
language sql
stable
as $$
  select u.user_id,
         (count(*) filter (where u.feature = 'assistant' and u.status <> 'failed'))::integer,
         coalesce(sum(u.cost_usd), 0)
  from public.ai_usage u
  where u.created_at >= p_since and u.user_id is not null
  group by u.user_id;
$$;

-- These run with the service key only. Postgres lets every role execute new
-- functions by default, which would let a visitor reserve messages for anyone.
revoke all on function public.ai_reserve_assistant_message(uuid, text, integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.ai_assistant_usage(uuid) from public, anon, authenticated;
revoke all on function public.ai_spend_by_feature(timestamptz) from public, anon, authenticated;
revoke all on function public.ai_usage_by_user(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_reserve_assistant_message(uuid, text, integer, integer, numeric) to service_role;
grant execute on function public.ai_assistant_usage(uuid) to service_role;
grant execute on function public.ai_spend_by_feature(timestamptz) to service_role;
grant execute on function public.ai_usage_by_user(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Transcription
-- ---------------------------------------------------------------------------
create table if not exists public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  collection_slug text not null,
  table_name text not null,
  model text not null,
  -- Whether scans whose records already had OCR text were included.
  include_ocr boolean not null default false,
  -- Anthropic Message Batch id, once submitted.
  batch_id text,
  status text not null default 'submitting'
    check (status in ('submitting', 'processing', 'ingesting', 'done', 'failed', 'canceled')),
  -- Request i in the batch (custom_id "s<i>") transcribes image_keys[i + 1].
  image_keys text[] not null default '{}',
  scan_count integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  estimated_cost numeric(10, 4),
  actual_cost numeric(10, 4),
  error text,
  ended_at timestamptz,
  ingested_at timestamptz
);

create index if not exists transcription_jobs_created_idx on public.transcription_jobs (created_at desc);

create table if not exists public.scan_transcriptions (
  id uuid primary key default gen_random_uuid(),
  -- The scan, as "bucket/path" (lib/storage/references.ts referenceKey), so a
  -- page is transcribed once however its records spell the link.
  image_key text not null unique,
  -- Where it was first transcribed from; records are found by image_path.
  table_name text not null,
  collection_slug text,
  -- What visitors see. Starts as Claude's text; an admin correction replaces it.
  text text not null default '',
  -- Claude's original, kept when an admin edits.
  ai_text text,
  model text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  notes text,
  job_id uuid references public.transcription_jobs(id) on delete set null,
  edited_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scan_transcriptions_table_idx on public.scan_transcriptions (table_name);

create table if not exists public.transcription_trials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- One pilot run: the same scans through each model being compared.
  run_id uuid not null,
  image_key text not null,
  collection_slug text,
  model text not null,
  text text,
  confidence text,
  notes text,
  error text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  duration_ms integer
);

create index if not exists transcription_trials_run_idx on public.transcription_trials (run_id);

alter table public.transcription_jobs enable row level security;
alter table public.scan_transcriptions enable row level security;
alter table public.transcription_trials enable row level security;

drop policy if exists "transcription_jobs_no_public_access" on public.transcription_jobs;
create policy "transcription_jobs_no_public_access"
  on public.transcription_jobs for all to anon, authenticated
  using (false) with check (false);

-- Transcripts follow their collection's access tier, which a table policy
-- can't express, so the site serves them after checking access.
drop policy if exists "scan_transcriptions_no_public_access" on public.scan_transcriptions;
create policy "scan_transcriptions_no_public_access"
  on public.scan_transcriptions for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "transcription_trials_no_public_access" on public.transcription_trials;
create policy "transcription_trials_no_public_access"
  on public.transcription_trials for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- user_activity (the assistant's "recent activity")
-- ---------------------------------------------------------------------------
create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('collection', 'subcollection', 'record', 'search')),
  target_slug text not null,
  target_name text,
  collection_slug text,
  parent_slug text,
  occurred_at timestamptz not null default now(),
  -- Viewing the same thing again bumps occurred_at instead of adding a row.
  constraint user_activity_one_per_target unique (user_id, type, target_slug)
);

create index if not exists user_activity_recent_idx on public.user_activity (user_id, occurred_at desc);

alter table public.user_activity enable row level security;

drop policy if exists "user_activity_select_own" on public.user_activity;
create policy "user_activity_select_own"
  on public.user_activity for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_activity_insert_own" on public.user_activity;
create policy "user_activity_insert_own"
  on public.user_activity for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_activity_update_own" on public.user_activity;
create policy "user_activity_update_own"
  on public.user_activity for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Settings (left alone if they already exist, so admin edits survive re-runs)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description)
values
  ('ai_limits',
   '{"free": {"day": 10, "month": 50}, "member": {"day": 40, "month": 400}, "monthly_budget_usd": 500, "assistant_pause_usd": 450}'::jsonb,
   'AI assistant caps per account level, the monthly AI budget, and the spend at which the assistant pauses for non-admins'),
  ('transcription_model', '"claude-sonnet-5"'::jsonb,
   'Model used for scan transcription batches')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
