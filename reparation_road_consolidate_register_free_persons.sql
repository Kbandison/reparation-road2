-- ============================================================================
-- REPARATION ROAD — CONSOLIDATE GEORGIA "REGISTER OF FREE PERSONS"
-- ============================================================================
-- Collapses the nine per-county "Register of Free Persons — <County>"
-- collections into a SINGLE collection: "Register of Free Persons".
--
-- Nothing about the archival data changes. All nine collections already read
-- the SAME table (register_free_persons, 928 rows); they were only split by a
-- `county` discriminator. This rewrites the `collections` METADATA so one
-- collection reads the whole table, with `county` kept as a visible, sortable,
-- searchable column (records group by county, then original document order).
--
-- End state under parent "Georgia State Records Concerning Persons of Color":
--   ├─ Register of Free Persons          (register_free_persons, 928 rows)
--   └─ Passports Issued by Governors…    (unchanged)
--
-- Safe to run once. Re-running is a no-op (the second pass matches nothing new).
-- Reviewed refs before writing this:
--   • 0 bookmarks reference the nine county slugs.
--   • 1 related_records row references 'register-free-persons-camden' — STEP 1
--     repoints it so the link keeps working.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Repoint related-record links off the per-county slugs
-- ----------------------------------------------------------------------------
-- Record IDs are unchanged (records stay in register_free_persons); only the
-- human-facing collection slug/name on the link needs to move to the new one.
UPDATE related_records
SET source_collection = 'Register of Free Persons',
    source_collection_slug = 'register-free-persons'
WHERE source_collection_slug LIKE 'register-free-persons-%';

UPDATE related_records
SET target_collection = 'Register of Free Persons',
    target_collection_slug = 'register-free-persons'
WHERE target_collection_slug LIKE 'register-free-persons-%';

-- ----------------------------------------------------------------------------
-- STEP 2: Normalize county values for display (spelling + Title Case)
-- ----------------------------------------------------------------------------
-- The county column is now shown to users, so tidy the stored values:
--   • 'colombia' is the misspelled Columbia County — correct it.
--   • lower-case values ('baldwin') become Title Case ('Baldwin').
UPDATE register_free_persons SET county = 'Columbia' WHERE county IN ('colombia', 'columbia');
UPDATE register_free_persons
SET county = INITCAP(county)
WHERE county IS NOT NULL AND county <> INITCAP(county);

-- ----------------------------------------------------------------------------
-- STEP 3: Turn the Baldwin row INTO the consolidated collection
-- ----------------------------------------------------------------------------
-- Repurposing an existing row (rather than INSERT) avoids any dependence on a
-- unique-constraint / ON CONFLICT and reuses a known-good metadata row.
-- Clearing the discriminator makes it read the entire table (all 928 rows).
-- The slug IN (...) clause keeps a re-run refreshing the already-renamed row.
UPDATE collections
SET slug = 'register-free-persons',
    name = 'Register of Free Persons',
    short_description = 'Registration records of free persons of color across nine antebellum Georgia counties',
    long_description = 'Free persons of color in antebellum Georgia were required to register with their county courts. This collection brings together the surviving registers for Baldwin, Camden, Columbia, Hancock, Jefferson, Lincoln, Lumpkin, Thomas, and Warren counties into a single searchable record set. Each entry lists the person''s name, age, place of nativity, residence, occupation, and date of registration; use the County column to focus on a single county.',
    category = 'legal',
    era = 'antebellum',
    region = 'georgia',
    table_name = 'register_free_persons',
    discriminator_column = NULL,
    discriminator_value = NULL,
    record_count = 928,
    has_images = true,
    has_ocr = true,
    has_transcription = false,
    access_tier = 'scholar',
    parent_slug = 'georgia-state-records',
    display_type = 'table',
    display_columns = '["county","name","age","place_of_nativity","residence","occupation","date_registered"]',
    search_columns  = '["county","name","place_of_nativity","residence","occupation"]',
    sort_columns    = '["county","book_no","page_no","row_no"]',
    sort_order = 10,
    updated_at = now()
WHERE slug IN ('register-free-persons', 'register-free-persons-baldwin');

-- ----------------------------------------------------------------------------
-- STEP 4: Delete the remaining eight per-county collection rows
-- ----------------------------------------------------------------------------
-- The renamed row is now 'register-free-persons' and no longer matches the
-- 'register-free-persons-%' pattern, so exactly the other eight are removed.
DELETE FROM collections
WHERE slug LIKE 'register-free-persons-%'
  AND slug <> 'register-free-persons';

-- ----------------------------------------------------------------------------
-- STEP 5: Re-sum the parent's record_count (register 928 + passports 894 = 1822)
-- ----------------------------------------------------------------------------
UPDATE collections p
SET record_count = (
  SELECT COALESCE(SUM(c.record_count), 0)
  FROM collections c
  WHERE c.parent_slug = p.slug
),
updated_at = now()
WHERE p.slug = 'georgia-state-records';

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — safe to run after COMMIT)
-- ============================================================================
-- Expect: one 'register-free-persons' row, zero 'register-free-persons-%' rows,
-- and a live table count of 928 spread across nine counties.

SELECT slug, name, table_name, discriminator_column, record_count, parent_slug, is_published
FROM collections
WHERE slug = 'register-free-persons'
   OR slug LIKE 'register-free-persons-%'
ORDER BY slug;

SELECT county, COUNT(*) AS records
FROM register_free_persons
GROUP BY county
ORDER BY county;

SELECT COUNT(*) AS total_rows FROM register_free_persons;  -- expect 928
