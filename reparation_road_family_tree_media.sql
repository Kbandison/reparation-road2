-- Reparation Road — Family tree photos / media
-- Imports the photos a GEDCOM bundle carries into Supabase Storage and links
-- them to people. Safe to run more than once.
--
-- Run this in the Supabase SQL editor (or psql). No data is destroyed.

-- 1. A quick "primary photo" on each person (for the canvas card + profile).
alter table public.tree_individuals
  add column if not exists photo_url text;

-- 2. All media for a person.
create table if not exists public.tree_media (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  individual_id uuid references public.tree_individuals(id) on delete cascade,
  title text,
  url text not null,            -- public URL (Storage or an external link)
  storage_path text,            -- object path in the bucket (null for external)
  format text,                  -- jpg / png / …
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tree_media_individual_idx on public.tree_media (individual_id);
create index if not exists tree_media_tree_idx on public.tree_media (tree_id);
create index if not exists tree_media_user_idx on public.tree_media (user_id);

-- 3. RLS — owners manage their own media rows; the importer writes via the
--    service-role client (bypasses RLS).
alter table public.tree_media enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tree_media' and policyname = 'tree_media_select_own') then
    create policy tree_media_select_own on public.tree_media for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_media' and policyname = 'tree_media_insert_own') then
    create policy tree_media_insert_own on public.tree_media for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_media' and policyname = 'tree_media_update_own') then
    create policy tree_media_update_own on public.tree_media for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tree_media' and policyname = 'tree_media_delete_own') then
    create policy tree_media_delete_own on public.tree_media for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 4. A public Storage bucket for the photos. Public buckets are readable at
--    /storage/v1/object/public/family-tree-media/... without auth; uploads run
--    through the server's service-role client, so no extra storage policies are
--    needed.
insert into storage.buckets (id, name, public)
values ('family-tree-media', 'family-tree-media', true)
on conflict (id) do update set public = true;
