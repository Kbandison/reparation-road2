-- Reparation Road — Family tree archive matches
-- Persists the archive records that may refer to each person in a family tree,
-- so matches survive a reload and can be found automatically on import.
-- Safe to run more than once.
--
-- Run this in the Supabase SQL editor (or psql). No data is destroyed.

-- 1. A marker on each individual so batch matching knows who's already been
--    searched (null = not yet matched).
alter table public.tree_individuals
  add column if not exists matched_at timestamptz;

-- 2. The persisted candidate matches. One row per (person, archive record).
create table if not exists public.tree_individual_matches (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references public.tree_individuals(id) on delete cascade,
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_slug text not null,
  collection_name text,
  record_id text not null,
  record_slug text,
  title text,
  score real not null default 0,
  match_reasons jsonb not null default '[]'::jsonb,
  detail_url text,
  -- 'suggested' (auto-found), 'linked' (confirmed by the user), 'dismissed'.
  status text not null default 'suggested',
  created_at timestamptz not null default now(),
  unique (individual_id, collection_slug, record_id)
);

create index if not exists tim_individual_idx on public.tree_individual_matches (individual_id);
create index if not exists tim_tree_idx on public.tree_individual_matches (tree_id);
create index if not exists tim_user_idx on public.tree_individual_matches (user_id);

-- 3. RLS — owners manage their own match rows. The server's service-role client
--    (used for the actual archive search + writes) bypasses these.
alter table public.tree_individual_matches enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tree_individual_matches' and policyname = 'tim_select_own'
  ) then
    create policy tim_select_own on public.tree_individual_matches
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'tree_individual_matches' and policyname = 'tim_insert_own'
  ) then
    create policy tim_insert_own on public.tree_individual_matches
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'tree_individual_matches' and policyname = 'tim_update_own'
  ) then
    create policy tim_update_own on public.tree_individual_matches
      for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'tree_individual_matches' and policyname = 'tim_delete_own'
  ) then
    create policy tim_delete_own on public.tree_individual_matches
      for delete using (auth.uid() = user_id);
  end if;
end $$;
