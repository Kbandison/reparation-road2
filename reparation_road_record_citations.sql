-- ============================================================================
-- REPARATION ROAD — RECORD CITATIONS & SOURCE INFORMATION
-- ============================================================================
-- Adds:
--   1. collections.source_information — a default archival source/provenance
--      block shown on every record in the collection.
--   2. record_citations — per-record overrides for the citation text and the
--      source information (keyed by table + record id, so no per-table ALTERs).
--
-- Resolution at display time:
--   citation = record override  ->  collection.citation_template  ->  default
--   source   = record override  ->  collection.source_information ->  (hidden)
--
-- Reads are public (citations are meant to be shown). Writes go through the
-- admin API using the service role, which bypasses RLS, so only a public SELECT
-- policy is needed here.
-- ============================================================================

-- 1) Collection-level default source ------------------------------------------
ALTER TABLE collections ADD COLUMN IF NOT EXISTS source_information text;

-- 2) Per-record overrides -----------------------------------------------------
CREATE TABLE IF NOT EXISTS record_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  citation text,
  source_information text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT record_citations_unique UNIQUE (table_name, record_id)
);

ALTER TABLE record_citations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read record citations" ON record_citations;
CREATE POLICY "Public read record citations" ON record_citations
  FOR SELECT USING (true);

-- Make PostgREST pick up the new table/column immediately.
NOTIFY pgrst, 'reload schema';
