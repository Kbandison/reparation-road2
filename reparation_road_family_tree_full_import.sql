-- Reparation Road — Family tree full GEDCOM capture
-- Stores everything a GEDCOM file carries: the full raw record per person, a
-- structured life-events timeline (incl. marriages), and the source bibliography
-- with citations. Safe to run more than once.
--
-- Run this in the Supabase SQL editor (or psql). No data is destroyed.

-- 1. Per-person: the full raw INDI subtree (every tag, including custom ones)
--    and the source citations attached directly to the person.
alter table public.tree_individuals
  add column if not exists raw_gedcom jsonb;
alter table public.tree_individuals
  add column if not exists citations jsonb not null default '[]'::jsonb;

-- 2. Life events & facts — births, deaths, marriages, residences, census,
--    occupations, custom events, etc. One row per event/attribute.
create table if not exists public.tree_events (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  individual_id uuid not null references public.tree_individuals(id) on delete cascade,
  -- The other person for shared events (e.g. a marriage partner).
  related_individual_id uuid references public.tree_individuals(id) on delete set null,
  tag text not null,            -- raw GEDCOM tag (BIRT, MARR, RESI, _CUSTOM…)
  type text not null,           -- normalized category (birth, marriage, event…)
  label text not null,          -- human label
  date text,
  place text,
  value text,                   -- attribute value (e.g. an occupation)
  note text,
  sources jsonb not null default '[]'::jsonb,  -- citation pointers under this event
  raw jsonb,                    -- full event subtree (set for family events)
  position int not null default 0,             -- original order, for stable sort
  created_at timestamptz not null default now()
);

create index if not exists tree_events_individual_idx on public.tree_events (individual_id);
create index if not exists tree_events_tree_idx on public.tree_events (tree_id);
create index if not exists tree_events_user_idx on public.tree_events (user_id);

-- 3. The source bibliography (top-level SOUR records).
create table if not exists public.tree_sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  gedcom_xref text not null,    -- @S1@ pointer used by citations
  title text,
  author text,
  publication text,
  repository text,
  text text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (tree_id, gedcom_xref)
);

create index if not exists tree_sources_tree_idx on public.tree_sources (tree_id);
create index if not exists tree_sources_user_idx on public.tree_sources (user_id);

-- 4. RLS — owners manage their own rows; the server's service-role client
--    (used by the importer) bypasses these.
alter table public.tree_events enable row level security;
alter table public.tree_sources enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tree_events' and policyname = 'tree_events_select_own') then
    create policy tree_events_select_own on public.tree_events for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_events' and policyname = 'tree_events_insert_own') then
    create policy tree_events_insert_own on public.tree_events for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_events' and policyname = 'tree_events_update_own') then
    create policy tree_events_update_own on public.tree_events for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_events' and policyname = 'tree_events_delete_own') then
    create policy tree_events_delete_own on public.tree_events for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'tree_sources' and policyname = 'tree_sources_select_own') then
    create policy tree_sources_select_own on public.tree_sources for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_sources' and policyname = 'tree_sources_insert_own') then
    create policy tree_sources_insert_own on public.tree_sources for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_sources' and policyname = 'tree_sources_update_own') then
    create policy tree_sources_update_own on public.tree_sources for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_sources' and policyname = 'tree_sources_delete_own') then
    create policy tree_sources_delete_own on public.tree_sources for delete using (auth.uid() = user_id);
  end if;
end $$;
