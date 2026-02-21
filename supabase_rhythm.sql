-- ============================================================
-- RHYTHM MODE: courses + permanent high scores
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1) rhythm_courses — metadata for generated course versions
CREATE TABLE IF NOT EXISTS public.rhythm_courses (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spotify_track_id text NOT NULL,
  difficulty    text NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  name          text NOT NULL DEFAULT 'Default',
  version       int NOT NULL DEFAULT 1,
  seed          int NOT NULL DEFAULT 0,
  score_total   real NOT NULL DEFAULT 0,
  score_beat_sync real NOT NULL DEFAULT 0,
  score_flow    real NOT NULL DEFAULT 0,
  score_difficulty_curve real NOT NULL DEFAULT 0,
  score_type_variety real NOT NULL DEFAULT 0,
  score_lane_coverage real NOT NULL DEFAULT 0,
  score_energy_match real NOT NULL DEFAULT 0,
  score_cull_rate real NOT NULL DEFAULT 0,
  rating        real NOT NULL DEFAULT 0,  -- user rating 0-10 (0 = unrated)
  is_active     boolean NOT NULL DEFAULT true,
  event_count   int NOT NULL DEFAULT 0,
  attempts      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rc_track_diff
  ON public.rhythm_courses (spotify_track_id, difficulty);

CREATE INDEX IF NOT EXISTS idx_rc_active
  ON public.rhythm_courses (spotify_track_id, difficulty, is_active);

-- RLS: public SELECT, no direct insert/update from client
ALTER TABLE public.rhythm_courses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rhythm_courses' AND policyname = 'rhythm_courses_select_all'
  ) THEN
    CREATE POLICY rhythm_courses_select_all ON public.rhythm_courses
      FOR SELECT USING (true);
  END IF;
END
$$;

-- Grant table-level SELECT to anon + authenticated
GRANT SELECT ON public.rhythm_courses TO anon, authenticated;

-- 2) rhythm_scores — permanent high scores per track+difficulty
CREATE TABLE IF NOT EXISTS public.rhythm_scores (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid,
  spotify_user_id text,
  spotify_track_id text NOT NULL,
  difficulty      text NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  score           int NOT NULL,
  time_survived   int,        -- seconds (null if completed full song)
  username        text,
  avatar_url      text,
  course_version  int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rs_track_diff_score
  ON public.rhythm_scores (spotify_track_id, difficulty, score DESC);

CREATE INDEX IF NOT EXISTS idx_rs_user
  ON public.rhythm_scores (spotify_user_id, spotify_track_id, difficulty);

-- RLS: public SELECT + INSERT
ALTER TABLE public.rhythm_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rhythm_scores' AND policyname = 'rhythm_scores_select_all'
  ) THEN
    CREATE POLICY rhythm_scores_select_all ON public.rhythm_scores
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rhythm_scores' AND policyname = 'rhythm_scores_insert_all'
  ) THEN
    CREATE POLICY rhythm_scores_insert_all ON public.rhythm_scores
      FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- Grant table-level SELECT + INSERT to anon + authenticated
GRANT SELECT, INSERT ON public.rhythm_scores TO anon, authenticated;

-- 3) RPC: Global top 10 for a track+difficulty (permanent, never resets)
DROP FUNCTION IF EXISTS public.get_rhythm_top10(text, text);

CREATE FUNCTION public.get_rhythm_top10(
  p_track_id text,
  p_difficulty text
)
RETURNS TABLE(
  rank bigint,
  id bigint,
  username text,
  score int,
  time_survived int,
  user_id uuid,
  spotify_user_id text,
  avatar_url text,
  created_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY rs.score DESC,
               rs.time_survived DESC NULLS LAST,
               rs.created_at ASC
    ) AS rank,
    rs.id,
    COALESCE(rs.username, 'ANON') AS username,
    rs.score,
    rs.time_survived,
    rs.user_id,
    rs.spotify_user_id,
    rs.avatar_url,
    rs.created_at
  FROM public.rhythm_scores rs
  WHERE rs.spotify_track_id = p_track_id
    AND rs.difficulty = p_difficulty
  ORDER BY rs.score DESC,
           rs.time_survived DESC NULLS LAST,
           rs.created_at ASC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.get_rhythm_top10(text, text) TO anon, authenticated;
