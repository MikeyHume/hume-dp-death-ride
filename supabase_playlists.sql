-- ============================================================
-- USER PLAYLISTS + PLAYLIST TRACKS
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Two tables: user_playlists (playlist metadata) and
-- user_playlist_tracks (track membership, cascading delete).
-- Keyed by Supabase auth user ID (auth.uid()).
-- ============================================================

-- 1) Playlists table
CREATE TABLE IF NOT EXISTS public.user_playlists (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL,
  name       TEXT NOT NULL DEFAULT 'Untitled',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Playlist tracks junction table
CREATE TABLE IF NOT EXISTS public.user_playlist_tracks (
  playlist_id      BIGINT NOT NULL REFERENCES public.user_playlists(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  position         INT DEFAULT 0,
  added_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (playlist_id, spotify_track_id)
);

-- 3) Enable RLS
ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_playlist_tracks ENABLE ROW LEVEL SECURITY;

-- 4) RLS policies for user_playlists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlists' AND policyname = 'pl_select'
  ) THEN
    CREATE POLICY pl_select ON public.user_playlists
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlists' AND policyname = 'pl_insert'
  ) THEN
    CREATE POLICY pl_insert ON public.user_playlists
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlists' AND policyname = 'pl_update'
  ) THEN
    CREATE POLICY pl_update ON public.user_playlists
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlists' AND policyname = 'pl_delete'
  ) THEN
    CREATE POLICY pl_delete ON public.user_playlists
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 5) RLS policies for user_playlist_tracks (ownership via parent playlist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlist_tracks' AND policyname = 'plt_select'
  ) THEN
    CREATE POLICY plt_select ON public.user_playlist_tracks
      FOR SELECT USING (
        playlist_id IN (SELECT id FROM public.user_playlists WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlist_tracks' AND policyname = 'plt_insert'
  ) THEN
    CREATE POLICY plt_insert ON public.user_playlist_tracks
      FOR INSERT WITH CHECK (
        playlist_id IN (SELECT id FROM public.user_playlists WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_playlist_tracks' AND policyname = 'plt_delete'
  ) THEN
    CREATE POLICY plt_delete ON public.user_playlist_tracks
      FOR DELETE USING (
        playlist_id IN (SELECT id FROM public.user_playlists WHERE user_id = auth.uid())
      );
  END IF;
END
$$;

-- 6) Indexes
CREATE INDEX IF NOT EXISTS idx_pl_user ON public.user_playlists (user_id);
CREATE INDEX IF NOT EXISTS idx_plt_playlist ON public.user_playlist_tracks (playlist_id);

-- 7) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_playlist_tracks TO anon, authenticated;
