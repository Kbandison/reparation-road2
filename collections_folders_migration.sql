-- Folders: collections that hold other collections (tabs), never records.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Until now a "folder" was only implied: a collection with no table that
-- happened to have tabs under it. An empty one looked exactly like an empty
-- tab, so the import offered it as a target, and importing into it turned it
-- into a single list that hid any tabs added later. display_type = 'folder'
-- marks folders explicitly. The admin creates them from Import Records.

-- 1. Allow 'folder' alongside the existing 'table' and 'book'.
ALTER TABLE public.collections DROP CONSTRAINT IF EXISTS collections_display_type_check;
ALTER TABLE public.collections ADD CONSTRAINT collections_display_type_check
  CHECK (display_type IN ('table', 'book', 'folder'));

-- 2. Mark the collections that already work as folders: no table of their own,
--    with tabs under them (16 when this was written).
UPDATE public.collections AS c
SET display_type = 'folder'
WHERE c.table_name IS NULL
  AND EXISTS (SELECT 1 FROM public.collections AS k WHERE k.parent_slug = c.slug);

-- 3. The empty state collections that will get tabs rather than records.
UPDATE public.collections
SET display_type = 'folder'
WHERE table_name IS NULL
  AND slug IN (
    'tn-state-records-poc',
    'ky-state-records-poc',
    'md-state-records-poc',
    'al-state-records-poc',
    'pa-state-records-poc',
    'ny-state-records-poc',
    'civilian-records-poc'
  );

-- Check: every folder, with how many tabs it holds.
SELECT c.slug, c.name, c.parent_slug,
       (SELECT count(*) FROM public.collections AS k WHERE k.parent_slug = c.slug) AS tabs
FROM public.collections AS c
WHERE c.display_type = 'folder'
ORDER BY c.parent_slug NULLS FIRST, c.name;
