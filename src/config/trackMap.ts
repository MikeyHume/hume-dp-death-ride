/**
 * Track mapping between Spotify and YouTube.
 *
 * Each entry links a Spotify track ID to a YouTube video ID for the same song.
 * Used to display the YouTube music video (muted) synced with Spotify audio
 * when the player has a Premium account and a matching track is playing.
 *
 * Spotify track ID: the last segment of a spotify:track:XXXXX URI
 * YouTube video ID: the 11-char ID from a youtube.com/watch?v=XXXXX URL
 *
 * YouTube playlist: PLgz1oMMp1awLI_wrJTMblR6dRTMDcwaGr
 * Spotify playlist: spotify:playlist:37i9dQZF1DZ06evO3es99h
 */

export interface TrackMapping {
  spotifyId: string;    // Spotify track ID (from URI)
  youtubeId: string;    // YouTube video ID
  title: string;        // Human-readable song title (for debugging/reference)
}

// ── Add entries here as you identify matching songs between playlists ──
export const TRACK_MAP: TrackMapping[] = [
  // { spotifyId: 'XXXXXXXXXXXXXXXXXXXXXX', youtubeId: 'XXXXXXXXXXX', title: 'Song Name - Artist' },
];

/** Look up a YouTube video ID from a Spotify track ID. Returns null if no match. */
export function getYouTubeIdForSpotify(spotifyTrackId: string): string | null {
  for (let i = 0; i < TRACK_MAP.length; i++) {
    if (TRACK_MAP[i].spotifyId === spotifyTrackId) return TRACK_MAP[i].youtubeId;
  }
  return null;
}

/** Look up a Spotify track ID from a YouTube video ID. Returns null if no match. */
export function getSpotifyIdForYouTube(youtubeVideoId: string): string | null {
  for (let i = 0; i < TRACK_MAP.length; i++) {
    if (TRACK_MAP[i].youtubeId === youtubeVideoId) return TRACK_MAP[i].spotifyId;
  }
  return null;
}
