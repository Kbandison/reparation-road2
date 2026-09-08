-- ============================================================================
-- Reparation Road — Rate limiting
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Backed by Postgres rather than process memory. Serverless functions are
-- replaced and run in parallel, so an in-process counter resets constantly and
-- protects nothing — it only looks like it works in local testing.
-- ============================================================================

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- Only the sweep reads this by time.
create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

drop policy if exists "rate_limits_no_public_access" on public.rate_limits;
create policy "rate_limits_no_public_access"
  on public.rate_limits for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Count one hit against a key
-- ---------------------------------------------------------------------------
-- Counting and deciding happen in a single statement on purpose. Reading the
-- count and then writing it back would let two concurrent requests both see the
-- same value and both be allowed — which is exactly the situation a limiter
-- exists to stop, and exactly what a flood produces.

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after integer)
language plpgsql
as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning rl.count, rl.window_start into v_count, v_window_start;

  return query
  select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      0,
      ceil(extract(epoch from (
        v_window_start + make_interval(secs => p_window_seconds) - now()
      )))::integer
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
-- Expired rows are dead weight; the newsletter reconcile cron calls this daily.

create or replace function public.sweep_rate_limits(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
