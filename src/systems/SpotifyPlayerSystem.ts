/**
 * Spotify Web Playback SDK wrapper.
 * Loads the SDK, creates a player, and controls playback of a playlist.
 * Only works for Spotify Premium accounts.
 */

import { getAccessToken } from './SpotifyAuthSystem';

const PLAYLIST_URI = 'spotify:playlist:37i9dQZF1DZ06evO3es99h';
const SKIP_TRACK_IDS = new Set([
  '3WhO9X2qZ7JexACAfvxHiZ', // Hell Girl — too similar to countdown track
]);

export interface SpotifyTrackInfo {
  name: string;
  artist: string;
  albumImageUrl: string | null;
}

type TrackChangeCallback = (track: SpotifyTrackInfo) => void;

export class SpotifyPlayerSystem {
  private player: any = null;
  private deviceId: string | null = null;
  private ready: boolean = false;
  private onTrackChange: TrackChangeCallback | null = null;
  private sdkLoaded: boolean = false;
  private muted: boolean = false;
  private volume: number = 0.5;

  /** Load the SDK script and initialize the player. Resolves true if playback is ready. */
  async init(): Promise<boolean> {
    const token = getAccessToken();
    if (!token) return false;

    try {
      await this.loadSDK();
      return await this.createPlayer(token);
    } catch (err) {
      console.warn('SpotifyPlayerSystem: init failed', err);
      return false;
    }
  }

  private loadSDK(): Promise<void> {
    if (this.sdkLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      // If SDK is already on page
      if ((window as any).Spotify?.Player) {
        this.sdkLoaded = true;
        resolve();
        return;
      }

      (window as any).onSpotifyWebPlaybackSDKReady = () => {
        this.sdkLoaded = true;
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
      document.head.appendChild(script);

      // Timeout after 10s
      setTimeout(() => reject(new Error('Spotify SDK load timeout')), 10000);
    });
  }

  private createPlayer(token: string): Promise<boolean> {
    return new Promise((resolve) => {
      const SpotifySDK = (window as any).Spotify;
      if (!SpotifySDK?.Player) { resolve(false); return; }

      this.player = new SpotifySDK.Player({
        name: 'DP Moto',
        getOAuthToken: (cb: (t: string) => void) => {
          // Always provide a fresh token in case it was refreshed
          const t = getAccessToken();
          cb(t || token);
        },
        volume: this.volume,
      });

      this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
        this.deviceId = device_id;
        this.ready = true;
        resolve(true);
      });

      this.player.addListener('not_ready', () => {
        this.ready = false;
        resolve(false);
      });

      this.player.addListener('initialization_error', () => resolve(false));
      this.player.addListener('authentication_error', () => resolve(false));
      this.player.addListener('account_error', () => resolve(false));

      this.player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        const track = state.track_window?.current_track;
        if (!track) return;

        // Auto-skip banned tracks
        const trackId = track.uri?.split(':').pop();
        if (trackId && SKIP_TRACK_IDS.has(trackId) && !state.paused) {
          this.next();
          return;
        }

        if (this.onTrackChange) {
          this.onTrackChange({
            name: track.name,
            artist: track.artists?.map((a: any) => a.name).join(', ') || '',
            albumImageUrl: track.album?.images?.[0]?.url || null,
          });
        }
      });

      this.player.connect();

      // Safety timeout
      setTimeout(() => { if (!this.ready) resolve(false); }, 12000);
    });
  }

  /** Start playing the playlist with shuffle. Silently skips the first track so it's never heard. */
  async startPlaylist(): Promise<boolean> {
    if (!this.ready || !this.deviceId) return false;
    const token = getAccessToken();
    if (!token) return false;

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    try {
      // Mute during startup so the first track isn't audible
      if (this.player) await this.player.setVolume(0).catch(() => {});

      // Enable shuffle first
      await fetch(
        `https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=${this.deviceId}`,
        { method: 'PUT', headers },
      );

      // Start playlist (lands on track 1 briefly, but we're muted)
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ context_uri: PLAYLIST_URI }),
        },
      );

      if (!res.ok) {
        this.restoreVolume();
        return false;
      }

      // Skip to a random track (shuffle is on) so we never hear track 1
      await this.next();
      // Wait for the skip to register before restoring volume
      await new Promise((r) => setTimeout(r, 600));
      this.restoreVolume();

      return true;
    } catch {
      this.restoreVolume();
      return false;
    }
  }

  private restoreVolume(): void {
    if (this.player && !this.muted) {
      this.player.setVolume(this.volume).catch(() => {});
    }
  }

  async next(): Promise<void> {
    if (!this.ready) return;
    const token = getAccessToken();
    if (!token) return;
    await fetch('https://api.spotify.com/v1/me/player/next', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  async prev(): Promise<void> {
    if (!this.ready) return;
    const token = getAccessToken();
    if (!token) return;
    await fetch('https://api.spotify.com/v1/me/player/previous', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  async setVolume(vol: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.player && this.ready && !this.muted) {
      this.player.setVolume(this.volume).catch(() => {});
    }
  }

  async toggleMute(): Promise<boolean> {
    this.muted = !this.muted;
    if (this.player && this.ready) {
      this.player.setVolume(this.muted ? 0 : this.volume).catch(() => {});
    }
    return this.muted;
  }

  isMuted(): boolean { return this.muted; }

  setVolumeBoost(multiplier: number): void {
    const vol = Math.min(1, 0.5 * multiplier);
    if (this.player && this.ready && !this.muted) {
      this.player.setVolume(vol).catch(() => {});
    }
  }

  onTrackChanged(cb: TrackChangeCallback): void {
    this.onTrackChange = cb;
  }

  isReady(): boolean { return this.ready; }

  destroy(): void {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
    }
    this.ready = false;
    this.deviceId = null;
  }
}
