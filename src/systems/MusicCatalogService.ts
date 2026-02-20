/**
 * MusicCatalogService — reads synced track data from Supabase `music_tracks`
 * and `music_artists` tables. Provides artist catalogs and Spotify↔YouTube
 * mappings for the WMP popup and PlaybackController.
 *
 * All reads use the anon key (public SELECT). Writes happen server-side
 * in the `sync_music_catalog` Edge Function.
 */

import { supabase } from '../supabaseClient';

// ─── Types ──────────────────────────────────────────────────────

export interface CatalogArtist {
  spotifyArtistId: string;
  name: string;
  imageUrl: string | null;
}

export interface CatalogTrack {
  spotifyTrackId: string;
  spotifyArtistId: string;
  title: string;
  artistName: string;
  albumName: string | null;
  albumImageUrl: string | null;
  durationMs: number;
  spotifyUrl: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  youtubeThumbnailUrl: string | null;
  youtubeTitle: string | null;
  youtubeChannelTitle: string | null;
  youtubeIsManual: boolean;
  popularity: number;
}

// ─── Cache ──────────────────────────────────────────────────────

let cachedArtists: CatalogArtist[] | null = null;
let cachedTracks: CatalogTrack[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
  return cachedTracks !== null && Date.now() - cacheTime < CACHE_TTL_MS;
}

/** Clear cache — call after a sync or when data might be stale. */
export function clearCatalogCache(): void {
  cachedArtists = null;
  cachedTracks = null;
  cacheTime = 0;
}

// ─── Fetch artists ──────────────────────────────────────────────

export async function fetchArtists(): Promise<CatalogArtist[]> {
  if (cachedArtists && isCacheValid()) return cachedArtists;

  const { data, error } = await supabase
    .from('music_artists')
    .select('spotify_artist_id, name, image_url')
    .order('name');

  if (error) {
    console.warn('[MusicCatalog] fetchArtists error:', error.message);
    return cachedArtists ?? [];
  }

  cachedArtists = (data ?? []).map((r: any) => ({
    spotifyArtistId: r.spotify_artist_id,
    name: r.name,
    imageUrl: r.image_url ?? null,
  }));
  return cachedArtists;
}

// ─── Fetch all tracks ───────────────────────────────────────────

export async function fetchAllTracks(): Promise<CatalogTrack[]> {
  if (cachedTracks && isCacheValid()) return cachedTracks;

  const { data, error } = await supabase
    .from('music_tracks')
    .select('*')
    .order('title');

  if (error) {
    console.warn('[MusicCatalog] fetchAllTracks error:', error.message);
    return cachedTracks ?? [];
  }

  cachedTracks = (data ?? []).map(mapTrackRow);
  cacheTime = Date.now();
  return cachedTracks;
}

// ─── Fetch tracks for a specific artist ─────────────────────────

export async function fetchTracksByArtist(spotifyArtistId: string): Promise<CatalogTrack[]> {
  // Use cache if available
  if (cachedTracks && isCacheValid()) {
    return cachedTracks.filter((t) => t.spotifyArtistId === spotifyArtistId);
  }

  const { data, error } = await supabase
    .from('music_tracks')
    .select('*')
    .eq('spotify_artist_id', spotifyArtistId)
    .order('title');

  if (error) {
    console.warn('[MusicCatalog] fetchTracksByArtist error:', error.message);
    return [];
  }

  return (data ?? []).map(mapTrackRow);
}

// ─── Lookup helpers ─────────────────────────────────────────────

/** Get the YouTube video ID for a given Spotify track ID (from DB). */
export async function getYouTubeForSpotify(spotifyTrackId: string): Promise<string | null> {
  const tracks = await fetchAllTracks();
  const match = tracks.find((t) => t.spotifyTrackId === spotifyTrackId);
  return match?.youtubeVideoId ?? null;
}

/** Get the Spotify track ID for a given YouTube video ID (from DB). */
export async function getSpotifyForYouTube(youtubeVideoId: string): Promise<string | null> {
  const tracks = await fetchAllTracks();
  const match = tracks.find((t) => t.youtubeVideoId === youtubeVideoId);
  return match?.spotifyTrackId ?? null;
}

/** Get all tracks that have both Spotify and YouTube IDs (fully mapped). */
export async function fetchMappedTracks(): Promise<CatalogTrack[]> {
  const tracks = await fetchAllTracks();
  return tracks.filter((t) => t.youtubeVideoId != null && t.spotifyTrackId != null);
}

/** Get tracks missing a YouTube match (for manual matching UI). */
export async function fetchUnmatchedTracks(): Promise<CatalogTrack[]> {
  const tracks = await fetchAllTracks();
  return tracks.filter((t) => t.youtubeVideoId == null);
}

// ─── Row mapper ─────────────────────────────────────────────────

function mapTrackRow(r: any): CatalogTrack {
  return {
    spotifyTrackId: r.spotify_track_id,
    spotifyArtistId: r.spotify_artist_id,
    title: r.title,
    artistName: r.artist_name,
    albumName: r.album_name ?? null,
    albumImageUrl: r.album_image_url ?? null,
    durationMs: r.duration_ms ?? 0,
    spotifyUrl: r.spotify_url ?? null,
    youtubeVideoId: r.youtube_video_id ?? null,
    youtubeUrl: r.youtube_url ?? null,
    youtubeThumbnailUrl: r.youtube_thumbnail_url ?? null,
    youtubeTitle: r.youtube_title ?? null,
    youtubeChannelTitle: r.youtube_channel_title ?? null,
    youtubeIsManual: r.youtube_is_manual ?? false,
    popularity: r.popularity ?? 0,
  };
}
