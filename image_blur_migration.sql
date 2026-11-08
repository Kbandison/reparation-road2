-- ============================================================================
-- REPARATION ROAD — BLURRED IMAGES (rights / licensing)
-- ============================================================================
-- Some collections can't show their scans in full. For those, a heavily
-- blurred copy is the only version anyone gets, and the image links to the
-- original at its source.
--
--   collections.blur_images         — this collection's scans are blurred
--   collections.image_link          — link every record's image opens (optional)
--   collections.image_link_column   — column holding each record's own link,
--                                     which beats image_link (optional)
--   blurred_scans                   — each blurred scan: where the original
--                                     was, its blurred copy, and where the
--                                     original is kept privately (for undo)
--   storage buckets                 — blurred-images (public, the copies) and
--                                     restricted-images (PRIVATE, the originals)
--
-- Run once in the Supabase SQL editor (safe to re-run). No data changes.
-- ============================================================================

-- 1) Collection settings -------------------------------------------------------
ALTER TABLE collections ADD COLUMN IF NOT EXISTS blur_images boolean NOT NULL DEFAULT false;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS image_link text;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS image_link_column text;

-- 2) Blurred scans -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blurred_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kept when a collection is deleted, so its originals can still be found.
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  -- "bucket/path" the original lived at, and where links pointed before.
  original_key text NOT NULL,
  -- "blurred-images/…", the copy links point at now.
  blurred_key text NOT NULL,
  -- "restricted-images/…" once the original is moved out of public view;
  -- null if that move hasn't happened yet (the admin page retries it).
  restricted_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT blurred_scans_original_unique UNIQUE (original_key)
);

CREATE INDEX IF NOT EXISTS blurred_scans_collection_idx ON blurred_scans (collection_id);

-- Admin-only bookkeeping, reached through the service role (which bypasses
-- RLS). RLS on with no policies keeps it closed to everyone else.
ALTER TABLE blurred_scans ENABLE ROW LEVEL SECURITY;

-- 3) Storage buckets -------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('blurred-images', 'blurred-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('restricted-images', 'restricted-images', false)
ON CONFLICT (id) DO NOTHING;

-- The originals bucket must never be public, even if it already existed.
UPDATE storage.buckets SET public = false WHERE id = 'restricted-images';

-- Make PostgREST pick up the new columns and table immediately.
NOTIFY pgrst, 'reload schema';
