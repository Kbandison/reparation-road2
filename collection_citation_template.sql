-- ============================================================================
-- REPARATION ROAD — COLLECTION CITATION TEMPLATE
-- ============================================================================
-- reparation_road_record_citations.sql added collections.source_information
-- but assumed collections.citation_template already existed. It never did, so
-- every collection-level citation/source save was rejected by PostgREST.
--
-- Run this once (safe to re-run). No data changes.
--
-- Resolution at display time (lib/collections/citation.ts):
--   citation = record override -> collection template -> parent folder template(s) -> default
--   source   = record override -> collection source   -> parent folder source(s)   -> (hidden)
-- ============================================================================

ALTER TABLE collections ADD COLUMN IF NOT EXISTS citation_template text;

-- Make PostgREST pick up the new column immediately.
NOTIFY pgrst, 'reload schema';
