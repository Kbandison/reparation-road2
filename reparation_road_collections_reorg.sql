-- ============================================================================
-- REPARATION ROAD — COLLECTION REORGANIZATION
-- ============================================================================
-- Adds parent/child collection hierarchy and display_type (book vs table).
-- Run AFTER the main migration and the RLS fix.
-- ============================================================================


-- ============================================================================
-- STEP 1: Add new columns to collections table
-- ============================================================================

ALTER TABLE collections ALTER COLUMN table_name DROP NOT NULL;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS parent_slug text;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS display_type text NOT NULL DEFAULT 'table'
  CHECK (display_type IN ('table', 'book'));


-- ============================================================================
-- STEP 2: Insert parent collection records (grouping containers)
-- ============================================================================

INSERT INTO collections (slug, name, short_description, long_description, category, era, region, table_name, record_count, has_images, has_ocr, has_transcription, display_columns, search_columns, sort_order, is_published) VALUES

('georgia-state-records', 'Georgia State Records Concerning Persons of Color',
 'Registration records of free persons of color across Georgia counties',
 'These records document free persons of color who were required to register with their county courts in antebellum Georgia. Each county maintained its own register with details including name, age, place of nativity, residence, occupation, and date of registration.',
 'legal', 'antebellum', 'georgia', NULL, 0, false, false, false, '[]', '[]', 10, true),

('virginia-order-books', 'Virginia Order Books — Negro Adjudgments',
 'Court records relating to enslaved persons across Virginia counties',
 'These Virginia county court order books contain adjudgment records documenting the legal proceedings related to enslaved persons, including names of enslavers, enslaved individuals, ages, and judgment dates.',
 'legal', 'antebellum', 'virginia', NULL, 0, false, false, false, '[]', '[]', 30, true),

('virginia-personal-property', 'Virginia Personal Property and Tithes Tables',
 'Personal property tax records listing enslaved persons across Virginia counties',
 'These tax records document the personal property holdings including enslaved persons in various Virginia counties. Records include enslaver family names, names of enslaved persons, totals, and dates.',
 'property', 'antebellum', 'virginia', NULL, 0, false, false, false, '[]', '[]', 40, true),

('slave-merchant-trade', 'RAC/VLC — Slave Merchant Trade Records',
 'Sales records from colonial-era slave trading vessels',
 'Records from the Royal African Company and various slave trading vessels documenting the sale of enslaved persons. Includes sale dates, purchaser names, locations, and counts of men, women, boys, and girls sold.',
 'slave-trade', 'colonial', 'southeast', NULL, 0, false, false, false, '[]', '[]', 20, true),

('slave-importation-records', 'Slave Importation Declaration',
 'Records of enslaved persons imported into southern states',
 'Declaration records documenting the importation of enslaved persons into Georgia, Kentucky, and Mississippi. Includes names, ages, physical descriptions, and origin/destination information.',
 'slave-trade', 'colonial', 'national', NULL, 0, false, false, false, '[]', '[]', 50, true),

('native-american-records', 'Native American Records',
 'Census and enrollment records of Native American nations including enslaved persons',
 'Records from various Native American nations documenting census data, including enslaved persons held within tribal territories. Currently includes Cherokee Henderson Census and Creek Census records.',
 'census', 'antebellum', 'southeast', NULL, 0, false, false, false, '[]', '[]', 55, true),

('florida-louisiana-records', 'Florida-Louisiana Colonial Records',
 'Church vital records for persons of color from French and Spanish colonial territories',
 'Death and marriage records from Catholic churches in Florida and Louisiana during the colonial period, documenting persons of color in French and Spanish territories.',
 'church-records', 'antebellum', 'southeast', NULL, 0, false, false, false, '[]', '[]', 56, true),

('african-colonization-society', 'African Colonization Society',
 'Records of emigration to Liberia and census rolls from Liberian settlements',
 'Records from the American Colonization Society documenting persons who emigrated from the United States to Liberia, along with census records from the established Liberian settlements.',
 'immigration', 'antebellum', 'international', NULL, 0, false, false, false, '[]', '[]', 57, true),

('church-records-collection', 'Bibles and Churches Records',
 'Church records of enslaved persons from Kentucky and Alabama',
 'Baptismal registers and church records documenting enslaved persons in Kentucky Catholic churches and Alabama Episcopal churches.',
 'church-records', 'antebellum', 'national', NULL, 0, false, false, false, '[]', '[]', 58, true)

ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- STEP 3: Set parent_slug on child collections
-- ============================================================================

-- Georgia State Records children
UPDATE collections SET parent_slug = 'georgia-state-records'
WHERE slug LIKE 'register-free-persons-%';

