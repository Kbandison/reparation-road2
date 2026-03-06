-- ============================================================================
-- REPARATION ROAD — RLS FIX: Security Definer Functions + Membership Gating
-- ============================================================================
-- Run this in Supabase SQL Editor AFTER the main migration.
--
-- Fixes:
--   1. Infinite recursion in admin_users RLS policy
--   2. Replaces all direct admin_users subqueries with is_admin() function
--   3. Gates paid collection data tables behind subscription check
--   4. Updates collection access_tier values
-- ============================================================================


-- ============================================================================
-- STEP 1: Create SECURITY DEFINER helper functions
-- ============================================================================
-- These bypass RLS when checking admin/subscription status,
-- breaking the infinite recursion cycle.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_paid_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND subscription_status = 'paid'
  );
$$;


-- ============================================================================
-- STEP 2: Fix admin_users RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Only admins can view" ON admin_users;
DROP POLICY IF EXISTS "Only service role can modify" ON admin_users;

-- Admins can see the admin list
CREATE POLICY "Admins read admin_users" ON admin_users
  FOR SELECT USING (is_admin());

-- Admins can manage other admins
CREATE POLICY "Admins manage admin_users" ON admin_users
  FOR ALL USING (is_admin());


-- ============================================================================
-- STEP 3: Fix collections metadata RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Admin manage collections" ON collections;
-- "Public read collections" stays — everyone can see collection cards
CREATE POLICY "Admin manage collections" ON collections
  FOR ALL USING (is_admin());


-- ============================================================================
-- STEP 4: Fix bookings RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users see own bookings" ON bookings;
DROP POLICY IF EXISTS "Admins manage bookings" ON bookings;
DROP POLICY IF EXISTS "Admins delete bookings" ON bookings;

CREATE POLICY "Users see own bookings" ON bookings
  FOR SELECT USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Admins manage bookings" ON bookings
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins delete bookings" ON bookings
  FOR DELETE USING (is_admin());


-- ============================================================================
-- STEP 5: Fix orders RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users see own orders" ON orders;
DROP POLICY IF EXISTS "Admins manage orders" ON orders;

CREATE POLICY "Users see own orders" ON orders
  FOR SELECT USING (
    user_id = auth.uid() OR is_admin()
  );

CREATE POLICY "Admins manage orders" ON orders
  FOR UPDATE USING (is_admin());


-- ============================================================================
-- STEP 6: Fix order_items RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Users see own items" ON order_items;
DROP POLICY IF EXISTS "Admins manage items" ON order_items;

CREATE POLICY "Users see own items" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "Admins manage items" ON order_items
  FOR ALL USING (is_admin());


-- ============================================================================
-- STEP 7: Fix ex_slave_pension_images RLS policies
-- ============================================================================

DROP POLICY IF EXISTS "Admin insert images" ON ex_slave_pension_images;
DROP POLICY IF EXISTS "Admin update images" ON ex_slave_pension_images;
DROP POLICY IF EXISTS "Admin delete images" ON ex_slave_pension_images;

CREATE POLICY "Admin insert images" ON ex_slave_pension_images
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admin update images" ON ex_slave_pension_images
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admin delete images" ON ex_slave_pension_images
  FOR DELETE USING (is_admin());


-- ============================================================================
-- STEP 8: Fix data table RLS policies — membership gating
-- ============================================================================

-- 8A: FREE data tables — accessible to everyone
-- Tables: aa_revolutionary_soldiers, archive_pages, free_black_heads_of_household

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'aa_revolutionary_soldiers',
      'archive_pages',
      'free_black_heads_of_household'
    ])
  LOOP
    -- Drop old policies
    EXECUTE format('DROP POLICY IF EXISTS "Public read" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin insert" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin update" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin delete" ON %I', tbl);

    -- Public read (free)
    EXECUTE format('CREATE POLICY "Public read" ON %I FOR SELECT USING (true)', tbl);

    -- Admin write (using security definer function)
    EXECUTE format('CREATE POLICY "Admin insert" ON %I FOR INSERT WITH CHECK (is_admin())', tbl);
    EXECUTE format('CREATE POLICY "Admin update" ON %I FOR UPDATE USING (is_admin())', tbl);
    EXECUTE format('CREATE POLICY "Admin delete" ON %I FOR DELETE USING (is_admin())', tbl);
  END LOOP;
END $$;


-- 8B: PAID data tables — require subscription or admin
-- All other data tables

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'register_free_persons',
      'slave_merchants',
      'va_books',
      'va_personal_property',
      'slave_importation',
      'cherokee_henderson',
      'colored_deaths',
      'colored_marriages',
      'creek_census',
      'emmigrants_to_liberia',
      'enslaved_catholic_kentuky',
      'enslaved_persons_alabama',
      'ex_slave_pension',
      'formerly_enslaved',
      'liberation_census_rolls',
      'revolutionary_soldiers',
      'slave_compensation_claims',
      'slave_voyages'
    ])
  LOOP
    -- Drop old policies
    EXECUTE format('DROP POLICY IF EXISTS "Public read" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin insert" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin update" ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Admin delete" ON %I', tbl);

    -- Paid members + admins can read
    EXECUTE format('CREATE POLICY "Paid read" ON %I FOR SELECT USING (has_paid_subscription() OR is_admin())', tbl);

    -- Admin write (using security definer function)
    EXECUTE format('CREATE POLICY "Admin insert" ON %I FOR INSERT WITH CHECK (is_admin())', tbl);
    EXECUTE format('CREATE POLICY "Admin update" ON %I FOR UPDATE USING (is_admin())', tbl);
    EXECUTE format('CREATE POLICY "Admin delete" ON %I FOR DELETE USING (is_admin())', tbl);
  END LOOP;
END $$;


-- ============================================================================
-- STEP 9: Update collection access_tier values
-- ============================================================================

-- Free collections (matches freeFeatures in lib/constants.ts)
UPDATE collections SET access_tier = 'free'
WHERE slug IN (
  'aa-revolutionary-soldiers',
  'inspection-roll-of-negroes',
  'free-black-heads-of-household'
);

-- Paid collections (everything else)
UPDATE collections SET access_tier = 'scholar'
WHERE slug NOT IN (
  'aa-revolutionary-soldiers',
  'inspection-roll-of-negroes',
  'free-black-heads-of-household'
);


-- ============================================================================
-- STEP 10: Verify
-- ============================================================================

-- Check functions exist
SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('is_admin', 'has_paid_subscription');

-- Check admin_users policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'admin_users';

-- Check a sample data table policy
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'creek_census';

-- Check access_tier distribution
SELECT access_tier, count(*) FROM collections GROUP BY access_tier;
