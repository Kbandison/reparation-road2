-- ============================================================================
-- REPARATION ROAD — COMPLETE DATABASE MIGRATION
-- ============================================================================
-- Run these sections IN ORDER in the Supabase SQL Editor.
-- Recommended: Run on a branch/clone first, verify, then run on production.
--
-- SECTIONS:
--   1. Prerequisites (enable extensions)
--   2. Consolidated table creation
--   3. Data migration into consolidated tables
--   4. Table renaming (fix hyphens)
--   5. Collections metadata table
--   6. Bookmark unification
--   7. Performance fixes (archive_pages)
--   8. RLS policies for ALL tables
--   9. Verification queries
--  10. Cleanup (legacy + original tables)
-- ============================================================================


-- ============================================================================
-- SECTION 1: PREREQUISITES
-- ============================================================================

-- Ensure trigram extension is available (needed for search indexes)
create extension if not exists pg_trgm;


-- ============================================================================
-- SECTION 2: CREATE CONSOLIDATED TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2A: register_free_persons
-- Consolidates: baldwin, camden, colombia, hancock, jefferson,
--               lincoln, lumpkin, thomas, warren (9 tables → 1)
-- ----------------------------------------------------------------------------

create table if not exists public.register_free_persons (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  book_no integer not null default 1,
  page_no integer not null,
  page_label text,
  entry_no integer,
  row_no integer,
  slug text not null,
  image_path text not null,
  name text,
  age text,
  place_of_nativity text,
  residence text,
  date_entered_state text,
  entered_state_year text,
  time_of_coming_into_state text,
  occupation text,
  date_registered text,
  ocr_text text not null default '',
  created_at timestamptz default now(),

  constraint register_free_persons_slug_key unique (slug)
);

create index if not exists idx_rfp_county on register_free_persons (county);
create index if not exists idx_rfp_name_trgm on register_free_persons using gin (name gin_trgm_ops);
create index if not exists idx_rfp_ocr_trgm on register_free_persons using gin (ocr_text gin_trgm_ops);
create index if not exists idx_rfp_book_page on register_free_persons (book_no, page_no);


-- ----------------------------------------------------------------------------
-- 2B: slave_merchants
-- Consolidates: austin_laurens, charlotte, othello, schooner (4 tables → 1)
-- ----------------------------------------------------------------------------

create table if not exists public.slave_merchants (
  id uuid primary key default gen_random_uuid(),
  vessel_name text not null,
  book_no integer not null,
  page_name text not null,
  entry_no integer not null,
  sale_date text,
  to_whom_sold text,
  location text,
  men integer,
  women integer,
  boys integer,
  girls integer,
  image_path text not null,
  ocr_text text not null default '',
  slug text not null,
  created_at timestamptz default now(),

  constraint slave_merchants_slug_key unique (slug),
  constraint slave_merchants_vessel_book_page_entry unique (vessel_name, book_no, page_name, entry_no)
);

