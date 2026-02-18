/**
 * Supabase-backed leaderboard queries.
 * Uses RPC functions defined in supabase_leaderboard.sql.
 *
 * Score submission works for ALL users (anonymous + Spotify).
 * Anonymous users are identified by auth.uid() (set via column default).
 * Spotify users additionally have spotify_user_id for cross-device dedup.
 */

import { supabase } from '../supabaseClient';
import { getLinkedSpotifyId } from './ProfileSystem';
import { getCurrentWeekKey } from '../util/time';
import { ensureAnonUser } from './AuthSystem';

export interface PlayerScore {
  score: number;
  rank: number;
}

export interface WeeklyHistoryEntry {
  weekId: string;
  bestScore: number;
  rank: number;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  score: number;
  timeSurvived: number;
  userId: string;
  spotifyUserId: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

/**
 * Submit a score to the Supabase leaderboard. Fire-and-forget safe.
 * Works for all users — anonymous get user_id via auth.uid() column default,
 * Spotify users additionally get spotify_user_id set.
 */
export async function submitScore(score: number, timeSurvived?: number, username?: string): Promise<string | null> {
  try {
    console.log('[LB] submitScore called — score:', score, 'time:', timeSurvived, 'name:', username);

    // Best-effort auth session — get a user_id if possible
    let authUid: string | null = null;
    try {
      authUid = await ensureAnonUser();
      console.log('[LB] auth uid:', authUid);
    } catch (authErr) {
      console.warn('[LB] ensureAnonUser FAILED:', authErr);
    }

    const spotifyId = getLinkedSpotifyId();
    console.log('[LB] spotifyId:', spotifyId || '(none)');

    // Fetch avatar for Spotify users (best-effort)
    let avatarUrl: string | null = null;
    if (spotifyId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('spotify_user_id', spotifyId)
        .maybeSingle();
      avatarUrl = profile?.avatar_url || null;
    }

    const weekId = getCurrentWeekKey();
    const row: Record<string, unknown> = {
      spotify_user_id: spotifyId || null,
      week_id: weekId,
      score,
      time_survived: timeSurvived != null ? Math.round(timeSurvived) : null,
      username: username || null,
      avatar_url: avatarUrl,
    };
    // Only set user_id when we have a real auth uid — avoids FK violation
    // against auth.users when no session exists
    if (authUid) row.user_id = authUid;

    console.log('[LB] inserting row:', JSON.stringify(row));

    const { data, error, status, statusText } = await supabase
      .from('leaderboard_entries')
      .insert(row)
      .select('id')
      .single();

    console.log('[LB] response — status:', status, statusText, 'data:', data, 'error:', error);

    if (error) {
      console.error('[LB] INSERT FAILED —', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint);
      return null;
    }
    console.log('[LB] INSERT OK — id:', data?.id, 'week:', weekId);
    return data?.id != null ? String(data.id) : null;
  } catch (err) {
    console.error('[LB] submitScore EXCEPTION:', err);
    return null;
  }
}

/** Fetch the global top 10 runs for a given week (no dedup — same player can hold multiple slots). */
export async function fetchGlobalTop10(weekId?: string): Promise<GlobalLeaderboardEntry[]> {
  try {
    const wk = weekId || getCurrentWeekKey();
    const { data, error } = await supabase
      .from('leaderboard_entries')
      .select('id, username, score, time_survived, user_id, spotify_user_id, avatar_url, created_at')
      .eq('week_id', wk)
      .order('score', { ascending: false })
      .order('time_survived', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.warn('LeaderboardService: fetchGlobalTop10 failed', error);
      return [];
    }

    return (data || []).map((row: { id: number; username: string; score: number; time_survived: number; user_id: string; spotify_user_id: string | null; avatar_url: string | null; created_at: string }, i: number) => ({
      rank: i + 1,
      id: String(row.id),
      username: row.username || 'ANON',
      score: row.score,
      timeSurvived: row.time_survived || 0,
      userId: row.user_id,
      spotifyUserId: row.spotify_user_id || null,
      avatarUrl: row.avatar_url || null,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.warn('LeaderboardService: fetchGlobalTop10 error', err);
    return [];
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
