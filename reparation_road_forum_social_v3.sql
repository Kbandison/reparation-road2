-- Reparation Road — Forum social, v3
-- Adds support for the internal "Share to your feed" (reposting a post into
-- your own feed). Safe to run more than once.
--
-- Run this in the Supabase SQL editor (or psql). No data is destroyed.

-- A reposted thread is stored as a small JSON reference { slug, title, author }
-- on the new post — mirroring how attached archive records work. Posts without
-- a repost simply leave it null.
alter table public.forum_threads
  add column if not exists shared_thread jsonb;
