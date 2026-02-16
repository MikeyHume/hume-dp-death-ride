import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isConnected, checkPremium } from './SpotifyAuthSystem';
import { SpotifyPlayerSystem } from './SpotifyPlayerSystem';

const MUSIC_UI_SCALE = 1;             // uniform scale from upper-right corner
const COUNTDOWN_VOLUME = 3.0;         // countdown music volume (0.0–1.0+)
const CROSSFADE_LEAD_S = 3.0;        // fade duration in seconds (audio audibly fades over this)
const CROSSFADE_STARTUP_S = 2.0;    // estimated startup overhead for startPlaylist() (shuffle+play+skip+wait)
const CROSSFADE_START_DB = -6;       // starting volume in dB (0 = full, -12 ≈ 25%)
const SPOTIFY_URL = 'https://open.spotify.com/artist/5uzPIJDzWAujemRDKiJMRj';
const YT_THUMB_WIDTH = 171;
const YT_THUMB_HEIGHT = 96;

export type MusicSource = 'youtube' | 'spotify';

export class MusicPlayer {
  private scene: Phaser.Scene;
  private titleMusic: any = null;
  private ytPlayer: any = null;
  private ytReady: boolean = false;
  private pendingPlay: boolean = false;
  private playlistStarted: boolean = false;
  private container!: HTMLDivElement;
  private muteBtn!: HTMLButtonElement;
  private muteBtnImg!: HTMLImageElement;
  private titleMuted: boolean = false;
  private thumbnailImg!: HTMLImageElement;
  private titleClip!: HTMLDivElement;
  private trackTitle!: HTMLAnchorElement;
  private scrollAnim: number = 0;
  private canvasOverlay!: HTMLDivElement;
  private overlaySyncAnim: number = 0;
  private rightColumnEl!: HTMLDivElement;
  private compact: boolean = true;
  private hovered: boolean = false;
  private cursorOver: boolean = false;

  // Phaser sprites that mirror HTML buttons (rendered through CRT shader)
  private btnSprites: Phaser.GameObjects.Image[] = [];
  private btnElements: HTMLButtonElement[] = [];
  private muteBtnSprite!: Phaser.GameObjects.Image;

  // Phaser objects mirroring thumbnail and title (rendered through CRT shader)
  private thumbSprite!: Phaser.GameObjects.Image;
  private thumbTextureId: number = 0;
  private titleText!: Phaser.GameObjects.Text;
  private titleMaskGfx!: Phaser.GameObjects.Graphics;
  private lastGameFontSize: number = 0;

  // Dual-source
  private source: MusicSource = 'youtube';
  private spotifyPlayer: SpotifyPlayerSystem | null = null;
  private countdownMusic: Phaser.Sound.BaseSound | null = null;
  private crossfadeTimer: number = 0;
  private crossfadeAnim: number = 0;


  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createUI();
    // YouTube API loading is deferred until switchToPlaylist() to speed up initial boot
    this.tryInitSpotify();

