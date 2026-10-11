-- Give Enslaved Catholic Baptisms — Kentucky the id column every other
-- collection table has.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- enslaved_catholic_kentuky holds 4,006 baptisms but was created without an
-- id column. The site identifies records by id, so without one its records
-- can't be opened, bookmarked, saved to a family tree, or found by archive
-- matching and Related Records, and Sync Record Counts reads it as 0 records.
-- This adds the same id other collection tables have (a uuid primary key that
-- fills itself in), then sets the collection's record count.

-- 1. The id, filled in for every existing row; new rows get one automatically.
ALTER TABLE public.enslaved_catholic_kentuky
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- 2. Make it the primary key (the table has none).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.enslaved_catholic_kentuky'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.enslaved_catholic_kentuky ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 3. The collection card's record count (Sync Record Counts would also do this now).
UPDATE public.collections
SET record_count = (SELECT count(*) FROM public.enslaved_catholic_kentuky)
WHERE table_name = 'enslaved_catholic_kentuky';

NOTIFY pgrst, 'reload schema';

-- Check (optional): 4006 rows, 4006 distinct ids.
-- SELECT count(*), count(DISTINCT id) FROM public.enslaved_catholic_kentuky;
