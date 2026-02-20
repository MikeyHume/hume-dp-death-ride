/**
 * TrackMappingService — handles manual YouTube↔Spotify mapping and
 * triggers the sync_music_catalog Edge Function.
 *
 * Manual mapping: user pastes a YouTube URL for a Spotify track.
 * Sync trigger: calls the edge function to refresh artist catalogs + auto-match.
 */

import { supabase } from '../supabaseClient';
import { clearCatalogCache } from './MusicCatalogService';

// ─── Types ──────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  spotify: {
    artistsProcessed: number;
    albumIdsCount: number;
    tracksFetched: number;
    tracksUpserted: number;
  };
  youtube: {
    needingMatch: number;
    matched: number;
    skippedManual: number;
    failedNames: string[];
  };
  errors?: Array<{
    artistId: string;
    step: string;
    status: number;
    body: string;
    url?: string;
  }>;
}

// ─── Manual YouTube mapping ─────────────────────────────────────

/** Extract a YouTube video ID from a URL or raw ID string. */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // Already a bare video ID (11 chars, alphanumeric + - + _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  // Standard youtube.com/watch?v=... URL
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v') ?? null;
    }
    // youtu.be/VIDEO_ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return id.length === 11 ? id : null;
    }
  } catch {
    // not a URL
  }
  return null;
}

/**
 * Manually set a YouTube video ID for a Spotify track.
 * Marks it as `youtube_is_manual = true` so auto-sync won't overwrite it.
 */
export async function setManualYouTubeMatch(
  spotifyTrackId: string,
  youtubeVideoId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('music_tracks')
    .update({
      youtube_video_id: youtubeVideoId,
      youtube_url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      youtube_thumbnail_url: `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`,
      youtube_is_manual: true,
      youtube_matched_at: new Date().toISOString(),
    })
    .eq('spotify_track_id', spotifyTrackId);

  if (error) {
    console.error('[TrackMapping] setManualYouTubeMatch error:', error.message);
    return { ok: false, error: error.message };
  }

  clearCatalogCache();
  return { ok: true };
}

/** Remove a YouTube mapping (resets to null so auto-sync can try again). */
export async function clearYouTubeMatch(
  spotifyTrackId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('music_tracks')
    .update({
      youtube_video_id: null,
      youtube_url: null,
      youtube_thumbnail_url: null,
      youtube_title: null,
      youtube_channel_title: null,
      youtube_is_manual: false,
      youtube_matched_at: null,
    })
    .eq('spotify_track_id', spotifyTrackId);

  if (error) {
    console.error('[TrackMapping] clearYouTubeMatch error:', error.message);
    return { ok: false, error: error.message };
  }

  clearCatalogCache();
  return { ok: true };
}

// ─── Sync trigger ───────────────────────────────────────────────

/**
 * Trigger the sync_music_catalog Edge Function.
 * Pass `dryRun: true` to preview without writing to DB.
 */
export async function triggerSync(
  artistIds: string[],
  dryRun = false,
): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke('sync_music_catalog', {
    body: { artist_ids: artistIds, dryRun },
  });

  if (error) {
    console.error('[TrackMapping] triggerSync error:', error.message);
    return {
      ok: false,
      dryRun,
      spotify: { artistsProcessed: 0, albumIdsCount: 0, tracksFetched: 0, tracksUpserted: 0 },
      youtube: { needingMatch: 0, matched: 0, skippedManual: 0, failedNames: [] },
      errors: [{ artistId: '', step: 'invoke', status: 0, body: error.message }],
    };
  }

  clearCatalogCache();
  return data as SyncResult;
}
