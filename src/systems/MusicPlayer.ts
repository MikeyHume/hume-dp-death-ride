import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isConnected, checkPremium, getAccessToken } from './SpotifyAuthSystem';
import { SpotifyPlayerSystem } from './SpotifyPlayerSystem';
import { WMPPopup } from '../ui/WMPPopup';
import { PlaybackController } from './PlaybackController';
import { fetchAllTracks, type CatalogTrack } from './MusicCatalogService';
import { GAME_MODE } from '../config/gameMode';

const MUSIC_UI_SCALE = 1;             // uniform scale from upper-right corner
const MUSIC_BTN_SCALE = 1.5;           // scale multiplier for control buttons group (anchor: bottom-right)
const CROSSFADE_LEAD_S = 3.0;        // fade duration in seconds (audio audibly fades over this)
const CROSSFADE_STARTUP_S = 2.0;    // estimated startup overhead for startPlaylist() (shuffle+play+skip+wait)
const CROSSFADE_START_DB = -6;       // starting volume in dB (0 = full, -12 ≈ 25%)
const SPOTIFY_URL = 'https://open.spotify.com/artist/5uzPIJDzWAujemRDKiJMRj';
// Title-screen track IDs (streamed instead of local audio)
const TITLE_YT_VIDEO_ID = 'n5BsRaPlglc';
const TITLE_SPOTIFY_TRACK_ID = '19KIMjXBvqibE0QNq0kGjQ';
// YouTube video IDs that match the countdown audio — never start with these after shuffle
const YT_AVOID_FIRST_IDS = ['GZwNZU7AviA', 'EkPDn519DFs'];
const YT_THUMB_WIDTH = 171;
const YT_THUMB_HEIGHT = 96;

export type MusicSource = 'youtube' | 'spotify';

export class MusicPlayer {
  private scene: Phaser.Scene;
  private titleTrackPlaying: boolean = false;
  private pendingTitlePlay: boolean = false;
  private titlePlaylistLoaded: boolean = false;
  private lastYTVideoSync: number = 0;
  private ytPlayer: any = null;
  private ytReady: boolean = false;
  private pendingPlay: boolean = false;
  private playlistStarted: boolean = false;
  private lastSkipTime: number = 0;
  private container!: HTMLDivElement;
  private muteBtn!: HTMLButtonElement;
  private muteBtnImg!: HTMLImageElement;
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

  // Heart (favorite) button — separate from icon button pool (uses Text, not Image)
  private heartBtn!: HTMLButtonElement;
  private heartTextP!: Phaser.GameObjects.Text;
  private heartBounceT = 1;  // bounce progress (1 = idle)

  // Phaser background panel behind all music player elements
  private bgPanel!: Phaser.GameObjects.Rectangle;

  // Phaser objects mirroring thumbnail and title (rendered through CRT shader)
  private thumbSprite!: Phaser.GameObjects.Image;
  private thumbHoverOverlay!: Phaser.GameObjects.Rectangle;
  private thumbHovered: boolean = false;
  private thumbTextureId: number = 0;
  private titleText!: Phaser.GameObjects.Text;
  private titleMaskGfx!: Phaser.GameObjects.Graphics;
  private lastGameFontSize: number = 0;

  // Dual-source
  private source: MusicSource = 'youtube';
  private spotifyLoggedIn = false;          // true if logged into Spotify (regardless of premium)
  private spotifyPlayer: SpotifyPlayerSystem | null = null;
  private spotifyInitInProgress = false;
  private previewAudio: HTMLAudioElement | null = null; // for non-premium Spotify preview playback
  private currentAlbumImageUrl: string | null = null;  // album art for current Spotify track
  private currentTrackName: string = '';                // current track name only (no artist)
  private currentArtist: string = '';                  // current track artist name
  private currentSpotifyUrl: string | null = null;     // current track Spotify URL
  private currentTrackId: string | null = null;        // Spotify track ID of currently playing track
  private lastPlayedCatalog: CatalogTrack | null = null; // catalog track from library click (prevents YT clobbering)
  private userVolume = 0.69;                           // user's intended volume 0-1 (before master multiplier)
  private countdownMusic: Phaser.Sound.BaseSound | null = null;
  private crossfadeTimer: number = 0;
  private crossfadeAnim: number = 0;
  private revealTimer: Phaser.Time.TimerEvent | null = null;
  private ytAvoidCountdownTrack: boolean = false;
  private wmpPopup: WMPPopup | null = null;
  private playbackCtrl: PlaybackController;
  private onWMPOpenCb: (() => void) | null = null;
  private onWMPCloseCb: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.playbackCtrl = new PlaybackController();
    this.playbackCtrl.warmup(); // non-blocking catalog preload
    this.createUI();

    // WMP popup (must come after createUI so canvasOverlay exists)
    this.wmpPopup = new WMPPopup(this.scene, this.canvasOverlay, {
      getPosition: () => this.getTrackPosition(),
      seekTo: (s: number) => this.seekToPosition(s),
      getVolume: () => this.getVolumeFraction(),
      setVolume: (v: number) => this.setVolumeFraction(v),
      getYTElement: () => document.getElementById('yt-player'),
      getTrackTitle: () => this.currentTrackName,
      getTrackArtist: () => this.currentArtist,
      getSpotifyUrl: () => this.currentSpotifyUrl,
      getSource: () => this.source,
      isSpotifyLoggedIn: () => this.spotifyLoggedIn,
      playTrack: (track) => this.playSpecificTrack(track),
      prev: () => this.prev(),
      next: () => this.next(),
      togglePlayPause: () => this.togglePlayPause(),
      toggleShuffle: () => this.toggleShuffle(),
      onWMPClose: () => this.onWMPClosed(),
    });

    // Load YouTube API early so it's ready for title track
    this.loadYouTubeAPI();
    this.tryInitSpotify();

