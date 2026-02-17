import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { InputSystem } from '../systems/InputSystem';
import { PlayerSystem } from '../systems/PlayerSystem';
import { RoadSystem } from '../systems/RoadSystem';
import { ParallaxSystem } from '../systems/ParallaxSystem';
import { ObstacleSystem, ObstacleType, LaneWarning } from '../systems/ObstacleSystem';
import { DifficultySystem } from '../systems/DifficultySystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { FXSystem } from '../systems/FXSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { LeaderboardSystem } from '../systems/LeaderboardSystem';
import { MusicPlayer } from '../systems/MusicPlayer';
import { PickupSystem } from '../systems/PickupSystem';
import { RocketSystem } from '../systems/RocketSystem';
import { getCurrentWeekKey, weekKeyToSeed } from '../util/time';
import { CRTPipeline } from '../fx/CRTPipeline';
import { CRT_TUNING } from '../config/crtTuning';
import { ProfileHud } from '../ui/ProfileHud';
import { ProfilePopup, AVATAR_TEXTURE_KEY } from '../ui/ProfilePopup';
import { ShieldSystem } from '../systems/ShieldSystem';
import { PerfSystem } from '../systems/PerfSystem';
import { OrientationOverlay } from '../systems/OrientationOverlay';
import { GAME_MODE } from '../config/gameMode';
import { submitScore } from '../systems/LeaderboardService';

enum GameState {
  TITLE,
  TUTORIAL,
  STARTING,
  PLAYING,
  DYING,
  NAME_ENTRY,
  DEAD,
}

const NAME_MAX_LENGTH = 10;
const SKIP_BTN_MARGIN_RIGHT = 90;    // px from right edge of screen
const SKIP_BTN_MARGIN_BOTTOM = 56;   // px from bottom edge of screen

// ── Debug hotkeys (set active: false to disable) ──
const DEBUG_HOTKEYS = {
  gameplayInfo:   { key: 'E',    active: false },  // toggle gameplay debug text (pos, speed, diff, time)
  musicSource:    { key: 'W',    active: false },  // toggle music source label (SPOTIFY / YOUTUBE)
  jumpLeaderboard:{ key: 'Q',    active: false },  // skip straight to death/leaderboard screen
  toggleCRT:      { key: 'O',    active: true },  // toggle CRT shader on/off
  crtDebug:       { key: 'P',    active: false },  // toggle CRT tuning overlay
  instantRage:    { key: 'ZERO',    active: true },  // trigger instant rage mode
  spectatorMode:  { key: 'I',       active: true },  // toggle spectator: invincible + auto-explode obstacles
  toggleLayer1:   { key: 'ONE',     active: true },  // toggle parallax layer 1 (railing)
  toggleLayer2:   { key: 'TWO',     active: true },  // toggle parallax layer 2
  toggleLayer3:   { key: 'THREE',   active: true },  // toggle parallax layer 3 (buildings-big)
  toggleLayer4:   { key: 'FOUR',    active: true },  // toggle parallax layer 4 (buildings-front close)
  toggleLayer5:   { key: 'FIVE',    active: true },  // toggle parallax layer 5 (buildings-front flipped)
  toggleLayer6:   { key: 'SIX',     active: true },  // toggle parallax layer 6 (buildings-front)
  toggleLayer7:   { key: 'SEVEN',   active: true },  // toggle parallax layer 7 (buildings-back)
  toggleSky:      { key: 'EIGHT',   active: true },  // toggle sky background
  toggleRoad:     { key: 'NINE',    active: true },  // toggle road
  hideHud:        { key: 'G',       active: true },  // hide HUD + music UI during gameplay
  showHelp:       { key: 'PLUS',   active: true },  // toggle debug hotkey help overlay
  showCollisions: { key: 'MINUS',  active: true },  // toggle collision hitbox overlay
  startHold:      { key: 'BACKTICK', active: true }, // debug: skip the start hold phase
};

// ── Death screen leaderboard: Top 3 group ──
const DLB_T3_X = 560;              // left edge X of the entire top-3 group
const DLB_T3_Y = 0;                // Y offset from leaderboard header bottom
const DLB_T3_ROW_H = 58;           // row height per top-3 entry
const DLB_T3_FONT = '34px';        // font size for top-3 text
const DLB_T3_AVATAR_R = 22;        // avatar circle radius
const DLB_T3_AVATAR_STROKE = 3;    // medal ring stroke width
const DLB_T3_AVATAR_X = -55;       // avatar center X relative to group left
const DLB_T3_RANK_X = 0;           // rank text X relative to group left
const DLB_T3_NAME_X = 96;          // name text X relative to group left
const DLB_T3_TIME_X = 380;         // time text X relative to group left
const DLB_T3_SCORE_X = 520;        // score text X relative to group left
const DLB_T3_MEDAL_COLORS = [0xFFD700, 0xC0C0C0, 0xCD7F32]; // gold, silver, bronze
const DLB_GAP = 12;               // min px gap between adjacent elements in a row

// ── Death screen leaderboard: Rows 4-10 group ──
const DLB_REST_X = 615;            // left edge X of the 4-10 group
const DLB_REST_Y = 8;              // Y gap between top-3 block and 4-10 block
const DLB_REST_ROW_H = 38;         // row height per 4-10 entry
const DLB_REST_FONT = '24px';      // font size for 4-10 text
const DLB_REST_RANK_X = 0;         // rank X relative to group left
const DLB_REST_NAME_X = 56;        // name X relative to group left
const DLB_REST_TIME_X = 280;       // time X relative to group left
const DLB_REST_SCORE_X = 400;      // score X relative to group left

export class GameScene extends Phaser.Scene {
  // Systems
  private inputSystem!: InputSystem;
  private playerSystem!: PlayerSystem;
  private parallaxSystem!: ParallaxSystem;
  private roadSystem!: RoadSystem;
  private obstacleSystem!: ObstacleSystem;
  private difficultySystem!: DifficultySystem;
  private scoreSystem!: ScoreSystem;
  private fxSystem!: FXSystem;
  private audioSystem!: AudioSystem;
  private leaderboardSystem!: LeaderboardSystem;
  private musicPlayer!: MusicPlayer;
  private pickupSystem!: PickupSystem;
  private rocketSystem!: RocketSystem;
  private profileHud!: ProfileHud;
  private profilePopup!: ProfilePopup;
  private perfSystem!: PerfSystem;
  private orientationOverlay: OrientationOverlay | null = null;
  private shieldSystem!: ShieldSystem;

  // Custom cursor (rendered under CRT)
  private cursorStroke?: Phaser.GameObjects.Image;
  private cursorMain!: Phaser.GameObjects.Image;
  private crosshair!: Phaser.GameObjects.Image;
  private cursorOverUI: boolean = false;

  // Weekly seed
  private weekKey!: string;
  private weekSeed!: number;

  // State
  private state: GameState = GameState.TITLE;
  private elapsed: number = 0;
  private deadInputDelay: number = 0;

  // Death exposure transition
  private deathWhiteOverlay!: Phaser.GameObjects.Rectangle;
  private deathExplosion!: Phaser.GameObjects.Sprite;
  private dyingPhase: 'ramp' | 'snap' | 'hold' | 'fade' | 'done' = 'done';
  private dyingTimer: number = 0;

  // Katana slash
  private slashSprite!: Phaser.GameObjects.Sprite;
  private slashActiveTimer: number = 0;
  private slashCooldownTimer: number = 0;
  private slashInvincibilityTimer: number = 0;
  private rocketCooldownTimer: number = 0;

  // Score popups
  private scorePopups: Phaser.GameObjects.Text[] = [];

  // Lane highlights (collision warning)
  private laneHighlights: Phaser.GameObjects.Rectangle[] = [];

  // Lane warning indicators (pooled, right-edge preview circles)
  private warningPool: { circle: Phaser.GameObjects.Arc; preview: Phaser.GameObjects.Sprite; currentKey: string }[] = [];
  private warningPoolUsed: number = 0;

  // Rage meter
  private rageAmount: number = 0;
  private rageTimer: number = 0;       // seconds remaining in rage mode (0 = inactive)
  private roadSpeedBonus: number = 0;  // permanent speed increase from katana kills
  private rageZoomProgress: number = 0; // 0 = no zoom, 1 = full zoom (smoothly interpolated)
  private spectatorMode: boolean = false; // debug: invincible + explode obstacles on contact
  private hudHidden: boolean = false; // debug: hide HUD + music UI during gameplay
  private startHoldMode: boolean = false;  // debug: freeze at start until spacebar
  private startHoldTimer: number = 0;      // seconds elapsed in hold (must reach 2 before release)
  private startHoldActive: boolean = false; // currently holding at start
  private startHoldRampT: number = 0;      // 0→1 ramp progress after release
  private startHoldText!: Phaser.GameObjects.Text;
  private startHoldBlinkTween: Phaser.Tweens.Tween | null = null;

  // Title loop animation
  private titleLoopSprite!: Phaser.GameObjects.Sprite;

  // UI layers
  private hudLabel!: Phaser.GameObjects.Text;
  private hudHighScore!: Phaser.GameObjects.Text;
  private titleContainer!: Phaser.GameObjects.Container;
  private deathContainer!: Phaser.GameObjects.Container;
  private deathScoreText!: Phaser.GameObjects.Text;
  private deathTimeText!: Phaser.GameObjects.Text;
  private deathRankText!: Phaser.GameObjects.Text;
  private deathBestText!: Phaser.GameObjects.Text;
  private deathLeaderboardText!: Phaser.GameObjects.Text;
  private deathRestartText!: Phaser.GameObjects.Text;
  private highlightRank: number = 0;
  private deathLbEntriesContainer!: Phaser.GameObjects.Container;
  private highlightedRowTexts: Phaser.GameObjects.Text[] = [];
  private nameTitleText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private debugMusicSourceText: Phaser.GameObjects.Text | null = null;
  private spectatorLabel!: Phaser.GameObjects.Text;
  private debugHelpBg!: Phaser.GameObjects.Rectangle;
  private debugHelpText!: Phaser.GameObjects.Text;
  private collisionDebug: boolean = false;
  private collisionGfx!: Phaser.GameObjects.Graphics;

  // Name entry
  private nameEntryContainer!: Phaser.GameObjects.Container;
  private nameInputText!: Phaser.GameObjects.Text;
  private nameEnterBtn!: Phaser.GameObjects.Text;
  private enteredName: string = '';
  private pendingScore: number = 0;
  private pendingRank: number = 0;
  private nameKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private nameConfirmed: boolean = false;
  private autoSubmitted: boolean = false;
  private nameSkipConfirmPending: boolean = false;
  private nameSkipWarning!: Phaser.GameObjects.Text;
  private emptyNamePrompt!: Phaser.GameObjects.Text;
  private emptyNameYesBtn!: Phaser.GameObjects.Text;
  private emptyNameNoBtn!: Phaser.GameObjects.Text;
  private emptyNameVisible: boolean = false;
  private anyInputPressed: boolean = false;

  // Play-music overlay (shown once on first load, dismissed on first interaction)
  private playMusicOverlay!: Phaser.GameObjects.Image;
  private musicOverlayActive: boolean = true;

  // Countdown (5→1 before gameplay)
  private countdownSprite!: Phaser.GameObjects.Sprite;
  private blackOverlay!: Phaser.GameObjects.Rectangle;
  private countdownIndex: number = 0;
  private countdownPhaseTimer: number = 0;
  private countdownPhase: 'animate' | 'delay' | 'cutscene' | 'grace' | 'done' = 'done';
  private preStartSprite!: Phaser.GameObjects.Sprite;
  private spawnGraceTimer: number = 0;

  // Tutorial (pre-countdown screens)
  private introTutSprite!: Phaser.GameObjects.Sprite;
  private introTutPlaying: boolean = false;
  private tutorialBlank!: Phaser.GameObjects.Image;
  private tutorialControlsSprite!: Phaser.GameObjects.Sprite;
  private tutorialObstaclesImage!: Phaser.GameObjects.Image;
  private tutorialRageSprite!: Phaser.GameObjects.Sprite;
  private tutorialPhase: 'black_reveal' | 'controls_wait' | 'controls_fade' | 'obstacles_in' | 'obstacles_wait' | 'obstacles_fade' | 'rage_in' | 'rage_wait' | 'rage_black' | 'skip_fade' | 'done' = 'done';
  private tutorialTimer: number = 0;
  private tutorialAdvance: boolean = false;
  private tutorialSkipBtn!: Phaser.GameObjects.Image;

  // CRT post-processing
  private crtEnabled: boolean = true;
  private crtDebugVisible: boolean = false;
  private crtDebugDom!: Phaser.GameObjects.DOMElement;
  private crtDebugEl!: HTMLPreElement;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.elapsed = 0;
    this.state = GameState.TITLE;

