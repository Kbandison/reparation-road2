-- Spelling-variant name matching for family-tree archive suggestions.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Archive suggestions matched names only as exact text, so a tree's
-- "Pinkard" never found a record's "Pinckard", "Elijah" never found "Eilja",
-- and "William" never found "Wm". This adds a function the matcher calls
-- alongside the exact search. It returns records where one person's name in
-- the record (not words from different people on the same row) is the name,
-- sounds like it (same Soundex code), is a letter or two off, or uses one of
-- the nicknames/abbreviations the app sends (Polly for Mary, Wm for William).
-- The app then scores each record with the same rules the family-tree search
-- uses, so this only has to find candidates.
-- Until this is run, the app simply keeps doing exact matching.

-- 1. Soundex and edit distance (a standard Postgres extension Supabase ships).
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

-- 2. The search.
--    p_match_columns   name columns, each compared on its own
--    p_joined_columns  name parts kept in separate columns (first_name, last_name),
--                      joined in this order into one name
--    p_select_columns  columns to return for each record (id is always returned)
--    p_terms           words to look for
--    p_groups          for each term, which word of the person's name it stands
--                      for; a nickname shares its name's group, so rank counts
--                      name words matched, not spellings
--    p_fuzzy           for each term, whether sound-alikes and letter slips count
--                      (true for the person's own names, false for nicknames)
--    p_min_hits        how many name words one name in the record must match
--    p_required_groups name words one of which must be among them (the surname,
--                      so two first names alone never count); empty = none
--
-- A field can name several people ("Tom, Kate & Nan", "Collin Reddock (Thomas
-- Powers)"), so fields are split at commas, semicolons, ampersands, "and" and
-- parentheses, and words only count together within one piece. A surname-first
-- name ("Bowers, John") stays whole.

-- Earlier drafts of this function had different parameters; remove any that
-- were installed so only the current one below exists.
DROP FUNCTION IF EXISTS public.match_name_variants(text, text[], text[], integer[], text, text, integer);
DROP FUNCTION IF EXISTS public.match_name_variants(text, text[], text[], text[], integer[], boolean[], integer, text, text, integer);
DROP FUNCTION IF EXISTS public.match_name_variants(text, text[], text[], text[], text[], integer[], boolean[], integer, text, text, integer);

CREATE OR REPLACE FUNCTION public.match_name_variants(
  p_table text,
  p_match_columns text[],
  p_joined_columns text[],
  p_select_columns text[],
  p_terms text[],
  p_groups integer[],
  p_fuzzy boolean[],
  p_min_hits integer DEFAULT 1,
  p_required_groups integer[] DEFAULT '{}',
  p_discriminator_column text DEFAULT NULL,
  p_discriminator_value text DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_match text[];
  v_joined text[];
  v_select text[];
  v_values text;
  v_row text;
  v_filter text := '';
BEGIN
  -- Only tables behind a collection, and only columns they really have.
  IF NOT EXISTS (SELECT 1 FROM public.collections WHERE table_name = p_table) THEN
    RAISE EXCEPTION 'Not a collection table: %', p_table;
  END IF;

  SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position) INTO v_match
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = ANY (p_match_columns);

  SELECT array_agg(c.column_name::text ORDER BY array_position(p_joined_columns, c.column_name::text)) INTO v_joined
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = ANY (p_joined_columns);

  SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position) INTO v_select
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table
    AND (c.column_name = 'id' OR c.column_name = ANY (p_select_columns));

  IF (v_match IS NULL AND v_joined IS NULL) OR coalesce(array_length(p_terms, 1), 0) = 0 THEN
    RETURN;
  END IF;

  IF p_discriminator_column IS NOT NULL AND p_discriminator_value IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = p_discriminator_column
    ) THEN
      RAISE EXCEPTION 'Unknown column %', p_discriminator_column;
    END IF;
    v_filter := format('AND r.%I::text ILIKE %L', p_discriminator_column, p_discriminator_value);
  END IF;

  -- Each name column's text, plus the joined name parts as one more value.
  SELECT 'ARRAY[' || string_agg(expr, ', ') || ']::text[]' INTO v_values
  FROM (
    SELECT format('r.%I::text', col) AS expr FROM unnest(v_match) AS col
    UNION ALL
    SELECT 'concat_ws('' '', ' || string_agg(format('r.%I::text', col), ', ') || ')'
    FROM unnest(v_joined) AS col
    HAVING count(*) > 0
  ) AS parts;

  -- Only the requested columns come back, not whole records.
  SELECT 'jsonb_build_object(' || string_agg(format('%L, r.%I', col, col), ', ') || ')'
  INTO v_row
  FROM unnest(v_select) AS col;

  -- Candidates are a little looser than the app's rules (same Soundex code, or
  -- up to two edits keeping the first letter, which covers a swapped pair of
  -- letters), so nothing the app would accept is missed here. A record ranks
  -- by its best-matching name.
  RETURN QUERY EXECUTE format($query$
    WITH terms AS (
      SELECT t.term,
             t.grp,
             CASE WHEN t.fuzzy AND length(t.term) >= 4 THEN soundex(t.term) END AS sx,
             CASE WHEN length(t.term) >= 5 THEN 2 ELSE 0 END AS slips
      FROM unnest($1::text[], $2::integer[], $3::boolean[]) AS t(term, grp, fuzzy)
    )
    SELECT %s
    FROM public.%I AS r
    CROSS JOIN LATERAL (
      SELECT coalesce(max(per_name.hits) FILTER (WHERE per_name.has_required), 0) AS hits
      FROM (
        SELECT count(DISTINCT terms.grp) AS hits,
               (cardinality($6::integer[]) = 0 OR bool_or(terms.grp = ANY ($6::integer[]))) AS has_required
        FROM unnest(%s) WITH ORDINALITY AS v(val, vn)
        CROSS JOIN LATERAL regexp_split_to_table(
          CASE WHEN v.val ~ '^\s*[[:alpha:]''-]+\s*,[^,]*$' THEN replace(v.val, ',', ' ') ELSE v.val END,
          '[,;&()]|\mand\M', 'i'
        ) WITH ORDINALITY AS s(piece, pn)
        CROSS JOIN LATERAL (
          SELECT DISTINCT w, soundex(w) AS wsx
          FROM regexp_split_to_table(lower(s.piece), '[^[:alpha:]]+') AS w
          WHERE w <> ''
        ) AS words
        JOIN terms ON words.w = terms.term
          OR (terms.sx IS NOT NULL AND length(words.w) >= 4 AND (
                words.wsx = terms.sx
                OR (terms.slips > 0 AND left(words.w, 1) = left(terms.term, 1)
                    AND levenshtein_less_equal(words.w, terms.term, terms.slips) <= terms.slips)
             ))
        GROUP BY v.vn, s.pn
      ) AS per_name
    ) AS m
    WHERE m.hits >= $4 %s
    ORDER BY m.hits DESC
    LIMIT $5
  $query$, v_row, p_table, v_values, v_filter)
  USING p_terms, p_groups, p_fuzzy, greatest(p_min_hits, 1), least(greatest(p_limit, 1), 200),
        coalesce(p_required_groups, '{}');
END;
$$;

-- 3. Server-side only: the app's service-role matcher calls it.
REVOKE ALL ON FUNCTION public.match_name_variants(text, text[], text[], text[], text[], integer[], boolean[], integer, integer[], text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_name_variants(text, text[], text[], text[], text[], integer[], boolean[], integer, integer[], text, text, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Check (optional): should list Register of Free Persons records spelled like
-- Priscilla, e.g. Precilla.
-- SELECT * FROM public.match_name_variants(
--   'register_of_free_person', ARRAY['name'], ARRAY[]::text[], ARRAY['name'],
--   ARRAY['priscilla'], ARRAY[0], ARRAY[true]
-- ) LIMIT 5;
