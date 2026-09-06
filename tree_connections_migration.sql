-- ============================================================================
-- Reparation Road — Tree connections
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Lets researchers find others who have the same people in their trees, and
-- talk to them.
--
-- Sharing is OFF until a user turns it on. Once on, ALL of their individuals
-- are matchable, living relatives included — that is a deliberate product
-- decision, so the consent text must say so plainly rather than burying it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Opt-in
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists tree_sharing_enabled boolean not null default false,
  add column if not exists tree_sharing_enabled_at timestamptz;

create index if not exists profiles_tree_sharing_idx
  on public.profiles (id) where tree_sharing_enabled;

-- ---------------------------------------------------------------------------
-- 2. Normalised match keys
-- ---------------------------------------------------------------------------
-- Generated rather than maintained in application code: every import path,
-- manual edit and GEDCOM merge would otherwise need to remember to update them,
-- and one that forgets produces a person who silently never matches.

alter table public.tree_individuals
  add column if not exists norm_surname text
    generated always as (
      lower(regexp_replace(coalesce(surname, ''), '[^a-zA-Z]', '', 'g'))
    ) stored,
  add column if not exists norm_given text
    generated always as (
      lower(regexp_replace(split_part(coalesce(given_name, ''), ' ', 1), '[^a-zA-Z]', '', 'g'))
    ) stored,
  -- GEDCOM dates are free text ("ABT 1842", "12 MAR 1842", "1842-03-12"), so
  -- the year is pulled out rather than parsed as a date.
  add column if not exists birth_year integer
    generated always as (
      nullif(substring(coalesce(birth_date, '') from '[0-9]{4}'), '')::integer
    ) stored;

create index if not exists tree_individuals_match_idx
  on public.tree_individuals (norm_surname, norm_given)
  where norm_surname <> '' and norm_given <> '';

-- ---------------------------------------------------------------------------
-- 3. Overlap lookup
-- ---------------------------------------------------------------------------

create or replace function public.find_tree_overlaps(p_user_id uuid)
returns table (
  my_individual_id uuid,
  my_tree_id uuid,
  given_name text,
  surname text,
  birth_year integer,
  birth_place text,
  other_user_id uuid,
  other_individual_id uuid,
  other_birth_year integer,
  other_birth_place text,
  other_handle text,
  other_display_name text,
  other_avatar_url text,
  confidence text
)
language sql
stable
as $$
  select
    mine.id,
    mine.tree_id,
    mine.given_name,
    mine.surname,
    mine.birth_year,
    mine.birth_place,
    theirs.user_id,
    theirs.id,
    theirs.birth_year,
    theirs.birth_place,
    p.handle,
    p.display_name,
    p.avatar_url,
    case
      -- Same name and the same birth year is about as good as this gets
      -- without a shared source document.
      when mine.birth_year is not null and mine.birth_year = theirs.birth_year then 'strong'
      -- Transcribed dates drift by a year or two constantly.
      when mine.birth_year is not null and theirs.birth_year is not null then 'probable'
      -- Name-only. Common surnames make this weak on its own, which is why it
      -- is labelled rather than hidden.
      else 'possible'
    end
  from public.tree_individuals mine
  join public.tree_individuals theirs
    on theirs.norm_surname = mine.norm_surname
   and theirs.norm_given = mine.norm_given
   and theirs.user_id <> mine.user_id
   and (
     mine.birth_year is null
     or theirs.birth_year is null
     or abs(theirs.birth_year - mine.birth_year) <= 2
   )
  join public.profiles p
    on p.id = theirs.user_id
   and p.tree_sharing_enabled
  where mine.user_id = p_user_id
    -- A blank surname would otherwise match every other blank surname.
    and mine.norm_surname <> ''
    and mine.norm_given <> ''
    -- Sharing is mutual: you see other people's trees only while yours is
    -- visible too.
    and exists (
      select 1 from public.profiles me
      where me.id = p_user_id and me.tree_sharing_enabled
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Conversations
-- ---------------------------------------------------------------------------
-- One conversation per pair of people. user_a is always the lower uuid so the
-- pair has a single canonical row and the unique index actually prevents
-- duplicates.

create table if not exists public.tree_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  -- The person who brought them together, kept for context in the UI.
  about_individual_id uuid references public.tree_individuals (id) on delete set null,
  about_name text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint tree_conversations_ordered check (user_a < user_b)
);

create unique index if not exists tree_conversations_pair_idx
  on public.tree_conversations (user_a, user_b);

create index if not exists tree_conversations_recent_idx
  on public.tree_conversations (last_message_at desc);

create table if not exists public.tree_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.tree_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tree_messages_thread_idx
  on public.tree_messages (conversation_id, created_at);

create index if not exists tree_messages_unread_idx
  on public.tree_messages (conversation_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- 5. RLS — participants only
-- ---------------------------------------------------------------------------

alter table public.tree_conversations enable row level security;
alter table public.tree_messages enable row level security;

drop policy if exists "tree_conversations_participants" on public.tree_conversations;
create policy "tree_conversations_participants"
  on public.tree_conversations for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "tree_messages_participants" on public.tree_messages;
create policy "tree_messages_participants"
  on public.tree_messages for select to authenticated
  using (
    exists (
      select 1 from public.tree_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.user_a or auth.uid() = c.user_b)
    )
  );

-- Writes go through server routes using the service role, which check
-- participation and that both parties still have sharing enabled.
