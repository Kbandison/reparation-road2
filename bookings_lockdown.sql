-- ============================================================================
-- REPARATION ROAD — LOCK DOWN BOOKINGS
-- ============================================================================
-- Bookings are now created only by app/api/bookings, which runs with the
-- service role (RLS doesn't apply to it). That route turns bots away, checks
-- the session, date and time, and sends the confirmation built from the saved
-- row. The admin bookings screen also uses the service role, so it is
-- unaffected.
--
-- STEP 1 closes the side door: the "Anyone can create booking" policy let any
-- visitor insert rows straight through the public API key, so a script could
-- fill the calendar with fake bookings without touching the site at all.
--
-- STEP 2 makes one booking per slot a rule rather than a hope. Until now two
-- people could book the same date and time: the booking page couldn't read
-- other people's bookings to grey the slot out. Checked 2026-09-27: 26
-- bookings, no slot booked twice, so the index builds cleanly.
--
-- RUN THIS ONLY AFTER the code that adds app/api/bookings is deployed. Run it
-- earlier and the old booking page, which inserts from the browser, stops
-- working until the deploy lands.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- STEP 1: no more inserts through the public API key.
DROP POLICY IF EXISTS "Anyone can create booking" ON public.bookings;

-- STEP 2: one booking per date and time.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_date_time_key ON public.bookings (date, time);

COMMIT;

-- ============================================================================
-- VERIFICATION (read-only — safe to run after COMMIT)
-- ============================================================================
-- Expect: no row with cmd = INSERT (or ALL). If one shows up under another
-- name, visitors can still insert directly; drop that policy too.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bookings'
ORDER BY cmd, policyname;

-- Expect: bookings_date_time_key in the list.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'bookings';
