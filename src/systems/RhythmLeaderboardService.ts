/**
 * Supabase-backed rhythm mode leaderboard.
 * Permanent per-track+difficulty high scores (never reset).
 * Follows the same pattern as LeaderboardService.ts.
 */

import { supabase } from '../supabaseClient';
import { getLinkedSpotifyId } from './ProfileSystem';
import { ensureAnonUser } from './AuthSystem';
import type { GlobalLeaderboardEntry } from './LeaderboardService';

/**
 * Submit a rhythm mode score. Fire-and-forget safe.
 */
export async function submitRhythmScore(
  trackId: string,
  difficulty: string,
  score: number,
  timeSurvived?: number,
  username?: string,
  courseVersion: number = 1,
): Promise<string | null> {
  try {
    console.log('[RLB] submitRhythmScore —', trackId, difficulty, score);

    let authUid: string | null = null;
    try {
      authUid = await ensureAnonUser();
    } catch (authErr) {
      console.warn('[RLB] ensureAnonUser FAILED:', authErr);
    }

    const spotifyId = getLinkedSpotifyId();

    let avatarUrl: string | null = null;
    if (spotifyId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('spotify_user_id', spotifyId)
        .maybeSingle();
      avatarUrl = profile?.avatar_url || null;
    }

    const row: Record<string, unknown> = {
      spotify_user_id: spotifyId || null,
      spotify_track_id: trackId,
      difficulty,
      score,
      time_survived: timeSurvived != null ? Math.round(timeSurvived) : null,
      username: username || null,
      avatar_url: avatarUrl,
      course_version: courseVersion,
    };
    if (authUid) row.user_id = authUid;

    const { data, error } = await supabase
      .from('rhythm_scores')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('[RLB] INSERT FAILED —', error.message);
      return null;
    }
    console.log('[RLB] INSERT OK — id:', data?.id);
    return data?.id != null ? String(data.id) : null;
  } catch (err) {
    console.error('[RLB] submitRhythmScore EXCEPTION:', err);
    return null;
  }
}

/**
 * Fetch global top 10 for a track+difficulty.
 * Returns the same GlobalLeaderboardEntry shape as the weekly leaderboard.
 */
export async function fetchRhythmTop10(
  trackId: string,
  difficulty: string,
): Promise<GlobalLeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('rhythm_scores')
      .select('id, username, score, time_survived, user_id, spotify_user_id, avatar_url, created_at')
      .eq('spotify_track_id', trackId)
      .eq('difficulty', difficulty)
      .order('score', { ascending: false })
      .order('time_survived', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.warn('[RLB] fetchRhythmTop10 failed', error);
      return [];
    }

    return (data || []).map((row: any, i: number) => ({
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
    console.warn('[RLB] fetchRhythmTop10 error', err);
    return [];
  }
}
