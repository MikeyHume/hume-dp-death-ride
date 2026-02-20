-- ============================================================
-- MUSIC CATALOG: Tables for Spotify ↔ YouTube track mapping
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1) Artists table
CREATE TABLE IF NOT EXISTS public.music_artists (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spotify_artist_id text NOT NULL UNIQUE,
  name          text NOT NULL,
  image_url     text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_artists_spotify_id
  ON public.music_artists (spotify_artist_id);

-- 2) Tracks table — stores Spotify track info + YouTube match
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spotify_track_id        text NOT NULL UNIQUE,
  spotify_artist_id       text NOT NULL REFERENCES public.music_artists(spotify_artist_id),
  title                   text NOT NULL,
  artist_name             text NOT NULL,
  album_name              text,
  album_image_url         text,
  duration_ms             int,
  spotify_url             text,
  -- YouTube match fields (null until matched)
  youtube_video_id        text,
  youtube_url             text,
  youtube_thumbnail_url   text,
  youtube_title           text,
  youtube_channel_title   text,
  youtube_matched_at      timestamptz,
  youtube_is_manual       boolean DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_tracks_spotify_id
  ON public.music_tracks (spotify_track_id);

CREATE INDEX IF NOT EXISTS idx_music_tracks_artist_id
  ON public.music_tracks (spotify_artist_id);

CREATE INDEX IF NOT EXISTS idx_music_tracks_youtube_id
  ON public.music_tracks (youtube_video_id);

-- 3) RLS: public read, service_role writes (edge function uses service_role key)
ALTER TABLE public.music_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_tracks  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'music_artists' AND policyname = 'music_artists_select_all'
  ) THEN
    CREATE POLICY music_artists_select_all ON public.music_artists
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'music_tracks' AND policyname = 'music_tracks_select_all'
  ) THEN
    CREATE POLICY music_tracks_select_all ON public.music_tracks
      FOR SELECT USING (true);
  END IF;
END
$$;

-- 4) Grant read access to anon + authenticated (edge function uses service_role)
GRANT SELECT ON public.music_artists TO anon, authenticated;
GRANT SELECT ON public.music_tracks  TO anon, authenticated;
