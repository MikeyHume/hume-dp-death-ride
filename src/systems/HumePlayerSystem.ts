/**
 * Hume Player — HTML5 Audio playback for self-hosted music.
 * Mirrors SpotifyPlayerSystem API so MusicPlayer can route calls uniformly.
 * Audio files are streamed from Supabase Storage (public bucket).
 */

import { HUME_TRACKS, type HumeTrack } from '../config/humeManifest';

export interface HumeTrackInfo {
  name: string;
  artist: string;
  title: string;
  file: string;
  url: string;
}

type TrackChangeCallback = (track: HumeTrackInfo) => void;

export class HumePlayerSystem {
  private audio: HTMLAudioElement;
  private playlist: HumeTrack[] = [];
  private currentIndex: number = -1;
  private shuffled: boolean = true;
  private volume: number = 1.0;
  private muted: boolean = false;
  private ready: boolean = false;
  private onTrackChange: TrackChangeCallback | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    // Auto-advance to next track when current ends
    this.audio.addEventListener('ended', () => this.next());

    // Mark ready once we have a valid playlist
    this.buildPlaylist();
    this.ready = this.playlist.length > 0;
  }

  /** Build a shuffled copy of the full hume catalog. */
  private buildPlaylist(): void {
    this.playlist = [...HUME_TRACKS];
    if (this.shuffled) this.shuffle();
  }

  /** Fisher-Yates shuffle. */
  private shuffle(): void {
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
  }

  /** Start playing from the beginning of the shuffled playlist. */
  async startPlaylist(): Promise<boolean> {
    if (this.playlist.length === 0) return false;

    // Avoid repeating the same first track as last session
    const lastFirst = localStorage.getItem('dp_last_first_hume');
    if (lastFirst && this.playlist[0]?.file === lastFirst && this.playlist.length > 1) {
      // Move first track to a random position
      const moved = this.playlist.shift()!;
      const pos = 1 + Math.floor(Math.random() * (this.playlist.length));
      this.playlist.splice(pos, 0, moved);
    }

    this.currentIndex = 0;
    localStorage.setItem('dp_last_first_hume', this.playlist[0].file);
    return this.loadAndPlay();
  }

  /** Play a specific track by filename. */
  async playTrackByFile(filename: string): Promise<boolean> {
    const idx = this.playlist.findIndex(t => t.file === filename);
    if (idx === -1) {
      // Track not in current playlist — find in full catalog
      const track = HUME_TRACKS.find(t => t.file === filename);
      if (!track) return false;
      // Insert at current position and play
      this.playlist.splice(this.currentIndex + 1, 0, track);
      this.currentIndex++;
      return this.loadAndPlay();
    }
    this.currentIndex = idx;
    return this.loadAndPlay();
  }

  /** Load current track and start playback. */
  private async loadAndPlay(): Promise<boolean> {
    const track = this.playlist[this.currentIndex];
    if (!track) return false;

    this.audio.src = track.url;
    this.audio.volume = this.muted ? 0 : this.volume;

    try {
      await this.audio.play();
    } catch (err) {
      console.warn('HumePlayer: playback failed', err);
      return false;
    }

    this.fireTrackChange(track);
    return true;
  }

  private fireTrackChange(track: HumeTrack): void {
    if (this.onTrackChange) {
      this.onTrackChange({
        name: track.name,
        artist: track.artist,
        title: track.title,
        file: track.file,
        url: track.url,
      });
    }
  }

  async next(): Promise<void> {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;

    // Re-shuffle when we wrap around
    if (this.currentIndex === 0) this.shuffle();

    await this.loadAndPlay();
  }

  async prev(): Promise<void> {
    if (this.playlist.length === 0) return;
    // If more than 3s into current track, restart it
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      this.fireTrackChange(this.playlist[this.currentIndex]);
      return;
    }
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    await this.loadAndPlay();
  }

  async pause(): Promise<void> {
    this.audio.pause();
  }

  resume(): void {
    this.audio.play().catch(() => {});
  }

  togglePlayPause(): void {
    if (this.audio.paused) {
      this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.muted) {
      this.audio.volume = this.volume;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.audio.volume = this.muted ? 0 : this.volume;
    return this.muted;
  }

  isMuted(): boolean { return this.muted; }

  setVolumeBoost(vol: number): void {
    if (!this.muted) {
      this.audio.volume = Math.min(1, vol);
    }
  }

  /** Get current playback position (most accurate of all three sources). */
  getPosition(): { current: number; duration: number } {
    return {
      current: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
    };
  }

  /** Seek to a position in seconds. */
  seek(seconds: number): void {
    if (isFinite(seconds) && this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  /** Set playback rate for time dilation. */
  setPlaybackRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  /** Get the current track info. */
  getCurrentTrack(): HumeTrack | null {
    return this.playlist[this.currentIndex] ?? null;
  }

  onTrackChanged(cb: TrackChangeCallback): void {
    this.onTrackChange = cb;
  }

  isReady(): boolean { return this.ready; }
  isPaused(): boolean { return this.audio.paused; }

  /** Stop playback and release audio resources. */
  stop(): void {
    this.audio.pause();
    this.audio.src = '';
    this.currentIndex = -1;
  }

  destroy(): void {
    this.stop();
    this.audio.removeAttribute('src');
    this.onTrackChange = null;
  }
}
