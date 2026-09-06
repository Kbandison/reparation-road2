-- ============================================================================
-- Reparation Road — Tree connections: living-person safeguard + match ranking
-- Run once in the Supabase SQL editor, after tree_connections_migration.sql.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Living-person safeguard
-- ---------------------------------------------------------------------------
-- The is_living flag cannot carry this. It is false on all 2,845 individuals
-- because GEDCOM import never sets it, while the data contains people born in
-- 1992, 1982 and 1964 with no death date. A safeguard that reads is_living
-- would therefore protect nobody while appearing to work.
--
-- So "possibly living" is derived: no death date, and either born within living
-- memory or carrying no dates at all. Undated people are treated as possibly
-- living deliberately — with no dates they can only ever produce a name-only
-- match, which is the weakest kind and the least worth exposing someone for.
--
-- Default is to withhold them. Sharing everyone remains available, but it is
-- now a choice someone makes rather than the one they get by not thinking
-- about it.

alter table public.profiles
  add column if not exists tree_sharing_include_living boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Overlap lookup, with the safeguard and a distinctiveness score
-- ---------------------------------------------------------------------------
-- Confidence alone orders matches badly once trees overlap heavily: a thousand
-- equally-strong matches come back in arbitrary order. Rarity breaks the tie —
-- a shared Pinkard means far more than a shared John Smith, and surfacing the
-- rare ones first is the difference between a discovery and a wall of names.

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
  confidence text,
  name_frequency integer
)
language sql
stable
as $$
  with visible as (
    -- Every individual that may take part in matching, from either side.
    select i.*
    from public.tree_individuals i
    join public.profiles p on p.id = i.user_id
    where p.tree_sharing_enabled
      and i.norm_surname <> ''
      and i.norm_given <> ''
      and (
        p.tree_sharing_include_living
        or i.death_date is not null
        or (
          i.birth_year is not null
          and i.birth_year <= extract(year from current_date)::int - 100
        )
      )
  ),
  frequency as (
    -- How many people across all shared trees carry this exact name. Low is
    -- distinctive.
    select norm_surname, norm_given, count(*)::int as n
    from visible
    group by norm_surname, norm_given
  )
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
      when mine.birth_year is not null and mine.birth_year = theirs.birth_year then 'strong'
      when mine.birth_year is not null and theirs.birth_year is not null then 'probable'
      else 'possible'
    end,
    f.n
  from visible mine
  join visible theirs
    on theirs.norm_surname = mine.norm_surname
   and theirs.norm_given = mine.norm_given
   and theirs.user_id <> mine.user_id
   and (
     mine.birth_year is null
     or theirs.birth_year is null
     or abs(theirs.birth_year - mine.birth_year) <= 2
   )
  join public.profiles p on p.id = theirs.user_id
  join frequency f
    on f.norm_surname = mine.norm_surname
   and f.norm_given = mine.norm_given
  where mine.user_id = p_user_id
    and exists (
      select 1 from public.profiles me
      where me.id = p_user_id and me.tree_sharing_enabled
    );
$$;
