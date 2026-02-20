-- ============================================================
-- POPULARITY COLUMN FOR music_tracks
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Adds a popularity column (0-100, from Spotify) to music_tracks.
-- Used by the "this is hume" playlist to rank tracks.
-- ============================================================

ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS popularity INT DEFAULT 0;
