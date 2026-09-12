-- ============================================================================
-- Reparation Road — Give every account a handle
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- A profile with no handle has no address: nothing could link to it, so the
-- dashboard could not show someone their own public page and other researchers
-- could not reach them. Everyone gets one automatically now, and is nudged to
-- fill in the rest.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Handle generation
-- ---------------------------------------------------------------------------

create or replace function public.generate_unique_handle(p_base text)
returns text
language plpgsql
as $$
declare
  v_base text;
  v_handle text;
  v_suffix integer := 0;
begin
  -- Same character set the API enforces, so a generated handle is one the user
  -- could also have typed.
  v_base := lower(regexp_replace(coalesce(p_base, ''), '[^a-zA-Z0-9_]', '', 'g'));
  v_base := left(v_base, 16);

  -- The column allows 3-20 characters; anything shorter needs padding rather
  -- than rejection, since this must always produce something.
  if length(v_base) < 3 then
    v_base := 'researcher';
  end if;

  v_handle := v_base;

  -- Numeric suffix on collision. Bounded so a pathological case cannot spin.
  while exists (select 1 from public.profiles where handle = v_handle) loop
    v_suffix := v_suffix + 1;
    if v_suffix > 9999 then
      v_handle := v_base || '_' || replace(gen_random_uuid()::text, '-', '');
      v_handle := left(v_handle, 20);
      exit;
    end if;
    v_handle := left(v_base, 20 - length(v_suffix::text)) || v_suffix::text;
  end loop;

  return v_handle;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- Built from the name where there is one, the email local part otherwise. Done
-- row by row because each generated handle has to be visible to the uniqueness
-- check for the next.

do $$
declare
  r record;
begin
  for r in
    select id, first_name, last_name, email
    from public.profiles
    where handle is null or trim(handle) = ''
  loop
    update public.profiles
    set handle = public.generate_unique_handle(
      coalesce(
        nullif(trim(coalesce(r.first_name, '') || coalesce(r.last_name, '')), ''),
        split_part(coalesce(r.email, ''), '@', 1),
        'researcher'
      )
    )
    where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Keep it true for new accounts
-- ---------------------------------------------------------------------------
-- A trigger rather than application code: profiles are created by a database
-- trigger on auth signup, so there is no single code path that could do it.

create or replace function public.profiles_assign_handle()
returns trigger
language plpgsql
as $$
begin
  if new.handle is null or trim(new.handle) = '' then
    new.handle := public.generate_unique_handle(
      coalesce(
        nullif(trim(coalesce(new.first_name, '') || coalesce(new.last_name, '')), ''),
        split_part(coalesce(new.email, ''), '@', 1),
        'researcher'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_handle_trigger on public.profiles;

create trigger profiles_assign_handle_trigger
  before insert on public.profiles
  for each row
  execute function public.profiles_assign_handle();
