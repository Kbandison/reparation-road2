-- Ex-Slave Pension scans, and removal of a duplicate leftover table.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Ex-Slave Pension shows no scans: its table has no image_path, the column
--    every collection table uses for a record's image. Each of the 127 letters
--    already has its scan recorded in ex_slave_pension_with_image (same ids;
--    all 127 files confirmed present in the ex-slave-pension bucket), so add
--    the column and fill it from there, as "bucket/path".
ALTER TABLE public.ex_slave_pension ADD COLUMN IF NOT EXISTS image_path text DEFAULT '';

UPDATE public.ex_slave_pension AS e
SET image_path = w.storage_bucket || '/' || w.image_object_path
FROM public.ex_slave_pension_with_image AS w
WHERE w.id = e.id
  AND w.image_object_path IS NOT NULL
  AND coalesce(e.image_path, '') = '';

NOTIFY pgrst, 'reload schema';

-- 2. sc_register_guardian is an exact copy of Free Colored Register of
--    Guardian (same 428 rows, same 333 people), left behind on 2026-10-04 when
--    the first import's placeholder tab was deleted. No collection uses it.
--    Refuses to drop it if one ever does.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.collections WHERE table_name = 'sc_register_guardian') THEN
    RAISE EXCEPTION 'A collection still uses sc_register_guardian; not dropping it.';
  END IF;
END $$;
DROP TABLE IF EXISTS public.sc_register_guardian;

-- Check: 127 letters, 127 with a scan.
SELECT count(*) AS letters, count(*) FILTER (WHERE image_path <> '') AS with_scan
FROM public.ex_slave_pension;
