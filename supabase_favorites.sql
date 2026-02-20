-- ============================================================
-- USER FAVORITES
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Stores per-user favorite tracks, keyed by Supabase auth user ID.
-- Both anonymous (signInAnonymously) and Spotify-connected users
-- get a persistent auth.uid() via ensureAnonUser().
-- ============================================================

-- 1) Create table
CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id          UUID NOT NULL,
  spotify_track_id TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, spotify_track_id)
);

-- 2) Enable RLS
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies: users can only read/write their own favorites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_favorites' AND policyname = 'fav_select'
  ) THEN
    CREATE POLICY fav_select ON public.user_favorites
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_favorites' AND policyname = 'fav_insert'
  ) THEN
    CREATE POLICY fav_insert ON public.user_favorites
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_favorites' AND policyname = 'fav_delete'
  ) THEN
    CREATE POLICY fav_delete ON public.user_favorites
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 4) Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_fav_user
  ON public.user_favorites (user_id);

-- 5) Grant access to anon + authenticated roles
GRANT SELECT, INSERT, DELETE ON public.user_favorites TO anon, authenticated;
