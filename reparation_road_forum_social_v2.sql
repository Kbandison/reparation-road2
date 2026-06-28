-- Reparation Road — Forum social, v2
-- Adds thread-level reactions so a feed post can be "liked / rated" the same way
-- replies already can. Safe to run more than once.
--
-- Run this in the Supabase SQL editor (or psql). No data is destroyed.

-- 1. Let forum_reactions point at a thread instead of (or as well as) a post.
alter table public.forum_reactions
  add column if not exists thread_id uuid references public.forum_threads(id) on delete cascade;

-- post_id was NOT NULL; a thread reaction has no post, so relax it.
alter table public.forum_reactions
  alter column post_id drop not null;

-- Exactly one target: either a post OR a thread, never both, never neither.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'forum_reactions_one_target'
  ) then
    alter table public.forum_reactions
      add constraint forum_reactions_one_target
      check ((post_id is not null) <> (thread_id is not null));
  end if;
end $$;

-- One reaction of a given type per user per thread (mirrors the per-post rule).
create unique index if not exists forum_reactions_thread_user_type_idx
  on public.forum_reactions (thread_id, user_id, reaction_type)
  where thread_id is not null;

create index if not exists forum_reactions_thread_id_idx
  on public.forum_reactions (thread_id);

-- 2. RLS — the existing insert/select/delete policies key on auth.uid() = user_id,
--    which already covers thread reactions. Nothing else needed; this block is a
--    no-op safety net in case the table had no policies yet.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'forum_reactions' and policyname = 'forum_reactions_select_all'
  ) then
    create policy forum_reactions_select_all on public.forum_reactions
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'forum_reactions' and policyname = 'forum_reactions_insert_own'
  ) then
    create policy forum_reactions_insert_own on public.forum_reactions
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'forum_reactions' and policyname = 'forum_reactions_delete_own'
  ) then
    create policy forum_reactions_delete_own on public.forum_reactions
      for delete using (auth.uid() = user_id);
  end if;
end $$;