    // Keyboard input — only Space/Enter advance title & tutorial; all keys blocked during BIOS
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      // Block ALL keyboard input while BIOS overlay is still visible
      const biosOverlay = document.getElementById('boot-overlay');
      if (biosOverlay && !biosOverlay.classList.contains('hidden')) return;
      // Forward all keys to profile popup when open
      if (this.profilePopup?.isOpen()) {
        this.profilePopup.handleKey(event);
        return;
      }
      if (k === 'escape') {
        if (this.state === GameState.NAME_ENTRY) {
          if (this.nameSkipConfirmPending) {
            // Second Escape — confirmed skip
            this.returnToTitle();
          } else {
            // First Escape — show warning
            this.nameSkipConfirmPending = true;
            this.nameSkipWarning.setVisible(true);
          }
        } else if (this.state !== GameState.TITLE) {
          this.returnToTitle();
        }
        return;
      }
      // Debug keys — don't advance game state (map Phaser key names to event.key values)
      const phaserToEventKey: Record<string, string> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', plus: '+', minus: '-', backtick: '`' };
      // Also block shared-key variants ('='→'+', '_'→'-', '~'→'`')
      if (k === '=' || k === '+' || k === '-' || k === '_' || k === '~' || k === '`') return;
      const debugKeys = Object.values(DEBUG_HOTKEYS).map(h => {
        const lk = h.key.toLowerCase();
        return phaserToEventKey[lk] || lk;
      });
      if (debugKeys.includes(k)) return;
      // Any non-Escape key dismisses the skip warning
      if (this.nameSkipConfirmPending) {
        this.nameSkipConfirmPending = false;
        this.nameSkipWarning.setVisible(false);
      }
      // Only Space and Enter can advance title/tutorial (other keys are ignored)
      const isAdvanceKey = k === ' ' || k === 'enter';
      if (this.state === GameState.TUTORIAL) {
        if (isAdvanceKey) this.tutorialAdvance = true;
      } else if (this.state === GameState.TITLE) {
        if (isAdvanceKey) {
          if (this.musicOverlayActive) {
            this.dismissMusicOverlay();
          } else {
            this.anyInputPressed = true;
          }
        }
      }
    });
    this.input.on('pointerdown', () => {
      if (this.profilePopup?.isOpen()) return;
      // Block clicks while BIOS overlay is still visible
      const biosOverlay = document.getElementById('boot-overlay');
      if (biosOverlay && !biosOverlay.classList.contains('hidden')) return;
      if (this.state === GameState.TUTORIAL || this.state === GameState.TITLE || this.state === GameState.STARTING) {
        this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME });
      }
      if (this.state === GameState.TUTORIAL) {
        this.tutorialAdvance = true;
      } else if (this.state === GameState.TITLE) {
        if (this.musicOverlayActive) {
          this.dismissMusicOverlay();
        } else {
          this.anyInputPressed = true;
        }
      }
    });

    // Weekly seed
    this.weekKey = getCurrentWeekKey();
    this.weekSeed = weekKeyToSeed(this.weekKey);
    this.leaderboardSystem = new LeaderboardSystem(this.weekKey);

    // --- Game world ---
    this.parallaxSystem = new ParallaxSystem(this);
    this.roadSystem = new RoadSystem(this);
    this.obstacleSystem = new ObstacleSystem(this, this.weekSeed);
    this.pickupSystem = new PickupSystem(this);
    this.rocketSystem = new RocketSystem(this, this.obstacleSystem);

    this.shieldSystem = new ShieldSystem(this);

    // Wire obstacle system to spawn pickups behind CRASH obstacles
    this.obstacleSystem.onPickupSpawn = (x: number, y: number) => {
      this.pickupSystem.spawn(x, y);
    };

    // Wire obstacle system to spawn shield pickups behind CRASH obstacles
    this.obstacleSystem.onShieldSpawn = (x: number, y: number) => {
      this.shieldSystem.spawn(x, y);
    };

    // Wire rocket hit: explosion sound + score bonus + popup + camera shake
    this.rocketSystem.onHit = (_x: number, _y: number) => {
      this.scoreSystem.addBonus(TUNING.ROCKET_KILL_POINTS);
      this.spawnScorePopup(TUNING.ROCKET_KILL_POINTS);
      this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 0.25, TUNING.SHAKE_DEATH_INTENSITY * 0.25);
    };

    this.difficultySystem = new DifficultySystem();
    this.inputSystem = new InputSystem(this);
    this.playerSystem = new PlayerSystem(this, this.inputSystem);
    this.scoreSystem = new ScoreSystem();
    this.fxSystem = new FXSystem(this);
    this.audioSystem = new AudioSystem(this);
    this.musicPlayer = new MusicPlayer(this);

    // Wire car-vs-crash explosion sound
    this.obstacleSystem.onExplosion = () => this.audioSystem.playExplosion();

    // Lane highlight overlays (collision warning — above road, below everything else)
    const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
    for (let i = 0; i < TUNING.LANE_COUNT; i++) {
      const laneY = TUNING.ROAD_TOP_Y + laneH * i + laneH / 2;
      const highlight = this.add.rectangle(
        TUNING.GAME_WIDTH / 2, laneY,
        TUNING.GAME_WIDTH, laneH,
        0xff0000, 0.1
      ).setDepth(0.5).setVisible(false);
      this.laneHighlights.push(highlight);
    }

    // Lane warning circles + preview sprites (pooled, right edge)
    const warningRadius = laneH / 3;
    const initialPoolSize = TUNING.LANE_COUNT * 3; // pre-warm enough for multiple per lane
    for (let i = 0; i < initialPoolSize; i++) {
      const circle = this.add.circle(0, 0, warningRadius, TUNING.WARNING_FILL_COLOR, TUNING.WARNING_FILL_ALPHA)
        .setDepth(95).setVisible(false);
      const preview = this.add.sprite(0, 0, 'obstacle-crash')
        .setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
      this.warningPool.push({ circle, preview, currentKey: '' });
    }

    // --- HUD (visible during PLAYING) ---
    this.hudLabel = this.add.text(TUNING.GAME_WIDTH / 2, 20, 'WEEKLY HIGH SCORE', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Alagard',
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0).setVisible(false);

    this.hudHighScore = this.add.text(TUNING.GAME_WIDTH / 2, 50, '', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'Early GameBoy',
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0).setVisible(false);

    // --- Performance monitor + orientation lock ---
    this.perfSystem = new PerfSystem();
    if (GAME_MODE.mobileMode) {
      this.orientationOverlay = new OrientationOverlay(this);
    }

    // --- Profile HUD (Phaser-based, upper-left, affected by shaders) ---
    this.profileHud = new ProfileHud(this);

    // --- Profile Popup (opens on avatar click) ---
    this.profilePopup = new ProfilePopup(this);
    this.profileHud.onAvatarClick(() => {
      this.profilePopup.open(this.profilePopup.getName());
    });
    this.profilePopup.onProfileChanged((name, hasAvatar) => {
      if (hasAvatar) {
        const key = this.profilePopup.getAvatarTextureKey();
        if (key) this.profileHud.setAvatarTexture(key);
      }
      // Update profile mode display if on title or death screen
      if (this.state === GameState.TITLE || this.state === GameState.DEAD) {
        this.profileHud.showProfileMode(name, this.getProfileRankText());
      }
    });
    // Load profile from Supabase early so the HUD is populated before the player sees it
    this.profilePopup.loadProfile();

    // Refresh HUD name + avatar after Spotify login/disconnect
    this.events.on('spotify-auth-changed', () => {
      const name = this.profilePopup.getName();
      const key = this.profilePopup.getAvatarTextureKey();
      if (key) this.profileHud.setAvatarTexture(key);
      if (this.state === GameState.TITLE || this.state === GameState.DEAD) {
        this.profileHud.showProfileMode(name, this.getProfileRankText());
      }
    });

    // --- Debug text ---
    this.debugText = this.add.text(16, 16, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setDepth(100).setVisible(false);

    this.spectatorLabel = this.add.text(20, TUNING.GAME_HEIGHT - 40, 'SPECTATOR', {
      fontSize: '18px',
      color: '#ff4444',
      fontFamily: 'Early GameBoy',
    }).setDepth(9999).setScrollFactor(0).setVisible(false);

    // --- Title loop animation (fullscreen, behind title text) ---
    this.titleLoopSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      'start-loop-00'
    ).setDepth(199);
    // Scale to fill screen
    const frameTex = this.textures.get('start-loop-00');
    const frameW = frameTex.getSourceImage().width;
    const frameH = frameTex.getSourceImage().height;
    this.titleLoopSprite.setDisplaySize(
      TUNING.GAME_WIDTH,
      TUNING.GAME_WIDTH * (frameH / frameW) // maintain aspect ratio
    );
    // If aspect ratio doesn't fill height, scale to cover
    if (this.titleLoopSprite.displayHeight < TUNING.GAME_HEIGHT) {
      this.titleLoopSprite.setDisplaySize(
        TUNING.GAME_HEIGHT * (frameW / frameH),
        TUNING.GAME_HEIGHT
      );
    }
    this.titleLoopSprite.play('title-loop');

    // --- Play-music overlay (on top of title, dismissed on first interaction) ---
    this.playMusicOverlay = this.add.image(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      'play-music-overlay'
    ).setDepth(201);
    // Scale to fill screen
    const overlayTex = this.textures.get('play-music-overlay');
    const overlayW = overlayTex.getSourceImage().width;
    const overlayH = overlayTex.getSourceImage().height;
    const scaleX = TUNING.GAME_WIDTH / overlayW;
    const scaleY = TUNING.GAME_HEIGHT / overlayH;
    const overlayScale = Math.max(scaleX, scaleY);
    this.playMusicOverlay.setScale(overlayScale);

    // --- Title screen ---
    this.titleContainer = this.add.container(0, 0).setDepth(200);
    const titleText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 - 60,
      '', {
        fontSize: '72px',
        color: '#ff4400',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);
    const startText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 40,
      '', {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    const weekText = this.add.text(
      TUNING.GAME_WIDTH - 1448, TUNING.GAME_HEIGHT - 850,
      `WEEK: ${this.weekKey}`, {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    this.titleContainer.add([titleText, startText, weekText]);

    // --- Death screen ---
    this.deathContainer = this.add.container(0, 0).setDepth(200);
    const deathBg = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      0x000000, 1
    );
    const deathTitle = this.add.text(
      TUNING.GAME_WIDTH / 2, 120,
      'wasted', {
        fontSize: '192px',
        color: '#ff0000',
        fontFamily: 'Alagard',
      }
    ).setOrigin(0.5);
    this.deathScoreText = this.add.text(
      TUNING.GAME_WIDTH / 2, 220,
      '', {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    this.deathTimeText = this.add.text(
      TUNING.GAME_WIDTH / 2, 270,
      '', {
        fontSize: '24px',
        color: '#aaaaaa',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    this.deathRankText = this.add.text(
      TUNING.GAME_WIDTH / 2, 320,
      '', {
        fontSize: '24px',
        color: '#ffcc00',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    this.deathBestText = this.add.text(
      TUNING.GAME_WIDTH / 2, 350,
      '', {
        fontSize: '20px',
        color: '#aaaaaa',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    this.deathLeaderboardText = this.add.text(
      TUNING.GAME_WIDTH / 2, 380,
      '', {
        fontSize: '28px',
        color: '#aaaaaa',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5, 0);
    this.deathLbEntriesContainer = this.add.container(0, 0);
    this.deathRestartText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 380,
      'Press SPACEBAR to try again', {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    this.deathContainer.add([deathBg, deathTitle, this.deathScoreText, this.deathTimeText, this.deathRankText, this.deathBestText, this.deathLeaderboardText, this.deathLbEntriesContainer, this.deathRestartText]);
    this.deathContainer.setVisible(false);

    // --- Name entry overlay (shown on top 10 scores) ---
    this.nameEntryContainer = this.add.container(0, 0).setDepth(210);
    const nameBg = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      0x000000, 1
    );
    this.nameTitleText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 - 120,
      'NEW HIGH SCORE!', {
        fontSize: '48px',
        color: '#ffcc00',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    const nameScoreLabel = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 - 60,
      '', {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    nameScoreLabel.setData('id', 'nameScoreLabel');
    const namePrompt = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 10,
      'ENTER YOUR NAME:', {
        fontSize: '24px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    this.nameInputText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 60,
      '_', {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5);
    this.nameSkipWarning = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 200,
      'Your score won\'t be saved! Press ESC again to skip.', {
        fontSize: '22px',
        color: '#ff4444',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setVisible(false);
    this.nameEntryContainer.add([nameBg, this.nameTitleText, nameScoreLabel, namePrompt, this.nameInputText, this.nameSkipWarning]);
    this.nameEntryContainer.setVisible(false);

    // ENTER button — scene-level (NOT inside container) so pointer events work reliably
    this.nameEnterBtn = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 140,
      '[ ENTER ]', {
        fontSize: '32px',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        backgroundColor: '#003300',
        padding: { x: 20, y: 10 },
      }
    ).setOrigin(0.5).setDepth(211).setInteractive({ useHandCursor: true });
    this.nameEnterBtn.on('pointerover', () => {
      this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME });
      this.nameEnterBtn.setColor('#ffffff').setBackgroundColor('#006600');
    });
    this.nameEnterBtn.on('pointerout', () => {
      this.nameEnterBtn.setColor('#00ff00').setBackgroundColor('#003300');
    });
    this.nameEnterBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME });
      if (this.state === GameState.NAME_ENTRY) {
        this.confirmNameEntry();
      }
    });
    this.nameEnterBtn.setVisible(false);

    // "Are you sure?" prompt + Yes/No buttons (scene-level for pointer events)
    this.emptyNamePrompt = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 200,
      'No name entered. Are you sure?', {
        fontSize: '24px',
        color: '#ff4444',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setDepth(212).setVisible(false);

    const btnStyle = {
      fontSize: '28px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      padding: { x: 24, y: 8 },
    };
    this.emptyNameYesBtn = this.add.text(
      TUNING.GAME_WIDTH / 2 - 100, TUNING.GAME_HEIGHT / 2 + 250,
      'YES', { ...btnStyle, color: '#ff4444', backgroundColor: '#330000' }
    ).setOrigin(0.5).setDepth(212).setInteractive({ useHandCursor: true }).setVisible(false);
    this.emptyNameYesBtn.on('pointerover', () => { this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }); this.emptyNameYesBtn.setColor('#ffffff').setBackgroundColor('#660000'); });
    this.emptyNameYesBtn.on('pointerout', () => this.emptyNameYesBtn.setColor('#ff4444').setBackgroundColor('#330000'));
    this.emptyNameYesBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME });
      if (this.state === GameState.NAME_ENTRY && this.emptyNameVisible) {
        this.submitAsAnon();
      }
    });

    this.emptyNameNoBtn = this.add.text(
      TUNING.GAME_WIDTH / 2 + 100, TUNING.GAME_HEIGHT / 2 + 250,
      'NO', { ...btnStyle, color: '#00ff00', backgroundColor: '#003300' }
    ).setOrigin(0.5).setDepth(212).setInteractive({ useHandCursor: true }).setVisible(false);
    this.emptyNameNoBtn.on('pointerover', () => { this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }); this.emptyNameNoBtn.setColor('#ffffff').setBackgroundColor('#006600'); });
    this.emptyNameNoBtn.on('pointerout', () => this.emptyNameNoBtn.setColor('#00ff00').setBackgroundColor('#003300'));
    this.emptyNameNoBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME });
      if (this.state === GameState.NAME_ENTRY && this.emptyNameVisible) {
        this.hideEmptyNamePrompt();
      }
    });

    // Black overlay for countdown (covers game world, below countdown numbers)
    this.blackOverlay = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      0x000000
    ).setDepth(249).setScrollFactor(0).setVisible(false);

    // Pre-start cutscene (fullscreen, plays once after countdown, above game world)
    this.preStartSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'pre-start-00000'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT)
     .setDepth(248).setScrollFactor(0).setVisible(false);

    // Intro-to-tutorial cutscene (fullscreen, plays once between title and tutorial)
    this.introTutSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'intro-tut-00000'
    ).setDisplaySize(TUNING.GAME_WIDTH * TUNING.INTRO_TUT_SCALE, TUNING.GAME_HEIGHT)
     .setDepth(248).setScrollFactor(0).setVisible(false);

    // Death exposure white overlay (above everything game-related)
    this.deathWhiteOverlay = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      0xffffff
    ).setDepth(1200).setScrollFactor(0).setAlpha(0).setVisible(false);

    // Countdown sprite (centered, high depth, hidden until enterStarting)
    this.countdownSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      'countdown', 0
    ).setDepth(250).setVisible(false);

    // Tutorial layers (above title, below black overlay)
    this.tutorialBlank = this.add.image(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'tutorial-blank'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT).setDepth(230).setVisible(false);

    this.tutorialControlsSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'tutorial-controls-00'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT).setDepth(231).setVisible(false);

    this.tutorialObstaclesImage = this.add.image(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'tutorial-obstacles'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT).setDepth(231).setVisible(false);

    this.tutorialRageSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'tutorial-rage-0'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT).setDepth(231).setVisible(false);

    // Tutorial skip button (bottom-right, above tutorial content, below black overlay)
    this.tutorialSkipBtn = this.add.image(0, 0, 'tutorial-skip')
      .setOrigin(0.5, 0.5).setScale(0.5).setAlpha(0.69).setDepth(248).setVisible(false).setInteractive({ useHandCursor: true }).setTintFill(0xffffff);
    // Position so bottom-right edge sits 30px from screen edges
    this.tutorialSkipBtn.setPosition(
      TUNING.GAME_WIDTH - SKIP_BTN_MARGIN_RIGHT - this.tutorialSkipBtn.displayWidth / 2,
      TUNING.GAME_HEIGHT - SKIP_BTN_MARGIN_BOTTOM - this.tutorialSkipBtn.displayHeight / 2,
    );
    this.tutorialSkipBtn.on('pointerover', () => {
      this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME });
      this.tweens.killTweensOf(this.tutorialSkipBtn);
      this.tweens.add({
        targets: this.tutorialSkipBtn,
        alpha: 1,
        scale: 0.575,
        duration: 400,
        ease: 'Sine.easeInOut',
      });
    });
    this.tutorialSkipBtn.on('pointerout', () => {
      this.tweens.killTweensOf(this.tutorialSkipBtn);
      this.tweens.add({
        targets: this.tutorialSkipBtn,
        alpha: 0.69,
        scale: 0.5,
        duration: 400,
        ease: 'Sine.easeInOut',
      });
    });
    this.tutorialSkipBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME });
      if (this.state === GameState.TUTORIAL && this.tutorialPhase !== 'skip_fade' && this.tutorialPhase !== 'done') {
        // Flash red, shrink smoothly from current scale to base, fade out over 0.5s
        this.tweens.killTweensOf(this.tutorialSkipBtn);
        this.tutorialSkipBtn.setTintFill(0xff0000);
        this.tutorialSkipBtn.disableInteractive();
        this.tweens.add({
          targets: this.tutorialSkipBtn,
          alpha: 0,
          scale: 0.5,
          duration: 500,
          ease: 'Sine.easeIn',
          onComplete: () => {
            this.tutorialSkipBtn.setVisible(false);
            this.tutorialSkipBtn.setTintFill(0xffffff);
            this.tutorialSkipBtn.setAlpha(0.69);
            this.tutorialPhase = 'skip_fade';
            this.tutorialTimer = 0;
            this.blackOverlay.setVisible(true).setAlpha(0);
          },
        });
      }
    });

    // Death explosion (hidden, reused each death — depth set dynamically in enterDead)
    this.deathExplosion = this.add.sprite(0, 0, 'explosion');
    this.deathExplosion.setVisible(false);

    // Katana slash VFX sprite (hidden until activated)
    this.slashSprite = this.add.sprite(0, 0, 'slash-vfx');
    this.slashSprite.setVisible(false).setDepth(4);
    this.slashActiveTimer = 0;
    this.slashCooldownTimer = 0;

    // Hide player until game starts
    this.playerSystem.setVisible(false);

    // Start hold text — shown during hold phase, hidden when ramp begins
    this.startHoldText = this.add.text(TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2, 'HOLD SPACEBAR TO GO', {
      fontFamily: 'Early GameBoy',
      fontSize: '36px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1000).setScrollFactor(0).setVisible(false);

    // --- CRT post-processing ---
    this.cameras.main.setPostPipeline(CRTPipeline);

    // --- Custom cursor (under CRT shader) ---
    this.game.canvas.style.cursor = 'none';
    const cursorTex = this.textures.get('cursor').getSourceImage();
    const aspect = cursorTex.width / cursorTex.height;
    const curH = TUNING.CURSOR_SIZE;
    const curW = curH * aspect;
    if (TUNING.CURSOR_STROKE_W > 0) {
      const strokeH = curH + TUNING.CURSOR_STROKE_W * 2;
      const strokeW = strokeH * aspect;
      this.cursorStroke = this.add.image(0, 0, 'cursor')
        .setDisplaySize(strokeW, strokeH)
        .setTintFill(TUNING.CURSOR_STROKE_COLOR)
        .setDepth(TUNING.CURSOR_DEPTH)
        .setScrollFactor(0);
    }
    this.cursorMain = this.add.image(0, 0, 'cursor')
      .setDisplaySize(curW, curH)
      .setTintFill(TUNING.CURSOR_TINT)
      .setDepth(TUNING.CURSOR_DEPTH + 1)
      .setScrollFactor(0);

    // Crosshair cursor (shown during gameplay only, same depth as main cursor)
    const chTex = this.textures.get('crosshair').getSourceImage();
    const chAspect = chTex.width / chTex.height;
    const chH = TUNING.CURSOR_SIZE * TUNING.CROSSHAIR_SCALE;
    const chW = chH * chAspect;
    this.crosshair = this.add.image(0, 0, 'crosshair')
      .setDisplaySize(chW, chH)
      .setTintFill(0xff0000)
      .setDepth(TUNING.CURSOR_DEPTH + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // CRT debug overlay (DOM element — not affected by CRT shader)
    this.crtDebugEl = document.createElement('pre');
    Object.assign(this.crtDebugEl.style, {
      margin: '0',
      fontSize: '13px',
      color: '#00ff00',
      fontFamily: 'monospace',
      backgroundColor: 'rgba(0,0,0,0.67)',
      padding: '6px 8px',
      whiteSpace: 'pre',
      lineHeight: '1.4',
    });
    this.crtDebugDom = this.add.dom(16, TUNING.GAME_HEIGHT - 320, this.crtDebugEl)
      .setOrigin(0, 0)
      .setDepth(300)
      .setVisible(false)
      .setScrollFactor(0);

    // Debug hotkeys registered in create() (event-based)
    if (DEBUG_HOTKEYS.toggleCRT.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleCRT.key).on('down', () => {
        this.crtEnabled = !this.crtEnabled;
        const pipes = this.cameras.main.getPostPipeline(CRTPipeline);
        if (Array.isArray(pipes)) {
          pipes.forEach(p => p.active = this.crtEnabled);
        } else if (pipes) {
          pipes.active = this.crtEnabled;
        }
      });
    }
    if (DEBUG_HOTKEYS.crtDebug.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.crtDebug.key).on('down', () => {
        this.crtDebugVisible = !this.crtDebugVisible;
        this.crtDebugDom.setVisible(this.crtDebugVisible);
        if (this.crtDebugVisible) this.updateCRTDebugText();
      });
    }

    // Signal boot overlay that the start screen is ready
    (window as any).__bootOverlay?.markStartScreenReady?.();

    // Attempt to autoplay title music — skip overlay if browser allows it
    this.tryAutoplayMusic();

    if (DEBUG_HOTKEYS.instantRage.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.instantRage.key).on('down', () => {
        if (this.state === GameState.PLAYING && this.rageTimer <= 0) {
          this.rageAmount = TUNING.RAGE_MAX;
          this.rageTimer = TUNING.RAGE_DURATION;
          this.playerSystem.playPoweredUp();
          this.musicPlayer.setVolumeBoost(TUNING.RAGE_MUSIC_VOLUME_BOOST);
          this.audioSystem.setDistortion(TUNING.RAGE_AUDIO_DISTORTION);
        }
      });
    }
    if (DEBUG_HOTKEYS.spectatorMode.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.spectatorMode.key).on('down', () => {
        this.spectatorMode = !this.spectatorMode;
        this.playerSystem.setSpectator(this.spectatorMode);
        this.spectatorLabel.setVisible(this.spectatorMode);
      });
    }
    // Parallax layer toggles (keys 1-7)
    for (let i = 0; i < 7; i++) {
      const hotkey = [
        DEBUG_HOTKEYS.toggleLayer1, DEBUG_HOTKEYS.toggleLayer2, DEBUG_HOTKEYS.toggleLayer3,
        DEBUG_HOTKEYS.toggleLayer4, DEBUG_HOTKEYS.toggleLayer5, DEBUG_HOTKEYS.toggleLayer6,
        DEBUG_HOTKEYS.toggleLayer7,
      ][i];
      if (hotkey.active) {
        const layerIdx = i;
        this.input.keyboard?.addKey(hotkey.key).on('down', () => {
          this.parallaxSystem.toggleLayer(layerIdx);
        });
      }
    }
    // Sky toggle (key 8)
    if (DEBUG_HOTKEYS.toggleSky.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleSky.key).on('down', () => {
        this.parallaxSystem.toggleSky();
      });
    }
    // Road toggle (key 9)
    if (DEBUG_HOTKEYS.toggleRoad.active) {
      let roadVisible = true;
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleRoad.key).on('down', () => {
        roadVisible = !roadVisible;
        this.roadSystem.setVisible(roadVisible);
      });
    }
    // Hide HUD (G) — only during gameplay
    if (DEBUG_HOTKEYS.hideHud.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.hideHud.key).on('down', () => {
        if (this.state !== GameState.PLAYING) return;
        this.hudHidden = !this.hudHidden;
        const v = !this.hudHidden;
        // UI elements
        this.profileHud.setVisible(v);
        this.hudLabel.setVisible(v);
        this.hudHighScore.setVisible(v);
        this.musicPlayer.setVisible(v);
        this.spectatorLabel.setVisible(v && this.spectatorMode);
        this.startHoldText.setVisible(v && this.startHoldActive);
        // World objects
        this.obstacleSystem.setVisible(v);
        this.pickupSystem.setVisible(v);
        this.shieldSystem.setVisible(v);
        for (let i = 0; i < this.warningPool.length; i++) {
          this.warningPool[i].circle.setVisible(v);
          this.warningPool[i].preview.setVisible(v);
        }
        for (let i = 0; i < this.laneHighlights.length; i++) {
          this.laneHighlights[i].setVisible(false);
        }
        // Suppress explosions and screen shakes
        this.obstacleSystem.setSuppressExplosions(this.hudHidden);
        this.fxSystem.setSuppressShake(this.hudHidden);
      });
    }

    if (DEBUG_HOTKEYS.startHold.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.startHold.key).on('down', () => {
        this.startHoldMode = !this.startHoldMode; // when true, skips the start hold
      });
    }

    // Debug help overlay — black box with neon green text listing active hotkeys
    {
      const lines: string[] = [];
      const entries: { label: string; key: string; desc: string }[] = [
        { label: 'gameplayInfo',    key: DEBUG_HOTKEYS.gameplayInfo.key,    desc: 'Toggle gameplay debug info' },
        { label: 'musicSource',     key: DEBUG_HOTKEYS.musicSource.key,     desc: 'Toggle music source label' },
        { label: 'jumpLeaderboard', key: DEBUG_HOTKEYS.jumpLeaderboard.key, desc: 'Skip to death/leaderboard' },
        { label: 'toggleCRT',       key: DEBUG_HOTKEYS.toggleCRT.key,       desc: 'Toggle CRT shader' },
        { label: 'crtDebug',        key: DEBUG_HOTKEYS.crtDebug.key,        desc: 'Toggle CRT tuning overlay' },
        { label: 'instantRage',     key: DEBUG_HOTKEYS.instantRage.key,     desc: 'Trigger instant rage' },
        { label: 'spectatorMode',   key: DEBUG_HOTKEYS.spectatorMode.key,   desc: 'Toggle spectator mode' },
        { label: 'toggleLayer 1-7', key: '1-7',                             desc: 'Toggle parallax layers' },
        { label: 'toggleSky',       key: DEBUG_HOTKEYS.toggleSky.key,       desc: 'Toggle sky background' },
        { label: 'toggleRoad',      key: DEBUG_HOTKEYS.toggleRoad.key,      desc: 'Toggle road' },
        { label: 'hideHud',         key: DEBUG_HOTKEYS.hideHud.key,         desc: 'Hide HUD + music UI' },
        { label: 'showHelp',        key: '+',                               desc: 'Toggle this help overlay' },
        { label: 'showCollisions',  key: '-',                               desc: 'Toggle collision hitboxes' },
        { label: 'startHold',       key: '`',                               desc: 'Skip start hold' },
      ];
      // Only include active hotkeys
      const activeLabels = new Set(
        Object.entries(DEBUG_HOTKEYS).filter(([, v]) => v.active).map(([k]) => k)
      );
      for (const e of entries) {
        // Layer toggles: show if any layer toggle is active
        if (e.label === 'toggleLayer 1-7') {
          const anyLayer = ['toggleLayer1','toggleLayer2','toggleLayer3','toggleLayer4','toggleLayer5','toggleLayer6','toggleLayer7'].some(k => activeLabels.has(k));
          if (anyLayer) lines.push(`  [${e.key}]  ${e.desc}`);
        } else if (activeLabels.has(e.label)) {
          lines.push(`  [${e.key}]  ${e.desc}`);
        }
      }
      const helpStr = '  DEBUG HOTKEYS\n  ─────────────────────────────────────\n' + lines.join('\n');
      const pad = 40;
      this.debugHelpText = this.add.text(pad + 30, pad + 30, helpStr, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#00ff00',
        lineSpacing: 14,
      }).setDepth(9999).setScrollFactor(0).setVisible(false);

      const bounds = this.debugHelpText.getBounds();
      this.debugHelpBg = this.add.rectangle(
        pad, pad,
        bounds.width + 60, bounds.height + 60,
        0x000000, 0.92
      ).setOrigin(0, 0).setDepth(9998).setScrollFactor(0).setVisible(false);

      if (DEBUG_HOTKEYS.showHelp.active) {
        this.input.keyboard?.addKey(DEBUG_HOTKEYS.showHelp.key).on('down', () => {
          const show = !this.debugHelpBg.visible;
          this.debugHelpBg.setVisible(show);
          this.debugHelpText.setVisible(show);
        });
      }
    }

    // Collision debug overlay
    this.collisionGfx = this.add.graphics().setDepth(9000);
    if (DEBUG_HOTKEYS.showCollisions.active) {
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.showCollisions.key).on('down', () => {
        this.collisionDebug = !this.collisionDebug;
        if (!this.collisionDebug) this.collisionGfx.clear();
      });
    }
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    // Custom cursor follows pointer
    const ptr = this.input.activePointer;
    this.cursorMain.setPosition(ptr.x, ptr.y);
    this.cursorStroke?.setPosition(ptr.x, ptr.y);
    this.crosshair.setPosition(ptr.x, ptr.y);

    // Fade cursor/crosshair when hovering over music UI overlay
    const overUI = this.musicPlayer.isCursorOverUI();
    if (overUI !== this.cursorOverUI) {
      this.cursorOverUI = overUI;
      const alpha = overUI ? 0 : 1;
      this.tweens.killTweensOf(this.cursorMain);
      this.tweens.add({ targets: this.cursorMain, alpha, duration: 200 });
      if (this.cursorStroke) {
        this.tweens.killTweensOf(this.cursorStroke);
        this.tweens.add({ targets: this.cursorStroke, alpha, duration: 200 });
      }
      this.tweens.killTweensOf(this.crosshair);
      this.tweens.add({ targets: this.crosshair, alpha, duration: 200 });
    }

    this.perfSystem.update(dt);
    this.inputSystem.update(dt);
    if (this.orientationOverlay) {
      this.orientationOverlay.update();
      if (this.orientationOverlay.isPaused()) return;
    }

    // Debug hotkeys polled in update()
    if (DEBUG_HOTKEYS.gameplayInfo.active && this.input.keyboard
        && Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(DEBUG_HOTKEYS.gameplayInfo.key))) {
      this.debugText.setVisible(!this.debugText.visible);
      if (!this.debugText.visible) this.debugText.setText('');
    }

    if (DEBUG_HOTKEYS.musicSource.active && this.input.keyboard
        && Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(DEBUG_HOTKEYS.musicSource.key))) {
      if (!this.debugMusicSourceText) {
        this.debugMusicSourceText = this.add.text(TUNING.GAME_WIDTH - 40, 150, '', {
          fontSize: '18px', color: '#00ff00', fontFamily: 'monospace',
        }).setOrigin(1, 0).setDepth(9999).setScrollFactor(0);
      }
      this.debugMusicSourceText.setVisible(!this.debugMusicSourceText.visible);
    }
    if (this.debugMusicSourceText?.visible) {
      this.debugMusicSourceText.setText(`SRC: ${this.musicPlayer.getSource().toUpperCase()}`);
    }

    if (DEBUG_HOTKEYS.jumpLeaderboard.active && this.input.keyboard
        && Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(DEBUG_HOTKEYS.jumpLeaderboard.key))
        && this.state !== GameState.DEAD) {
      if (this.leaderboardSystem.getDisplayEntries().length < 10) {
        const names = ['ACE', 'BLAZE', 'CRUX', 'DRIFT', 'EDGE', 'FLUX', 'GRIM', 'HAWK', 'JINX', 'KOVA'];
        for (let i = 0; i < 10; i++) {
          this.leaderboardSystem.submit(names[i], 5000 - i * 400, 60 - i * 4);
        }
      }
      this.pendingScore = 3800;
      this.elapsed = 42;
      const rank = this.leaderboardSystem.wouldMakeBoard(this.pendingScore);
      if (rank > 0) this.leaderboardSystem.submit(this.profilePopup.getName() || 'ANON', this.pendingScore, this.elapsed);
      this.deathContainer.setVisible(true);
      this.showDeathScreen(rank || 3);
    }

    switch (this.state) {
      case GameState.TITLE:
        this.updateTitle(dt);
        break;
      case GameState.TUTORIAL:
        this.updateTutorial(dt);
        break;
      case GameState.STARTING:
        this.updateStarting(dt);
        break;
      case GameState.PLAYING:
        this.updatePlaying(dt);
        break;
      case GameState.DYING:
        this.updateDying(dt);
        break;
      case GameState.NAME_ENTRY:
        this.updateNameEntry(dt);
        break;
      case GameState.DEAD:
        this.updateDead(dt);
        break;
    }

    // Collision debug overlay
    if (this.collisionDebug) {
      this.drawCollisionDebug();
    }
  }

  private updateTitle(dt: number): void {
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.roadSystem.update(titleSpeed, dt);

    if (this.anyInputPressed) {
      this.anyInputPressed = false;
      // Drain queued inputs so they don't carry into gameplay
      this.inputSystem.getSpeedTap();
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      // Start audio on first user gesture
      this.audioSystem.start();
      this.enterTutorial();
    }
  }

  private updateStarting(dt: number): void {
    // Keep background scrolling during countdown
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.roadSystem.update(titleSpeed, dt);

    // Drain inputs so nothing queues up during countdown
    this.inputSystem.getSpeedTap();
    this.inputSystem.getAttackPressed();
    this.inputSystem.getRocketPressed();

    if (this.countdownPhase === 'done') return;

    this.countdownPhaseTimer += dt;

    if (this.countdownPhase === 'animate') {
      const dur = TUNING.COUNTDOWN_NUMBER_DURATION;
      const t = Math.min(this.countdownPhaseTimer / dur, 1);

      // Scale: ease-out cubic (fast start, slow end) — 0.5× to 1×
      const scaleT = 1 - Math.pow(1 - t, 3);
      this.countdownSprite.setScale(0.5 + scaleT * 0.5);

      // Alpha: ease-in cubic (slow start, fast end) — 1 to 0
      const alphaT = Math.pow(t, 3);
      this.countdownSprite.setAlpha(1 - alphaT);

      if (t >= 1) {
        // Number animation done — move to delay before next
        this.countdownPhase = 'delay';
        this.countdownPhaseTimer = 0;
        this.countdownSprite.setVisible(false);

        // When "2" finishes animating, start the cutscene + fade black + reveal music UI
        if (this.countdownIndex === TUNING.COUNTDOWN_FRAMES - 2) {
          this.musicPlayer.revealForGameplay();
          this.titleLoopSprite.stop();
          this.titleLoopSprite.setVisible(false);
          this.playerSystem.reset();
          this.preStartSprite.setVisible(true).setAlpha(1);
          this.preStartSprite.play('pre-start-cutscene');
          this.preStartSprite.once('animationcomplete', () => {
            if (this.countdownPhase !== 'done') {
              this.countdownPhase = 'done';
              this.startGame();
              this.spawnGraceTimer = TUNING.COUNTDOWN_SPAWN_DELAY;
              this.tweens.add({
                targets: this.preStartSprite,
                alpha: 0,
                duration: 1000,
                onComplete: () => {
                  this.preStartSprite.setVisible(false);
                },
              });
            }
          });
          // Fade black overlay + cursor out over the delay period
          const fadeDur = TUNING.COUNTDOWN_DELAY * 1000;
          this.tweens.add({ targets: this.blackOverlay, alpha: 0, duration: fadeDur });
          this.tweens.add({ targets: this.cursorMain, alpha: 0, duration: fadeDur });
          if (this.cursorStroke) {
            this.tweens.add({ targets: this.cursorStroke, alpha: 0, duration: fadeDur });
          }
        }
      }
    } else if (this.countdownPhase === 'delay') {
      const wait = this.countdownIndex < 0
        ? TUNING.COUNTDOWN_INITIAL_DELAY
        : TUNING.COUNTDOWN_DELAY;
      if (this.countdownPhaseTimer >= wait) {
        const nextIndex = this.countdownIndex + 1;
        if (nextIndex >= TUNING.COUNTDOWN_FRAMES - 1) {
          // Skip "1" — go straight to cutscene phase (black already faded during "2"'s delay)
          this.countdownPhase = 'cutscene';
          this.countdownPhaseTimer = 0;
          this.countdownSprite.setVisible(false);
          this.blackOverlay.setVisible(false);
        } else {
          // Show next number
          this.countdownIndex = nextIndex;
          this.countdownPhaseTimer = 0;
          this.countdownPhase = 'animate';
          this.countdownSprite.setFrame(this.countdownIndex);
          this.countdownSprite.setScale(0.5);
          this.countdownSprite.setAlpha(1);
          this.countdownSprite.setVisible(true);
        }
      }
    } else if (this.countdownPhase === 'cutscene') {
      // Cutscene playing — just wait for animationcomplete callback
    }
  }

  private returnToTitle(): void {
    this.state = GameState.TITLE;
    this.setCrosshairMode(false);
    this.elapsed = 0;

    // Clean up tutorial
    this.tutorialPhase = 'done';
    this.tutorialBlank.setVisible(false);
    this.tutorialControlsSprite.setVisible(false);
    this.tutorialControlsSprite.stop();
    this.tutorialObstaclesImage.setVisible(false);
    this.tutorialRageSprite.setVisible(false);
    this.tutorialRageSprite.stop();
    this.tutorialSkipBtn.setVisible(false);

    // Restore cursor visibility
    this.cursorMain.setVisible(true).setAlpha(1);
    this.cursorStroke?.setVisible(true).setAlpha(1);

    // Clean up any active game state
    this.countdownPhase = 'done';
    this.dyingPhase = 'done';
    this.deathWhiteOverlay.setVisible(false);
    this.countdownSprite.setVisible(false);
    this.blackOverlay.setVisible(false);
    this.preStartSprite.setVisible(false);
    this.preStartSprite.stop();
    this.introTutSprite.setVisible(false);
    this.introTutSprite.stop();
    this.introTutPlaying = false;
    this.playerSystem.setVisible(false);
    this.deathExplosion.setVisible(false);
    this.slashSprite.setVisible(false);
    this.slashActiveTimer = 0;
    this.slashCooldownTimer = 0;
    this.slashInvincibilityTimer = 0;
    this.startHoldActive = false;
    this.startHoldText.setVisible(false);
    this.obstacleSystem.reset(this.weekSeed);
    this.fxSystem.reset();
    this.audioSystem.silenceEngine();
    this.rageZoomProgress = 0;
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.adjustHudForZoom(1);
    this.pickupSystem.reset();
    this.pickupSystem.setHUDVisible(false);
    this.rocketSystem.reset();
    this.rocketCooldownTimer = 0;
    this.shieldSystem.reset();
    this.hideWarningPool();

    // Hide all overlays
    this.hudLabel.setVisible(false);
    this.hudHighScore.setVisible(false);
    this.deathContainer.setVisible(false);
    this.highlightRank = 0;
    this.deathLbEntriesContainer.removeAll(true);
    this.highlightedRowTexts = [];
    this.nameEntryContainer.setVisible(false);
    this.nameEnterBtn.setVisible(false);
    this.playMusicOverlay.setAlpha(0).setVisible(false);
    this.debugText.setText('');

    // Clean up name entry keyboard handler if active
    if (this.nameKeyHandler) {
      this.input.keyboard?.off('keydown', this.nameKeyHandler);
      this.nameKeyHandler = null;
    }
    this.nameConfirmed = false;
    this.nameSkipConfirmPending = false;
    this.nameSkipWarning.setVisible(false);
    this.emptyNameVisible = false;
    this.emptyNamePrompt.setVisible(false);
    this.emptyNameYesBtn.setVisible(false);
    this.emptyNameNoBtn.setVisible(false);

    // Reset auto-submit state
    this.autoSubmitted = false;
    this.deathBestText.setVisible(false);

    // Restore road/parallax and show title screen
    this.roadSystem.setVisible(true);
    this.parallaxSystem.setVisible(true);
    this.titleLoopSprite.setVisible(true);
    this.titleLoopSprite.play('title-loop');
    this.titleContainer.setVisible(true);

    // Hide music player UI on title (music keeps playing)
    this.musicPlayer.setVisible(false);

    // ProfileHud in profile mode on title
    this.profileHud.showProfileMode(this.profilePopup.getName(), this.getProfileRankText());
    this.profileHud.setAlpha(1);
    this.profileHud.setVisible(true);
  }

  private tryAutoplayMusic(): void {
    if (!this.cache.audio.exists('title-music')) return;
    const testSound = this.sound.add('title-music', { loop: true, volume: 0 });
    testSound.play();
    // Check if the browser actually allowed playback
    if (testSound.isPlaying) {
      // Autoplay worked — hand off to MusicPlayer and skip the overlay
      testSound.stop();
      testSound.destroy();
      this.musicPlayer.startTitleMusic();
      this.musicOverlayActive = false;
      this.playMusicOverlay.setVisible(false);
      this.profileHud.showProfileMode(this.profilePopup.getName(), this.getProfileRankText());
      this.profileHud.setVisible(true);
    } else {
      // Autoplay blocked — clean up and keep the overlay as fallback
      testSound.stop();
      testSound.destroy();
    }
  }

  private dismissMusicOverlay(): void {
    this.musicOverlayActive = false;
    this.musicPlayer.startTitleMusic();
    this.profileHud.showProfileMode(this.profilePopup.getName(), this.getProfileRankText());
    this.profileHud.setVisible(true);
    this.tweens.add({
      targets: this.playMusicOverlay,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => {
        this.playMusicOverlay.setVisible(false);
      },
    });
  }

  private enterTutorial(): void {
    this.state = GameState.TUTORIAL;
    this.titleContainer.setVisible(false);

    // Switch from loop to play-once start animation (fire-and-forget visual underneath)
    this.titleLoopSprite.play('title-start');
    this.titleLoopSprite.once('animationcomplete', () => {
      this.titleLoopSprite.stop();
      this.titleLoopSprite.setVisible(false);
    });

    // Play intro-to-tutorial cutscene over everything
    this.introTutPlaying = true;
    this.introTutSprite.setVisible(true).setAlpha(1);
    this.introTutSprite.play('intro-tut-cutscene');
    this.introTutSprite.once('animationcomplete', () => {
      // Cutscene finished — fade it out to reveal the tutorial underneath
      this.tweens.add({
        targets: this.introTutSprite,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          this.introTutSprite.setVisible(false);
          this.introTutPlaying = false;
        },
      });
      // Cutscene fades out to reveal controls directly — skip black_reveal
      this.tutorialPhase = 'controls_wait';
      this.tutorialTimer = 0;
      this.tutorialAdvance = false;
      this.tutorialSkipBtn.setVisible(true).setAlpha(0.69).setScale(0.5).setTintFill(0xffffff).setInteractive({ useHandCursor: true });
    });

    // Prepare tutorial layers underneath the cutscene (hidden by black overlay)
    this.tutorialBlank.setVisible(true);
    this.tutorialControlsSprite.setVisible(true).setAlpha(1);
    this.tutorialControlsSprite.play('tutorial-controls');
    this.tutorialObstaclesImage.setVisible(false).setAlpha(0);
    this.tutorialRageSprite.setVisible(false).setAlpha(0);

    // Black overlay starts hidden — will be shown when cutscene finishes
    this.blackOverlay.setVisible(false);

    // Tutorial phases start as 'done' — cutscene callback will kick off 'black_reveal'
    this.tutorialPhase = 'done';
    this.tutorialTimer = 0;
    this.tutorialAdvance = false;
  }

  private updateTutorial(dt: number): void {
    // Keep background scrolling during tutorial
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.roadSystem.update(titleSpeed, dt);

    // Drain game inputs so nothing queues up
    this.inputSystem.getSpeedTap();
    this.inputSystem.getAttackPressed();
    this.inputSystem.getRocketPressed();

    if (this.tutorialPhase === 'done') return;

    this.tutorialTimer += dt;
    const fadeDur = TUNING.TUTORIAL_FADE_DURATION;

    switch (this.tutorialPhase) {
      case 'black_reveal': {
        // Black overlay fading 1→0 to reveal controls underneath
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.blackOverlay.setAlpha(1 - t);
        if (t >= 1) {
          this.blackOverlay.setVisible(false);
          this.tutorialPhase = 'controls_wait';
          this.tutorialTimer = 0;
          this.tutorialAdvance = false;
        }
        break;
      }
      case 'controls_wait': {
        if (this.tutorialAdvance) {
          this.tutorialAdvance = false;
          this.tutorialPhase = 'controls_fade';
          this.tutorialTimer = 0;
        }
        break;
      }
      case 'controls_fade': {
        // Controls fading out, blank visible underneath
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.tutorialControlsSprite.setAlpha(1 - t);
        if (t >= 1) {
          this.tutorialControlsSprite.setVisible(false);
          this.tutorialControlsSprite.stop();
          this.tutorialPhase = 'obstacles_in';
          this.tutorialTimer = 0;
        }
        break;
      }
      case 'obstacles_in': {
        // Obstacles image fading in on top of blank
        this.tutorialObstaclesImage.setVisible(true);
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.tutorialObstaclesImage.setAlpha(t);
        if (t >= 1) {
          this.tutorialPhase = 'obstacles_wait';
          this.tutorialTimer = 0;
          this.tutorialAdvance = false;
        }
        break;
      }
      case 'obstacles_wait': {
        if (this.tutorialAdvance) {
          this.tutorialAdvance = false;
          this.tutorialPhase = 'obstacles_fade';
          this.tutorialTimer = 0;
        }
        break;
      }
      case 'obstacles_fade': {
        // Obstacles fading out, blank visible underneath
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.tutorialObstaclesImage.setAlpha(1 - t);
        if (t >= 1) {
          this.tutorialObstaclesImage.setVisible(false);
          // Start rage animation and begin fading it in
          this.tutorialRageSprite.setVisible(true).setAlpha(0);
          this.tutorialRageSprite.play('tutorial-rage');
          this.tutorialPhase = 'rage_in';
          this.tutorialTimer = 0;
        }
        break;
      }
      case 'rage_in': {
        // Rage sequence fading in
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.tutorialRageSprite.setAlpha(t);
        if (t >= 1) {
          this.tutorialPhase = 'rage_wait';
          this.tutorialTimer = 0;
          this.tutorialAdvance = false;
        }
        break;
      }
      case 'rage_wait': {
        if (this.tutorialAdvance) {
          this.tutorialAdvance = false;
          this.tutorialPhase = 'rage_black';
          this.tutorialTimer = 0;
          // Show black overlay, fade from 0→1 ON TOP of rage
          this.blackOverlay.setVisible(true).setAlpha(0);
        }
        break;
      }
      case 'rage_black': {
        // Black overlay fading in over rage
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.blackOverlay.setAlpha(t);
        if (t >= 1) {
          // Tutorial done — clean up all tutorial elements
          this.tutorialControlsSprite.setVisible(false);
          this.tutorialObstaclesImage.setVisible(false);
          this.tutorialRageSprite.setVisible(false);
          this.tutorialRageSprite.stop();
          this.tutorialBlank.setVisible(false);
          this.tutorialSkipBtn.setVisible(false);
          this.tutorialPhase = 'done';

          // Start playlist music and begin countdown
          this.musicPlayer.switchToPlaylist();
          this.enterStarting();
        }
        break;
      }
      case 'skip_fade': {
        // Fade to black then skip straight to countdown
        const t = Math.min(this.tutorialTimer / fadeDur, 1);
        this.blackOverlay.setAlpha(t);
        if (t >= 1) {
          // Clean up all tutorial elements
          this.tutorialControlsSprite.setVisible(false);
          this.tutorialControlsSprite.stop();
          this.tutorialObstaclesImage.setVisible(false);
          this.tutorialRageSprite.setVisible(false);
          this.tutorialRageSprite.stop();
          this.tutorialBlank.setVisible(false);
          this.tutorialPhase = 'done';

          // Start playlist music and begin countdown
          this.musicPlayer.switchToPlaylist();
          this.enterStarting();
        }
        break;
      }
    }
  }

  private enterStarting(): void {
    this.state = GameState.STARTING;
    // blackOverlay already at alpha 1 from tutorial
    this.titleContainer.setVisible(false);
    this.titleLoopSprite.stop();
    this.titleLoopSprite.setVisible(false);

    // Fade out profile HUD during countdown
    this.tweens.add({
      targets: this.profileHud.getContainer(),
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
    });

    // Start countdown (5→2, then fade black to reveal game) — begin with initial delay
    this.countdownIndex = -1;
    this.countdownPhaseTimer = 0;
    this.countdownPhase = 'delay';
    this.countdownSprite.setVisible(false);
  }

  private setCrosshairMode(enabled: boolean): void {
    this.tweens.killTweensOf(this.crosshair);
    if (enabled) {
      this.crosshair.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.crosshair, alpha: 1, duration: 1500 });
    } else {
      this.crosshair.setVisible(false).setAlpha(0);
    }
    this.cursorMain.setVisible(!enabled);
    if (this.cursorStroke) this.cursorStroke.setVisible(!enabled);
  }

  private startGame(): void {
    this.state = GameState.PLAYING;
    this.setCrosshairMode(true);
    this.musicPlayer.setCompact(false);
    this.elapsed = 0;
    this.spawnGraceTimer = 0;
    this.blackOverlay.setVisible(false);
    this.deathWhiteOverlay.setVisible(false);
    this.dyingPhase = 'done';
    this.roadSystem.setVisible(true);
    this.parallaxSystem.setVisible(true);
    this.playerSystem.reset();
    if (this.spectatorMode) this.playerSystem.setSpectator(true);
    this.playerSystem.setVisible(true);
    this.obstacleSystem.reset(this.weekSeed);
    this.difficultySystem.reset();
    this.scoreSystem.reset();
    this.fxSystem.reset();
    this.titleContainer.setVisible(false);
    this.titleLoopSprite.stop();
    this.titleLoopSprite.setVisible(false);
    this.deathContainer.setVisible(false);
    this.highlightRank = 0;
    this.deathLbEntriesContainer.removeAll(true);
    this.highlightedRowTexts = [];
    this.nameEntryContainer.setVisible(false);
    this.nameEnterBtn.setVisible(false);
    if (this.nameKeyHandler) {
      this.input.keyboard?.off('keydown', this.nameKeyHandler);
      this.nameKeyHandler = null;
    }
    const entries = this.leaderboardSystem.getEntries();
    const weeklyHigh = entries.length > 0 ? entries[0].score : 0;
    this.hudHighScore.setText(String(weeklyHigh).padStart(7, '0'));
    this.hudLabel.setVisible(true);
    this.hudHighScore.setVisible(true);
    this.profileHud.showPlayingMode(this.profilePopup.getName());
    this.profileHud.setAlpha(0);
    this.tweens.add({
      targets: this.profileHud.getContainer(),
      alpha: 1,
      duration: 2000,
      ease: 'Power2',
    });
    this.profileHud.setScore(0);
    this.profileHud.setRage01(0);
    this.profileHud.setRockets(0, TUNING.PICKUP_MAX_AMMO);
    this.rageAmount = 0;
    this.rageTimer = 0;
    this.rageZoomProgress = 0;
    this.roadSpeedBonus = 0;
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.adjustHudForZoom(1);
    this.audioSystem.setDistortion(0);
    CRT_TUNING.rageDistortion = 0;
    this.deathExplosion.setVisible(false);
    this.slashSprite.setVisible(false);
    this.slashActiveTimer = 0;
    this.slashCooldownTimer = 0;
    this.slashInvincibilityTimer = 0;
    this.rocketCooldownTimer = 0;
    this.startHoldActive = false;
    this.startHoldText.setVisible(false);
    this.pickupSystem.reset();
    this.pickupSystem.setHUDVisible(true);
    this.rocketSystem.reset();
    this.shieldSystem.reset();
    this.hideWarningPool();

    // Start-hold: freeze everything until spacebar after wait period
    // (debug backtick toggle skips this when startHoldMode = true)
    if (!this.startHoldMode) {
      this.startHoldActive = true;
      this.startHoldTimer = 0;
      this.startHoldRampT = 0;
      this.startHoldText.setAlpha(1);
      this.startHoldText.setVisible(true);
      // Blink: on → fade out → off → fade in → repeat
      if (this.startHoldBlinkTween) this.startHoldBlinkTween.destroy();
      this.startHoldBlinkTween = this.tweens.add({
        targets: this.startHoldText,
        alpha: 0,
        duration: TUNING.START_TEXT_FADE_MS,
        delay: TUNING.START_TEXT_ON_MS,
        hold: TUNING.START_TEXT_OFF_MS,
        yoyo: true,
        repeatDelay: TUNING.START_TEXT_ON_MS,
        repeat: -1,
      });
    } else {
      // Debug skip: full speed immediately, but still play start animation
      this.startHoldActive = false;
      this.startHoldRampT = 1;
      this.startHoldText.setVisible(false);
      this.playerSystem.setCursorBlend(1);
      this.playerSystem.playStartAnim();
    }
  }

  private drawCollisionDebug(): void {
    const g = this.collisionGfx;
    g.clear();

    const ALPHA = 0.4;

    // Player collision ellipse (green)
    const px = this.playerSystem.getX();
    const py = Math.max(this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y, TUNING.ROAD_TOP_Y);
    g.lineStyle(2, 0x00ff00, 1);
    g.fillStyle(0x00ff00, ALPHA);
    g.fillEllipse(px, py, TUNING.PLAYER_COLLISION_W, TUNING.PLAYER_COLLISION_H);
    g.strokeEllipse(px, py, TUNING.PLAYER_COLLISION_W, TUNING.PLAYER_COLLISION_H);

    // Obstacles (crash = orange rect, slow = blue rect, car = white ellipse)
    const obstacles = this.obstacleSystem.getPool();
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (!obs.active || obs.getData('dying')) continue;
      const type = obs.getData('type') as ObstacleType;
      const w = obs.getData('w') as number;
      const h = obs.getData('h') as number;

      if (type === ObstacleType.CAR) {
        // Ellipse: bottom-aligned, width * 0.8, height * 0.667
        const a = (w * TUNING.CAR_COLLISION_WIDTH_RATIO) / 2;
        const b = (h * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        const coy = (h - h * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        g.lineStyle(2, 0xffffff, 1);
        g.fillStyle(0xffffff, ALPHA);
        g.fillEllipse(obs.x, obs.y + coy, a * 2, b * 2);
        g.strokeEllipse(obs.x, obs.y + coy, a * 2, b * 2);
      } else if (type === ObstacleType.SLOW) {
        // Blue ellipse
        g.lineStyle(2, 0x0066ff, 1);
        g.fillStyle(0x0066ff, ALPHA);
        g.fillEllipse(obs.x, obs.y, w, h);
        g.strokeEllipse(obs.x, obs.y, w, h);
      } else {
        // Crash: orange rectangle
        g.lineStyle(2, 0xff8800, 1);
        g.fillStyle(0xff8800, ALPHA);
        g.fillRect(obs.x - w / 2, obs.y - h / 2, w, h);
        g.strokeRect(obs.x - w / 2, obs.y - h / 2, w, h);
      }
    }

    // Pickups (yellow circles)
    const pickups = this.pickupSystem.getPool();
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.active) continue;
      const r = TUNING.PICKUP_DIAMETER / 2;
      g.lineStyle(2, 0xffff00, 1);
      g.fillStyle(0xffff00, ALPHA);
      g.fillCircle(p.x, p.y, r);
      g.strokeCircle(p.x, p.y, r);
    }

    // Shield pickups (green circles)
    const shields = this.shieldSystem.getPool();
    for (let i = 0; i < shields.length; i++) {
      const s = shields[i];
      if (!s.active) continue;
      const r = TUNING.SHIELD_DIAMETER / 2;
      g.lineStyle(2, 0x00ff00, 1);
      g.fillStyle(0x00ff00, ALPHA);
      g.fillCircle(s.x, s.y, r);
      g.strokeCircle(s.x, s.y, r);
    }

    // Rocket projectiles (yellow circles)
    const rockets = this.rocketSystem.getPool();
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (!r.active) continue;
      g.lineStyle(2, 0xffff00, 1);
      g.fillStyle(0xffff00, ALPHA);
      g.fillCircle(r.x, r.y, TUNING.ROCKET_RADIUS);
      g.strokeCircle(r.x, r.y, TUNING.ROCKET_RADIUS);
    }

    // Katana slash collision hitbox (red rectangle, only when active)
    if (this.slashActiveTimer > 0) {
      const roadSpeed = TUNING.ROAD_BASE_SPEED + TUNING.ROAD_SPEED_RAMP * this.elapsed;
      const speedRatio = roadSpeed > 0 ? this.playerSystem.getPlayerSpeed() / roadSpeed : 1;
      const sT = Phaser.Math.Clamp((speedRatio - 1) / (TUNING.MAX_SPEED_MULTIPLIER - 1), 0, 1);
      const sw = TUNING.KATANA_WIDTH * (1 + sT * (TUNING.KATANA_SPEED_WIDTH_SCALE - 1));
      const sOff = TUNING.KATANA_OFFSET_X * (1 + sT * (TUNING.KATANA_SPEED_OFFSET_SCALE - 1));
      const cx = this.playerSystem.getX() + sOff;
      const cy = this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y;
      const sh = TUNING.PLAYER_COLLISION_H;
      g.lineStyle(2, 0xff0000, 1);
      g.fillStyle(0xff0000, ALPHA);
      g.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      g.strokeRect(cx - sw / 2, cy - sh / 2, sw, sh);
    }
  }

  private updatePlaying(dt: number): void {
    // Drain gameplay input while popup is open (game world keeps running)
    if (this.profilePopup.isOpen()) {
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      this.inputSystem.getSpeedTap();
    }

    // Start-hold: freeze everything until spacebar after minimum 2s
    if (this.startHoldActive) {
      this.startHoldTimer += dt;
      // Drain all inputs so nothing queues
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      this.inputSystem.getSpeedTap();
      const held = this.inputSystem.isSpaceHeld();
      if (held && this.startHoldTimer >= TUNING.START_HOLD_WAIT) {
        this.startHoldActive = false;
        this.startHoldRampT = 0;
        // Play start animation sequence then transition to ride loop
        this.playerSystem.playStartAnim();
        // Stop blink and fade out the text
        if (this.startHoldBlinkTween) { this.startHoldBlinkTween.destroy(); this.startHoldBlinkTween = null; }
        this.startHoldText.setAlpha(1);
        this.tweens.add({
          targets: this.startHoldText,
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => { this.startHoldText.setVisible(false); },
        });
      } else {
        // Consume the tap so it doesn't queue
        this.inputSystem.isSpaceHeld();
      }
      // Nothing moves — pass 0 speed, skip all updates
      this.roadSystem.update(0, dt);
      this.parallaxSystem.update(0, dt);
      return;
    }
    // Ramp from 0 to base speed over START_HOLD_RAMP seconds after hold release
    if (this.startHoldRampT < 1) {
      this.startHoldRampT = Math.min(this.startHoldRampT + dt / TUNING.START_HOLD_RAMP, 1);
    }
    // Ease in/out: smoothstep (3t² - 2t³) — used for road speed and player Y blend
    const rampEased = this.startHoldRampT < 1
      ? (() => { const t = this.startHoldRampT; return t * t * (3 - 2 * t); })()
      : 1;
    // Blend player cursor following from center to full
    this.playerSystem.setCursorBlend(rampEased);

    this.elapsed += dt;
    let baseRoadSpeed = TUNING.ROAD_BASE_SPEED + this.elapsed * TUNING.ROAD_SPEED_RAMP + this.roadSpeedBonus;
    if (this.startHoldRampT < 1) {
      const eased = rampEased;
      baseRoadSpeed *= eased;
    }
    let rageFactor = 0; // 0 = no rage, 0→1 ramp up, 1 = full, 1→0 ramp down
    if (this.rageTimer > 0) {
      const elapsed = TUNING.RAGE_DURATION - this.rageTimer; // seconds since rage started
      const rampUp = Math.min(elapsed / TUNING.RAGE_SPEED_RAMP_UP, 1);       // 0→1 over ramp-up
      const rampDown = Math.min(this.rageTimer / TUNING.RAGE_SPEED_RAMP_DOWN, 1); // 1→0 over ramp-down
      rageFactor = Math.min(rampUp, rampDown); // whichever is lower
    }
    CRT_TUNING.rageDistortion = CRT_TUNING.rageDistortionMax * rageFactor;
    const rageSpeedFactor = 1 + (TUNING.RAGE_SPEED_MULTIPLIER - 1) * rageFactor;
    const roadSpeed = baseRoadSpeed * rageSpeedFactor;

    // Spawn grace — no obstacles until timer expires (countdown intro period)
    if (this.spawnGraceTimer > 0) {
      this.spawnGraceTimer -= dt;
    }

    this.difficultySystem.update(dt);
    this.playerSystem.setInvincible(this.rageTimer > 0 || this.rageZoomProgress > 0);
    this.playerSystem.update(dt, roadSpeed, baseRoadSpeed);
    this.scoreSystem.update(dt, this.playerSystem.getPlayerSpeed());
    if (this.spawnGraceTimer <= 0) {
      this.obstacleSystem.update(dt, roadSpeed, this.difficultySystem.getFactor(), rageFactor);
    }
    this.updateLaneWarnings(roadSpeed);

    // Katana slash (checked BEFORE player collision so destroyed obstacles can't kill)
    this.slashCooldownTimer = Math.max(0, this.slashCooldownTimer - dt);
    this.slashInvincibilityTimer = Math.max(0, this.slashInvincibilityTimer - dt);

    // Speed-scaled slash: wider and further right at higher speeds
    const speedRatio = roadSpeed > 0 ? this.playerSystem.getPlayerSpeed() / roadSpeed : 1;
    const speedT = Phaser.Math.Clamp((speedRatio - 1) / (TUNING.MAX_SPEED_MULTIPLIER - 1), 0, 1);
    const slashWidth = TUNING.KATANA_WIDTH * (1 + speedT * (TUNING.KATANA_SPEED_WIDTH_SCALE - 1));
    const slashOffset = TUNING.KATANA_OFFSET_X * (1 + speedT * (TUNING.KATANA_SPEED_OFFSET_SCALE - 1));

    // Collision hitbox center (speed-scaled, independent of VFX position)
    const slashCenterX = this.playerSystem.getX() + slashOffset;

    // Collision hitbox active while slash VFX is visible
    if (this.slashSprite.visible) {
      const slashCollY = this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y;
      const hitX = this.obstacleSystem.checkSlashCollision(
        slashCenterX,
        slashWidth,
        slashCollY,
        TUNING.PLAYER_COLLISION_H / 2
      );
      if (hitX >= 0) {
        this.slashInvincibilityTimer = TUNING.KATANA_INVINCIBILITY;
        this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION, TUNING.SHAKE_DEATH_INTENSITY * 0.25);

        // Distance-based bonus: left edge of slash = 100pts, right edge = min pts
        const slashLeft = this.playerSystem.getX() + slashOffset - slashWidth / 2;
        const dist = Math.max(0, hitX - slashLeft);
        const t = Math.min(dist / slashWidth, 1); // 0 = left edge, 1 = right edge
        const bonus = Math.round(TUNING.KATANA_KILL_POINTS_MAX - t * t * (TUNING.KATANA_KILL_POINTS_MAX - TUNING.KATANA_KILL_POINTS_MIN));
        this.scoreSystem.addBonus(bonus);
        this.spawnScorePopup(bonus);

        // Only add permanent road speed outside rage (rage plows through too many)
        if (this.rageTimer <= 0) {
          this.roadSpeedBonus += TUNING.RAGE_SPEED_BOOST_PER_KILL;
        }

        // Fill rage meter (scaled by multiplier)
        if (this.rageTimer <= 0) {
          this.rageAmount = Math.min(this.rageAmount + bonus * TUNING.RAGE_FILL_MULTIPLIER, TUNING.RAGE_MAX);
          if (this.rageAmount >= TUNING.RAGE_MAX) {
            this.rageTimer = TUNING.RAGE_DURATION;
            this.rageAmount = TUNING.RAGE_MAX;
            this.playerSystem.playPoweredUp();
            this.musicPlayer.setVolumeBoost(TUNING.RAGE_MUSIC_VOLUME_BOOST);
            this.audioSystem.setDistortion(TUNING.RAGE_AUDIO_DISTORTION);
          }
        }
      }
    }
    // VFX sprite follows player while animation is playing
    if (this.slashSprite.visible) {
      this.slashSprite.setPosition(
        this.playerSystem.getX() + TUNING.SLASH_VFX_OFFSET_X,
        this.playerSystem.getY() + TUNING.SLASH_VFX_OFFSET_Y
      );
      // First 3 visible frames render behind player, rest render on top
      const frameIdx = this.slashSprite.anims.currentFrame?.index ?? 1;
      const behindPlayer = frameIdx <= 3;
      this.slashSprite.setDepth(this.playerSystem.getY() + (behindPlayer ? -0.3 : 0.3));
    }
    if (this.inputSystem.getAttackPressed() && this.slashCooldownTimer <= 0 && this.playerSystem.playAttack()) {
      this.slashActiveTimer = TUNING.KATANA_DURATION;
      this.slashCooldownTimer = TUNING.KATANA_COOLDOWN;
      this.slashSprite.setPosition(
        this.playerSystem.getX() + TUNING.SLASH_VFX_OFFSET_X,
        this.playerSystem.getY() + TUNING.SLASH_VFX_OFFSET_Y
      );
      this.slashSprite.setScale(TUNING.SLASH_VFX_SCALE);
      this.slashSprite.setVisible(true);
      this.slashSprite.setDepth(this.playerSystem.getY() - 0.3);
      this.slashSprite.play('slash-vfx-play');
      this.slashSprite.once('animationcomplete', () => {
        this.slashSprite.setVisible(false);
      });
      this.audioSystem.playSlash();
    }

    // Rocket launcher: right-click fires when ammo > 0 (spectator = infinite ammo)
    this.rocketCooldownTimer = Math.max(0, this.rocketCooldownTimer - dt);
    if (this.inputSystem.getRocketPressed() && this.rocketCooldownTimer <= 0 && (this.spectatorMode || this.pickupSystem.getAmmo() > 0)) {
      // Lock the lane at fire time using the collision Y (sprite center + offset), same as all other collisions
      const fireY = Math.max(this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y, TUNING.ROAD_TOP_Y);
      const fireLane = this.obstacleSystem.getClosestLane(fireY);
      const launched = this.playerSystem.playRocketLaunch(() => {
        this.rocketSystem.fire(
          this.playerSystem.getX() + TUNING.ROCKET_EMIT_X,
          this.playerSystem.getY() + TUNING.ROCKET_EMIT_Y,
          fireLane
        );
        this.audioSystem.playRocketLaunch();
      });
      if (launched && !this.spectatorMode) {
        this.pickupSystem.consumeAmmo();
      }
      if (launched) {
        this.rocketCooldownTimer = TUNING.ROCKET_COOLDOWN;
      }
    }
    this.rocketSystem.update(dt);

    // Player collisions (after slash so destroyed obstacles are already gone)
    // NOTE: rage timer is ticked AFTER collisions so it can't expire mid-frame
    const playerCollX = this.playerSystem.getX();
    const playerCollY = Math.max(this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y, TUNING.ROAD_TOP_Y);

    // Update pickups (scrolling + collection)
    this.pickupSystem.update(dt, roadSpeed, playerCollX, playerCollY);
    if (this.pickupSystem.wasCollected()) {
      this.playerSystem.playCollectRocket();
    }

    // Update shield pickups (scrolling + collection)
    this.shieldSystem.update(dt, roadSpeed, playerCollX, playerCollY);
    if (this.shieldSystem.wasCollected()) {
      this.playerSystem.playCollectShield();
    }

    const pHalfW = TUNING.PLAYER_COLLISION_W / 2;
    const pHalfH = TUNING.PLAYER_COLLISION_H / 2;
    this.profileHud.setShields(this.shieldSystem.getShields());

    if (this.rageTimer > 0 || this.spectatorMode) {
      // Rage mode / spectator: destroy obstacles on contact
      const hits = this.obstacleSystem.checkRageCollision(
        playerCollX, playerCollY, pHalfW, pHalfH
      );
      if (hits.length > 0) {
        this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 0.5, TUNING.SHAKE_DEATH_INTENSITY * 0.3);
        this.playerSystem.playCollectHit();
        for (let i = 0; i < hits.length; i++) {
          if (hits[i].type === ObstacleType.CAR) {
            this.scoreSystem.addBonus(TUNING.RAGE_CAR_KILL_BONUS);
            this.spawnScorePopup(TUNING.RAGE_CAR_KILL_BONUS);
          }
        }
      }
      // Still check slow zones
      const result = this.obstacleSystem.checkCollision(playerCollX, playerCollY, pHalfW, pHalfH);
      if (result.slowOverlapping) {
        this.playerSystem.applyLeftwardPush(TUNING.SLOW_PUSH_RATE * dt);
      }
      this.fxSystem.onSlowOverlap(result.slowOverlapping);
    } else if (this.playerSystem.isCollecting()) {
      // COL animation playing = invincibility frames, skip collision entirely
      this.fxSystem.onSlowOverlap(false);
    } else {
      const result = this.obstacleSystem.checkCollision(playerCollX, playerCollY, pHalfW, pHalfH);
      if (result.crashed && this.slashInvincibilityTimer <= 0) {
        if (this.shieldSystem.getShields() > 0) {
          // Shield absorbs the hit — explode obstacle, lose one shield
          this.shieldSystem.consumeShield();
          this.obstacleSystem.spawnExplosion(result.hitX, result.hitY);
          this.audioSystem.playExplosion();
          this.playerSystem.playCollectHit();
          if (!this.hudHidden) this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 0.5, TUNING.SHAKE_DEATH_INTENSITY * 0.5);
        } else {
          this.playerSystem.kill();
        }
      }
      if (result.slowOverlapping) {
        this.playerSystem.applyLeftwardPush(TUNING.SLOW_PUSH_RATE * dt);
      }
      this.fxSystem.onSlowOverlap(result.slowOverlapping);
    }

    // Rage mode tick — drain the bar so player can see time remaining
    // (ticked AFTER collisions so rage can't expire mid-frame leaving player vulnerable)
    if (this.rageTimer > 0) {
      this.rageTimer -= dt;
      if (this.rageTimer <= 0) {
        this.rageTimer = 0;
        this.rageAmount = 0;
        this.playerSystem.stopPoweredUp();
        this.musicPlayer.setVolumeBoost(1.0);
        this.audioSystem.setDistortion(0);

        // End-of-rage shockwave: big explosion + destroy all obstacles to protect player
        this.obstacleSystem.destroyAllOnScreen(TUNING.RAGE_END_EXPLOSION_SCALE);
        this.obstacleSystem.spawnExplosion(this.playerSystem.getX(), this.playerSystem.getY(), TUNING.RAGE_END_EXPLOSION_SCALE);
        this.audioSystem.playExplosion();
        if (!this.hudHidden) this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 2, TUNING.SHAKE_DEATH_INTENSITY * 1.5);
      } else {
        this.rageAmount = TUNING.RAGE_MAX * (this.rageTimer / TUNING.RAGE_DURATION);
      }
    }

    // Rage zoom: start zooming out early so player can adjust before rage ends
    if (this.rageTimer > TUNING.RAGE_ZOOM_OUT_DURATION) {
      // Still plenty of rage left — zoom in
      this.rageZoomProgress = Math.min(this.rageZoomProgress + dt / TUNING.RAGE_ZOOM_IN_DURATION, 1);
    } else if (this.rageZoomProgress > 0) {
      // Zoom out (starts RAGE_ZOOM_OUT_DURATION seconds before rage expires)
      this.rageZoomProgress = Math.max(this.rageZoomProgress - dt / TUNING.RAGE_ZOOM_OUT_DURATION, 0);
    }
    this.applyRageZoom();

    // FX: speed lines + edge warnings
    this.fxSystem.update(dt, this.playerSystem.getPlayerSpeed(), roadSpeed, this.playerSystem.getX());

    // Audio: engine pitch/volume
    this.audioSystem.updateEngine(this.playerSystem.getPlayerSpeed(), roadSpeed, this.inputSystem.isSpaceHeld());

    // Check if player died this frame
    if (!this.playerSystem.isAlive()) {
      this.enterDead();
    }

    this.parallaxSystem.update(roadSpeed, dt);
    this.roadSystem.update(roadSpeed, dt);

    // Lane collision highlights
    const collY = this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y;
    const collTop = collY - TUNING.PLAYER_COLLISION_H / 2;
    const collBottom = collY + TUNING.PLAYER_COLLISION_H / 2;
    const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
    // Pulse alpha: 24-frame cycle (12 out + 12 in at 60fps), cubic easing lingers near 0
    const raw = 0.5 + 0.5 * Math.sin(this.elapsed * TUNING.LANE_PULSE_SPEED);
    const laneAlpha = Math.pow(raw, 3);
    for (let i = 0; i < TUNING.LANE_COUNT; i++) {
      const laneTop = TUNING.ROAD_TOP_Y + laneH * i;
      const laneBottom = laneTop + laneH;
      const visible = collTop < laneBottom && collBottom > laneTop;
      this.laneHighlights[i].setVisible(visible);
      if (visible) this.laneHighlights[i].setAlpha(laneAlpha);
    }

    // Profile HUD
    const ragePct = this.rageAmount / TUNING.RAGE_MAX;
    this.profileHud.setScore(this.scoreSystem.getScore());
    this.profileHud.setRage01(ragePct);
    this.profileHud.setRageColor(this.rageTimer > 0 ? TUNING.RAGE_ACTIVE_COLOR : TUNING.RAGE_COLOR);
    this.profileHud.setRockets(this.pickupSystem.getAmmo(), TUNING.PICKUP_MAX_AMMO);

    // Debug
    const diff = this.difficultySystem.getFactor();
    if (this.debugText.visible) {
      this.debugText.setText(
        `X: ${Math.round(this.playerSystem.getX())}  ` +
        `Y: ${Math.round(this.playerSystem.getY())}  ` +
        `bikeSpd: ${Math.round(this.playerSystem.getPlayerSpeed())}  ` +
        `roadSpd: ${Math.round(roadSpeed)}  ` +
        `diff: ${diff.toFixed(2)}  ` +
        `time: ${Math.round(this.elapsed)}s`
      );
    }

    // Re-hide world objects each frame when hudHidden (systems re-show on spawn)
    if (this.hudHidden) {
      this.obstacleSystem.setVisible(false);
      this.pickupSystem.setVisible(false);
      this.shieldSystem.setVisible(false);
      for (let i = 0; i < this.warningPool.length; i++) {
        this.warningPool[i].circle.setVisible(false);
        this.warningPool[i].preview.setVisible(false);
      }
      for (let i = 0; i < this.laneHighlights.length; i++) {
        this.laneHighlights[i].setVisible(false);
      }
    }

    // CRT debug overlay
    if (this.crtDebugVisible) this.updateCRTDebugText();
  }

  private updateCRTDebugText(): void {
    const t = CRT_TUNING;
    this.crtDebugEl.textContent =
      `CRT: ${this.crtEnabled ? 'ON' : 'OFF'}  [O] toggle  [P] hide\n` +
      `── Scanlines ──\n` +
      `  intensity: ${t.scanlineIntensity}  density: ${t.scanlineDensity}  roll: ${t.scanlineRollSpeed}\n` +
      `── Mask ──\n` +
      `  strength: ${t.maskStrength}  scale: ${t.maskScale}  gap: ${t.maskGap}  type: ${t.maskType}\n` +
      `── Beam ──\n` +
      `  focus: ${t.beamFocus}  convergence: ${t.convergenceError}\n` +
      `── Bloom ──\n` +
      `  strength: ${t.bloomStrength}  radius: ${t.bloomRadius}  threshold: ${t.bloomThreshold}\n` +
      `── Curvature ──\n` +
      `  curvature: ${t.curvature}  cornerDark: ${t.cornerDarkening}\n` +
      `── Color ──\n` +
      `  chromaAb: ${t.chromaAberration}  bleed: ${t.colorBleed}  sat: ${t.saturation}\n` +
      `  gamma: ${t.gamma}  brightness: ${t.brightness}\n` +
      `── Signal ──\n` +
      `  noise: ${t.noiseAmount}  speed: ${t.noiseSpeed}  jitter: ${t.jitterAmount}\n` +
      `  vignette: ${t.vignette}`;
  }

  /** Show/hide lane warning circles with obstacle previews */
  private updateLaneWarnings(roadSpeed: number): void {
    const warnings = this.obstacleSystem.getUpcomingByLane(roadSpeed);
    const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
    const warningRadius = laneH / 3;
    const circleDiameter = warningRadius * 2;
    const laneCenters: number[] = [];
    for (let l = 0; l < TUNING.LANE_COUNT; l++) {
      laneCenters.push(TUNING.ROAD_TOP_Y + laneH * l + laneH / 2);
    }

    // Merge pickup warnings into the per-lane arrays
    if (roadSpeed > 0) {
      const pickupPool = this.pickupSystem.getPool();
      for (let i = 0; i < pickupPool.length; i++) {
        const pickup = pickupPool[i];
        if (!pickup.active || pickup.x <= TUNING.GAME_WIDTH) continue;

        const timeUntil = (pickup.x - TUNING.GAME_WIDTH) / roadSpeed;
        if (timeUntil > TUNING.LANE_WARNING_DURATION) continue;

        // Find closest lane
        let closestLane = 0;
        let closestDist = Infinity;
        for (let l = 0; l < TUNING.LANE_COUNT; l++) {
          const dist = Math.abs(pickup.y - laneCenters[l]);
          if (dist < closestDist) {
            closestDist = dist;
            closestLane = l;
          }
        }

        warnings[closestLane].push({
          type: 'pickup',
          textureKey: 'pickup-rocket',
          timeUntil,
        });
      }

      // Merge shield pickup warnings
      const shieldPool = this.shieldSystem.getPool();
      for (let i = 0; i < shieldPool.length; i++) {
        const pickup = shieldPool[i];
        if (!pickup.active || pickup.x <= TUNING.GAME_WIDTH) continue;

        const timeUntil = (pickup.x - TUNING.GAME_WIDTH) / roadSpeed;
        if (timeUntil > TUNING.LANE_WARNING_DURATION) continue;

        let closestLane = 0;
        let closestDist = Infinity;
        for (let l = 0; l < TUNING.LANE_COUNT; l++) {
          const dist = Math.abs(pickup.y - laneCenters[l]);
          if (dist < closestDist) {
            closestDist = dist;
            closestLane = l;
          }
        }

        warnings[closestLane].push({
          type: 'shield-pickup',
          textureKey: 'pickup-shield',
          timeUntil,
        });
      }

      // Re-sort lanes that got pickup entries
      for (let l = 0; l < TUNING.LANE_COUNT; l++) {
        if (warnings[l].length > 1) {
          warnings[l].sort((a, b) => a.timeUntil - b.timeUntil);
        }
      }
    }

    // Reset pool usage counter — we'll claim slots as needed
    let poolIdx = 0;

    for (let lane = 0; lane < TUNING.LANE_COUNT; lane++) {
      const laneWarnings = warnings[lane];
      const laneY = laneCenters[lane];
      const total = laneWarnings.length;

      for (let w = 0; w < total; w++) {
        const warning = laneWarnings[w];

        // Grow pool if needed
        if (poolIdx >= this.warningPool.length) {
          const circle = this.add.circle(0, 0, warningRadius, TUNING.WARNING_FILL_COLOR, TUNING.WARNING_FILL_ALPHA)
            .setDepth(95).setVisible(false);
          const preview = this.add.sprite(0, 0, 'obstacle-crash')
            .setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
          this.warningPool.push({ circle, preview, currentKey: '' });
        }

        const slot = this.warningPool[poolIdx];
        poolIdx++;

        // Position: latest arrival (last in sorted array) is at the right edge,
        // earlier arrivals stack leftward. This means new warnings appear at the
        // right and push existing ones left.
        const cx = TUNING.GAME_WIDTH - warningRadius - (total - 1 - w) * circleDiameter;
        slot.circle.setPosition(cx, laneY);
        slot.preview.setPosition(cx, laneY);

        // Alpha fades in as obstacle approaches
        const warningDuration = warning.type === ObstacleType.CAR
          ? TUNING.LANE_WARNING_DURATION + TUNING.LANE_WARNING_CAR_EXTRA
          : TUNING.LANE_WARNING_DURATION;
        const alpha = (1 - warning.timeUntil / warningDuration) * 0.8;
        slot.circle.setAlpha(alpha).setVisible(true);
        slot.preview.setAlpha(alpha).setVisible(true);

        // Determine texture, scale, and stroke color per type
        let scaleMultiplier: number;
        let textureKey: string;
        let strokeColor: number;
        switch (warning.type) {
          case ObstacleType.CRASH:
            textureKey = 'obstacle-crash';
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_CRASH;
            strokeColor = TUNING.WARNING_STROKE_CRASH;
            break;
          case ObstacleType.CAR:
            textureKey = warning.textureKey;
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_CAR;
            strokeColor = TUNING.WARNING_STROKE_CAR;
            break;
          case ObstacleType.SLOW:
            textureKey = 'obstacle-slow';
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_SLOW;
            strokeColor = TUNING.WARNING_STROKE_SLOW;
            break;
          case 'pickup':
            textureKey = 'pickup-rocket';
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_PICKUP;
            strokeColor = TUNING.WARNING_STROKE_ROCKET;
            break;
          case 'shield-pickup':
            textureKey = 'pickup-shield';
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_SHIELD;
            strokeColor = TUNING.WARNING_STROKE_SHIELD;
            break;
          default:
            textureKey = 'obstacle-crash';
            scaleMultiplier = TUNING.LANE_WARNING_PREVIEW_CRASH;
            strokeColor = TUNING.WARNING_STROKE_CRASH;
            break;
        }

        // Apply per-type stroke
        slot.circle.setStrokeStyle(TUNING.WARNING_STROKE_WIDTH, strokeColor, alpha);

        // Only switch texture/animation when key changes
        if (slot.currentKey !== textureKey) {
          slot.currentKey = textureKey;
          if (warning.type === ObstacleType.CAR) {
            slot.preview.setTexture(textureKey);
            slot.preview.play(`${textureKey}-drive`);
          } else {
            slot.preview.setTexture(textureKey);
            slot.preview.stop();
          }
        }

        // Scale preview to fit inside circle
        const targetH = circleDiameter * scaleMultiplier;
        const frameW = slot.preview.width || 1;
        const frameH = slot.preview.height || 1;
        const targetW = targetH * (frameW / frameH);
        slot.preview.setDisplaySize(targetW, targetH);
      }
    }

    // Hide unused pool slots
    for (let i = poolIdx; i < this.warningPool.length; i++) {
      this.warningPool[i].circle.setVisible(false);
      this.warningPool[i].preview.setVisible(false);
      this.warningPool[i].currentKey = '';
    }
    this.warningPoolUsed = poolIdx;
  }

  /** Hide all warning pool items */
  private hideWarningPool(): void {
    for (let i = 0; i < this.warningPool.length; i++) {
      this.warningPool[i].circle.setVisible(false);
      this.warningPool[i].preview.setVisible(false);
      this.warningPool[i].currentKey = '';
    }
    this.warningPoolUsed = 0;
  }

  /** Adjust all scrollFactor(0) HUD elements so they stay pinned during camera zoom */
  private adjustHudForZoom(zoom: number): void {
    this.profileHud.adjustForZoom(zoom);
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    const invZ = 1 / zoom;
    // hudLabel original position: (GAME_WIDTH/2, 20)
    this.hudLabel.setScale(invZ);
    this.hudLabel.setPosition(
      cx + (TUNING.GAME_WIDTH / 2 - cx) * invZ,
      cy + (20 - cy) * invZ,
    );
    // hudHighScore original position: (GAME_WIDTH/2, 50)
    this.hudHighScore.setScale(invZ);
    this.hudHighScore.setPosition(
      cx + (TUNING.GAME_WIDTH / 2 - cx) * invZ,
      cy + (50 - cy) * invZ,
    );
  }

  /** Apply camera zoom + scroll to create rage focal-length effect */
  private applyRageZoom(): void {
    if (this.rageZoomProgress <= 0) {
      this.cameras.main.setZoom(1);
      this.cameras.main.setScroll(0, 0);
      this.adjustHudForZoom(1);
      return;
    }
    // Ease in/out for smooth feel
    const t = this.rageZoomProgress * this.rageZoomProgress * (3 - 2 * this.rageZoomProgress); // smoothstep
    const zoom = 1 + (TUNING.RAGE_ZOOM_LEVEL - 1) * t;
    this.cameras.main.setZoom(zoom);
    this.adjustHudForZoom(zoom);

    // Compute desired camera center in world coordinates
    const halfVisW = TUNING.GAME_WIDTH / (2 * zoom);
    const halfVisH = TUNING.GAME_HEIGHT / (2 * zoom);

    // X: center on player, Y: lock bottom of road to bottom of screen
    let centerX = this.playerSystem.getX();
    let centerY = TUNING.ROAD_BOTTOM_Y - halfVisH;

    // Clamp so visible area never extends beyond game bounds (no black edges)
    centerX = Math.max(halfVisW, Math.min(TUNING.GAME_WIDTH - halfVisW, centerX));
    centerY = Math.max(halfVisH, Math.min(TUNING.GAME_HEIGHT - halfVisH, centerY));

    // Convert world center to scroll (scroll 0,0 = center at GAME_WIDTH/2, GAME_HEIGHT/2)
    this.cameras.main.setScroll(centerX - TUNING.GAME_WIDTH / 2, centerY - TUNING.GAME_HEIGHT / 2);
  }

  private spawnScorePopup(points: number): void {
    // Reuse an inactive popup or create a new one
    let popup: Phaser.GameObjects.Text | null = null;
    for (let i = 0; i < this.scorePopups.length; i++) {
      if (!this.scorePopups[i].active) {
        popup = this.scorePopups[i];
        break;
      }
    }
    if (!popup) {
      popup = this.add.text(0, 0, '', {
        fontSize: '28px',
        color: '#ffcc00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(100);
      this.scorePopups.push(popup);
    }

    popup.setText(`+${points}`);
    popup.setPosition(this.playerSystem.getX(), this.playerSystem.getY() - 40);
    popup.setAlpha(1);
    popup.setActive(true).setVisible(true);

    this.tweens.add({
      targets: popup,
      y: popup.y - 60,
      alpha: 0,
      duration: TUNING.KATANA_KILL_POPUP_DURATION * 1000,
      ease: 'Power2',
      onComplete: () => {
        popup!.setActive(false).setVisible(false);
      },
    });
  }

  private updateDying(dt: number): void {
    this.dyingTimer += dt;

    switch (this.dyingPhase) {
      case 'ramp': {
        // Exposure ramp: 0 → peak over DEATH_RAMP_DURATION (eased for accelerating overexposure)
        const t = Math.min(this.dyingTimer / TUNING.DEATH_RAMP_DURATION, 1);
        this.deathWhiteOverlay.setAlpha(t * t * TUNING.DEATH_RAMP_PEAK); // quadratic ease-in
        if (t >= 1) {
          this.dyingPhase = 'snap';
          this.dyingTimer = 0;
        }
        break;
      }
      case 'snap': {
        // Quick snap from peak to full white
        const t = Math.min(this.dyingTimer / TUNING.DEATH_SNAP_DURATION, 1);
        this.deathWhiteOverlay.setAlpha(TUNING.DEATH_RAMP_PEAK + t * (1 - TUNING.DEATH_RAMP_PEAK));
        if (t >= 1) {
          this.dyingPhase = 'hold';
          this.dyingTimer = 0;
          // Screen is fully white — hide ALL game elements behind it
          this.hudLabel.setVisible(false);
          this.hudHighScore.setVisible(false);
          this.profileHud.setVisible(false);
          this.playerSystem.setVisible(false);
          this.deathExplosion.setVisible(false);
          this.slashSprite.setVisible(false);
          this.slashActiveTimer = 0;
          this.startHoldActive = false;
          this.startHoldText.setVisible(false);
          this.rageTimer = 0;
          this.audioSystem.setDistortion(0);
          CRT_TUNING.rageDistortion = 0;
          this.obstacleSystem.hideAll();
          this.pickupSystem.hideAll();
          this.pickupSystem.setHUDVisible(false);
          this.rocketSystem.hideAll();
          this.shieldSystem.hideAll();
          this.fxSystem.reset();
          this.roadSystem.setVisible(false);
          this.parallaxSystem.setVisible(false);
          for (let i = 0; i < this.laneHighlights.length; i++) this.laneHighlights[i].setVisible(false);
          this.hideWarningPool();
          for (let i = 0; i < this.scorePopups.length; i++) {
            this.scorePopups[i].setActive(false).setVisible(false);
          }
        }
        break;
      }
      case 'hold': {
        // Hold full white briefly, then prepare the death/name screen behind it
        if (this.dyingTimer >= TUNING.DEATH_WHITE_HOLD) {
          this.dyingPhase = 'fade';
          this.dyingTimer = 0;

          const profileName = this.profilePopup.getName();
          const hasProfileName = profileName !== 'ANON' && profileName.trim() !== '';

          if (hasProfileName) {
            // Auto-submit with profile name — skip name entry entirely
            const rank = this.leaderboardSystem.submit(profileName, this.pendingScore, this.elapsed);
            void submitScore(this.pendingScore, profileName);
            this.autoSubmitted = true;
            this.prepareDeathScreenVisuals(rank);
          } else if (this.pendingRank > 0) {
            // Top 10 but no profile name — show name entry
            this.autoSubmitted = false;
            this.prepareNameEntryVisuals();
          } else {
            // Not top 10, no profile name
            this.autoSubmitted = false;
            this.leaderboardSystem.submit('---', this.pendingScore, this.elapsed);
            void submitScore(this.pendingScore);
            this.prepareDeathScreenVisuals(0);
          }
        }
        break;
      }
      case 'fade': {
        // White fades away to reveal death/name-entry screen
        const t = Math.min(this.dyingTimer / TUNING.DEATH_FADE_DURATION, 1);
        this.deathWhiteOverlay.setAlpha(1 - t);
        if (t >= 1) {
          this.deathWhiteOverlay.setVisible(false);
          this.dyingPhase = 'done';

          // Show profileHud in profile mode
          const profileName = this.profilePopup.getName();
          this.profileHud.showProfileMode(profileName, this.getProfileRankText());
          this.profileHud.setVisible(true);

          // NOW activate the actual state
          if (!this.autoSubmitted && this.pendingRank > 0) {
            this.activateNameEntry();
          } else {
            this.state = GameState.DEAD;
            this.deadInputDelay = 0.5;
          }
        }
        break;
      }
    }
  }

  private enterDead(): void {
    this.state = GameState.DYING;
    this.autoSubmitted = false;

    // Restore HUD visibility if hidden by debug key
    if (this.hudHidden) {
      this.hudHidden = false;
      this.profileHud.setVisible(true);
      this.musicPlayer.setVisible(true);
      this.obstacleSystem.setSuppressExplosions(false);
      this.fxSystem.setSuppressShake(false);
    }

    // Close profile popup if open
    if (this.profilePopup.isOpen()) this.profilePopup.close();

    // Reset camera zoom before death transition
    this.rageZoomProgress = 0;
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(0, 0);
    this.adjustHudForZoom(1);

    // Collapse music player to thumbnail-only
    this.musicPlayer.setCompact(true);

    // Juice: shake, flash, impact sound
    this.fxSystem.triggerDeath();
    this.audioSystem.playImpact();
    this.audioSystem.silenceEngine();

    // Stash score info for after the transition
    this.pendingScore = this.scoreSystem.getScore();
    this.pendingRank = this.leaderboardSystem.wouldMakeBoard(this.pendingScore);

    // Explosion on top of the player (above player's Y-based depth, below white overlay at 1200)
    this.deathExplosion.setPosition(this.playerSystem.getX(), this.playerSystem.getY());
    this.deathExplosion.setDepth(this.playerSystem.getY() + 1);
    this.deathExplosion.setDisplaySize(TUNING.EXPLOSION_FRAME_SIZE, TUNING.EXPLOSION_FRAME_SIZE);
    this.deathExplosion.setVisible(true);
    this.deathExplosion.play('explosion-play');
    this.deathExplosion.once('animationcomplete', () => {
      this.deathExplosion.setVisible(false);
    });

    // Start the exposure ramp — white overlay from 0 to peak
    this.deathWhiteOverlay.setAlpha(0).setVisible(true);
    this.dyingPhase = 'ramp';
    this.dyingTimer = 0;
  }

  /** Show name entry UI (visuals only, no state change or keyboard handler) */
  private prepareNameEntryVisuals(): void {
    this.enteredName = '';
    this.nameSkipConfirmPending = false;
    this.nameSkipWarning.setVisible(false);
    this.emptyNameVisible = false;
    this.emptyNamePrompt.setVisible(false);
    this.emptyNameYesBtn.setVisible(false);
    this.emptyNameNoBtn.setVisible(false);

    // Update the score label inside the name entry container
    this.nameEntryContainer.each((child: Phaser.GameObjects.GameObject) => {
      if (child.getData('id') === 'nameScoreLabel' && child instanceof Phaser.GameObjects.Text) {
        child.setText(`SCORE: ${this.pendingScore}`);
      }
    });

    this.nameInputText.setText('_');
    this.nameEntryContainer.setVisible(true);
    this.nameEnterBtn.setVisible(true);
  }

  /** Activate name entry state and keyboard handler (call after visuals are revealed) */
  private activateNameEntry(): void {
    this.state = GameState.NAME_ENTRY;
    this.nameKeyHandler = (event: KeyboardEvent) => {
      if (this.state !== GameState.NAME_ENTRY) return;

      if (event.key === 'Enter') {
        if (this.emptyNameVisible) {
          this.submitAsAnon();
        } else {
          this.confirmNameEntry();
        }
        return;
      }

      if (this.emptyNameVisible) {
        this.hideEmptyNamePrompt();
      }

      if (event.key === 'Backspace') {
        this.enteredName = this.enteredName.slice(0, -1);
      } else if (event.key.length === 1 && this.enteredName.length < NAME_MAX_LENGTH) {
        this.enteredName += event.key;
      }
      this.nameInputText.setText(this.enteredName + '_');
    };
    this.input.keyboard?.on('keydown', this.nameKeyHandler);
  }

  /** Get the rank text for the current profile name (e.g. "RANKED #3" or "") */
  private getProfileRankText(): string {
    const profileName = this.profilePopup.getName();
    if (profileName === 'ANON' || profileName.trim() === '') return 'UNRANKED';
    const best = this.leaderboardSystem.getBestForName(profileName);
    if (best) return `RANKED #${best.rank}`;
    return 'UNRANKED';
  }

  /** Show death screen UI (visuals only, no state change) */
  private prepareDeathScreenVisuals(rank: number): void {
    this.inputSystem.getSpeedTap();
    this.inputSystem.getAttackPressed();
    this.inputSystem.getRocketPressed();

    this.deathScoreText.setText(`SCORE: ${this.pendingScore}`);
    this.deathTimeText.setText(`TIME: ${Math.round(this.elapsed)}s`);

    if (rank > 0 && rank <= 10) {
      this.deathRankText.setText(`#${rank} THIS WEEK`);
    } else if (rank > 10) {
      this.deathRankText.setText(`YOUR SCORE RANKED #${rank}`);
    } else {
      this.deathRankText.setText('');
    }

    // Show best score info when not in top 10
    const profileName = this.profilePopup.getName();
    const hasProfileName = profileName !== 'ANON' && profileName.trim() !== '';
    if (rank > 10 && hasProfileName) {
      const best = this.leaderboardSystem.getBestForName(profileName);
      if (best && best.rank !== rank) {
        this.deathBestText.setText(`BEST: ${best.score} (RANKED #${best.rank})`);
        this.deathBestText.setVisible(true);
      } else {
        this.deathBestText.setVisible(false);
      }
    } else {
      this.deathBestText.setVisible(false);
    }

    // Top 10 leaderboard display — top 3 get podium styling
    const entries = this.leaderboardSystem.getDisplayEntries();
    this.deathLeaderboardText.setText(`── ${this.weekKey} TOP 10 ──`);

    // Clear previous entry rows
    this.deathLbEntriesContainer.removeAll(true);
    this.highlightedRowTexts = [];

    const highlightIdx = (rank > 0 && rank <= 10) ? rank - 1 : -1;
    const headerH = 40;
    const baseY = this.deathLeaderboardText.y + headerH;

    const hasAvatar = this.textures.exists(AVATAR_TEXTURE_KEY);
    const playerName = this.profilePopup.getName();

    // ── Top 3 entries ──
    let curY = baseY + DLB_T3_Y;
    const top3Count = Math.min(entries.length, 3);
    for (let i = 0; i < top3Count; i++) {
      const e = entries[i];
      const rowCenterY = curY + DLB_T3_ROW_H / 2;
      const color = (i === highlightIdx) ? '#ffffff' : '#aaaaaa';
      const rowTexts: Phaser.GameObjects.Text[] = [];

      // Avatar with medal stroke
      const avatarX = DLB_T3_X + DLB_T3_AVATAR_X;
      const ring = this.add.circle(avatarX, rowCenterY, DLB_T3_AVATAR_R + DLB_T3_AVATAR_STROKE, DLB_T3_MEDAL_COLORS[i]);
      this.deathLbEntriesContainer.add(ring);

      const isPlayerEntry = e.name === playerName && hasAvatar;
      if (isPlayerEntry) {
        const avatar = this.add.image(avatarX, rowCenterY, AVATAR_TEXTURE_KEY)
          .setDisplaySize(DLB_T3_AVATAR_R * 2, DLB_T3_AVATAR_R * 2);
        this.deathLbEntriesContainer.add(avatar);
      } else {
        const inner = this.add.circle(avatarX, rowCenterY, DLB_T3_AVATAR_R, 0x222222);
        this.deathLbEntriesContainer.add(inner);
        const numLabel = this.add.text(avatarX, rowCenterY, String(i + 1), {
          fontSize: '20px', color: '#ffffff', fontFamily: 'Early GameBoy',
        }).setOrigin(0.5);
        this.deathLbEntriesContainer.add(numLabel);
      }

      // Rank
      let nextX = DLB_T3_X + DLB_T3_RANK_X;
      const rankT = this.add.text(nextX, rowCenterY, `${String(i + 1).padStart(2, ' ')}.`, {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(rankT);
      rowTexts.push(rankT);

      // Name — push right if rank text overflows its slot
      nextX = Math.max(DLB_T3_X + DLB_T3_NAME_X, rankT.x + rankT.width + DLB_GAP);
      const nameT = this.add.text(nextX, rowCenterY, (e.name || 'ANON').padEnd(NAME_MAX_LENGTH, ' '), {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(nameT);
      rowTexts.push(nameT);

      // Time — push right if name overflows its slot
      nextX = Math.max(DLB_T3_X + DLB_T3_TIME_X, nameT.x + nameT.width + DLB_GAP);
      const timeT = this.add.text(nextX, rowCenterY, `${e.time}s`, {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(timeT);
      rowTexts.push(timeT);

      // Score + marker — push right if time overflows its slot
      const marker = (i === highlightIdx) ? ' ◄' : '';
      nextX = Math.max(DLB_T3_X + DLB_T3_SCORE_X, timeT.x + timeT.width + DLB_GAP);
      const scoreT = this.add.text(nextX, rowCenterY, `${String(e.score).padStart(8, ' ')}${marker}`, {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(scoreT);
      rowTexts.push(scoreT);

      if (i === highlightIdx) this.highlightedRowTexts = rowTexts;
      curY += DLB_T3_ROW_H;
    }

    // ── Rows 4-10 ──
    curY += DLB_REST_Y;
    for (let i = 3; i < entries.length; i++) {
      const e = entries[i];
      const rowCenterY = curY + DLB_REST_ROW_H / 2;
      const color = (i === highlightIdx) ? '#ffffff' : '#aaaaaa';
      const rowTexts: Phaser.GameObjects.Text[] = [];

      // Rank
      let nextX = DLB_REST_X + DLB_REST_RANK_X;
      const rankT = this.add.text(nextX, rowCenterY, `${String(i + 1).padStart(2, ' ')}.`, {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(rankT);
      rowTexts.push(rankT);

      // Name
      nextX = Math.max(DLB_REST_X + DLB_REST_NAME_X, rankT.x + rankT.width + DLB_GAP);
      const nameT = this.add.text(nextX, rowCenterY, (e.name || 'ANON').padEnd(NAME_MAX_LENGTH, ' '), {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(nameT);
      rowTexts.push(nameT);

      // Time
      nextX = Math.max(DLB_REST_X + DLB_REST_TIME_X, nameT.x + nameT.width + DLB_GAP);
      const timeT = this.add.text(nextX, rowCenterY, `${e.time}s`, {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(timeT);
      rowTexts.push(timeT);

      // Score + marker
      const marker = (i === highlightIdx) ? ' ◄' : '';
      nextX = Math.max(DLB_REST_X + DLB_REST_SCORE_X, timeT.x + timeT.width + DLB_GAP);
      const scoreT = this.add.text(nextX, rowCenterY, `${String(e.score).padStart(8, ' ')}${marker}`, {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(scoreT);
      rowTexts.push(timeT);

      if (i === highlightIdx) this.highlightedRowTexts = rowTexts;
      curY += DLB_REST_ROW_H;
    }

    this.highlightRank = highlightIdx >= 0 ? rank : 0;

    this.deathContainer.setVisible(true);
    this.deathRestartText.setVisible(true);
  }

  private confirmNameEntry(): void {
    if (this.enteredName.trim() === '') {
      // Empty name — show "are you sure?" prompt
      this.showEmptyNamePrompt();
      return;
    }
    // Set flag — actual transition happens in updateNameEntry to avoid
    // issues with state changes inside Phaser's keyboard event dispatch
    this.nameConfirmed = true;
  }

  private showEmptyNamePrompt(): void {
    this.emptyNameVisible = true;
    this.emptyNamePrompt.setVisible(true);
    this.emptyNameYesBtn.setVisible(true);
    this.emptyNameNoBtn.setVisible(true);
    this.nameEnterBtn.setVisible(false);
  }

  private hideEmptyNamePrompt(): void {
    this.emptyNameVisible = false;
    this.emptyNamePrompt.setVisible(false);
    this.emptyNameYesBtn.setVisible(false);
    this.emptyNameNoBtn.setVisible(false);
    this.nameEnterBtn.setVisible(true);
  }

  private submitAsAnon(): void {
    this.hideEmptyNamePrompt();
    this.enteredName = 'ANON';
    this.nameConfirmed = true;
  }

  private showDeathScreen(rank: number): void {
    this.state = GameState.DEAD;
    this.deadInputDelay = 0.5;
    this.prepareDeathScreenVisuals(rank);
  }

  private updateNameEntry(_dt: number): void {
    // Game world is frozen — no road/obstacle updates

    // Rainbow cycle the "NEW HIGH SCORE!" title
    const RAINBOW = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00CCFF', '#0044FF', '#FF00FF'];
    const idx = Math.floor(Date.now() / 80) % RAINBOW.length;
    this.nameTitleText.setColor(RAINBOW[idx]);

    // Consume any space taps so they don't queue up for restart
    this.inputSystem.getSpeedTap();
    // Consume any clicks so they don't trigger slash on next game
    this.inputSystem.getAttackPressed();
    this.inputSystem.getRocketPressed();

    // Process deferred name confirmation (avoids state change inside event handlers)
    if (this.nameConfirmed) {
      this.nameConfirmed = false;

      // Remove keyboard listener
      if (this.nameKeyHandler) {
        this.input.keyboard?.off('keydown', this.nameKeyHandler);
        this.nameKeyHandler = null;
      }

      // Submit score with name
      const name = this.enteredName.trim() || 'ANON';
      const rank = this.leaderboardSystem.submit(name, this.pendingScore, this.elapsed);
      void submitScore(this.pendingScore, name);
      this.nameEntryContainer.setVisible(false);
      this.nameEnterBtn.setVisible(false);
      this.showDeathScreen(rank);
    }
  }

  private updateDead(dt: number): void {
    // Game world is frozen — no road/obstacle updates

    // Rainbow cycle the highlighted leaderboard entry
    if (this.highlightRank > 0 && this.highlightedRowTexts.length > 0) {
      const RAINBOW = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00CCFF', '#0044FF', '#FF00FF'];
      const idx = Math.floor(Date.now() / 80) % RAINBOW.length;
      for (const t of this.highlightedRowTexts) t.setColor(RAINBOW[idx]);
    }

    if (this.deadInputDelay > 0) {
      this.deadInputDelay -= dt;
      // Drain any stale input during the delay window
      this.inputSystem.getSpeedTap();
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      return;
    }

    if (this.inputSystem.getSpeedTap()) {
      this.startGame();
    }
  }
}