create index if not exists idx_sm_vessel on slave_merchants (vessel_name);
create index if not exists idx_sm_to_whom_trgm on slave_merchants using gin (to_whom_sold gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- 2C: va_books
-- Consolidates: chesterfield, goochland, henrico, spotsylvania (4 tables → 1)
-- ----------------------------------------------------------------------------

create table if not exists public.va_books (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  slug text not null,
  page_no integer,
  page_no_2 integer,
  page_label text,
  image_path text not null,
  enslaver text,
  enslaved_person text,
  age text,
  judgement_date text,
  ocr_text text not null default '',
  ocr_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint va_books_slug_key unique (slug)
);

create index if not exists idx_vb_county on va_books (county);
create index if not exists idx_vb_enslaver_trgm on va_books using gin (enslaver gin_trgm_ops);
create index if not exists idx_vb_enslaved_trgm on va_books using gin (enslaved_person gin_trgm_ops);
create index if not exists idx_vb_page on va_books (page_no);


-- ----------------------------------------------------------------------------
-- 2D: va_personal_property
-- Consolidates: buckingham, chesterfield, hanover, henrico, orange (5 tables → 1)
-- ----------------------------------------------------------------------------

create table if not exists public.va_personal_property (
  id uuid primary key default gen_random_uuid(),
  county text not null,
  book_no integer,
  page_no integer,
  page_name text,
  entry_no integer,
  slug text not null,
  image_path text not null,
  state_county text,
  date text,
  enslaver_family text,
  enslaved_persons text,
  total integer,
  ocr_text text not null default '',
  created_at timestamptz default now(),

  constraint va_personal_property_slug_key unique (slug)
);

create index if not exists idx_vpp_county on va_personal_property (county);
create index if not exists idx_vpp_enslaver_trgm on va_personal_property using gin (enslaver_family gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- 2E: slave_importation
-- Consolidates: GA, KY, MS (3 tables → 1)
-- ----------------------------------------------------------------------------

create table if not exists public.slave_importation (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  book_no integer,
  page_no integer,
  location text,
  entry_no integer,
  slug text not null,
  image_path text not null,
  by_whom_enslaved text,
  name text,
  age text,
  sex text,
  complexion text,
  record_date text,
  where_to text,
  where_from text,
  ocr_text text not null default '',
  created_at timestamptz default now(),

  constraint slave_importation_slug_key unique (slug)
);

create index if not exists idx_si_state on slave_importation (state);
create index if not exists idx_si_name_trgm on slave_importation using gin (name gin_trgm_ops);
create index if not exists idx_si_enslaver_trgm on slave_importation using gin (by_whom_enslaved gin_trgm_ops);


-- ============================================================================
-- SECTION 3: DATA MIGRATION (CORRECTED)
-- ============================================================================
-- All slugs are prefixed with the discriminator value to guarantee uniqueness
-- across merged tables.
--
-- BEFORE RUNNING: If you had partial runs from the old Section 3, clear them:
--
--   delete from register_free_persons;
--   delete from slave_merchants;
--   delete from va_books;
--   delete from va_personal_property;
--   delete from slave_importation;
--
-- Then run this entire file.
-- ============================================================================


-- ============================================================================
-- 3A: Migrate Register of Free Persons
-- ============================================================================

-- BALDWIN: has row_no (not entry_no), age_int + age_text, no ocr_text
insert into register_free_persons
  (county, book_no, page_no, row_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'baldwin',
  book_no,
  page_no,
  row_no,
  'baldwin-' || slug,
  image_path,
  name,
  coalesce(age_text, age_int::text),
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered,
  '',
  created_at
from register_free_persons_baldwin;


-- CAMDEN: has entry_no, age as text, ocr_text
insert into register_free_persons
  (county, book_no, page_no, entry_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'camden',
  book_no,
  page_no,
  entry_no,
  'camden-' || slug,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_camden;


-- COLOMBIA: has row_no, page_label, entered_state_year, time_of_coming_into_state, NO slug column
insert into register_free_persons
  (county, book_no, page_no, page_label, row_no, slug, image_path, name, age, place_of_nativity, residence, entered_state_year, time_of_coming_into_state, occupation, date_registered, ocr_text, created_at)
select
  'colombia',
  book_no,
  page_no,
  page_label,
  row_no,
  'colombia-b' || book_no || '-p' || page_no || '-r' || row_no,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  entered_state_year,
  time_of_coming_into_state,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_colombia;


-- HANCOCK: has entry_no, age as text, ocr_text
insert into register_free_persons
  (county, book_no, page_no, entry_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'hancock',
  book_no,
  page_no,
  entry_no,
  'hancock-' || slug,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_hancock;


-- JEFFERSON: has row_no, page_label, entered_state_year, NO slug column
insert into register_free_persons
  (county, book_no, page_no, page_label, row_no, slug, image_path, name, age, place_of_nativity, residence, entered_state_year, occupation, date_registered, ocr_text, created_at)
select
  'jefferson',
  book_no,
  page_no,
  page_label,
  row_no,
  'jefferson-b' || book_no || '-p' || page_no || '-r' || row_no,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  entered_state_year,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_jefferson;


-- LINCOLN: has entry_no, age as text, ocr_text
insert into register_free_persons
  (county, book_no, page_no, entry_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'lincoln',
  book_no,
  page_no,
  entry_no,
  'lincoln-' || slug,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_lincoln;


-- LUMPKIN: has entry_no, age as INTEGER, date_registered as INTEGER
insert into register_free_persons
  (county, book_no, page_no, entry_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'lumpkin',
  book_no,
  page_no,
  entry_no,
  'lumpkin-' || slug,
  image_path,
  name,
  age::text,
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered::text,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_lumpkin;


-- THOMAS: has entry_no, age as text, date_registered as text
insert into register_free_persons
  (county, book_no, page_no, entry_no, slug, image_path, name, age, place_of_nativity, residence, date_entered_state, occupation, date_registered, ocr_text, created_at)
select
  'thomas',
  book_no,
  page_no,
  entry_no,
  'thomas-' || slug,
  image_path,
  name,
  age,
  place_of_nativity,
  residence,
  date_entered_state,
  occupation,
  date_registered,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_thomas;


-- WARREN: page-level only — no name, age, entry fields
insert into register_free_persons
  (county, book_no, page_no, slug, image_path, ocr_text, created_at)
select
  'warren',
  book_no,
  page_no,
  'warren-' || slug,
  image_path,
  coalesce(ocr_text, ''),
  created_at
from register_free_persons_warren;


-- ============================================================================
-- 3B: Migrate Slave Merchants
-- ============================================================================

-- AUSTIN LAURENS: uses date_sold
insert into slave_merchants
  (vessel_name, book_no, page_name, entry_no, sale_date, to_whom_sold, location, men, women, boys, girls, image_path, ocr_text, slug, created_at)
select
  'austin_laurens',
  book_no,
  page_name,
  entry_no,
  date_sold,
  to_whom_sold,
  location,
  men, women, boys, girls,
  image_path,
  coalesce(ocr_text, ''),
  'austin-laurens-' || slug,
  created_at
from slave_merchants_austin_laurens;


-- CHARLOTTE: uses when_sold
insert into slave_merchants
  (vessel_name, book_no, page_name, entry_no, sale_date, to_whom_sold, location, men, women, boys, girls, image_path, ocr_text, slug, created_at)
select
  'charlotte',
  book_no,
  page_name,
  entry_no,
  when_sold,
  to_whom_sold,
  location,
  men, women, boys, girls,
  image_path,
  coalesce(ocr_text, ''),
  'charlotte-' || slug,
  created_at
from slave_merchants_charlotte;


-- OTHELLO: uses when_sold
insert into slave_merchants
  (vessel_name, book_no, page_name, entry_no, sale_date, to_whom_sold, location, men, women, boys, girls, image_path, ocr_text, slug, created_at)
select
  'othello',
  book_no,
  page_name,
  entry_no,
  when_sold,
  to_whom_sold,
  location,
  men, women, boys, girls,
  image_path,
  coalesce(ocr_text, ''),
  'othello-' || slug,
  created_at
from slave_merchants_othello;


-- SCHOONER: uses date_sold
insert into slave_merchants
  (vessel_name, book_no, page_name, entry_no, sale_date, to_whom_sold, location, men, women, boys, girls, image_path, ocr_text, slug, created_at)
select
  'schooner',
  book_no,
  page_name,
  entry_no,
  date_sold,
  to_whom_sold,
  location,
  men, women, boys, girls,
  image_path,
  coalesce(ocr_text, ''),
  'schooner-' || slug,
  created_at
from slave_merchants_schooner;


-- ============================================================================
-- 3C: Migrate VA Books
-- ============================================================================

-- CHESTERFIELD: age as integer, has ocr_json
insert into va_books
  (county, slug, page_no, page_no_2, page_label, image_path, enslaver, enslaved_person, age, judgement_date, ocr_text, ocr_json, created_at)
select
  'chesterfield',
  'chesterfield-' || slug,
  page_no,
  page_no_2,
  page_label,
  image_path,
  enslaver,
  enslaved_person,
  age::text,
  judgement_date,
  coalesce(ocr_text, ''),
  ocr_json,
  created_at
from va_books_chesterfield;


-- GOOCHLAND: age as text, judgement_date as text, has updated_at
insert into va_books
  (county, slug, page_no, page_no_2, page_label, image_path, enslaver, enslaved_person, age, judgement_date, ocr_text, created_at, updated_at)
select
  'goochland',
  'goochland-' || slug,
  page_no,
  page_no_2,
  page_label,
  image_path,
  enslaver,
  enslaved_person,
  age,
  judgement_date,
  coalesce(ocr_text, ''),
  created_at,
  updated_at
from va_books_goochland;


-- HENRICO: age as integer, judgement_date as DATE, no page_no_2/page_label/ocr_text
insert into va_books
  (county, slug, page_no, image_path, enslaver, enslaved_person, age, judgement_date, created_at)
select
  'henrico',
  'henrico-' || slug,
  page_no,
  image_path,
  enslaver,
  enslaved_person,
  age::text,
  judgement_date::text,
  created_at
from va_books_henrico;


-- SPOTSYLVANIA: age as text, judgement_date as text, has updated_at
insert into va_books
  (county, slug, page_no, page_no_2, page_label, image_path, enslaver, enslaved_person, age, judgement_date, ocr_text, created_at, updated_at)
select
  'spotsylvania',
  'spotsylvania-' || slug,
  page_no,
  page_no_2,
  page_label,
  image_path,
  enslaver,
  enslaved_person,
  age,
  judgement_date,
  coalesce(ocr_text, ''),
  created_at,
  updated_at
from va_books_spotsylvania;


-- ============================================================================
-- 3D: Migrate VA Personal Property
-- ============================================================================

-- BUCKINGHAM: has all standard columns
insert into va_personal_property
  (county, book_no, page_no, entry_no, slug, image_path, state_county, date, enslaver_family, enslaved_persons, total, ocr_text, created_at)
select
  'buckingham',
  book_no,
  page_no,
  entry_no,
  'buckingham-' || slug,
  image_path,
  state_county,
  date,
  enslaver_family,
  enslaved_persons,
  total,
  coalesce(ocr_text, ''),
  created_at
from va_personal_buckingham;


-- CHESTERFIELD (hyphenated): uses page_number + image_url, no slug — generate with row_number
insert into va_personal_property
  (county, page_no, slug, image_path, state_county, date, enslaver_family, enslaved_persons, total, created_at)
select
  'chesterfield',
  page_number,
  'chesterfield-p' || page_number || '-' || row_number() over (partition by page_number order by created_at, id),
  image_url,
  state_county,
  date,
  coalesce(enslaver_family, 'Unknown'),
  enslaved_persons,
  total,
  created_at
from "va-personal-chesterfield";


-- HANOVER: page-level only — no individual entry data
insert into va_personal_property
  (county, book_no, page_no, slug, image_path, ocr_text, created_at)
select
  'hanover',
  book_no,
  page_no,
  'hanover-' || slug,
  image_path,
  coalesce(ocr_text, ''),
  created_at
from va_personal_hanover;


-- HENRICO: uses page_name instead of page_no
insert into va_personal_property
  (county, book_no, page_name, entry_no, slug, image_path, state_county, date, enslaver_family, enslaved_persons, total, ocr_text, created_at)
select
  'henrico',
  book_no,
  page_name,
  entry_no,
  'henrico-' || slug,
  image_path,
  state_county,
  date,
  enslaver_family,
  enslaved_persons,
  total,
  coalesce(ocr_text, ''),
  created_at
from va_personal_henrico;


-- ORANGE: standard columns
insert into va_personal_property
  (county, book_no, page_no, entry_no, slug, image_path, state_county, date, enslaver_family, enslaved_persons, total, ocr_text, created_at)
select
  'orange',
  book_no,
  page_no,
  entry_no,
  'orange-' || slug,
  image_path,
  state_county,
  date,
  enslaver_family,
  enslaved_persons,
  total,
  coalesce(ocr_text, ''),
  created_at
from va_personal_orange;


-- ============================================================================
-- 3E: Migrate Slave Importation
-- ============================================================================

-- GEORGIA (hyphenated): has all fields, age as integer, uses 'date'
insert into slave_importation
  (state, book_no, page_no, location, entry_no, slug, image_path, by_whom_enslaved, name, age, sex, complexion, record_date, where_to, where_from, ocr_text, created_at)
select
  'georgia',
  book_no,
  page_no,
  location,
  entry_no,
  'georgia-' || slug,
  image_path,
  by_whom_enslaved,
  name,
  age::text,
  sex,
  complexion,
  date,
  where_to,
  where_from,
  coalesce(ocr_text, ''),
  created_at
from "slave-importation-ga";


-- KENTUCKY (hyphenated): uses page_number + image_url, no slug — generate with row_number
insert into slave_importation
  (state, page_no, slug, image_path, by_whom_enslaved, name, age, sex, complexion, record_date, where_to, where_from, created_at)
select
  'kentucky',
  page_number,
  'kentucky-p' || page_number || '-' || row_number() over (partition by page_number order by created_at, id),
  image_url,
  by_whom_enslaved,
  name,
  age,
  sex,
  complexion,
  record_date,
  where_to,
  where_from,
  created_at
from "slave-importation-ky";


-- MISSISSIPPI: page-level only
insert into slave_importation
  (state, book_no, page_no, slug, image_path, ocr_text, created_at)
select
  'mississippi',
  book_no,
  page_no,
  'mississippi-' || slug,
  image_path,
  coalesce(ocr_text, ''),
  created_at
from slave_importation_ms;


-- ============================================================================
-- DONE — Section 3 complete
-- ============================================================================
-- All slugs are now prefixed with their discriminator value:
--   - register_free_persons: 'baldwin-{slug}', 'camden-{slug}', etc.
--   - slave_merchants: 'austin-laurens-{slug}', 'charlotte-{slug}', etc.
--   - va_books: 'chesterfield-{slug}', 'goochland-{slug}', etc.
--   - va_personal_property: 'buckingham-{slug}', 'chesterfield-p{N}-{row}', etc.
--   - slave_importation: 'georgia-{slug}', 'kentucky-p{N}-{row}', etc.
--
-- Proceed to Section 4 (table renaming).
-- ============================================================================


-- ============================================================================
-- SECTION 4: RENAME HYPHENATED TABLES
-- ============================================================================
-- These standalone tables (not part of consolidation groups) need underscore names.

alter table if exists "colored-deaths" rename to colored_deaths;
alter table if exists "colored-marriages" rename to colored_marriages;
alter table if exists "creek-census" rename to creek_census;
alter table if exists "ex-slave-pension" rename to ex_slave_pension;
alter table if exists "formerly-enslaved" rename to formerly_enslaved;

-- Fix the foreign key on ex_slave_pension_images after rename
alter table ex_slave_pension_images
  drop constraint if exists ex_slave_pension_images_entry_id_fkey;

alter table ex_slave_pension_images
  add constraint ex_slave_pension_images_entry_id_fkey
    foreign key (entry_id) references ex_slave_pension(id) on delete cascade;


-- ============================================================================
-- SECTION 5: COLLECTIONS METADATA TABLE
-- ============================================================================

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  short_description text,
  long_description text,
  category text not null,
  era text,
  region text,
  table_name text not null,
  discriminator_column text,
  discriminator_value text,
  record_count integer default 0,
  has_images boolean default true,
  has_ocr boolean default false,
  has_transcription boolean default false,
  access_tier text default 'free' check (access_tier in ('free', 'explorer', 'scholar')),
  thumbnail_url text,
  display_columns jsonb,
  search_columns jsonb,
  sort_order integer default 0,
  is_published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Insert all collection metadata
insert into collections (slug, name, short_description, category, era, region, table_name, discriminator_column, discriminator_value, has_images, has_ocr, display_columns, search_columns, sort_order) values

-- Register of Free Persons (one entry per county)
('register-free-persons-baldwin', 'Register of Free Persons — Baldwin County', 'Registration records of free persons of color in Baldwin County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'baldwin', true, false, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "place_of_nativity", "residence", "occupation"]', 10),
('register-free-persons-camden', 'Register of Free Persons — Camden County', 'Registration records of free persons of color in Camden County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'camden', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 11),
('register-free-persons-colombia', 'Register of Free Persons — Columbia County', 'Registration records of free persons of color in Columbia County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'colombia', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 12),
('register-free-persons-hancock', 'Register of Free Persons — Hancock County', 'Registration records of free persons of color in Hancock County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'hancock', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 13),
('register-free-persons-jefferson', 'Register of Free Persons — Jefferson County', 'Registration records of free persons of color in Jefferson County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'jefferson', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 14),
('register-free-persons-lincoln', 'Register of Free Persons — Lincoln County', 'Registration records of free persons of color in Lincoln County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'lincoln', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 15),
('register-free-persons-lumpkin', 'Register of Free Persons — Lumpkin County', 'Registration records of free persons of color in Lumpkin County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'lumpkin', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 16),
('register-free-persons-thomas', 'Register of Free Persons — Thomas County', 'Registration records of free persons of color in Thomas County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'thomas', true, true, '["name", "age", "place_of_nativity", "residence", "occupation", "date_registered"]', '["name", "ocr_text", "residence"]', 17),
('register-free-persons-warren', 'Register of Free Persons — Warren County', 'Registration records of free persons of color in Warren County, Georgia', 'legal', 'antebellum', 'georgia', 'register_free_persons', 'county', 'warren', true, true, '["page_no", "book_no"]', '["ocr_text"]', 18),

-- Slave Merchants (one entry per vessel)
('slave-merchants-austin-laurens', 'Slave Merchants — Austin & Laurens', 'Sales records from the slave trading vessel Austin & Laurens', 'slave-trade', 'colonial', 'southeast', 'slave_merchants', 'vessel_name', 'austin_laurens', true, true, '["sale_date", "to_whom_sold", "location", "men", "women", "boys", "girls"]', '["to_whom_sold", "location", "ocr_text"]', 20),
('slave-merchants-charlotte', 'Slave Merchants — Charlotte', 'Sales records from the slave trading vessel Charlotte', 'slave-trade', 'colonial', 'southeast', 'slave_merchants', 'vessel_name', 'charlotte', true, true, '["sale_date", "to_whom_sold", "location", "men", "women", "boys", "girls"]', '["to_whom_sold", "location", "ocr_text"]', 21),
('slave-merchants-othello', 'Slave Merchants — Othello', 'Sales records from the slave trading vessel Othello', 'slave-trade', 'colonial', 'southeast', 'slave_merchants', 'vessel_name', 'othello', true, true, '["sale_date", "to_whom_sold", "location", "men", "women", "boys", "girls"]', '["to_whom_sold", "location", "ocr_text"]', 22),
('slave-merchants-schooner', 'Slave Merchants — Schooner', 'Sales records from the slave trading schooner', 'slave-trade', 'colonial', 'southeast', 'slave_merchants', 'vessel_name', 'schooner', true, true, '["sale_date", "to_whom_sold", "location", "men", "women", "boys", "girls"]', '["to_whom_sold", "location", "ocr_text"]', 23),

-- VA Books (one entry per county)
('va-books-chesterfield', 'Virginia Court Records — Chesterfield County', 'Court records relating to enslaved persons in Chesterfield County, Virginia', 'legal', 'antebellum', 'virginia', 'va_books', 'county', 'chesterfield', true, true, '["enslaver", "enslaved_person", "age", "judgement_date"]', '["enslaver", "enslaved_person", "ocr_text"]', 30),
('va-books-goochland', 'Virginia Court Records — Goochland County', 'Court records relating to enslaved persons in Goochland County, Virginia', 'legal', 'antebellum', 'virginia', 'va_books', 'county', 'goochland', true, true, '["enslaver", "enslaved_person", "age", "judgement_date"]', '["enslaver", "enslaved_person", "ocr_text"]', 31),
('va-books-henrico', 'Virginia Court Records — Henrico County', 'Court records relating to enslaved persons in Henrico County, Virginia', 'legal', 'antebellum', 'virginia', 'va_books', 'county', 'henrico', true, false, '["enslaver", "enslaved_person", "age", "judgement_date"]', '["enslaver", "enslaved_person"]', 32),
('va-books-spotsylvania', 'Virginia Court Records — Spotsylvania County', 'Court records relating to enslaved persons in Spotsylvania County, Virginia', 'legal', 'antebellum', 'virginia', 'va_books', 'county', 'spotsylvania', true, true, '["enslaver", "enslaved_person", "age", "judgement_date"]', '["enslaver", "enslaved_person", "ocr_text"]', 33),

-- VA Personal Property (one entry per county)
('va-personal-buckingham', 'Virginia Personal Property Tax — Buckingham County', 'Personal property tax records listing enslaved persons in Buckingham County', 'property', 'antebellum', 'virginia', 'va_personal_property', 'county', 'buckingham', true, true, '["enslaver_family", "enslaved_persons", "total", "date", "state_county"]', '["enslaver_family", "enslaved_persons", "ocr_text"]', 40),
('va-personal-chesterfield', 'Virginia Personal Property Tax — Chesterfield County', 'Personal property tax records listing enslaved persons in Chesterfield County', 'property', 'antebellum', 'virginia', 'va_personal_property', 'county', 'chesterfield', true, false, '["enslaver_family", "enslaved_persons", "total", "date", "state_county"]', '["enslaver_family", "enslaved_persons"]', 41),
('va-personal-hanover', 'Virginia Personal Property Tax — Hanover County', 'Personal property tax records listing enslaved persons in Hanover County', 'property', 'antebellum', 'virginia', 'va_personal_property', 'county', 'hanover', true, true, '["page_no", "book_no"]', '["ocr_text"]', 42),
('va-personal-henrico', 'Virginia Personal Property Tax — Henrico County', 'Personal property tax records listing enslaved persons in Henrico County', 'property', 'antebellum', 'virginia', 'va_personal_property', 'county', 'henrico', true, true, '["enslaver_family", "enslaved_persons", "total", "date", "state_county"]', '["enslaver_family", "enslaved_persons", "ocr_text"]', 43),
('va-personal-orange', 'Virginia Personal Property Tax — Orange County', 'Personal property tax records listing enslaved persons in Orange County', 'property', 'antebellum', 'virginia', 'va_personal_property', 'county', 'orange', true, true, '["enslaver_family", "enslaved_persons", "total", "date", "state_county"]', '["enslaver_family", "enslaved_persons", "ocr_text"]', 44),

-- Slave Importation (one entry per state)
('slave-importation-georgia', 'Slave Importation Records — Georgia', 'Records of enslaved persons imported into Georgia', 'slave-trade', 'colonial', 'georgia', 'slave_importation', 'state', 'georgia', true, true, '["by_whom_enslaved", "name", "age", "sex", "complexion", "where_from", "where_to"]', '["by_whom_enslaved", "name", "ocr_text"]', 50),
('slave-importation-kentucky', 'Slave Importation Records — Kentucky', 'Records of enslaved persons imported into Kentucky', 'slave-trade', 'antebellum', 'kentucky', 'slave_importation', 'state', 'kentucky', true, false, '["by_whom_enslaved", "name", "age", "sex", "complexion", "where_from", "where_to"]', '["by_whom_enslaved", "name"]', 51),
('slave-importation-mississippi', 'Slave Importation Records — Mississippi', 'Records of enslaved persons imported into Mississippi', 'slave-trade', 'antebellum', 'mississippi', 'slave_importation', 'state', 'mississippi', true, true, '["page_no", "book_no"]', '["ocr_text"]', 52),

-- Standalone collections
('aa-revolutionary-soldiers', 'African American Revolutionary Soldiers', 'Records of African American soldiers who served in the Revolutionary War', 'military', 'revolutionary', 'national', 'aa_revolutionary_soldiers', null, null, true, true, '["soldier_name", "state", "regiment", "period_of_service", "remarks"]', '["soldier_name", "state", "regiment", "ocr_text"]', 1),
('inspection-roll-of-negroes', 'Inspection Roll of Negroes', 'British inspection rolls documenting persons formerly enslaved by Loyalists departing New York', 'military', 'revolutionary', 'national', 'archive_pages', null, null, true, true, '["title", "year", "location", "book_no", "page_no"]', '["title", "location", "ocr_text"]', 2),
('cherokee-henderson', 'Cherokee Henderson Census', 'Cherokee census records from Henderson County including enslaved persons', 'census', 'antebellum', 'southeast', 'cherokee_henderson', null, null, true, true, '["head_of_family", "residence", "cherokees", "total_slaves", "household_total"]', '["head_of_family", "residence", "ocr_text"]', 3),
('slave-voyages', 'Trans-Atlantic Slave Voyages', 'Database of documented slave trade voyages across the Atlantic Ocean', 'slave-trade', 'colonial', 'international', 'slave_voyages', null, null, false, false, '["voyage_id", "year_arrived_with_captives", "total_embarked_imp", "total_disembarked_imp", "flag_of_vessel_imp", "principal_place_where_captives_were_landed_imp"]', '["voyage_id", "flag_of_vessel_imp", "principal_place_where_captives_were_landed_imp"]', 4),
('ex-slave-pension', 'Ex-Slave Pension Records', 'Pension correspondence for formerly enslaved persons', 'legal', 'reconstruction', 'national', 'ex_slave_pension', null, null, true, false, '["recipient_name", "recipient_state", "letter_date", "source_office", "recipient_town"]', '["recipient_name", "letter_body", "recipient_state"]', 5),
('enslaved-catholic-kentucky', 'Enslaved Catholic Baptisms — Kentucky', 'Baptismal records of enslaved persons in Kentucky Catholic churches', 'church-records', 'antebellum', 'kentucky', 'enslaved_catholic_kentuky', null, null, false, false, '["child", "church", "county", "baptism_date", "mother_s_first", "father_s_first", "gender"]', '["child", "church", "county", "mother_s_first", "father_s_first"]', 6),
('slave-compensation-claims', 'Slave Compensation Claims', 'Military records of formerly enslaved persons filing compensation claims', 'military', 'civil-war', 'national', 'slave_compensation_claims', null, null, false, false, '["last_name", "first_name", "age", "regiment", "former_slave_owner", "owner_residence", "place_of_birth"]', '["last_name", "first_name", "former_slave_owner", "regiment"]', 7),
('emigrants-to-liberia', 'Emigrants to Liberia', 'Records of persons who emigrated from the United States to Liberia', 'immigration', 'antebellum', 'international', 'emmigrants_to_liberia', null, null, false, false, '["name", "age", "state_of_origin", "free_status", "profession", "location_on_arrival"]', '["name", "state_of_origin", "profession"]', 8),
('liberation-census-rolls', 'Liberation Census Rolls', 'Census records from Liberian settlements', 'census', 'antebellum', 'international', 'liberation_census_rolls', null, null, false, false, '["name", "town", "age", "profession", "education", "where_born"]', '["name", "town", "profession"]', 9),
('free-black-heads-of-household', 'Free Black Heads of Household', 'Census records of free Black heads of household in the antebellum South', 'census', 'antebellum', 'national', 'free_black_heads_of_household', null, null, false, false, '["name", "state", "num_in_family", "notes"]', '["name", "state"]', 60),
('colored-deaths', 'Colored Deaths Register', 'Church death records for persons of color', 'church-records', 'antebellum', 'southeast', 'colored_deaths', null, null, true, false, '["page_number", "has_transcription"]', '["latin_transcription", "english_transcription"]', 61),
('colored-marriages', 'Colored Marriages Register', 'Church marriage records for persons of color', 'church-records', 'antebellum', 'southeast', 'colored_marriages', null, null, true, false, '["page_number", "has_transcription"]', '["latin_transcription", "english_transcription"]', 62),
('creek-census', 'Creek Census', 'Census records of Creek Nation including enslaved persons', 'census', 'antebellum', 'southeast', 'creek_census', null, null, true, false, '["principal_name", "town_section", "males", "females", "slaves", "total"]', '["principal_name", "town_section"]', 63),
('formerly-enslaved', 'Formerly Enslaved Records', 'Records pertaining to formerly enslaved persons', 'legal', 'reconstruction', 'national', 'formerly_enslaved', null, null, true, false, '["page_number", "has_transcription"]', '["latin_transcription", "english_transcription"]', 64),
('enslaved-persons-alabama', 'Enslaved Persons — Alabama', 'Church records of enslaved persons in Alabama', 'church-records', 'antebellum', 'alabama', 'enslaved_persons_alabama', null, null, false, false, '["name", "Parish", "Entry Type", "Parents", "Sponsors", "Notes"]', '["name", "Parish"]', 65),
('revolutionary-soldiers', 'Revolutionary War Soldiers', 'Records of soldiers who served in the Revolutionary War', 'military', 'revolutionary', 'national', 'revolutionary_soldiers', null, null, true, false, '["name", "state", "regiment"]', '["name", "state", "regiment"]', 66);

-- Update record counts from actual data
-- Run these after migration to set accurate counts:

update collections set record_count = (select count(*) from register_free_persons where county = 'baldwin') where slug = 'register-free-persons-baldwin';
update collections set record_count = (select count(*) from register_free_persons where county = 'camden') where slug = 'register-free-persons-camden';
update collections set record_count = (select count(*) from register_free_persons where county = 'colombia') where slug = 'register-free-persons-colombia';
update collections set record_count = (select count(*) from register_free_persons where county = 'hancock') where slug = 'register-free-persons-hancock';
update collections set record_count = (select count(*) from register_free_persons where county = 'jefferson') where slug = 'register-free-persons-jefferson';
update collections set record_count = (select count(*) from register_free_persons where county = 'lincoln') where slug = 'register-free-persons-lincoln';
update collections set record_count = (select count(*) from register_free_persons where county = 'lumpkin') where slug = 'register-free-persons-lumpkin';
update collections set record_count = (select count(*) from register_free_persons where county = 'thomas') where slug = 'register-free-persons-thomas';
update collections set record_count = (select count(*) from register_free_persons where county = 'warren') where slug = 'register-free-persons-warren';

update collections set record_count = (select count(*) from slave_merchants where vessel_name = 'austin_laurens') where slug = 'slave-merchants-austin-laurens';
update collections set record_count = (select count(*) from slave_merchants where vessel_name = 'charlotte') where slug = 'slave-merchants-charlotte';
update collections set record_count = (select count(*) from slave_merchants where vessel_name = 'othello') where slug = 'slave-merchants-othello';
update collections set record_count = (select count(*) from slave_merchants where vessel_name = 'schooner') where slug = 'slave-merchants-schooner';

update collections set record_count = (select count(*) from va_books where county = 'chesterfield') where slug = 'va-books-chesterfield';
update collections set record_count = (select count(*) from va_books where county = 'goochland') where slug = 'va-books-goochland';
update collections set record_count = (select count(*) from va_books where county = 'henrico') where slug = 'va-books-henrico';
update collections set record_count = (select count(*) from va_books where county = 'spotsylvania') where slug = 'va-books-spotsylvania';

update collections set record_count = (select count(*) from va_personal_property where county = 'buckingham') where slug = 'va-personal-buckingham';
update collections set record_count = (select count(*) from va_personal_property where county = 'chesterfield') where slug = 'va-personal-chesterfield';
update collections set record_count = (select count(*) from va_personal_property where county = 'hanover') where slug = 'va-personal-hanover';
update collections set record_count = (select count(*) from va_personal_property where county = 'henrico') where slug = 'va-personal-henrico';
update collections set record_count = (select count(*) from va_personal_property where county = 'orange') where slug = 'va-personal-orange';

update collections set record_count = (select count(*) from slave_importation where state = 'georgia') where slug = 'slave-importation-georgia';
update collections set record_count = (select count(*) from slave_importation where state = 'kentucky') where slug = 'slave-importation-kentucky';
update collections set record_count = (select count(*) from slave_importation where state = 'mississippi') where slug = 'slave-importation-mississippi';

update collections set record_count = (select count(*) from aa_revolutionary_soldiers) where slug = 'aa-revolutionary-soldiers';
update collections set record_count = (select count(*) from archive_pages) where slug = 'inspection-roll-of-negroes';
update collections set record_count = (select count(*) from cherokee_henderson) where slug = 'cherokee-henderson';
update collections set record_count = (select count(*) from slave_voyages) where slug = 'slave-voyages';
update collections set record_count = (select count(*) from ex_slave_pension) where slug = 'ex-slave-pension';
update collections set record_count = (select count(*) from enslaved_catholic_kentuky) where slug = 'enslaved-catholic-kentucky';
update collections set record_count = (select count(*) from slave_compensation_claims) where slug = 'slave-compensation-claims';
update collections set record_count = (select count(*) from emmigrants_to_liberia) where slug = 'emigrants-to-liberia';
update collections set record_count = (select count(*) from liberation_census_rolls) where slug = 'liberation-census-rolls';
update collections set record_count = (select count(*) from free_black_heads_of_household) where slug = 'free-black-heads-of-household';
update collections set record_count = (select count(*) from colored_deaths) where slug = 'colored-deaths';
update collections set record_count = (select count(*) from colored_marriages) where slug = 'colored-marriages';
update collections set record_count = (select count(*) from creek_census) where slug = 'creek-census';
update collections set record_count = (select count(*) from formerly_enslaved) where slug = 'formerly-enslaved';
update collections set record_count = (select count(*) from enslaved_persons_alabama) where slug = 'enslaved-persons-alabama';
update collections set record_count = (select count(*) from revolutionary_soldiers) where slug = 'revolutionary-soldiers';


-- ============================================================================
-- SECTION 6: BOOKMARK UNIFICATION
-- ============================================================================

create table if not exists public.bookmarks_unified (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_slug text not null,
  record_id text not null,
  record_title text,
  notes text,
  created_at timestamptz default now(),

  constraint bookmarks_unified_user_record unique (user_id, collection_slug, record_id)
);

create index if not exists idx_bookmarks_unified_user on bookmarks_unified (user_id);
create index if not exists idx_bookmarks_unified_collection on bookmarks_unified (collection_slug);

-- Migrate from bookmarks table
insert into bookmarks_unified (user_id, collection_slug, record_id, record_title, created_at)
select
  user_id,
  coalesce(collection_slug, 'unknown'),
  page_id,
  record_title,
  created_at
from bookmarks
on conflict (user_id, collection_slug, record_id) do nothing;

-- Migrate from user_bookmarks table
insert into bookmarks_unified (user_id, collection_slug, record_id, notes, created_at)
select
  user_id,
  collection_type,
  record_id,
  notes,
  created_at
from user_bookmarks
on conflict (user_id, collection_slug, record_id) do update set notes = excluded.notes;


-- ============================================================================
-- SECTION 7: PERFORMANCE FIXES
-- ============================================================================

-- Drop the vector embedding column and index from archive_pages
-- (saves storage + speeds up writes; re-add later for AI search)
drop index if exists archive_pages_vec_idx;
alter table archive_pages drop column if exists embedding;


-- ============================================================================
-- SECTION 8: RLS POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 8A: CRITICAL — admin_users, bookings, orders, order_items
-- ----------------------------------------------------------------------------

-- admin_users: only admins can see/modify
alter table admin_users enable row level security;
drop policy if exists "Only admins can view" on admin_users;
create policy "Only admins can view" on admin_users
  for select using (auth.uid() in (select user_id from admin_users));
drop policy if exists "Only service role can modify" on admin_users;
create policy "Only service role can modify" on admin_users
  for all using (auth.uid() in (select user_id from admin_users));

-- bookings: anyone can insert, users see own via email, admins see all
alter table bookings enable row level security;
drop policy if exists "Anyone can create booking" on bookings;
create policy "Anyone can create booking" on bookings
  for insert with check (true);
drop policy if exists "Users see own bookings" on bookings;
create policy "Users see own bookings" on bookings
  for select using (
    email = (select email from profiles where id = auth.uid())
    or exists (select 1 from admin_users where user_id = auth.uid())
  );
drop policy if exists "Admins manage bookings" on bookings;
create policy "Admins manage bookings" on bookings
  for update using (exists (select 1 from admin_users where user_id = auth.uid()));
create policy "Admins delete bookings" on bookings
  for delete using (exists (select 1 from admin_users where user_id = auth.uid()));

-- orders: users see own, admins manage all
alter table orders enable row level security;
drop policy if exists "Users see own orders" on orders;
create policy "Users see own orders" on orders
  for select using (
    user_id = auth.uid()
    or exists (select 1 from admin_users where user_id = auth.uid())
  );
drop policy if exists "Users create own orders" on orders;
create policy "Users create own orders" on orders
  for insert with check (user_id = auth.uid());
drop policy if exists "Admins manage orders" on orders;
create policy "Admins manage orders" on orders
  for update using (exists (select 1 from admin_users where user_id = auth.uid()));

-- order_items: follows order access
alter table order_items enable row level security;
drop policy if exists "Users see own order items" on order_items;
create policy "Users see own order items" on order_items
  for select using (
    order_id in (select id from orders where user_id = auth.uid())
    or exists (select 1 from admin_users where user_id = auth.uid())
  );
drop policy if exists "Service insert order items" on order_items;
create policy "Service insert order items" on order_items
  for insert with check (
    order_id in (select id from orders where user_id = auth.uid())
    or exists (select 1 from admin_users where user_id = auth.uid())
  );


-- ----------------------------------------------------------------------------
-- 8B: Collection tables — public read, admin write
-- ----------------------------------------------------------------------------

-- Helper: This DO block applies the same RLS pattern to all collection tables
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'register_free_persons',
      'slave_merchants',
      'va_books',
      'va_personal_property',
      'slave_importation',
      'aa_revolutionary_soldiers',
      'archive_pages',
      'cherokee_henderson',
      'colored_deaths',
      'colored_marriages',
      'creek_census',
      'emmigrants_to_liberia',
      'enslaved_catholic_kentuky',
      'enslaved_persons_alabama',
      'ex_slave_pension',
      'formerly_enslaved',
      'free_black_heads_of_household',
      'liberation_census_rolls',
      'revolutionary_soldiers',
      'slave_compensation_claims',
      'slave_voyages'
    ])
  loop
    -- Enable RLS
    execute format('alter table %I enable row level security', tbl);

    -- Drop existing policies to avoid conflicts
    execute format('drop policy if exists "Public read" on %I', tbl);
    execute format('drop policy if exists "Admin insert" on %I', tbl);
    execute format('drop policy if exists "Admin update" on %I', tbl);
    execute format('drop policy if exists "Admin delete" on %I', tbl);

    -- Public read
    execute format('create policy "Public read" on %I for select using (true)', tbl);

    -- Admin write
    execute format('create policy "Admin insert" on %I for insert with check (exists (select 1 from admin_users where user_id = auth.uid()))', tbl);
    execute format('create policy "Admin update" on %I for update using (exists (select 1 from admin_users where user_id = auth.uid()))', tbl);
    execute format('create policy "Admin delete" on %I for delete using (exists (select 1 from admin_users where user_id = auth.uid()))', tbl);
  end loop;
end $$;

-- ex_slave_pension_images: already has some policies, ensure consistent
alter table ex_slave_pension_images enable row level security;
drop policy if exists "Public read images" on ex_slave_pension_images;
create policy "Public read images" on ex_slave_pension_images for select using (true);
drop policy if exists "Admin insert images" on ex_slave_pension_images;
create policy "Admin insert images" on ex_slave_pension_images
  for insert with check (exists (select 1 from admin_users where user_id = auth.uid()));
drop policy if exists "Admin update images" on ex_slave_pension_images;
create policy "Admin update images" on ex_slave_pension_images
  for update using (exists (select 1 from admin_users where user_id = auth.uid()));
drop policy if exists "Admin delete images" on ex_slave_pension_images;
create policy "Admin delete images" on ex_slave_pension_images
  for delete using (exists (select 1 from admin_users where user_id = auth.uid()));


-- ----------------------------------------------------------------------------
-- 8C: App tables
-- ----------------------------------------------------------------------------

-- collections metadata: public read, admin write
alter table collections enable row level security;
create policy "Public read collections" on collections for select using (true);
create policy "Admin manage collections" on collections
  for all using (exists (select 1 from admin_users where user_id = auth.uid()));

-- bookmarks_unified: users manage their own
alter table bookmarks_unified enable row level security;
create policy "Users manage own bookmarks" on bookmarks_unified
  for all using (auth.uid() = user_id);

-- related_records: already has RLS (keep existing policies)

-- profiles: already has RLS (keep existing policies)

-- app_settings: already has RLS (keep existing policies)

-- forum tables: already have RLS (keep existing policies)


-- ============================================================================
-- SECTION 9: VERIFICATION QUERIES
-- ============================================================================
-- Run these to confirm migration was successful before cleanup.
-- Compare counts between source and consolidated tables.

-- Register Free Persons verification
select 'register_free_persons' as consolidated_table, county, count(*) as consolidated_count
from register_free_persons
group by county
order by county;

-- Compare with originals:
select 'baldwin_original' as source, count(*) from register_free_persons_baldwin
union all select 'camden_original', count(*) from register_free_persons_camden
union all select 'colombia_original', count(*) from register_free_persons_colombia
union all select 'hancock_original', count(*) from register_free_persons_hancock
union all select 'jefferson_original', count(*) from register_free_persons_jefferson
union all select 'lincoln_original', count(*) from register_free_persons_lincoln
union all select 'lumpkin_original', count(*) from register_free_persons_lumpkin
union all select 'thomas_original', count(*) from register_free_persons_thomas
union all select 'warren_original', count(*) from register_free_persons_warren;

-- Slave Merchants verification
select 'slave_merchants' as consolidated_table, vessel_name, count(*) as consolidated_count
from slave_merchants
group by vessel_name
order by vessel_name;

select 'austin_laurens_original' as source, count(*) from slave_merchants_austin_laurens
union all select 'charlotte_original', count(*) from slave_merchants_charlotte
union all select 'othello_original', count(*) from slave_merchants_othello
union all select 'schooner_original', count(*) from slave_merchants_schooner;

-- VA Books verification
select 'va_books' as consolidated_table, county, count(*) as consolidated_count
from va_books
group by county
order by county;

select 'chesterfield_original' as source, count(*) from va_books_chesterfield
union all select 'goochland_original', count(*) from va_books_goochland
union all select 'henrico_original', count(*) from va_books_henrico
union all select 'spotsylvania_original', count(*) from va_books_spotsylvania;

-- VA Personal Property verification
select 'va_personal_property' as consolidated_table, county, count(*) as consolidated_count
from va_personal_property
group by county
order by county;

select 'buckingham_original' as source, count(*) from va_personal_buckingham
union all select 'chesterfield_original', count(*) from "va-personal-chesterfield"
union all select 'hanover_original', count(*) from va_personal_hanover
union all select 'henrico_original', count(*) from va_personal_henrico
union all select 'orange_original', count(*) from va_personal_orange;

-- Slave Importation verification
select 'slave_importation' as consolidated_table, state, count(*) as consolidated_count
from slave_importation
group by state
order by state;

select 'georgia_original' as source, count(*) from "slave-importation-ga"
union all select 'kentucky_original', count(*) from "slave-importation-ky"
union all select 'mississippi_original', count(*) from slave_importation_ms;

-- Bookmark unification verification
select 'bookmarks_unified' as table_name, count(*) from bookmarks_unified
union all select 'old_bookmarks', count(*) from bookmarks
union all select 'old_user_bookmarks', count(*) from user_bookmarks;


-- ============================================================================
-- SECTION 10: CLEANUP
-- ============================================================================
-- ⚠️  ONLY RUN THIS AFTER VERIFYING SECTION 9 COUNTS MATCH!
-- ⚠️  Consider running this on a separate day after testing the new frontend.

-- ----------------------------------------------------------------------------
-- 10A: Drop legacy/backup tables
-- ----------------------------------------------------------------------------

drop table if exists cherokee_henderson_legacy;
drop table if exists register_free_persons_camden_legacy;
drop table if exists register_free_persons_hancock_legacy;
drop table if exists register_free_persons_lincoln_legacy;
drop table if exists register_free_persons_lumpkin_legacy;
drop table if exists register_free_persons_thomas_legacy;
drop table if exists slave_merchants_austin_laurens_legacy;
drop table if exists slave_merchants_charlotte_legacy;
drop table if exists slave_merchants_othello_legacy;
drop table if exists slave_merchants_schooner_legacy;
drop table if exists va_books_goochland_backup_20260111211714;
drop table if exists va_books_henrico_backup_20260111_210335;
drop table if exists va_books_spotsylvania_backup_20260111213128;
drop table if exists va_personal_henrico_legacy;
drop table if exists "slave-importation-ga_legacy";

-- ----------------------------------------------------------------------------
-- 10B: Drop original source tables (after consolidation verified)
-- ----------------------------------------------------------------------------

-- Register Free Persons originals
drop table if exists register_free_persons_baldwin;
drop table if exists register_free_persons_camden;
drop table if exists register_free_persons_colombia;
drop table if exists register_free_persons_hancock;
drop table if exists register_free_persons_jefferson;
drop table if exists register_free_persons_lincoln;
drop table if exists register_free_persons_lumpkin;
drop table if exists register_free_persons_thomas;
drop table if exists register_free_persons_warren;

-- Slave Merchants originals
drop table if exists slave_merchants_austin_laurens;
drop table if exists slave_merchants_charlotte;
drop table if exists slave_merchants_othello;
drop table if exists slave_merchants_schooner;

-- VA Books originals
drop table if exists va_books_chesterfield;
drop table if exists va_books_goochland;
drop table if exists va_books_henrico;
drop table if exists va_books_spotsylvania;

-- VA Personal Property originals
drop table if exists va_personal_buckingham;
drop table if exists "va-personal-chesterfield";
drop table if exists va_personal_hanover;
drop table if exists va_personal_henrico;
drop table if exists va_personal_orange;

-- Slave Importation originals
drop table if exists "slave-importation-ga";
drop table if exists "slave-importation-ky";
drop table if exists slave_importation_ms;

-- ----------------------------------------------------------------------------
-- 10C: Drop old bookmark tables (after unification verified)
-- ----------------------------------------------------------------------------

drop table if exists bookmarks;
drop table if exists user_bookmarks;

-- Rename unified to bookmarks
alter table bookmarks_unified rename to bookmarks;

-- Update the index names to match new table name
alter index if exists idx_bookmarks_unified_user rename to idx_bookmarks_user;
alter index if exists idx_bookmarks_unified_collection rename to idx_bookmarks_collection;
alter index if exists bookmarks_unified_user_record rename to bookmarks_user_record;


-- ============================================================================
-- DONE!
-- ============================================================================
-- Final table count: ~35 tables (down from ~55)
--
-- New tables created:
--   - register_free_persons (consolidated)
--   - slave_merchants (consolidated)
--   - va_books (consolidated)
--   - va_personal_property (consolidated)
--   - slave_importation (consolidated)
--   - collections (metadata registry)
--   - bookmarks (unified from bookmarks + user_bookmarks)
--
-- Tables renamed:
--   - colored-deaths → colored_deaths
--   - colored-marriages → colored_marriages
--   - creek-census → creek_census
--   - ex-slave-pension → ex_slave_pension
--   - formerly-enslaved → formerly_enslaved
--
-- RLS enabled on ALL tables
-- Embedding column dropped from archive_pages
-- Legacy/backup tables dropped
-- Original per-county/vessel tables dropped
-- ============================================================================
