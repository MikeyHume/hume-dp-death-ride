import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

const MUSIC_UI_SCALE = 1;             // uniform scale from upper-right corner
const SPOTIFY_URL = 'https://open.spotify.com/artist/5uzPIJDzWAujemRDKiJMRj';
const YT_THUMB_WIDTH = 171;
const YT_THUMB_HEIGHT = 96;

export class MusicPlayer {
  private scene: Phaser.Scene;
  private titleMusic: any = null;
  private ytPlayer: any = null;
  private ytReady: boolean = false;
  private pendingPlay: boolean = false;
  private playlistStarted: boolean = false;
  private container!: HTMLDivElement;
  private muteBtn!: HTMLButtonElement;
  private titleMuted: boolean = false;
  private thumbnailImg!: HTMLImageElement;
  private titleClip!: HTMLDivElement;
  private trackTitle!: HTMLAnchorElement;
  private scrollAnim: number = 0;
  private canvasOverlay!: HTMLDivElement;
  private overlaySyncAnim: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createUI();
    this.loadYouTubeAPI();
  }

  /** Start the in-game title music. Call from a user gesture handler. */
  startTitleMusic(): void {
    if (this.titleMusic) return; // already playing
    if (this.scene.cache.audio.exists('title-music')) {
      this.titleMusic = this.scene.sound.add('title-music', { loop: true, volume: 0.5 });
      this.titleMusic.play();
    }
    // Show the music player controls
    this.container.style.display = 'flex';
    // Show intro track thumbnail and title
    this.thumbnailImg.src = TUNING.INTRO_TRACK_THUMBNAIL;
    this.thumbnailImg.style.width = `${YT_THUMB_HEIGHT}px`;
    this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT}px`;
    this.thumbnailImg.style.display = 'block';
    this.trackTitle.textContent = TUNING.INTRO_TRACK_TITLE;
    this.titleClip.style.display = 'block';
    this.startTitleScroll();
  }

  private createUI(): void {
    // Create an overlay div that exactly tracks the game canvas position/size
    // so the music player stays within the 16:9 frame regardless of window aspect ratio
    const canvas = this.scene.game.canvas;

    this.canvasOverlay = document.createElement('div');
    Object.assign(this.canvasOverlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '10000',
      overflow: 'hidden',
    });
    document.body.appendChild(this.canvasOverlay);

    const syncOverlay = () => {
      const rect = canvas.getBoundingClientRect();
      this.canvasOverlay.style.top = rect.top + 'px';
      this.canvasOverlay.style.left = rect.left + 'px';
      this.canvasOverlay.style.width = rect.width + 'px';
      this.canvasOverlay.style.height = rect.height + 'px';
      this.overlaySyncAnim = requestAnimationFrame(syncOverlay);
    };
    this.overlaySyncAnim = requestAnimationFrame(syncOverlay);

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '40px',
      right: '40px',
      display: 'none',
      alignItems: 'flex-start',
      gap: '14px',
      pointerEvents: 'auto',
      transform: `scale(${MUSIC_UI_SCALE})`,
      transformOrigin: 'top right',
    });
    // Prevent clicks from reaching the Phaser canvas
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.canvasOverlay.appendChild(this.container);

    // Thumbnail (left side) — links to Spotify
    const thumbLink = document.createElement('a');
    thumbLink.href = SPOTIFY_URL;
    thumbLink.target = '_blank';
    thumbLink.rel = 'noopener noreferrer';
    thumbLink.style.display = 'flex';
    thumbLink.style.flexShrink = '0';

    this.thumbnailImg = document.createElement('img');
    Object.assign(this.thumbnailImg.style, {
      width: `${YT_THUMB_HEIGHT}px`,   // start square for intro track
      height: `${YT_THUMB_HEIGHT}px`,
      objectFit: 'cover',
      borderRadius: '4px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      display: 'none', // hidden until track info available
    });
    thumbLink.appendChild(this.thumbnailImg);

    // Right side: track title stacked above controls (fixed width)
    const rightColumn = document.createElement('div');
    const RIGHT_COL_WIDTH = 232; // wide enough for 2x title text
    Object.assign(rightColumn.style, {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: `${RIGHT_COL_WIDTH}px`,
      height: `${YT_THUMB_HEIGHT}px`,
      flexShrink: '0',
    });

    // Fixed-width clip container for scrolling title
    this.titleClip = document.createElement('div');
    Object.assign(this.titleClip.style, {
      width: `${RIGHT_COL_WIDTH}px`,
      overflow: 'hidden',
      display: 'none', // hidden until track info available
    });

    this.trackTitle = document.createElement('a');
    this.trackTitle.href = SPOTIFY_URL;
    this.trackTitle.target = '_blank';
    this.trackTitle.rel = 'noopener noreferrer';
    Object.assign(this.trackTitle.style, {
      color: 'white',
      fontSize: '24px',
      fontFamily: 'Early GameBoy',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      display: 'inline-block',
    });
    this.trackTitle.addEventListener('mouseenter', () => {
      this.trackTitle.style.textDecoration = 'underline';
    });
    this.trackTitle.addEventListener('mouseleave', () => {
      this.trackTitle.style.textDecoration = 'none';
    });
    this.titleClip.appendChild(this.trackTitle);

    // Control buttons
    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, { display: 'flex', justifyContent: 'center', gap: '14px' });
    const prevBtn = this.createButton('\u23EE', () => this.prev());
    const nextBtn = this.createButton('\u23ED', () => this.next());
    this.muteBtn = this.createButton('\uD83D\uDD0A', () => this.toggleMute());
    const igBtn = this.createButton('', () => window.open('https://www.instagram.com/deathpixiexx/?hl=en', '_blank'));
    igBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>';
    Object.assign(igBtn.style, { display: 'flex', alignItems: 'center', justifyContent: 'center' });
    btnContainer.append(prevBtn, nextBtn, this.muteBtn, igBtn);

    rightColumn.append(this.titleClip, btnContainer);
    this.container.append(thumbLink, rightColumn);

    // Hidden YouTube player container (1x1 pixel, bottom-right corner)
    const ytDiv = document.createElement('div');
    ytDiv.id = 'yt-player';
    Object.assign(ytDiv.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      bottom: '0',
      right: '0',
      overflow: 'hidden',
    });
    document.body.appendChild(ytDiv);
  }

  private createButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.tabIndex = -1;
    Object.assign(btn.style, {
      background: 'rgba(0, 0, 0, 0.8)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      color: 'white',
      fontSize: '20px',
      width: '44px',
      height: '44px',
      cursor: 'pointer',
      borderRadius: '4px',
      padding: '0',
    });
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(60, 60, 60, 0.9)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(0, 0, 0, 0.8)';
    });
    return btn;
  }

  private loadYouTubeAPI(): void {
    (window as any).onYouTubeIframeAPIReady = () => {
      this.createYTPlayer();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      console.warn('YouTube IFrame API failed to load');
    };
    document.head.appendChild(script);
  }

  private createYTPlayer(): void {
    const YT = (window as any).YT;
    if (!YT) return;

    this.ytPlayer = new YT.Player('yt-player', {
      width: '1',
      height: '1',
      playerVars: {
        origin: window.location.origin,
        listType: 'playlist',
        list: 'PLgz1oMMp1awLI_wrJTMblR6dRTMDcwaGr',
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        loop: 1,
      },
      events: {
        onReady: () => {
          this.ytReady = true;
          if (this.pendingPlay) {
            this.pendingPlay = false;
            this.startPlaylist();
          }
        },
        onStateChange: (event: any) => {
          // Restart playlist if it ends (state 0 = ended)
          if (event.data === 0 && this.playlistStarted) {
            this.ytPlayer.setShuffle(true);
            this.ytPlayer.playVideo();
          }
          // Update track info when a video starts playing (state 1 = playing)
          if (event.data === 1) {
            this.updateTrackInfo();
          }
        },
      },
    });
  }

  /** Stop title music and start YouTube playlist. Call from a user gesture handler. */
  switchToPlaylist(): void {
    if (this.playlistStarted) return;
    this.playlistStarted = true;

    // Stop title music
    if (this.titleMusic) {
      this.titleMusic.stop();
      this.titleMusic.destroy();
      this.titleMusic = null;
    }

    // Start YouTube
    if (this.ytReady) {
      this.startPlaylist();
    } else {
      this.pendingPlay = true;
    }
  }

  private startPlaylist(): void {
    if (!this.ytPlayer) return;
    this.ytPlayer.setVolume(50);
    this.ytPlayer.playVideo();
    // Let the first song play for 5 seconds, then shuffle and skip
    setTimeout(() => {
      if (this.ytPlayer && this.playlistStarted) {
        this.ytPlayer.setShuffle(true);
        this.ytPlayer.nextVideo();
      }
    }, 5500);
  }

  private updateTrackInfo(): void {
    if (!this.ytPlayer) return;
    try {
      const videoData = this.ytPlayer.getVideoData();
      if (videoData && videoData.video_id) {
        // Switch to YouTube 16:9 thumbnail dimensions
        this.thumbnailImg.style.width = `${YT_THUMB_WIDTH}px`;
        this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT}px`;
        this.thumbnailImg.src = `https://img.youtube.com/vi/${videoData.video_id}/mqdefault.jpg`;
        this.thumbnailImg.style.display = 'block';
        this.trackTitle.textContent = videoData.title || 'Unknown Track';
        this.titleClip.style.display = 'block';
        this.startTitleScroll();
      }
    } catch (_) {
      // YouTube API not ready yet
    }
  }

  private startTitleScroll(): void {
    // Stop any existing scroll
    if (this.scrollAnim) cancelAnimationFrame(this.scrollAnim);
    this.trackTitle.style.transform = 'translateX(0)';

    // Wait a frame for the DOM to measure text width
    requestAnimationFrame(() => {
      const textWidth = this.trackTitle.scrollWidth;
      const clipWidth = this.titleClip.clientWidth;

      if (textWidth <= clipWidth) {
        // Title fits — no scrolling needed
        return;
      }

      const scrollDistance = textWidth - clipWidth;
      const speed = 30; // px per second
      const pauseMs = 2000; // pause at start before scrolling
      let offset = 0;
      let pausing = true;
      let pauseStart = performance.now();
      let lastTime = performance.now();

      const tick = (now: number) => {
        if (pausing) {
          if (now - pauseStart >= pauseMs) {
            pausing = false;
            lastTime = now;
          }
        } else {
          const dt = (now - lastTime) / 1000;
          lastTime = now;
          offset += speed * dt;

          if (offset >= scrollDistance) {
            // Reset to start and pause again
            offset = 0;
            pausing = true;
            pauseStart = now;
          }
        }
        this.trackTitle.style.transform = `translateX(-${offset}px)`;
        this.scrollAnim = requestAnimationFrame(tick);
      };
      this.scrollAnim = requestAnimationFrame(tick);
    });
  }

  private prev(): void {
    if (this.ytPlayer && this.playlistStarted) {
      this.ytPlayer.previousVideo();
      setTimeout(() => this.updateTrackInfo(), 500);
    }
  }

  private next(): void {
    if (this.ytPlayer && this.playlistStarted) {
      this.ytPlayer.nextVideo();
      setTimeout(() => this.updateTrackInfo(), 500);
    }
  }

  /** Boost or restore music volume (multiplier: 1.0 = normal, >1 = louder) */
  setVolumeBoost(multiplier: number): void {
    if (this.playlistStarted && this.ytPlayer && !this.ytPlayer.isMuted()) {
      this.ytPlayer.setVolume(Math.min(100, Math.round(50 * multiplier)));
    } else if (this.titleMusic && !this.titleMuted) {
      this.titleMusic.setVolume(0.5 * multiplier);
    }
  }

  private toggleMute(): void {
    if (this.playlistStarted && this.ytPlayer) {
      // Toggle YouTube mute
      if (this.ytPlayer.isMuted()) {
        this.ytPlayer.unMute();
        this.muteBtn.textContent = '\uD83D\uDD0A';
      } else {
        this.ytPlayer.mute();
        this.muteBtn.textContent = '\uD83D\uDD07';
      }
    } else if (this.titleMusic) {
      // Toggle title music mute
      this.titleMuted = !this.titleMuted;
      this.titleMusic.setVolume(this.titleMuted ? 0 : 0.5);
      this.muteBtn.textContent = this.titleMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    }
  }

  destroy(): void {
    if (this.scrollAnim) cancelAnimationFrame(this.scrollAnim);
    if (this.overlaySyncAnim) cancelAnimationFrame(this.overlaySyncAnim);
    if (this.titleMusic) {
      this.titleMusic.stop();
      this.titleMusic.destroy();
    }
    if (this.ytPlayer) {
      this.ytPlayer.destroy();
    }
    this.canvasOverlay.remove();
    const ytEl = document.getElementById('yt-player');
    if (ytEl) ytEl.remove();
  }
}