-- Virginia Order Books children
UPDATE collections SET parent_slug = 'virginia-order-books'
WHERE slug LIKE 'va-books-%';

-- Virginia Personal Property children
UPDATE collections SET parent_slug = 'virginia-personal-property'
WHERE slug LIKE 'va-personal-%';

-- Slave Merchant Trade children
UPDATE collections SET parent_slug = 'slave-merchant-trade'
WHERE slug LIKE 'slave-merchants-%';

-- Slave Importation children
UPDATE collections SET parent_slug = 'slave-importation-records'
WHERE slug LIKE 'slave-importation-%';

-- Native American Records children
UPDATE collections SET parent_slug = 'native-american-records'
WHERE slug IN ('cherokee-henderson', 'creek-census');

-- Florida-Louisiana Colonial Records children
UPDATE collections SET parent_slug = 'florida-louisiana-records'
WHERE slug IN ('colored-deaths', 'colored-marriages');

-- African Colonization Society children
UPDATE collections SET parent_slug = 'african-colonization-society'
WHERE slug IN ('emigrants-to-liberia', 'liberation-census-rolls');

-- Bibles and Churches Records children
UPDATE collections SET parent_slug = 'church-records-collection'
WHERE slug IN ('enslaved-catholic-kentucky', 'enslaved-persons-alabama');


-- ============================================================================
-- STEP 4: Set display_type for book-style collections
-- ============================================================================

UPDATE collections SET display_type = 'book'
WHERE slug IN (
  'inspection-roll-of-negroes',
  'colored-deaths',
  'colored-marriages',
  'formerly-enslaved',
  'register-free-persons-warren',
  'va-personal-hanover',
  'slave-importation-mississippi'
);


-- ============================================================================
-- STEP 5: Update parent collection record counts (sum of children)
-- ============================================================================

UPDATE collections p
SET record_count = (
  SELECT COALESCE(SUM(c.record_count), 0)
  FROM collections c
  WHERE c.parent_slug = p.slug
)
WHERE p.table_name IS NULL;


-- ============================================================================
-- STEP 6: Reorder sort_order for clean landing page display
-- ============================================================================

-- Free standalone collections first
UPDATE collections SET sort_order = 1 WHERE slug = 'aa-revolutionary-soldiers';
UPDATE collections SET sort_order = 2 WHERE slug = 'inspection-roll-of-negroes';
UPDATE collections SET sort_order = 3 WHERE slug = 'free-black-heads-of-household';

-- Premium standalone collections
UPDATE collections SET sort_order = 10 WHERE slug = 'slave-voyages';
UPDATE collections SET sort_order = 11 WHERE slug = 'slave-compensation-claims';
UPDATE collections SET sort_order = 12 WHERE slug = 'ex-slave-pension';
UPDATE collections SET sort_order = 13 WHERE slug = 'formerly-enslaved';
UPDATE collections SET sort_order = 14 WHERE slug = 'revolutionary-soldiers';

-- Parent collections
UPDATE collections SET sort_order = 20 WHERE slug = 'georgia-state-records';
UPDATE collections SET sort_order = 21 WHERE slug = 'virginia-order-books';
UPDATE collections SET sort_order = 22 WHERE slug = 'virginia-personal-property';
UPDATE collections SET sort_order = 23 WHERE slug = 'slave-merchant-trade';
UPDATE collections SET sort_order = 24 WHERE slug = 'slave-importation-records';
UPDATE collections SET sort_order = 25 WHERE slug = 'native-american-records';
UPDATE collections SET sort_order = 26 WHERE slug = 'florida-louisiana-records';
UPDATE collections SET sort_order = 27 WHERE slug = 'african-colonization-society';
UPDATE collections SET sort_order = 28 WHERE slug = 'church-records-collection';


-- ============================================================================
-- STEP 7: Set access_tier — only 3 free, everything else premium
-- ============================================================================

UPDATE collections SET access_tier = 'free'
WHERE slug IN ('aa-revolutionary-soldiers', 'inspection-roll-of-negroes', 'free-black-heads-of-household');

UPDATE collections SET access_tier = 'scholar'
WHERE slug NOT IN ('aa-revolutionary-soldiers', 'inspection-roll-of-negroes', 'free-black-heads-of-household');


-- ============================================================================
-- STEP 8: Verify
-- ============================================================================

SELECT slug, name, parent_slug, display_type, access_tier, table_name IS NOT NULL AS has_data
FROM collections
WHERE parent_slug IS NULL AND is_published = true
ORDER BY sort_order;

SELECT parent_slug, count(*) AS children
FROM collections
WHERE parent_slug IS NOT NULL
GROUP BY parent_slug
ORDER BY parent_slug;
