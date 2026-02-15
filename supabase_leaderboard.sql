-- ============================================================
-- LEADERBOARD: ALTER EXISTING TABLE + RPC FUNCTIONS
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Existing table: public.leaderboard_entries
--   Columns: id, user_id (uuid), week_id (text), score (int),
--            username (text), avatar_url (text), created_at
--
-- This script adds spotify_user_id (text) so RPCs can key
-- on it directly without depending on user_id (uuid).
-- ============================================================

-- 1) Add spotify_user_id column (idempotent)
ALTER TABLE public.leaderboard_entries
  ADD COLUMN IF NOT EXISTS spotify_user_id text;

-- 2) Indexes for efficient lookups on the new column
CREATE INDEX IF NOT EXISTS idx_lb_spotify_week
  ON public.leaderboard_entries (spotify_user_id, week_id);

CREATE INDEX IF NOT EXISTS idx_lb_week_score
  ON public.leaderboard_entries (week_id, score DESC);

-- 3) RLS: public read + public insert (no Supabase Auth)
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leaderboard_entries' AND policyname = 'leaderboard_select_all'
  ) THEN
    CREATE POLICY leaderboard_select_all ON public.leaderboard_entries
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leaderboard_entries' AND policyname = 'leaderboard_insert_all'
  ) THEN
    CREATE POLICY leaderboard_insert_all ON public.leaderboard_entries
      FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- 4) Drop any old RPC signatures (return types may differ)
DROP FUNCTION IF EXISTS public.get_player_top10(text, int, int);
DROP FUNCTION IF EXISTS public.get_player_top10(text, text);
DROP FUNCTION IF EXISTS public.get_player_weekly_history(text);

-- 5) RPC: Player's top 10 distinct scores for a given week,
--         each with its global dense rank within that week.
CREATE FUNCTION public.get_player_top10(
  p_spotify_user_id text,
  p_week_id text
)
RETURNS TABLE(score int, rank bigint)
LANGUAGE sql STABLE
AS $$
  WITH global_ranks AS (
    -- Rank all distinct scores in this week
    SELECT s.score, DENSE_RANK() OVER (ORDER BY s.score DESC) AS rank
    FROM (
      SELECT DISTINCT le.score
      FROM public.leaderboard_entries le
      WHERE le.week_id = p_week_id AND le.spotify_user_id IS NOT NULL
    ) s
  )
  -- Keep only scores that this player has achieved
  SELECT gr.score, gr.rank
  FROM global_ranks gr
  WHERE gr.score IN (
    SELECT DISTINCT le2.score
    FROM public.leaderboard_entries le2
    WHERE le2.spotify_user_id = p_spotify_user_id
      AND le2.week_id = p_week_id
  )
  ORDER BY gr.score DESC
  LIMIT 10;
$$;

-- 6) RPC: Player's best score per week across all weeks,
--         each with its global dense rank within that week.
CREATE FUNCTION public.get_player_weekly_history(
  p_spotify_user_id text
)
RETURNS TABLE(week_id text, best_score int, rank bigint)
LANGUAGE sql STABLE
AS $$
  WITH player_best AS (
    SELECT le.week_id, MAX(le.score) AS best_score
    FROM public.leaderboard_entries le
    WHERE le.spotify_user_id = p_spotify_user_id
    GROUP BY le.week_id
  ),
  week_global_ranks AS (
    -- Rank distinct scores only in weeks the player participated in
    SELECT s.week_id, s.score,
      DENSE_RANK() OVER (PARTITION BY s.week_id ORDER BY s.score DESC) AS rank
    FROM (
      SELECT DISTINCT le.week_id, le.score
      FROM public.leaderboard_entries le
      WHERE le.spotify_user_id IS NOT NULL
        AND le.week_id IN (SELECT week_id FROM player_best)
    ) s
  )
  SELECT pb.week_id, pb.best_score, wgr.rank
  FROM player_best pb
  JOIN week_global_ranks wgr
    ON wgr.week_id = pb.week_id AND wgr.score = pb.best_score
  ORDER BY pb.week_id ASC;
$$;

-- 7) Grant execute to anon + authenticated
GRANT EXECUTE ON FUNCTION public.get_player_top10(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_weekly_history(text) TO anon, authenticated;