    // Re-try Spotify init when user completes auth in a new tab
    scene.events.on('spotify-auth-changed', () => this.tryInitSpotify());
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
    const s = TUNING.MUSIC_UI_THUMB_SCALE;
    this.thumbnailImg.src = TUNING.INTRO_TRACK_THUMBNAIL;
    this.thumbnailImg.style.width = `${YT_THUMB_HEIGHT * s}px`;
    this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT * s}px`;
    this.thumbnailImg.style.display = 'block';
    this.trackTitle.textContent = TUNING.INTRO_TRACK_TITLE;
    this.titleClip.style.display = 'block';
    this.startTitleScroll();
    if (this.compact) {
      this.collapseUI(false);
    }
  }

  getSource(): MusicSource { return this.source; }

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
      this.syncBtnSprites(rect);
      this.overlaySyncAnim = requestAnimationFrame(syncOverlay);
    };
    this.overlaySyncAnim = requestAnimationFrame(syncOverlay);

    this.container = document.createElement('div');
    const topPct = (TUNING.MUSIC_UI_PAD_TOP / TUNING.GAME_HEIGHT) * 100;
    const rightPct = (TUNING.MUSIC_UI_PAD_RIGHT / TUNING.GAME_WIDTH) * 100;
    const widthPct = (TUNING.MUSIC_UI_WIDTH / TUNING.GAME_WIDTH) * 100;
    Object.assign(this.container.style, {
      position: 'absolute',
      top: `${topPct}%`,
      right: `${rightPct}%`,
      width: `${widthPct}%`,
      display: 'none',
      alignItems: 'flex-start',
      gap: '14px',
      pointerEvents: 'auto',
      transform: `scale(${MUSIC_UI_SCALE})`,
      transformOrigin: 'top right',
      overflow: 'hidden',
      transition: 'width 0.4s ease, gap 0.4s ease',
    });
    // Prevent clicks from reaching the Phaser canvas
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('mouseenter', () => {
      this.cursorOver = true;
      if (!this.compact) return;
      this.hovered = true;
      this.expandUI();
    });
    this.container.addEventListener('mouseleave', () => {
      this.cursorOver = false;
      if (!this.compact) return;
      this.hovered = false;
      this.collapseUI();
    });
    this.canvasOverlay.appendChild(this.container);

    // Thumbnail (left side) — links to Spotify
    const thumbLink = document.createElement('a');
    thumbLink.href = SPOTIFY_URL;
    thumbLink.target = '_blank';
    thumbLink.rel = 'noopener noreferrer';
    thumbLink.style.display = 'flex';
    thumbLink.style.flexShrink = '0';

    const thumbScale = TUNING.MUSIC_UI_THUMB_SCALE;
    this.thumbnailImg = document.createElement('img');
    Object.assign(this.thumbnailImg.style, {
      width: `${YT_THUMB_HEIGHT * thumbScale}px`,   // start square for intro track
      height: `${YT_THUMB_HEIGHT * thumbScale}px`,
      objectFit: 'cover',
      borderRadius: '4px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      display: 'none', // hidden until track info available
      opacity: '0',    // invisible — Phaser sprite renders the visual through CRT
    });
    this.thumbnailImg.crossOrigin = 'anonymous';
    thumbLink.appendChild(this.thumbnailImg);

    // Right side: track title stacked above controls (height matches thumbnail)
    const rightColumn = document.createElement('div');
    Object.assign(rightColumn.style, {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      flex: '1',
      minWidth: '0',
      overflow: 'hidden',
      transition: 'opacity 0.4s ease',
    });
    this.rightColumnEl = rightColumn;

    // Fixed-width clip container for scrolling title
    this.titleClip = document.createElement('div');
    Object.assign(this.titleClip.style, {
      overflow: 'hidden',
      display: 'none', // hidden until track info available
    });

    this.trackTitle = document.createElement('a');
    this.trackTitle.href = SPOTIFY_URL;
    this.trackTitle.target = '_blank';
    this.trackTitle.rel = 'noopener noreferrer';
    Object.assign(this.trackTitle.style, {
      color: 'transparent', // invisible — Phaser text renders the visual through CRT
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

    // Control buttons row with source indicator
    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '14px', alignItems: 'center' });
    const prevBtn = this.createIconButton('ui/skip.png', () => this.prev(), true);
    const nextBtn = this.createIconButton('ui/skip.png', () => this.next());
    this.muteBtn = this.createIconButton('ui/unmuted.png', () => this.toggleMute());
    this.muteBtnImg = this.muteBtn.querySelector('img') as HTMLImageElement;
    const igBtn = this.createIconButton('ui/insta.png', () => window.open('https://www.instagram.com/deathpixiexx/?hl=en', '_blank'));

    btnContainer.append(prevBtn, nextBtn, this.muteBtn, igBtn);

    rightColumn.append(this.titleClip, btnContainer);
    this.container.append(thumbLink, rightColumn);

    // Phaser sprites that render through CRT shader (HTML images stay invisible click targets)
    const prevSprite = this.scene.add.image(0, 0, 'ui-skip').setFlipX(true);
    const nextSprite = this.scene.add.image(0, 0, 'ui-skip');
    this.muteBtnSprite = this.scene.add.image(0, 0, 'ui-unmuted');
    const igSprite = this.scene.add.image(0, 0, 'ui-insta');
    this.btnSprites = [prevSprite, nextSprite, this.muteBtnSprite, igSprite];
    this.btnElements = [prevBtn, nextBtn, this.muteBtn, igBtn];
    for (let i = 0; i < this.btnSprites.length; i++) {
      this.btnSprites[i].setDepth(1000).setScrollFactor(0).setVisible(false).setAlpha(0);
      const sprite = this.btnSprites[i];
      this.btnElements[i].addEventListener('mouseenter', () => { sprite.setAlpha(0.7); });
      this.btnElements[i].addEventListener('mouseleave', () => { sprite.setAlpha(this.compact && !this.hovered ? 0 : 1); });
    }

    // Thumbnail CRT sprite (mirrors HTML thumbnail through CRT shader)
    this.thumbSprite = this.scene.add.image(0, 0, '__DEFAULT')
      .setDepth(1000).setScrollFactor(0).setVisible(false);
    this.thumbnailImg.addEventListener('load', () => this.updateThumbTexture());

    // Song title CRT text (mirrors scrolling track title through CRT shader)
    this.titleMaskGfx = this.scene.add.graphics().setVisible(false);
    this.titleText = this.scene.add.text(0, 0, '', {
      fontFamily: '"Early GameBoy"',
      fontSize: '24px',
      color: '#ffffff',
    }).setDepth(1000).setScrollFactor(0).setOrigin(0, 0.5).setVisible(false).setAlpha(0);
    this.titleText.setMask(this.titleMaskGfx.createGeometryMask());

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

  private createIconButton(src: string, onClick: () => void, mirror: boolean = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.tabIndex = -1;
    Object.assign(btn.style, {
      background: 'none',
      border: 'none',
      padding: '0',
      width: '44px',
      height: '44px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    const img = document.createElement('img');
    img.src = src;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      transform: mirror ? 'scaleX(-1)' : 'none',
      opacity: '0', // invisible — Phaser sprite renders the visual through CRT
    });
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      if (this.scene.cache.audio.exists('sfx-click')) this.scene.sound.play('sfx-click');
      onClick();
    });
    btn.addEventListener('mouseenter', () => {
      if (this.scene.cache.audio.exists('sfx-hover')) this.scene.sound.play('sfx-hover');
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
            this.startYTPlaylist();
          }
        },
        onStateChange: (event: any) => {
          // Restart playlist if it ends (state 0 = ended)
          if (event.data === 0 && this.playlistStarted && this.source === 'youtube') {
            this.ytPlayer.setShuffle(true);
            this.ytPlayer.playVideo();
          }
          // Update track info when a video starts playing (state 1 = playing)
          if (event.data === 1 && this.source === 'youtube') {
            this.updateYTTrackInfo();
          }
        },
      },
    });
  }

  /** Attempt to initialize Spotify playback if connected + premium. Non-blocking. */
  private tryInitSpotify(): void {
    if (!isConnected()) return;

    checkPremium().then(async (isPremium) => {
      if (!isPremium) return;

      const sp = new SpotifyPlayerSystem();
      const ok = await sp.init();
      if (!ok) {
        console.warn('MusicPlayer: Spotify SDK init failed, staying on YouTube');
        sp.destroy();
        return;
      }

      this.spotifyPlayer = sp;

      // Wire track change updates
      sp.onTrackChanged((track) => {
        if (this.source !== 'spotify') return;
        // Square album art
        const s = TUNING.MUSIC_UI_THUMB_SCALE;
        this.thumbnailImg.style.width = `${YT_THUMB_HEIGHT * s}px`;
        this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT * s}px`;
        if (track.albumImageUrl) {
          this.thumbnailImg.src = track.albumImageUrl;
          this.thumbnailImg.style.display = 'block';
        }
        const display = track.artist ? `${track.name} - ${track.artist}` : track.name;
        this.trackTitle.textContent = display;
        this.titleClip.style.display = 'block';
        this.startTitleScroll();
        if (this.compact && !this.hovered) {
          this.collapseUI(false);
        }
      });

      // If playlist already started, switch now
      if (this.playlistStarted) {
        this.switchSourceToSpotify();
      }
    }).catch(() => {
      // Premium check failed — stay on YouTube silently
    });
  }

  /** Stop title music and start playlist. Call from a user gesture handler. */
  switchToPlaylist(): void {
    if (this.playlistStarted) return;
    this.playlistStarted = true;

    // Stop title music
    if (this.titleMusic) {
      this.titleMusic.stop();
      this.titleMusic.destroy();
      this.titleMusic = null;
    }

    // If Spotify player is ready, use it
    if (this.spotifyPlayer?.isReady()) {
      this.switchSourceToSpotify();
      return;
    }

    // Otherwise start YouTube (load API on first need)
    if (this.ytReady) {
      this.startYTPlaylist();
    } else {
      this.pendingPlay = true;
      this.loadYouTubeAPI();
    }
  }

  private switchSourceToSpotify(): void {
    if (!this.spotifyPlayer) return;
    this.source = 'spotify';

    // Mute YouTube if it was playing
    if (this.ytPlayer) {
      try { this.ytPlayer.mute(); this.ytPlayer.pauseVideo(); } catch {}
    }

    // Play countdown audio first, crossfade Spotify in before it ends
    if (this.scene.cache.audio.exists('countdown-music')) {
      this.countdownMusic = this.scene.sound.add('countdown-music', { loop: false, volume: COUNTDOWN_VOLUME });
      this.countdownMusic.play();

      // Schedule Spotify early enough that startup + fade finishes before countdown ends
      const duration = (this.countdownMusic as any).duration || 0;
      const leadMs = Math.max(0, duration - CROSSFADE_LEAD_S - CROSSFADE_STARTUP_S) * 1000;
      let spotifyStarted = false;

      this.crossfadeTimer = window.setTimeout(() => {
        spotifyStarted = true;
        this.startSpotifyWithFade();
      }, leadMs);

      this.countdownMusic.once('complete', () => {
        this.countdownMusic = null;
        // Fallback: if the timer hasn't fired yet, start normally
        if (!spotifyStarted) {
          window.clearTimeout(this.crossfadeTimer);
          this.startSpotifyPlaylist();
        }
      });
    } else {
      this.startSpotifyPlaylist();
    }
  }

  /** Start Spotify and fade in from CROSSFADE_START_DB to 0 dB over CROSSFADE_LEAD_S. */
  private async startSpotifyWithFade(): Promise<void> {
    if (!this.spotifyPlayer) return;

    const ok = await this.spotifyPlayer.startPlaylist();
    if (!ok) {
      // Fallback handled by startSpotifyPlaylist path
      this.startSpotifyFallback();
      return;
    }

    // Fade from -12 dB to 0 dB (relative to the player's base volume of 0.5)
    const startGain = Math.pow(10, CROSSFADE_START_DB / 20); // ~0.25
    const baseVol = 0.5;
    const fadeMs = CROSSFADE_LEAD_S * 1000;
    const startTime = performance.now();

    this.spotifyPlayer.setVolume(startGain * baseVol);

    const step = () => {
      const t = Math.min(1, (performance.now() - startTime) / fadeMs);
      const gain = startGain + (1 - startGain) * t;
      this.spotifyPlayer?.setVolume(gain * baseVol);
      if (t < 1) {
        this.crossfadeAnim = requestAnimationFrame(step);
      }
    };
    this.crossfadeAnim = requestAnimationFrame(step);
  }

  private startSpotifyFallback(): void {
    if (!this.playlistStarted) return;
    if (this.ytReady) this.startYTPlaylist();
    else {
      this.pendingPlay = true;
      this.loadYouTubeAPI();
    }
  }

  private async startSpotifyPlaylist(): Promise<void> {
    if (!this.spotifyPlayer) return;
    const ok = await this.spotifyPlayer.startPlaylist();
    if (!ok) {
      console.warn('MusicPlayer: Spotify playlist start failed, falling back to YouTube');
      if (!this.playlistStarted) return;
      if (this.ytReady) this.startYTPlaylist();
      else {
        this.pendingPlay = true;
        this.loadYouTubeAPI();
      }
    }
  }

  private startYTPlaylist(): void {
    if (!this.ytPlayer) return;
    this.source = 'youtube';
    this.ytPlayer.setVolume(50);
    this.ytPlayer.playVideo();
    // Let the first song play for 5 seconds, then shuffle and skip
    setTimeout(() => {
      if (this.ytPlayer && this.playlistStarted && this.source === 'youtube') {
        this.ytPlayer.setShuffle(true);
        this.ytPlayer.nextVideo();
      }
    }, 5500);
  }

  private updateYTTrackInfo(): void {
    if (!this.ytPlayer || this.source !== 'youtube') return;
    try {
      const videoData = this.ytPlayer.getVideoData();
      if (videoData && videoData.video_id) {
        // Switch to YouTube 16:9 thumbnail dimensions
        const s = TUNING.MUSIC_UI_THUMB_SCALE;
        this.thumbnailImg.style.width = `${YT_THUMB_WIDTH * s}px`;
        this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT * s}px`;
        this.thumbnailImg.src = `https://img.youtube.com/vi/${videoData.video_id}/mqdefault.jpg`;
        this.thumbnailImg.style.display = 'block';
        this.trackTitle.textContent = videoData.title || 'Unknown Track';
        this.titleClip.style.display = 'block';
        this.startTitleScroll();
        if (this.compact && !this.hovered) {
          this.collapseUI(false);
        }
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
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.prev();
    } else if (this.ytPlayer && this.playlistStarted) {
      this.ytPlayer.previousVideo();
      setTimeout(() => this.updateYTTrackInfo(), 500);
    }
  }

  private next(): void {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.next();
    } else if (this.ytPlayer && this.playlistStarted) {
      this.ytPlayer.nextVideo();
      setTimeout(() => this.updateYTTrackInfo(), 500);
    }
  }

  /** Boost or restore music volume (multiplier: 1.0 = normal, >1 = louder) */
  setVolumeBoost(multiplier: number): void {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.setVolumeBoost(multiplier);
    } else if (this.playlistStarted && this.ytPlayer && !this.ytPlayer.isMuted()) {
      this.ytPlayer.setVolume(Math.min(100, Math.round(50 * multiplier)));
    } else if (this.titleMusic && !this.titleMuted) {
      this.titleMusic.setVolume(0.5 * multiplier);
    }
  }

  private toggleMute(): void {
    if (this.source === 'spotify' && this.spotifyPlayer && this.playlistStarted) {
      const muted = this.spotifyPlayer.toggleMute();
      // toggleMute returns a Promise<boolean> — handle async
      if (muted instanceof Promise) {
        muted.then((m) => {
          this.muteBtnImg.src = m ? 'ui/muted.png' : 'ui/unmuted.png';
          this.muteBtnSprite.setTexture(m ? 'ui-muted' : 'ui-unmuted');
        });
      }
    } else if (this.playlistStarted && this.ytPlayer) {
      // Toggle YouTube mute
      if (this.ytPlayer.isMuted()) {
        this.ytPlayer.unMute();
        this.muteBtnImg.src = 'ui/unmuted.png';
        this.muteBtnSprite.setTexture('ui-unmuted');
      } else {
        this.ytPlayer.mute();
        this.muteBtnImg.src = 'ui/muted.png';
        this.muteBtnSprite.setTexture('ui-muted');
      }
    } else if (this.titleMusic) {
      // Toggle title music mute
      this.titleMuted = !this.titleMuted;
      this.titleMusic.setVolume(this.titleMuted ? 0 : 0.5);
      this.muteBtnImg.src = this.titleMuted ? 'ui/muted.png' : 'ui/unmuted.png';
      this.muteBtnSprite.setTexture(this.titleMuted ? 'ui-muted' : 'ui-unmuted');
    }
  }

  isCursorOverUI(): boolean {
    return this.cursorOver;
  }

  setCompact(value: boolean): void {
    this.compact = value;
    if (value && !this.hovered) {
      this.collapseUI();
    } else {
      this.expandUI();
    }
  }

  private collapseUI(animate: boolean = true): void {
    if (!animate) {
      this.container.style.transition = 'none';
      this.rightColumnEl.style.transition = 'none';
    }

    const thumbW = parseFloat(this.thumbnailImg.style.width) || (YT_THUMB_HEIGHT * TUNING.MUSIC_UI_THUMB_SCALE);
    const overlayW = this.canvasOverlay.offsetWidth || 1;
    const collapsedPct = (thumbW / overlayW) * 100;

    this.container.style.width = `${collapsedPct}%`;
    this.container.style.gap = '0px';
    this.rightColumnEl.style.opacity = '0';

    // Fade Phaser button sprites and title text to match
    for (const s of [...this.btnSprites, this.titleText]) {
      if (animate) {
        this.scene.tweens.killTweensOf(s);
        this.scene.tweens.add({ targets: s, alpha: 0, duration: 400, ease: 'Sine.easeInOut' });
      } else {
        s.setAlpha(0);
      }
    }

    if (!animate) {
      void this.container.offsetHeight; // force reflow
      this.container.style.transition = 'width 0.4s ease, gap 0.4s ease';
      this.rightColumnEl.style.transition = 'opacity 0.4s ease';
    }
  }

  private expandUI(): void {
    const widthPct = (TUNING.MUSIC_UI_WIDTH / TUNING.GAME_WIDTH) * 100;
    this.container.style.width = `${widthPct}%`;
    this.container.style.gap = '14px';
    this.rightColumnEl.style.opacity = '1';

    // Fade Phaser button sprites and title text in
    for (const s of [...this.btnSprites, this.titleText]) {
      this.scene.tweens.killTweensOf(s);
      this.scene.tweens.add({ targets: s, alpha: 1, duration: 400, ease: 'Sine.easeInOut' });
    }
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      for (const s of this.btnSprites) s.setVisible(false);
      this.thumbSprite.setVisible(false);
      this.titleText.setVisible(false);
    }
  }

  /** Load thumbnail image into a Phaser canvas texture for CRT rendering */
  private updateThumbTexture(): void {
    const img = this.thumbnailImg;
    if (!img.naturalWidth) return;

    try {
      this.thumbTextureId++;
      const key = `music-thumb-${this.thumbTextureId}`;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);

      this.scene.textures.addCanvas(key, canvas);
      this.thumbSprite.setTexture(key);

      // Clean up previous texture
      const oldKey = `music-thumb-${this.thumbTextureId - 1}`;
      if (this.thumbTextureId > 1 && this.scene.textures.exists(oldKey)) {
        this.scene.textures.remove(oldKey);
      }
    } catch {
      // CORS tainting — fall back to visible HTML thumbnail
      this.thumbnailImg.style.opacity = '1';
    }
  }

  /** Map HTML element positions to Phaser game coordinates and update CRT sprites */
  private syncBtnSprites(overlayRect: DOMRect): void {
    const containerVisible = this.container.style.display !== 'none';
    const ow = overlayRect.width || 1;
    const oh = overlayRect.height || 1;

    // --- Button sprites ---
    for (let i = 0; i < this.btnSprites.length; i++) {
      if (!containerVisible) {
        this.btnSprites[i].setVisible(false);
        continue;
      }
      const btnRect = this.btnElements[i].getBoundingClientRect();
      const cx = btnRect.left + btnRect.width / 2 - overlayRect.left;
      const cy = btnRect.top + btnRect.height / 2 - overlayRect.top;
      const gameX = (cx / ow) * TUNING.GAME_WIDTH;
      const gameY = (cy / oh) * TUNING.GAME_HEIGHT;
      const gameSize = (btnRect.width / ow) * TUNING.GAME_WIDTH;
      this.btnSprites[i].setPosition(gameX, gameY);
      this.btnSprites[i].setDisplaySize(gameSize, gameSize);
      this.btnSprites[i].setVisible(true);
    }

    // --- Thumbnail sprite ---
    const thumbVisible = containerVisible && this.thumbnailImg.style.display !== 'none' && this.thumbTextureId > 0;
    if (thumbVisible) {
      const tr = this.thumbnailImg.getBoundingClientRect();
      const tcx = tr.left + tr.width / 2 - overlayRect.left;
      const tcy = tr.top + tr.height / 2 - overlayRect.top;
      this.thumbSprite.setPosition((tcx / ow) * TUNING.GAME_WIDTH, (tcy / oh) * TUNING.GAME_HEIGHT);
      this.thumbSprite.setDisplaySize((tr.width / ow) * TUNING.GAME_WIDTH, (tr.height / oh) * TUNING.GAME_HEIGHT);
      this.thumbSprite.setVisible(true);
    } else {
      this.thumbSprite.setVisible(false);
    }

    // --- Title text ---
    const titleVisible = containerVisible && this.titleClip.style.display !== 'none';
    if (titleVisible) {
      // Sync text content
      const newText = this.trackTitle.textContent || '';
      if (this.titleText.text !== newText) {
        this.titleText.setText(newText);
      }

      // Scale font size to game coordinates (only update when changed)
      const scale = TUNING.GAME_WIDTH / ow;
      const gameFontSize = Math.round(24 * scale);
      if (gameFontSize !== this.lastGameFontSize) {
        this.lastGameFontSize = gameFontSize;
        this.titleText.setFontSize(gameFontSize);
      }

      // Position text from HTML trackTitle bounding rect (includes scroll offset)
      const titleRect = this.trackTitle.getBoundingClientRect();
      const titleLeft = (titleRect.left - overlayRect.left) / ow * TUNING.GAME_WIDTH;
      const titleMidY = (titleRect.top + titleRect.height / 2 - overlayRect.top) / oh * TUNING.GAME_HEIGHT;
      this.titleText.setPosition(titleLeft, titleMidY);
      this.titleText.setVisible(true);

      // Update geometry mask to match titleClip bounds
      const clipRect = this.titleClip.getBoundingClientRect();
      const clipLeft = (clipRect.left - overlayRect.left) / ow * TUNING.GAME_WIDTH;
      const clipTop = (clipRect.top - overlayRect.top) / oh * TUNING.GAME_HEIGHT;
      const clipW = (clipRect.width / ow) * TUNING.GAME_WIDTH;
      const clipH = (clipRect.height / oh) * TUNING.GAME_HEIGHT;
      this.titleMaskGfx.clear();
      this.titleMaskGfx.fillStyle(0xffffff);
      this.titleMaskGfx.fillRect(clipLeft, clipTop, clipW, clipH);
    } else {
      this.titleText.setVisible(false);
    }
  }

  destroy(): void {
    for (const s of this.btnSprites) s.destroy();
    this.btnSprites.length = 0;
    this.thumbSprite.destroy();
    this.titleText.destroy();
    this.titleMaskGfx.destroy();
    if (this.crossfadeTimer) window.clearTimeout(this.crossfadeTimer);
    if (this.crossfadeAnim) cancelAnimationFrame(this.crossfadeAnim);
    if (this.scrollAnim) cancelAnimationFrame(this.scrollAnim);
    if (this.overlaySyncAnim) cancelAnimationFrame(this.overlaySyncAnim);
    if (this.titleMusic) {
      this.titleMusic.stop();
      this.titleMusic.destroy();
    }
    if (this.ytPlayer) {
      this.ytPlayer.destroy();
    }
    if (this.spotifyPlayer) {
      this.spotifyPlayer.destroy();
    }
    this.canvasOverlay.remove();
    const ytEl = document.getElementById('yt-player');
    if (ytEl) ytEl.remove();
  }
}
