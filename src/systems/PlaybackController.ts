/**
 * PlaybackController — catalog-aware bridge between Spotify and YouTube.
 *
 * When Spotify plays a track, this controller looks up the matching YouTube
 * video from the music catalog (Supabase) and provides it to the WMP popup
 * so the video area shows content instead of a black box.
 *
 * When YouTube is the active source, it looks up the matching Spotify track
 * for metadata display.
 *
 * This is NOT a replacement for MusicPlayer — it's a helper that MusicPlayer
 * calls into for catalog-based track matching.
 */

import { getYouTubeForSpotify, getSpotifyForYouTube, type CatalogTrack, fetchAllTracks } from './MusicCatalogService';

// ─── Types ──────────────────────────────────────────────────────

export interface MatchedTrack {
  spotifyTrackId: string | null;
  youtubeVideoId: string | null;
  title: string;
  artistName: string;
  albumImageUrl: string | null;
}

type MatchCallback = (match: MatchedTrack) => void;

// ─── Controller ─────────────────────────────────────────────────

export class PlaybackController {
  private onMatch: MatchCallback | null = null;
  private lastSpotifyId: string | null = null;
  private lastYouTubeId: string | null = null;
  private catalogReady = false;

  /**
   * Pre-load the catalog so lookups are instant during playback.
   * Call once at startup (non-blocking).
   */
  async warmup(): Promise<void> {
    try {
      await fetchAllTracks();
      this.catalogReady = true;
      console.log('[PlaybackCtrl] catalog warmed up');
    } catch (err) {
      console.warn('[PlaybackCtrl] warmup failed:', err);
    }
  }

  /** Register a callback for when a track match is found. */
  onTrackMatched(cb: MatchCallback): void {
    this.onMatch = cb;
  }

  /**
   * Called by MusicPlayer when Spotify reports a new track playing.
   * Looks up the matching YouTube video ID from the catalog.
   * Returns the YouTube video ID or null if no match.
   */
  async onSpotifyTrackChanged(
    spotifyTrackId: string,
    trackName: string,
    artistName: string,
    albumImageUrl: string | null,
  ): Promise<string | null> {
    if (spotifyTrackId === this.lastSpotifyId) return this.lastYouTubeId;
    this.lastSpotifyId = spotifyTrackId;

    const ytId = await getYouTubeForSpotify(spotifyTrackId);
    this.lastYouTubeId = ytId;

    if (this.onMatch) {
      this.onMatch({
        spotifyTrackId,
        youtubeVideoId: ytId,
        title: trackName,
        artistName,
        albumImageUrl,
      });
    }

    return ytId;
  }

  /**
   * Called by MusicPlayer when YouTube reports a new video playing.
   * Looks up the matching Spotify track ID from the catalog.
   * Returns the Spotify track ID or null if no match.
   */
  async onYouTubeVideoChanged(
    youtubeVideoId: string,
    videoTitle: string,
  ): Promise<string | null> {
    if (youtubeVideoId === this.lastYouTubeId) return this.lastSpotifyId;
    this.lastYouTubeId = youtubeVideoId;

    const spotifyId = await getSpotifyForYouTube(youtubeVideoId);
    this.lastSpotifyId = spotifyId;

    if (this.onMatch && spotifyId) {
      // Look up full track data for the match callback
      const tracks = await fetchAllTracks();
      const track = tracks.find((t: CatalogTrack) => t.spotifyTrackId === spotifyId);
      if (track) {
        this.onMatch({
          spotifyTrackId: spotifyId,
          youtubeVideoId,
          title: track.title,
          artistName: track.artistName,
          albumImageUrl: track.albumImageUrl,
        });
      }
    }

    return spotifyId;
  }

  /** Get the last known YouTube video ID for the currently playing Spotify track. */
  getLastYouTubeId(): string | null {
    return this.lastYouTubeId;
  }

  /** Get the last known Spotify track ID for the currently playing YouTube video. */
  getLastSpotifyId(): string | null {
    return this.lastSpotifyId;
  }

  isCatalogReady(): boolean {
    return this.catalogReady;
  }
}
