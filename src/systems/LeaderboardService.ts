/**
 * Supabase-backed leaderboard queries for the profile popup.
 * Uses RPC functions defined in supabase_leaderboard.sql.
 * Identity is spotify_user_id (text) — no Supabase Auth.
 */

import { supabase } from '../supabaseClient';
import { getLinkedSpotifyId } from './ProfileSystem';
import { getCurrentWeekKey } from '../util/time';

export interface PlayerScore {
  score: number;
  rank: number;
}

export interface WeeklyHistoryEntry {
  weekId: string;
  bestScore: number;
  rank: number;
}

/**
 * Submit a score to the Supabase leaderboard. Fire-and-forget safe.
 * Bails silently if Spotify is not connected.
 */
export async function submitScore(score: number, username?: string): Promise<void> {
  try {
    const spotifyId = getLinkedSpotifyId();
    if (!spotifyId) return;

    // Fetch avatar storage path from profiles (best-effort)
    let avatarUrl: string | null = null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('spotify_user_id', spotifyId)
      .maybeSingle();
    avatarUrl = profile?.avatar_url || null;

    const weekId = getCurrentWeekKey();
    const { error } = await supabase
      .from('leaderboard_entries')
      .insert({
        spotify_user_id: spotifyId,
        week_id: weekId,
        score,
        username: username || null,
        avatar_url: avatarUrl,
      });

    if (error) {
      console.warn('LeaderboardService: submit failed', error);
    }
  } catch (err) {
    console.warn('LeaderboardService: submit error', err);
  }
}

/** Fetch the player's top 10 distinct scores for the current week with global ranks. */
export async function fetchPlayerTop10(weekId?: string): Promise<PlayerScore[]> {
  const spotifyId = getLinkedSpotifyId();
  if (!spotifyId) return [];

  const wk = weekId || getCurrentWeekKey();
  const { data, error } = await supabase.rpc('get_player_top10', {
    p_spotify_user_id: spotifyId,
    p_week_id: wk,
  });

  if (error) {
    console.warn('LeaderboardService: fetchPlayerTop10 failed', error);
    return [];
  }

  return (data || []).map((row: { score: number; rank: number }) => ({
    score: row.score,
    rank: Number(row.rank),
  }));
}

/** Fetch the player's best score per week across all weeks, with global rank. */
export async function fetchWeeklyHistory(): Promise<WeeklyHistoryEntry[]> {
  const spotifyId = getLinkedSpotifyId();
  if (!spotifyId) return [];

  const { data, error } = await supabase.rpc('get_player_weekly_history', {
    p_spotify_user_id: spotifyId,
  });

  if (error) {
    console.warn('LeaderboardService: fetchWeeklyHistory failed', error);
    return [];
  }

  return (data || []).map((row: { week_id: string; best_score: number; rank: number }) => ({
    weekId: row.week_id,
    bestScore: row.best_score,
    rank: Number(row.rank),
  }));
}