    // Handle Spotify login/disconnect
    scene.events.on('spotify-auth-changed', () => this.onSpotifyAuthChanged());
  }

  /** Start the in-game title music. Call from a user gesture handler. */
  startTitleMusic(): void {
    if (this.titleTrackPlaying || this.playlistStarted) return;

    this.trackTitle.textContent = `${TUNING.INTRO_TRACK_TITLE} - ${TUNING.INTRO_TRACK_ARTIST}`;
    this.currentTrackName = TUNING.INTRO_TRACK_TITLE;
    this.currentArtist = TUNING.INTRO_TRACK_ARTIST;
    this.currentSpotifyUrl = TUNING.INTRO_TRACK_SPOTIFY_URL;
    this.currentTrackId = TITLE_SPOTIFY_TRACK_ID;
    this.wmpPopup?.setPlayingTrack(TITLE_SPOTIFY_TRACK_ID);
    this.titleClip.style.display = 'block';
    this.startTitleScroll();

    // Prefer Spotify if ready (onTrackChanged callback will set thumbnail)
    if (this.spotifyPlayer?.isReady()) {
      this.titleTrackPlaying = true;
      this.source = 'spotify';
      this.spotifyPlayer.playTrack(TITLE_SPOTIFY_TRACK_ID, true);
      this.applyUserVolume();
      // Start YouTube video muted as visual companion in WMP
      this.startMutedYTVideo();
      return;
    }

    // Otherwise use YouTube — show 16:9 thumbnail
    const s = TUNING.MUSIC_UI_THUMB_SCALE;
    this.thumbnailImg.src = TUNING.INTRO_TRACK_THUMBNAIL;
    this.thumbnailImg.style.width = `${YT_THUMB_WIDTH * s}px`;
    this.thumbnailImg.style.height = `${YT_THUMB_HEIGHT * s}px`;
    this.thumbnailImg.style.display = 'block';

    this.source = 'youtube';
    if (this.ytReady) {
      this.playTitleVideo();
    } else {
      this.pendingTitlePlay = true;
    }
  }

  /** Play the title-screen video on the YouTube player. */
  private playTitleVideo(): void {
    if (!this.ytPlayer || this.titleTrackPlaying) return;
    this.titleTrackPlaying = true;
    // Mute while loading to prevent cached-position audio leaking
    this.ytPlayer.mute();
    this.ytPlayer.loadVideoById(TITLE_YT_VIDEO_ID);
    // Unmute after video starts from the beginning
    setTimeout(() => {
      try { this.ytPlayer.unMute(); this.applyUserVolume(); } catch {}
    }, 500);
  }

  /** Start the YouTube title video muted (visual-only companion for Spotify playback). */
  private startMutedYTVideo(): void {
    if (!this.ytPlayer || !this.ytReady) return;
    try {
      this.ytPlayer.setVolume(0);
      this.ytPlayer.mute();
      this.ytPlayer.loadVideoById(TITLE_YT_VIDEO_ID);
      // Re-assert mute after loading begins (mute may not stick on a fresh player)
      setTimeout(() => {
        try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}
      }, 200);
      this.wmpPopup?.setVideoActive(true);
    } catch {}
  }

  /**
   * Load a muted YouTube video as visual companion for the current Spotify track.
   * Uses the catalog for exact video ID match; falls back to YT search if no match.
   */
  private loadYTCompanionForSpotify(spotifyTrackId: string): void {
    if (!this.ytPlayer || !this.ytReady) {
      // No YT player — show album art fallback
      this.showAlbumFallbackInWMP();
      return;
    }

    // Always mute YouTube when it's a visual companion
    try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}

    // Try catalog lookup (returns instantly if cache is warm)
    this.playbackCtrl.onSpotifyTrackChanged(
      spotifyTrackId, '', '', null,
    ).then((ytId) => {
      if (ytId && this.ytPlayer && this.ytReady) {
        // Exact match — load muted YouTube video
        try {
          this.ytPlayer.loadVideoById({ videoId: ytId });
          this.ytPlayer.mute();
          this.ytPlayer.setVolume(0);
          this.wmpPopup?.hideAlbumFallback();
          this.wmpPopup?.setVideoActive(true);
        } catch {}
      } else {
        // No YouTube link — show album art fallback
        this.showAlbumFallbackInWMP();
      }
    }).catch(() => {
      this.showAlbumFallbackInWMP();
    });
  }

  /** Show album art in WMP video area when no YouTube companion is available. */
  private showAlbumFallbackInWMP(): void {
    if (this.currentAlbumImageUrl && this.wmpPopup) {
      this.wmpPopup.showAlbumFallback(this.currentAlbumImageUrl);
    }
  }

  /** Keep YouTube video position in sync with Spotify audio (throttled). */
  private syncYTVideoToSpotify(spotifySeconds: number): void {
    if (!this.ytPlayer || !this.ytReady) return;
    const now = performance.now();
    if (now - this.lastYTVideoSync < 3000) return;
    this.lastYTVideoSync = now;
    try {
      const ytPos = this.ytPlayer.getCurrentTime() || 0;
      if (Math.abs(ytPos - spotifySeconds) > 2) {
        this.ytPlayer.seekTo(spotifySeconds, true);
      }
    } catch {}
  }

  getSource(): MusicSource { return this.source; }
  getTrackId(): string | null { return this.currentTrackId; }
  getPlaybackPosition(): { current: number; duration: number } { return this.getTrackPosition(); }
  getThumbnailImage(): HTMLImageElement { return this.thumbnailImg; }
  getTrackArtist(): string { return this.currentArtist; }

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

    // Size overlay immediately so collapseUI() can calculate correct widths
    // before the first rAF fires
    const initRect = canvas.getBoundingClientRect();
    Object.assign(this.canvasOverlay.style, {
      top: initRect.top + 'px',
      left: initRect.left + 'px',
      width: initRect.width + 'px',
      height: initRect.height + 'px',
    });

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
    const MUSIC_BG_PAD = 20;  // px padding inside background
    Object.assign(this.container.style, {
      position: 'absolute',
      top: `${topPct}%`,
      right: `${rightPct}%`,
      width: `calc(${widthPct}% + ${MUSIC_BG_PAD * 2}px)`,
      display: 'none',
      alignItems: 'flex-start',
      gap: GAME_MODE.mobileMode ? '40px' : '14px',
      pointerEvents: 'auto',
      transform: `scale(${MUSIC_UI_SCALE})`,
      transformOrigin: 'top right',
      overflow: 'hidden',
      transition: 'width 0.4s ease, gap 0.4s ease',
      padding: `${MUSIC_BG_PAD}px`,
      boxSizing: 'border-box',
    });
    // Prevent clicks from reaching the Phaser canvas
    this.container.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('mouseenter', () => {
      this.cursorOver = true;
      if (GAME_MODE.mobileMode) return;  // mobile uses thumbnail tap instead
      if (!this.compact) return;
      this.hovered = true;
      this.expandUI();
    });
    this.container.addEventListener('mouseleave', () => {
      this.cursorOver = false;
      if (GAME_MODE.mobileMode) return;  // mobile uses thumbnail tap instead
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

    // Mobile: tap thumbnail to expand/collapse instead of opening Spotify link
    if (GAME_MODE.mobileMode) {
      thumbLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.compact) {
          this.hovered = true;
          this.expandUI();
        } else {
          this.hovered = false;
          this.collapseUI();
        }
      });
    }

    // Thumbnail hover brightness
    thumbLink.addEventListener('mouseenter', () => { this.thumbHovered = true; });
    thumbLink.addEventListener('mouseleave', () => { this.thumbHovered = false; });

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
    // Mobile: tap track title to collapse UI
    if (GAME_MODE.mobileMode) {
      this.trackTitle.addEventListener('click', (e) => {
        e.preventDefault();
        this.hovered = false;
        this.collapseUI();
      });
    }
    this.trackTitle.addEventListener('mouseenter', () => {
      this.trackTitle.style.textDecoration = 'underline';
    });
    this.trackTitle.addEventListener('mouseleave', () => {
      this.trackTitle.style.textDecoration = 'none';
    });
    this.titleClip.appendChild(this.trackTitle);

    // Control buttons row with source indicator
    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '14px', alignItems: 'center', transform: `scale(${MUSIC_BTN_SCALE})`, transformOrigin: 'bottom right' });
    const menuBtn = this.createIconButton('ui/music menu.png', () => {
      if (!this.wmpPopup?.getIsOpen()) this.onWMPOpenCb?.();
      this.wmpPopup?.toggle();
    });
    const prevBtn = this.createIconButton('ui/skip.png', () => this.prev(), true);
    const nextBtn = this.createIconButton('ui/skip.png', () => this.next());
    this.muteBtn = this.createIconButton('ui/unmuted.png', () => this.toggleMute());
    this.muteBtnImg = this.muteBtn.querySelector('img') as HTMLImageElement;

    // Heart (favorite) button — same size as icon buttons but renders via Phaser Text
    this.heartBtn = document.createElement('button');
    this.heartBtn.tabIndex = -1;
    Object.assign(this.heartBtn.style, {
      background: 'none', border: 'none', padding: '0',
      width: '44px', height: '44px', cursor: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    this.heartBtn.addEventListener('click', () => {
      if (this.scene.cache.audio.exists('sfx-click')) this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      const trackId = this.getCurrentTrackId();
      if (trackId && this.wmpPopup) {
        this.heartBounceT = 0;
        this.wmpPopup.toggleFavoriteById(trackId);
      }
    });

    btnContainer.append(this.heartBtn, prevBtn, nextBtn, this.muteBtn, menuBtn);

    rightColumn.append(this.titleClip, btnContainer);
    this.container.append(thumbLink, rightColumn);

    // Phaser sprites that render through CRT shader (HTML images stay invisible click targets)
    const prevSprite = this.scene.add.image(0, 0, 'ui-skip').setFlipX(true);
    const nextSprite = this.scene.add.image(0, 0, 'ui-skip');
    this.muteBtnSprite = this.scene.add.image(0, 0, 'ui-unmuted');
    const menuSprite = this.scene.add.image(0, 0, 'ui-music-menu');
    this.btnSprites = [prevSprite, nextSprite, this.muteBtnSprite, menuSprite];
    this.btnElements = [prevBtn, nextBtn, this.muteBtn, menuBtn];
    for (let i = 0; i < this.btnSprites.length; i++) {
      this.btnSprites[i].setDepth(1000).setScrollFactor(0).setVisible(false).setAlpha(0);
      const sprite = this.btnSprites[i];
      this.btnElements[i].addEventListener('mouseenter', () => { sprite.setAlpha(0.7); });
      this.btnElements[i].addEventListener('mouseleave', () => { sprite.setAlpha(this.compact && !this.hovered ? 0 : 1); });
    }

    // Semi-transparent background panel (Phaser, rendered through CRT behind all content)
    this.bgPanel = this.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0.55)
      .setDepth(999).setScrollFactor(0).setOrigin(0, 0).setVisible(false);

    // Thumbnail CRT sprite (mirrors HTML thumbnail through CRT shader)
    this.thumbSprite = this.scene.add.image(0, 0, '__DEFAULT')
      .setDepth(1000).setScrollFactor(0).setVisible(false);
    this.thumbHoverOverlay = this.scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(1001).setScrollFactor(0).setVisible(false);
    this.thumbnailImg.addEventListener('load', () => this.updateThumbTexture());

    // Song title CRT text (mirrors scrolling track title through CRT shader)
    this.titleMaskGfx = this.scene.add.graphics().setVisible(false);
    this.titleText = this.scene.add.text(0, 0, '', {
      fontFamily: '"Early GameBoy"',
      fontSize: '24px',
      color: '#ffffff',
    }).setDepth(1000).setScrollFactor(0).setOrigin(0, 0.5).setVisible(false).setAlpha(0);
    this.titleText.setMask(this.titleMaskGfx.createGeometryMask());

    // Heart (favorite) CRT text — white outline, purple fill when favorited
    this.heartTextP = this.scene.add.text(0, 0, '\u2665', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: 'rgba(0,0,0,0)',
      stroke: '#ffffff',
      strokeThickness: 2,
    }).setDepth(1000).setScrollFactor(0).setOrigin(0.5, 0.5).setVisible(false).setAlpha(0);

    // Heart hover events (match btn sprite hover pattern)
    this.heartBtn.addEventListener('mouseenter', () => {
      if (this.scene.cache.audio.exists('sfx-hover')) this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME });
      this.heartTextP.setAlpha(0.7);
    });
    this.heartBtn.addEventListener('mouseleave', () => {
      this.heartTextP.setAlpha(this.compact && !this.hovered ? 0 : 1);
    });

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
      cursor: 'none',
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
      if (this.scene.cache.audio.exists('sfx-click')) this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      onClick();
    });
    btn.addEventListener('mouseenter', () => {
      if (this.scene.cache.audio.exists('sfx-hover')) this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME });
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
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        fs: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          this.ytReady = true;
          // Expose YT player globally so BIOS dismiss gesture can unlock iOS audio
          (window as any).__ytPlayer = this.ytPlayer;
          if (this.pendingTitlePlay) {
            this.pendingTitlePlay = false;
            this.playTitleVideo();
          } else if (this.pendingPlay) {
            this.pendingPlay = false;
            this.startYTPlaylist();
          } else if (this.titleTrackPlaying && this.source === 'spotify') {
            // Spotify already playing title track — start YouTube video muted as visual
            this.startMutedYTVideo();
          }
        },
        onStateChange: (event: any) => {
          // Loop title video when it ends
          if (event.data === 0 && this.titleTrackPlaying && !this.playlistStarted) {
            this.ytPlayer.loadVideoById(TITLE_YT_VIDEO_ID);
            return;
          }
          // Restart playlist if it ends (state 0 = ended)
          if (event.data === 0 && (this.playlistStarted || this.titlePlaylistLoaded) && this.source === 'youtube') {
            this.ytPlayer.setShuffle(true);
            this.ytPlayer.playVideo();
          }
          // Ensure YouTube stays muted when playing as visual companion for Spotify
          if (event.data === 1 && this.source === 'spotify') {
            try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}
          }
          // Update track info when a playlist video starts playing (state 1 = playing)
          if (event.data === 1 && this.source === 'youtube' && (this.playlistStarted || this.titlePlaylistLoaded)) {
            // Skip if shuffle landed on a countdown-matching track or same as last session
            if (this.ytAvoidCountdownTrack) {
              this.ytAvoidCountdownTrack = false;
              try {
                const videoData = this.ytPlayer.getVideoData();
                if (videoData) {
                  const vid = videoData.video_id;
                  const lastFirst = localStorage.getItem('dp_last_first_yt');
                  if (YT_AVOID_FIRST_IDS.includes(vid) || vid === lastFirst) {
                    this.ytPlayer.nextVideo();
                    this.ytAvoidCountdownTrack = true; // keep checking after skip
                    return;
                  }
                  localStorage.setItem('dp_last_first_yt', vid);
                }
              } catch (_) { /* YT not ready */ }
            }
            this.updateYTTrackInfo();
          }
        },
      },
    });
  }

  /** Handle Spotify login or disconnect. */
  private onSpotifyAuthChanged(): void {
    if (isConnected()) {
      // Login — initialize Spotify without page reload
      this.spotifyLoggedIn = true;
      this.tryInitSpotify();
      return;
    }

    // Disconnected — tear down Spotify player and fall back to YouTube
    this.spotifyLoggedIn = false;
    this.spotifyInitInProgress = false;
    if (this.spotifyPlayer) {
      this.spotifyPlayer.destroy();
      this.spotifyPlayer = null;
    }
    if (this.source === 'spotify') {
      this.source = 'youtube';
      if (this.playlistStarted) {
        // Gameplay — start YouTube playlist
        if (this.ytReady) {
          this.startYTPlaylist();
        } else {
          this.pendingPlay = true;
          this.loadYouTubeAPI();
        }
      } else if (this.titlePlaylistLoaded) {
        // Title screen playlist browsing — start YouTube playlist
        if (this.ytReady) {
          this.startYTPlaylist();
        }
      } else if (this.titleTrackPlaying) {
        // Title screen single track — YouTube was muted visual, unmute for audio
        if (this.ytPlayer) {
          try {
            this.ytPlayer.unMute();
            this.applyUserVolume();
          } catch {}
        }
      }
    }
  }

  /** Attempt to initialize Spotify playback if connected + premium. Non-blocking. */
  private tryInitSpotify(): void {
    if (!isConnected()) return;
    if (this.spotifyInitInProgress || this.spotifyPlayer) return;
    this.spotifyInitInProgress = true;

    // User is connected to Spotify (has valid token) — mark logged in regardless of premium
    this.spotifyLoggedIn = true;

    checkPremium().then(async (isPremium) => {
      if (!isPremium) { this.spotifyInitInProgress = false; return; }

      const sp = new SpotifyPlayerSystem();
      const ok = await sp.init();
      if (!ok) {
        console.warn('MusicPlayer: Spotify SDK init failed, staying on YouTube');
        sp.destroy();
        this.spotifyInitInProgress = false;
        return;
      }

      this.spotifyPlayer = sp;
      this.spotifyInitInProgress = false;

      // Wire track change updates
      sp.onTrackChanged((track) => {
        if (this.source !== 'spotify') return;
        // Ignore stale track events during title screen — Spotify SDK may resume the
        // last session's track before we tell it to play the title track
        if (this.titleTrackPlaying && track.trackId !== TITLE_SPOTIFY_TRACK_ID) return;
        // Store album art for fallback display
        this.currentAlbumImageUrl = track.albumImageUrl ?? null;
        this.currentTrackName = track.name || '';
        this.currentArtist = track.artist || '';
        this.currentSpotifyUrl = track.trackId ? `https://open.spotify.com/track/${track.trackId}` : null;
        this.currentTrackId = track.trackId ?? null;
        this.wmpPopup?.setPlayingTrack(track.trackId);
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
        // Load matching YouTube video as muted visual companion in WMP
        if (this.playlistStarted || this.titlePlaylistLoaded) {
          if (track.trackId) {
            this.loadYTCompanionForSpotify(track.trackId);
          } else {
            // No track ID — show album art fallback
            this.showAlbumFallbackInWMP();
          }
        }
      });

      // Switch to Spotify based on current game state
      if (this.playlistStarted || (this.titlePlaylistLoaded && this.source === 'youtube')) {
        // Gameplay or title playlist — switch directly without countdown audio
        this.source = 'spotify';
        // Mute YouTube — onTrackChanged will search for matching video
        if (this.ytPlayer) {
          try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}
        }
        this.startSpotifyPlaylist();
      } else if (this.titleTrackPlaying && this.source === 'youtube') {
        // Title track already playing on YouTube — switch audio to Spotify, keep YT as muted visual
        this.source = 'spotify';
        this.spotifyPlayer!.playTrack(TITLE_SPOTIFY_TRACK_ID, true);
        this.applyUserVolume();
        if (this.ytPlayer) {
          try { this.ytPlayer.mute(); } catch {}
        }
        this.wmpPopup?.setVideoActive(true);
      }
    }).catch(() => {
      // Premium check failed — stay on YouTube silently
      this.spotifyInitInProgress = false;
    });
  }

  /** Stop title music and start playlist. Call from a user gesture handler. */
  switchToPlaylist(): void {
    if (this.playlistStarted) return;
    this.playlistStarted = true;

    // Already browsing playlist from title screen — just continue playing
    if (this.titlePlaylistLoaded) {
      this.titlePlaylistLoaded = false;
      return;
    }

    // Stop streaming title track
    if (this.titleTrackPlaying) {
      this.titleTrackPlaying = false;
      if (this.source === 'spotify' && this.spotifyPlayer) {
        this.spotifyPlayer.pause();
      } else if (this.ytPlayer) {
        try { this.ytPlayer.pauseVideo(); } catch {}
      }
    }

    // If Spotify player is ready, use it
    if (this.spotifyPlayer?.isReady()) {
      this.switchSourceToSpotify();
      return;
    }

    // Otherwise use YouTube: play countdown audio, then start playlist
    this.source = 'youtube';
    this.startYTWithCountdown();
  }

  private switchSourceToSpotify(): void {
    if (!this.spotifyPlayer) return;
    this.source = 'spotify';

    // Mute YouTube — it will be used as visual companion (onTrackChanged triggers search)
    if (this.ytPlayer) {
      try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}
    }

    // Play countdown audio first, crossfade Spotify in before it ends
    if (this.scene.cache.audio.exists('countdown-music')) {
      this.countdownMusic = this.scene.sound.add('countdown-music', { loop: false, volume: TUNING.MUSIC_VOL_COUNTDOWN });
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

    // Fade from -12 dB to 0 dB (relative to userVolume * MUSIC_VOL_MASTER)
    const startGain = Math.pow(10, CROSSFADE_START_DB / 20); // ~0.25
    const targetVol = Math.min(1, this.userVolume * TUNING.MUSIC_VOL_MASTER);
    const fadeMs = CROSSFADE_LEAD_S * 1000;
    const startTime = performance.now();

    this.spotifyPlayer.setVolume(startGain * targetVol);

    const step = () => {
      const t = Math.min(1, (performance.now() - startTime) / fadeMs);
      const gain = startGain + (1 - startGain) * t;
      this.spotifyPlayer?.setVolume(gain * targetVol);
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

  /** Play countdown audio, then start YT playlist when both countdown and API are ready. */
  private startYTWithCountdown(): void {
    if (this.scene.cache.audio.exists('countdown-music')) {
      this.countdownMusic = this.scene.sound.add('countdown-music', { loop: false, volume: TUNING.MUSIC_VOL_COUNTDOWN });
      this.countdownMusic.play();
      this.countdownMusic.once('complete', () => {
        this.countdownMusic = null;
        if (this.ytReady) {
          this.startYTPlaylist();
        } else {
          this.pendingPlay = true;
        }
      });
    } else {
      if (this.ytReady) {
        this.startYTPlaylist();
      } else {
        this.pendingPlay = true;
      }
    }
  }

  /** Stop countdown audio early and immediately start the music source. */
  skipCountdownAudio(): void {
    if (!this.countdownMusic) return;
    this.countdownMusic.stop();
    this.countdownMusic.destroy();
    this.countdownMusic = null;

    if (this.source === 'spotify') {
      // Clear the crossfade timer and start Spotify immediately
      if (this.crossfadeTimer) {
        window.clearTimeout(this.crossfadeTimer);
        this.crossfadeTimer = 0;
      }
      this.startSpotifyPlaylist();
    } else if (this.source === 'youtube') {
      if (this.ytReady) {
        this.startYTPlaylist();
      } else {
        this.pendingPlay = true;
      }
    }
  }

  private startYTPlaylist(): void {
    if (!this.ytPlayer) return;
    this.source = 'youtube';
    this.titleTrackPlaying = false;
    this.ytPlayer.unMute();
    this.applyUserVolume();
    this.wmpPopup?.setVideoActive(true);
    this.ytPlayer.loadPlaylist({
      listType: 'playlist',
      list: 'PLgz1oMMp1awLI_wrJTMblR6dRTMDcwaGr',
    });
    // Shuffle must be set after playlist loads
    setTimeout(() => {
      try { this.ytPlayer.setShuffle(true); } catch {}
    }, 500);
    this.ytAvoidCountdownTrack = true;
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
        // Use catalog metadata if this video was triggered by a library click
        const cat = this.lastPlayedCatalog;
        if (cat && cat.youtubeVideoId === videoData.video_id) {
          this.currentTrackName = cat.title;
          this.currentArtist = cat.artistName;
          this.currentSpotifyUrl = cat.spotifyUrl ?? null;
          this.currentTrackId = cat.spotifyTrackId;
          this.wmpPopup?.setPlayingTrack(cat.spotifyTrackId);
        } else {
          this.lastPlayedCatalog = null;
          // Try matching YouTube video to catalog for artist/URL metadata
          this.currentTrackName = videoData.title || 'Unknown Track';
          this.currentArtist = videoData.author || '';
          this.currentSpotifyUrl = null;
          fetchAllTracks().then(tracks => {
            const match = tracks.find(t => t.youtubeVideoId === videoData.video_id);
            if (match) {
              this.currentTrackName = match.title;
              this.currentArtist = match.artistName;
              this.currentSpotifyUrl = match.spotifyUrl ?? null;
              this.currentTrackId = match.spotifyTrackId;
              this.wmpPopup?.setPlayingTrack(match.spotifyTrackId);
            }
          });
        }
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
    // Title screen single track → restart from beginning
    if (this.titleTrackPlaying && !this.playlistStarted) {
      if (this.source === 'spotify' && this.spotifyPlayer) {
        this.spotifyPlayer.seek(0);
        // Also restart YouTube visual companion
        if (this.ytPlayer) { try { this.ytPlayer.seekTo(0, true); } catch {} }
      } else if (this.ytPlayer) {
        this.ytPlayer.seekTo(0, true);
      }
      return;
    }
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.prev();
    } else if (this.ytPlayer && (this.playlistStarted || this.titlePlaylistLoaded)) {
      this.ytPlayer.previousVideo();
      setTimeout(() => this.updateYTTrackInfo(), 500);
    }
  }

  private next(): void {
    // Title screen single track → load playlist and start browsing
    if (this.titleTrackPlaying && !this.playlistStarted) {
      this.titleTrackPlaying = false;
      this.titlePlaylistLoaded = true;
      if (this.source === 'spotify' && this.spotifyPlayer) {
        this.spotifyPlayer.startPlaylist();
        // Mute YouTube — onTrackChanged will search for matching video
        if (this.ytPlayer) {
          try { this.ytPlayer.mute(); this.ytPlayer.setVolume(0); } catch {}
        }
      } else if (this.ytPlayer) {
        this.startYTPlaylist();
      }
      return;
    }
    // Cooldown: ignore rapid-fire skips (Spotify API can't keep up)
    const now = performance.now();
    if (now - this.lastSkipTime < 800) return;
    this.lastSkipTime = now;

    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.next();
    } else if (this.ytPlayer && (this.playlistStarted || this.titlePlaylistLoaded)) {
      this.ytPlayer.nextVideo();
      setTimeout(() => this.updateYTTrackInfo(), 500);
    }
  }

  private togglePlayPause(): void {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.togglePlayPause();
    } else if (this.ytPlayer) {
      try {
        const state = this.ytPlayer.getPlayerState();
        if (state === 1) this.ytPlayer.pauseVideo();  // 1 = playing
        else this.ytPlayer.playVideo();
      } catch {}
    }
  }

  private toggleShuffle(): void {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      // Spotify shuffle is managed at playlist level — just skip to next
      this.next();
    } else if (this.ytPlayer) {
      try {
        this.ytPlayer.setShuffle(true);
        this.ytPlayer.nextVideo();
      } catch {}
    }
  }

  /** Boost or restore music volume (multiplier: 1.0 = normal, >1 = louder) */
  setVolumeBoost(multiplier: number): void {
    const playing = this.titleTrackPlaying || this.playlistStarted || this.titlePlaylistLoaded;
    const scaled = Math.min(1, this.userVolume * TUNING.MUSIC_VOL_MASTER * multiplier);
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.setVolumeBoost(scaled);
    } else if (this.ytPlayer && playing) {
      try {
        if (!this.ytPlayer.isMuted()) {
          this.ytPlayer.setVolume(Math.min(100, Math.round(scaled * 100)));
        }
      } catch {}
    }
  }

  /** Re-apply current volume multipliers (e.g. after debug adjustment) */
  applyVolume(): void {
    this.applyUserVolume();
  }

  /** Set music playback rate for time dilation slow-mo. 1.0 = normal speed. */
  setPlaybackRate(rate: number): void {
    if (this.source === 'youtube' && this.ytPlayer && (this.titleTrackPlaying || this.playlistStarted || this.titlePlaylistLoaded)) {
      try { this.ytPlayer.setPlaybackRate(rate); } catch (_) { /* YT not ready */ }
    }
  }

  private toggleMute(): void {
    if (this.source === 'spotify' && this.spotifyPlayer && (this.titleTrackPlaying || this.playlistStarted || this.titlePlaylistLoaded)) {
      const muted = this.spotifyPlayer.toggleMute();
      // toggleMute returns a Promise<boolean> — handle async
      if (muted instanceof Promise) {
        muted.then((m) => {
          this.muteBtnImg.src = m ? 'ui/muted.png' : 'ui/unmuted.png';
          this.muteBtnSprite.setTexture(m ? 'ui-muted' : 'ui-unmuted');
        });
      }
    } else if (this.ytPlayer && (this.titleTrackPlaying || this.playlistStarted || this.titlePlaylistLoaded)) {
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
    }
  }

  // ─── WMP popup callbacks ──────────────────────────────────
  private getTrackPosition(): { current: number; duration: number } {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      const pos = this.spotifyPlayer.getPositionSync();
      this.syncYTVideoToSpotify(pos.current);
      return pos;
    }
    if (this.source === 'youtube' && this.ytPlayer && (this.titleTrackPlaying || this.playlistStarted || this.titlePlaylistLoaded)) {
      try {
        return {
          current: this.ytPlayer.getCurrentTime() || 0,
          duration: this.ytPlayer.getDuration() || 0,
        };
      } catch { return { current: 0, duration: 0 }; }
    }
    return { current: 0, duration: 0 };
  }

  private seekToPosition(seconds: number): void {
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.seek(Math.round(seconds * 1000));
      // Also seek YouTube visual companion
      if (this.ytPlayer) {
        try { this.ytPlayer.seekTo(seconds, true); } catch {}
      }
    } else if (this.source === 'youtube' && this.ytPlayer) {
      this.ytPlayer.seekTo(seconds, true);
    }
  }

  /** Returns the user's intended volume (0-1), unscaled by master multiplier. */
  private getVolumeFraction(): number {
    return this.userVolume;
  }

  /** Sets volume from user input (0-1 slider value), applies master multiplier to output. */
  private setVolumeFraction(v: number): void {
    this.userVolume = v;
    this.applyUserVolume();
  }

  /** Apply userVolume * MUSIC_VOL_MASTER to all active audio outputs. */
  private applyUserVolume(): void {
    const scaled = Math.min(1, this.userVolume * TUNING.MUSIC_VOL_MASTER);
    if (this.source === 'spotify' && this.spotifyPlayer) {
      this.spotifyPlayer.setVolume(scaled);
    } else if (this.source === 'youtube' && this.ytPlayer) {
      this.ytPlayer.setVolume(Math.round(scaled * 100));
    }
    if (this.previewAudio) this.previewAudio.volume = scaled;
  }

  isCursorOverUI(): boolean {
    return this.cursorOver || (this.wmpPopup?.isCursorOver() ?? false);
  }

  /** Returns true when cursor is over the YouTube iframe (HTML above canvas — cursor can't render on top). */
  isCursorOverIframe(): boolean {
    return this.wmpPopup?.isCursorOverIframe() ?? false;
  }

  /** Play a specific track selected from the WMP library. */
  private playSpecificTrack(track: CatalogTrack): void {
    // Stop any playing preview audio
    this.stopPreviewAudio();

    // Store track metadata for info panel (also saved for YT clobber protection)
    this.lastPlayedCatalog = track;
    this.currentTrackName = track.title;
    this.currentArtist = track.artistName;
    this.currentSpotifyUrl = track.spotifyUrl ?? null;
    this.currentTrackId = track.spotifyTrackId;
    this.wmpPopup?.setPlayingTrack(track.spotifyTrackId);

    if (this.source === 'spotify' && this.spotifyPlayer) {
      // Premium Spotify: play via SDK, muted YouTube companion video or album art fallback
      this.currentAlbumImageUrl = track.albumImageUrl ?? null;
      this.spotifyPlayer.playTrack(track.spotifyTrackId);
      this.loadYTCompanionForSpotify(track.spotifyTrackId);
    } else if (this.source === 'youtube' && track.youtubeVideoId) {
      // YouTube source with YT link: play YouTube video with audio
      if (this.ytPlayer && this.ytReady) {
        this.ytPlayer.unMute();
        this.ytPlayer.loadVideoById(track.youtubeVideoId);
        this.applyUserVolume();
        this.wmpPopup?.setVideoActive(true);
        this.playlistStarted = true;
        setTimeout(() => this.updateYTTrackInfo(), 500);
      }
    } else if (this.source === 'youtube' && !track.youtubeVideoId && this.spotifyLoggedIn) {
      // Logged-in free user, track has no YT link: try Spotify preview
      this.playSpotifyPreview(track);
    }
  }

  /** Attempt to play a 30s Spotify preview for non-premium users. */
  private async playSpotifyPreview(track: CatalogTrack): Promise<void> {
    const token = getAccessToken();
    if (!token) return;

    // Update track info
    this.currentTrackName = track.title;
    this.currentArtist = track.artistName;
    this.currentSpotifyUrl = track.spotifyUrl ?? null;
    this.currentTrackId = track.spotifyTrackId;
    const display = `${track.title} - ${track.artistName}`;
    this.trackTitle.textContent = display;
    this.titleClip.style.display = 'block';
    this.startTitleScroll();

    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${track.spotifyTrackId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const previewUrl: string | null = data.preview_url;

      if (!previewUrl) {
        console.warn('MusicPlayer: No preview URL available for', track.title);
        return;
      }

      this.previewAudio = new Audio(previewUrl);
      this.previewAudio.volume = Math.min(1, this.userVolume * TUNING.MUSIC_VOL_MASTER);
      this.previewAudio.play().catch(() => {});
    } catch {
      // Preview fetch failed — silently ignore
    }
  }

  /** Stop any currently playing Spotify preview audio. */
  private stopPreviewAudio(): void {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.src = '';
      this.previewAudio = null;
    }
  }

  /** Called when WMP popup is closed. */
  private onWMPClosed(): void {
    this.onWMPCloseCb?.();
  }

  /** Close the WMP popup if it's open. */
  closeWMP(): void {
    this.wmpPopup?.close();
  }

  /** Register a callback fired when the WMP popup is about to open. */
  onWMPOpen(cb: () => void): void {
    this.onWMPOpenCb = cb;
  }

  /** Register a callback fired when the WMP popup is closed. */
  onWMPClose(cb: () => void): void {
    this.onWMPCloseCb = cb;
  }

  /** Hide/show WMP iframe when another popup needs to be on top. */
  setWMPBehind(behind: boolean): void {
    this.wmpPopup?.setIframeBehind(behind);
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

    this.container.style.width = `${thumbW + 2 * 20}px`; // thumb + padding (box-sizing: border-box)
    this.container.style.gap = '0px';
    this.rightColumnEl.style.opacity = '0';

    // Fade Phaser button sprites, title text, and heart to match
    for (const s of [...this.btnSprites, this.titleText, this.heartTextP]) {
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
    this.container.style.width = `calc(${widthPct}% + ${2 * 20}px)`;
    this.container.style.gap = GAME_MODE.mobileMode ? '40px' : '14px';
    this.rightColumnEl.style.opacity = '1';

    // Fade Phaser button sprites, title text, and heart in
    for (const s of [...this.btnSprites, this.titleText, this.heartTextP]) {
      this.scene.tweens.killTweensOf(s);
      this.scene.tweens.add({ targets: s, alpha: 1, duration: 400, ease: 'Sine.easeInOut' });
    }
  }

  /** Reveal music player during gameplay: fade in thumbnail, wait 1.5s, then expand */
  revealForGameplay(): void {
    // Cancel any previous reveal
    if (this.revealTimer) {
      this.revealTimer.destroy();
      this.revealTimer = null;
    }

    // Show container in collapsed state (thumbnail only, instant)
    this.container.style.display = 'flex';
    this.collapseUI(false);

    // Fade in thumbnail sprite
    this.thumbSprite.setAlpha(0);
    this.scene.tweens.add({
      targets: this.thumbSprite,
      alpha: 1,
      duration: 500,
      ease: 'Sine.easeInOut',
    });

    // After 1.5s, expand to show full UI
    this.revealTimer = this.scene.time.delayedCall(1500, () => {
      this.revealTimer = null;
      this.compact = false;
      this.expandUI();
    });
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      if (this.revealTimer) {
        this.revealTimer.destroy();
        this.revealTimer = null;
      }
      for (const s of this.btnSprites) s.setVisible(false);
      this.bgPanel.setVisible(false);
      this.thumbSprite.setVisible(false);
      this.titleText.setVisible(false);
      this.heartTextP.setVisible(false);
    }
  }

  private getCurrentTrackId(): string | null {
    return this.currentTrackId;
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

    // --- Background panel ---
    if (containerVisible) {
      const cRect = this.container.getBoundingClientRect();
      const bgX = (cRect.left - overlayRect.left) / ow * TUNING.GAME_WIDTH;
      const bgY = (cRect.top - overlayRect.top) / oh * TUNING.GAME_HEIGHT;
      const bgW = (cRect.width / ow) * TUNING.GAME_WIDTH;
      const bgH = (cRect.height / oh) * TUNING.GAME_HEIGHT;
      this.bgPanel.setPosition(bgX, bgY).setDisplaySize(bgW, bgH).setVisible(true);

      // Rounded corners via postFX — Phaser rectangles don't natively support borderRadius,
      // but the CRT shader makes it look good enough with the slight warp
    } else {
      this.bgPanel.setVisible(false);
    }

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
      // Hover brightness overlay
      this.thumbHoverOverlay.setPosition(this.thumbSprite.x, this.thumbSprite.y);
      this.thumbHoverOverlay.setDisplaySize(this.thumbSprite.displayWidth, this.thumbSprite.displayHeight);
      this.thumbHoverOverlay.setVisible(this.thumbHovered);
    } else {
      this.thumbSprite.setVisible(false);
      this.thumbHoverOverlay.setVisible(false);
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

    // --- Heart (favorite) text ---
    const heartVisible = containerVisible && !!this.currentTrackId;
    if (heartVisible) {
      const hRect = this.heartBtn.getBoundingClientRect();
      const hcx = hRect.left + hRect.width / 2 - overlayRect.left;
      const hcy = hRect.top + hRect.height / 2 - overlayRect.top;
      const gameHX = (hcx / ow) * TUNING.GAME_WIDTH;
      const gameHY = (hcy / oh) * TUNING.GAME_HEIGHT;
      const gameHSize = (hRect.width / ow) * TUNING.GAME_WIDTH;
      const heartFontSize = Math.round(gameHSize * 0.7);
      this.heartTextP.setPosition(gameHX, gameHY);
      this.heartTextP.setFontSize(heartFontSize);
      this.heartTextP.setStroke('#ffffff', Math.max(1, heartFontSize * 0.08));
      this.heartTextP.setVisible(true);

      // Favorite state coloring
      const isFav = this.wmpPopup?.isFavorited(this.currentTrackId!) ?? false;
      this.heartTextP.setColor(isFav ? '#4a0080' : 'rgba(0,0,0,0)');

      // Bounce animation (tick at ~60fps via rAF)
      if (this.heartBounceT < 1) {
        this.heartBounceT = Math.min(1, this.heartBounceT + 0.055); // ~300ms at 60fps
        const bounceScale = 1 + 0.4 * Math.sin(this.heartBounceT * Math.PI);
        this.heartTextP.setScale(bounceScale);
      } else {
        this.heartTextP.setScale(1);
      }
    } else {
      this.heartTextP.setVisible(false);
    }
  }

  destroy(): void {
    if (this.wmpPopup) { this.wmpPopup.destroy(); this.wmpPopup = null; }
    for (const s of this.btnSprites) s.destroy();
    this.btnSprites.length = 0;
    this.bgPanel.destroy();
    this.thumbSprite.destroy();
    this.thumbHoverOverlay.destroy();
    this.titleText.destroy();
    this.titleMaskGfx.destroy();
    this.heartTextP.destroy();
    if (this.crossfadeTimer) window.clearTimeout(this.crossfadeTimer);
    if (this.crossfadeAnim) cancelAnimationFrame(this.crossfadeAnim);
    if (this.scrollAnim) cancelAnimationFrame(this.scrollAnim);
    if (this.overlaySyncAnim) cancelAnimationFrame(this.overlaySyncAnim);
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
