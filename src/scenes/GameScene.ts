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
import { DamageFlashPipeline } from '../fx/DamageFlashPipeline';
import { CRT_TUNING } from '../config/crtTuning';
import { ProfileHud } from '../ui/ProfileHud';
import { ProfilePopup, AVATAR_TEXTURE_KEY } from '../ui/ProfilePopup';
import { ShieldSystem } from '../systems/ShieldSystem';
import { TimeDilationSystem } from '../systems/TimeDilationSystem';
import { PerfSystem } from '../systems/PerfSystem';
import { OrientationOverlay } from '../systems/OrientationOverlay';
import { GAME_MODE, DEVICE_PROFILE } from '../config/gameMode';
import { submitScore, fetchGlobalTop10, GlobalLeaderboardEntry } from '../systems/LeaderboardService';
import { submitRhythmScore, fetchRhythmTop10 } from '../systems/RhythmLeaderboardService';
import { ReflectionSystem } from '../systems/ReflectionSystem';
import { SkyGlowSystem } from '../systems/SkyGlowSystem';
import { fetchBeatData, getDominantColor } from '../systems/MusicCatalogService';
import { CourseRunner, loadCourseData, CourseData } from '../systems/CourseRunner';
import { SongSelectScreen } from '../ui/SongSelectScreen';
import { TEST_MODE } from '../util/testMode';
import { TITLE_LOOP_FRAME_COUNT, TITLE_START_FRAME_COUNT } from './BootScene';

enum GameState {
  TITLE,
  SONG_SELECT,
  TUTORIAL,
  STARTING,
  PLAYING,
  DYING,
  NAME_ENTRY,
  DEAD,
}

const NAME_MAX_LENGTH = 10;
const SKIP_BTN_SCALE = 1;          // skip button scale (0.5 = half, 1 = native, 2 = double
const SKIP_BTN_MARGIN_RIGHT = 240;    // px from right edge of screen
const SKIP_BTN_MARGIN_BOTTOM = 100;   // px from bottom edge of screen
const SKIP_BTN_PULSE_MIN = 0.15;     // minimum alpha during pulse
const SKIP_BTN_PULSE_MAX = 0.69;     // maximum alpha during pulse
const SKIP_BTN_PULSE_DURATION = 1200; // ms for one fade-in or fade-out half-cycle

// ── Debug hotkeys (all start inactive — toggle on via debug panel [+]) ──
const DEBUG_HOTKEYS = {
  gameplayInfo:   { key: 'E',       active: false },  // toggle gameplay debug text
  musicSource:    { key: 'W',       active: false },  // toggle music source label
  jumpLeaderboard:{ key: 'Q',       active: false },  // skip straight to death/leaderboard screen
  toggleCRT:      { key: 'O',       active: false },  // toggle CRT shader on/off
  crtDebug:       { key: 'P',       active: false },  // toggle CRT tuning overlay
  instantRage:    { key: 'ZERO',    active: false },  // trigger instant rage mode
  spectatorMode:  { key: 'I',       active: true },  // toggle spectator mode
  toggleLayer1:   { key: 'ONE',     active: false },  // toggle parallax layer 1
  toggleLayer2:   { key: 'TWO',     active: false },  // toggle parallax layer 2
  toggleLayer3:   { key: 'THREE',   active: false },  // toggle parallax layer 3
  toggleLayer4:   { key: 'FOUR',    active: false },  // toggle parallax layer 4
  toggleLayer5:   { key: 'FIVE',    active: false },  // toggle parallax layer 5
  toggleLayer6:   { key: 'SIX',     active: false },  // toggle parallax layer 6
  toggleLayer7:   { key: 'SEVEN',   active: false },  // toggle parallax layer 7
  toggleSky:      { key: 'EIGHT',   active: false },  // toggle sky background
  toggleRoad:     { key: 'NINE',    active: false },  // toggle road
  hideHud:        { key: 'G',       active: false },  // hide HUD + music UI during gameplay
  volumeAdjust:   { key: 'V',       active: false },  // up/down arrows adjust current music volume
  spritePosition: { key: 'S',       active: false },  // sprite X-offset position panel
  preStartOverlay:{ key: 'F',       active: false },  // toggle last pre-start frame overlay
  showHelp:       { key: 'PLUS',    active: true  },  // toggle debug panel (always active)
  showCollisions: { key: 'MINUS',   active: false },  // toggle collision hitbox overlay
  startHold:      { key: 'BACKTICK', active: false }, // skip the start hold phase
  toggleRefMask:  { key: 'R',       active: true },  // toggle puddle reflection mask
  freezeFrame:    { key: 'T',       active: true },  // freeze all movement for frame analysis
  textInspect:    { key: 'N',       active: true },  // cycle through all text elements to identify mystery text
  clickInspect:   { key: 'B',       active: true },  // click any element to identify it
};

// ── Death screen leaderboard: Scale multipliers ──
const DLB_T3_SCALE = 1.5;          // scale multiplier for top 3 font size
const DLB_REST_SCALE = 1.0;        // scale multiplier for rows 4-10 font size

// ── Death screen leaderboard: Top 3 group ──
const DLB_T3_X = 560;              // left edge X of the entire top-3 group
const DLB_T3_Y = 0;                // Y offset from leaderboard header bottom
const DLB_T3_ROW_H = 80;           // row height per top-3 entry
const DLB_T3_FONT = `${Math.round(34 * DLB_T3_SCALE)}px`;
const DLB_T3_AVATAR_R = 30;        // avatar circle radius
const DLB_T3_AVATAR_STROKE = 3;    // medal ring stroke width
const DLB_T3_AVATAR_X = -55;       // avatar center X relative to group left
const DLB_T3_RANK_X = 120;           // rank text X relative to group left
const DLB_T3_NAME_X = 160;          // name text X relative to group left
const DLB_T3_TIME_X = 600;         // time text X relative to group left
const DLB_T3_SCORE_X = 900;        // score text X relative to group left
const DLB_T3_MARKER_X = 960;       // ◄ marker X relative to group left
const DLB_T3_MEDAL_COLORS = [0xFFD700, 0xC0C0C0, 0xCD7F32]; // gold, silver, bronze
// ── Death screen leaderboard: Rows 4-10 group ──
const DLB_REST_Y = 8;              // Y gap between top-3 block and 4-10 block
const DLB_REST_ROW_H = 38;         // row height per 4-10 entry
const DLB_REST_FONT = `${Math.round(24 * DLB_REST_SCALE)}px`;

export class GameScene extends Phaser.Scene {
  // Systems
  private inputSystem!: InputSystem;
  private playerSystem!: PlayerSystem;
  private parallaxSystem!: ParallaxSystem;
  private roadSystem!: RoadSystem;
  private obstacleSystem!: ObstacleSystem;
  private reflectionSystem!: ReflectionSystem;
  private skyGlowSystem!: SkyGlowSystem;
  private lastBeatTrackId: string | null = null;
  private rhythmMode = false;
  private courseRunner: CourseRunner | null = null;
  private courseData: CourseData | null = null;
  private rhythmTrackId: string | null = null;
  private rhythmDifficulty: string = 'normal';
  private songSelectScreen!: SongSelectScreen;
  // Rhythm zone visuals
  private killZoneRect!: Phaser.GameObjects.Rectangle;
  private killZoneEdge!: Phaser.GameObjects.Rectangle;
  private sweetSpotLine!: Phaser.GameObjects.Graphics;
  private bonusZoneRect!: Phaser.GameObjects.Rectangle;
  private bonus2xPopup!: Phaser.GameObjects.Text;
  private bonusFlashOverlay!: Phaser.GameObjects.Rectangle;
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
  private profileWasOpen = false;
  private perfSystem!: PerfSystem;
  private orientationOverlay: OrientationOverlay | null = null;
  private shieldSystem!: ShieldSystem;
  private timeDilation!: TimeDilationSystem;
  private actionBtnTop!: Phaser.GameObjects.Sprite;
  private actionBtnBottom!: Phaser.GameObjects.Sprite;
  private sliderBar!: Phaser.GameObjects.Image;
  private sliderKnob!: Phaser.GameObjects.Image;
  private wasDilating: boolean = false;

  // Custom cursor (rendered under CRT) — desktop only, null on touch devices
  private cursorStroke?: Phaser.GameObjects.Image;
  private cursorMain?: Phaser.GameObjects.Image;
  private crosshair?: Phaser.GameObjects.Image;
  private crosshairActive = false;          // true when crosshair mode is on (gameplay)
  private crosshairHiddenByWMP = false;     // true when crosshair was faded out for WMP
  private cursorOverUI: boolean = false;
  private globalCursorX = 0;
  private globalCursorY = 0;
  private htmlCursor?: HTMLDivElement;  // HTML cursor overlay (renders above everything incl. iframe)

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

  // Streak system (rapid scoring bonuses)
  private streakCount: number = 0;
  private streakTimer: number = 0;

  // Lane highlights (collision warning)
  private laneHighlights: Phaser.GameObjects.Rectangle[] = [];
  private laneHighlightColor: number = 0xff0000;

  // Lane warning indicators (pooled, right-edge preview circles)
  private warningPool: { circle: Phaser.GameObjects.Arc; preview: Phaser.GameObjects.Sprite; currentKey: string }[] = [];
  private warningPoolUsed: number = 0;
  // Lane warning pills (combo: crash + pickup/shield, pill-shaped)
  private warningPillPool: { gfx: Phaser.GameObjects.Graphics; preview1: Phaser.GameObjects.Sprite; preview2: Phaser.GameObjects.Sprite; currentKey1: string; currentKey2: string }[] = [];
  private warningPillPoolUsed: number = 0;

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

  // Title loop animation — manual performance.now()-based frame stepping
  // Bypasses Phaser's animation timer for smoother playback (37% less judder on iPhone)
  private titleLoopSprite!: Phaser.GameObjects.Sprite;
  private titleRevealOverlay!: Phaser.GameObjects.Rectangle;
  private _titleAnimPlaying = false;
  private _titleAnimFrame = 0;
  private _titleAnimLastTime = 0;
  private _titleAnimFrameCount = 0;
  private _titleAnimFps = 12;
  private _titleAnimLoop = true;
  private _titleAnimSheet: 'loop' | 'play' = 'loop';
  private _titleAnimOnComplete: (() => void) | null = null;

  /** True if title animation frames were loaded (desktop always, mobile with ?anim_level=N). */
  private get titleAnimEnabled(): boolean {
    return !GAME_MODE.mobileMode || (window as any).__animLevel != null;
  }

  /** Start manual frame-stepping animation (bypasses Phaser anim timer for smoother playback). */
  private _titleAnimPlay(sheet: 'loop' | 'play'): void {
    this._titleAnimSheet = sheet;
    this._titleAnimFrame = 0;
    this._titleAnimFrameCount = sheet === 'loop' ? TITLE_LOOP_FRAME_COUNT : TITLE_START_FRAME_COUNT;
    this._titleAnimLoop = sheet === 'loop';
    this._titleAnimFps = 12;
    this._titleAnimPlaying = true;
    this._titleAnimLastTime = performance.now();
    this._titleAnimOnComplete = null;
    const texKey = sheet === 'loop' ? 'loop-sheet' : 'play-sheet';
    this.titleLoopSprite.setTexture(texKey, 0);
  }

  /** Stop manual frame-stepping animation. */
  private _titleAnimStop(): void {
    this._titleAnimPlaying = false;
    this._titleAnimOnComplete = null;
  }

  /** Register a one-time completion callback (for play-once animations like title-start). */
  private _titleAnimOnceComplete(cb: () => void): void {
    this._titleAnimOnComplete = cb;
  }

  /** Called every frame from update() — advances animation frame using performance.now(). */
  private _titleAnimUpdate(): void {
    if (!this._titleAnimPlaying) return;
    const now = performance.now();
    const elapsed = now - this._titleAnimLastTime;
    const frameDuration = 1000 / this._titleAnimFps;
    if (elapsed >= frameDuration) {
      const steps = Math.floor(elapsed / frameDuration);
      this._titleAnimLastTime += steps * frameDuration; // carry remainder
      if (this._titleAnimLoop) {
        this._titleAnimFrame = (this._titleAnimFrame + steps) % this._titleAnimFrameCount;
      } else {
        this._titleAnimFrame = Math.min(this._titleAnimFrame + steps, this._titleAnimFrameCount - 1);
        if (this._titleAnimFrame >= this._titleAnimFrameCount - 1) {
          this._titleAnimPlaying = false;
          const cb = this._titleAnimOnComplete;
          this._titleAnimOnComplete = null;
          if (cb) cb();
          return;
        }
      }
      this.titleLoopSprite.setFrame(this._titleAnimFrame);
    }
  }

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
  private debugHelpContainer!: Phaser.GameObjects.Container;
  private debugPanelOpen: boolean = false;
  private debugMasterEnabled: boolean = true;
  private debugFrozen: boolean = false;
  private debugPanelRows: { label: string; text: Phaser.GameObjects.Text }[] = [];
  private debugMasterText!: Phaser.GameObjects.Text;
  private debugVolumeBg!: Phaser.GameObjects.Rectangle;
  private debugVolumeTexts: Phaser.GameObjects.Text[] = [];
  private debugVolumeActive: boolean = false;
  private debugVolumeIdx: number = 0;
  private debugSpritePosBg!: Phaser.GameObjects.Rectangle;
  private debugSpritePosTexts: Phaser.GameObjects.Text[] = [];
  private debugSpritePosActive: boolean = false;
  private debugSpritePosIdx: number = 0;
  private debugPreStartOverlay!: Phaser.GameObjects.Image;
  private debugRepeatTimers: Record<string, number> = {};
  private collisionDebug: boolean = false;
  private collisionGfx!: Phaser.GameObjects.Graphics;

  // Vision debug HUD (?hud=1)
  private debugHudSystem: import('../systems/DebugHudSystem').DebugHudSystem | null = null;

  // Text inspector debug (N — cycle all texts)
  private _tiActive = false;
  private _tiIdx = 0;
  private _tiLabel!: Phaser.GameObjects.Text;
  private _tiItems: Array<{ id: string; obj: Phaser.GameObjects.Text | HTMLElement }> = [];
  private _tiOutlinedEl: HTMLElement | null = null;

  // Click inspector debug (B — click to identify elements, ←→ cycle)
  private _ciActive = false;
  private _ciIdx = 0;
  private _ciGfx!: Phaser.GameObjects.Graphics;
  private _ciLabel!: Phaser.GameObjects.Text;
  private _ciOutlinedEl: HTMLElement | null = null;
  private _ciClickHandler: ((e: MouseEvent) => void) | null = null;
  private _ciClipboard = '';
  private _ciHits: Array<{ id: string; phaser?: Phaser.GameObjects.Text; html?: HTMLElement }> = [];

  // Name entry
  private nameEntryContainer!: Phaser.GameObjects.Container;
  private nameInputText!: Phaser.GameObjects.Text;
  private nameEnterBtn!: Phaser.GameObjects.Text;
  private enteredName: string = '';
  private pendingScore: number = 0;
  private pendingRank: number = 0;
  private nameKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private nameHiddenInput: HTMLInputElement | null = null;
  private nameConfirmed: boolean = false;
  private autoSubmitted: boolean = false;
  private globalLeaderboardData: GlobalLeaderboardEntry[] | null = null;
  private lastSubmittedRunId: string | null = null;
  private deathGen = 0;
  private nameSkipConfirmPending: boolean = false;
  private nameSkipWarning!: Phaser.GameObjects.Text;
  private emptyNamePrompt!: Phaser.GameObjects.Text;
  private emptyNameYesBtn!: Phaser.GameObjects.Text;
  private emptyNameNoBtn!: Phaser.GameObjects.Text;
  private emptyNameVisible: boolean = false;
  private anyInputPressed: boolean = false;

  // Widescreen side curtains (hide extra canvas width until gameplay reveal)
  private curtainLeft: Phaser.GameObjects.Rectangle | null = null;
  private curtainRight: Phaser.GameObjects.Rectangle | null = null;

  // Countdown (5→1 before gameplay)
  private countdownSprite!: Phaser.GameObjects.Sprite;
  private blackOverlay!: Phaser.GameObjects.Rectangle;
  private countdownIndex: number = 0;
  private countdownPhaseTimer: number = 0;
  private countdownPhase: 'animate' | 'delay' | 'cutscene' | 'grace' | 'done' = 'done';
  private preStartSprite: Phaser.GameObjects.Sprite | null = null;
  private spawnGraceTimer: number = 0;
  /** HTML5 Audio for countdown music on mobile (bypasses Phaser WebAudio which is unreliable on iOS) */
  private countdownAudioEl: HTMLAudioElement | null = null;

  // Tutorial (pre-countdown screens)
  private introTutSprite: Phaser.GameObjects.Sprite | null = null;
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
      // Block ALL keyboard input while BIOS overlay or swipe-to-fullscreen is active
      const biosOverlay = document.getElementById('boot-overlay');
      if (biosOverlay && !biosOverlay.classList.contains('hidden')) return;
      if ((window as any).__swipeLock) return;
      // Forward all keys to profile popup when open
      if (this.profilePopup?.isOpen()) {
        this.profilePopup.handleKey(event);
        return;
      }
      if (k === 'escape') {
        if (this.state === GameState.SONG_SELECT) {
          // SongSelectScreen handles its own ESC — don't also returnToTitle
          return;
        }
        if (this.state === GameState.NAME_ENTRY) {
          if (this.nameSkipConfirmPending) {
            // Second Escape — confirmed skip
            this.returnToTitle();
          } else {
            // First Escape — show warning
            this.nameSkipConfirmPending = true;
            this.nameSkipWarning.setVisible(true);
          }
        } else if (this.state === GameState.DEAD && this.rhythmMode) {
          // Rhythm mode death → back to song select
          this.returnToTitle();
          this.enterSongSelect();
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
      // Block all input during unskippable cutscenes
      if (this.introTutPlaying) return;
      // Only Space and Enter can advance title/tutorial (other keys are ignored)
      const isAdvanceKey = k === ' ' || k === 'enter';
      // Eagerly resume AudioContext in user gesture (keyboard path)
      if (isAdvanceKey && (this.state === GameState.TUTORIAL || this.state === GameState.TITLE || this.state === GameState.STARTING)) {
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx?.state === 'suspended') ctx.resume();
      }
      if (this.state === GameState.TUTORIAL) {
        if (isAdvanceKey) {
          this.primeCountdownAudio(); // Bless HTML5 Audio in gesture context for iOS
          this.tutorialAdvance = true;
        }
      } else if (this.state === GameState.TITLE) {
        if (isAdvanceKey) {
          this.anyInputPressed = true;
        }
      } else if (this.state === GameState.STARTING) {
        this.anyInputPressed = true;
      }
    });
    // Track pointer start for mobile tap detection
    let pointerDownTime = 0;
    this.input.on('pointerdown', () => {
      pointerDownTime = performance.now();
      // iOS audio unlock fallback — must happen in gesture context
      try {
        const sp = (window as any).__spotifyPlayer;
        if (sp?.activateElement) sp.activateElement();
      } catch {}
      // Desktop: fire click logic immediately (no tap ambiguity with mouse)
      if (!GAME_MODE.mobileMode) {
        this.handleScreenTap();
      }
    });
    // Mobile: fire click logic on pointerup only if it was a quick tap
    this.input.on('pointerup', () => {
      if (!GAME_MODE.mobileMode) return;
      const held = performance.now() - pointerDownTime;
      if (held < TUNING.MOBILE_TAP_THRESHOLD) {
        this.handleScreenTap();
      }
    });

    // Weekly seed
    this.weekKey = getCurrentWeekKey();
    this.weekSeed = weekKeyToSeed(this.weekKey);
    this.leaderboardSystem = new LeaderboardSystem(this.weekKey);

    // --- Game world ---
    this.parallaxSystem = new ParallaxSystem(this);
    this.skyGlowSystem = new SkyGlowSystem(this, this.parallaxSystem);
    this.roadSystem = new RoadSystem(this);
    this.skyGlowSystem.setRoadTile(this.roadSystem.getRoadTile());
    this.obstacleSystem = new ObstacleSystem(this, this.weekSeed);
    // Reflections on all tiers — quality scaled via DeviceProfile (reflectionRTScale/Skip)
    this.reflectionSystem = new ReflectionSystem(this, this.parallaxSystem, this.obstacleSystem.getPool(), this.roadSystem.getRoadTile());
    this.reflectionSystem.setLinesTile(this.roadSystem.getLinesTile());
    this.pickupSystem = new PickupSystem(this);
    this.rocketSystem = new RocketSystem(this, this.obstacleSystem);

    this.shieldSystem = new ShieldSystem(this);
    this.reflectionSystem.setPickupPool(this.pickupSystem.getPool());
    this.reflectionSystem.setShieldPool(this.shieldSystem.getPool());
    this.reflectionSystem.setRocketPool(this.rocketSystem.getPool());

    // Wire obstacle system to spawn pickups behind CRASH obstacles
    this.obstacleSystem.onPickupSpawn = (x: number, y: number) => {
      this.pickupSystem.spawn(x, y);
    };

    // Wire obstacle system to spawn shield pickups behind CRASH obstacles
    this.obstacleSystem.onShieldSpawn = (x: number, y: number) => {
      this.shieldSystem.spawn(x, y);
    };

    // Wire rocket hit: explosion sound + score bonus + popup + camera shake
    this.rocketSystem.onHit = (hitX: number, _y: number, hitType?: ObstacleType, isEnemy?: boolean) => {
      if (this.rhythmMode && isEnemy) {
        // Enemy car proximity scoring — closer to center = more points
        const centerDist = Math.abs(hitX - TUNING.RHYTHM_SWEET_SPOT_X);
        const zoneHalf = TUNING.RHYTHM_ENEMY_CAR_ZONE_HALF;
        if (centerDist <= zoneHalf) {
          const proximity = 1 - centerDist / zoneHalf;
          const enemyBonus = Math.round(
            TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE +
            proximity * (TUNING.RHYTHM_ENEMY_CAR_MAX_SCORE - TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE)
          );
          this.awardBonus(enemyBonus, 'rocket');
          if (proximity > 0.7) this.trigger2XFlash();
        } else {
          this.awardBonus(TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE, 'rocket');
        }
      } else {
        const pts = hitType === ObstacleType.CAR ? TUNING.SCORE_CAR_ROCKET : TUNING.SCORE_OBSTACLE_ROCKET;
        this.awardBonus(pts, 'rocket');
      }
      this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 0.25, TUNING.SHAKE_DEATH_INTENSITY * 0.25);
    };

    this.difficultySystem = new DifficultySystem();
    this.inputSystem = new InputSystem(this);
    this.playerSystem = new PlayerSystem(this, this.inputSystem);
    this.reflectionSystem.setPlayerSprite(this.playerSystem.getSprite());
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
        GAME_MODE.canvasWidth, laneH,
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

    // Lane warning pills (combo: crash + pickup/shield, pooled)
    const initialPillPoolSize = TUNING.LANE_COUNT;
    for (let i = 0; i < initialPillPoolSize; i++) {
      const gfx = this.add.graphics().setDepth(95).setVisible(false);
      const p1 = this.add.sprite(0, 0, 'obstacle-crash').setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
      const p2 = this.add.sprite(0, 0, 'obstacle-crash').setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
      this.warningPillPool.push({ gfx, preview1: p1, preview2: p2, currentKey1: '', currentKey2: '' });
    }

    // --- HUD (visible during PLAYING) ---
    this.hudLabel = this.add.text(GAME_MODE.canvasWidth / 2, 20, 'WEEKLY HIGH SCORE', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Alagard',
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0).setVisible(false);

    this.hudHighScore = this.add.text(GAME_MODE.canvasWidth / 2, 50, '', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'Early GameBoy',
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0).setVisible(false);

    // --- Performance monitor + orientation lock ---
    this.perfSystem = new PerfSystem();
    if (GAME_MODE.mobileMode && !GAME_MODE.isPhoneMode) {
      // Tablets use Phaser overlay; phones use HTML rotate-back overlay (index.html)
      this.orientationOverlay = new OrientationOverlay(this);
    }

    // --- Vision debug HUD (?hud=1) ---
    if ((window as any).__dpMotoHud) {
      import('../systems/DebugHudSystem').then(({ DebugHudSystem }) => {
        this.debugHudSystem = new DebugHudSystem(this);
      });
    }

    // --- Profile HUD (Phaser-based, upper-left, affected by shaders) ---
    this.profileHud = new ProfileHud(this);

    // --- Action Buttons (upper-right, independently positioned, spritesheet) ---
    {
      const dep = TUNING.ACTION_BTN_DEPTH;
      const cw = GAME_MODE.canvasWidth;

      // Create press animations (5 frames each, 12 fps, play once)
      this.anims.create({ key: 'btn-rocket-press', frames: this.anims.generateFrameNumbers('btn-rocket', { start: 0, end: 4 }), frameRate: 12, repeat: 0 });
      this.anims.create({ key: 'btn-slash-press', frames: this.anims.generateFrameNumbers('btn-slash', { start: 0, end: 4 }), frameRate: 12, repeat: 0 });

      // Top button — rocket (gold/green)
      const scTop = TUNING.ACTION_BTN_SCALE_TOP;
      const topX = cw - TUNING.ACTION_BTN_PAD_RIGHT_TOP;
      const topY = TUNING.ACTION_BTN_PAD_TOP_TOP;

      this.actionBtnTop = this.add.sprite(topX, topY, 'btn-rocket', 0)
        .setScale(scTop).setDepth(dep).setScrollFactor(0).setVisible(false)
        .setInteractive({ useHandCursor: true });
      this.actionBtnTop.on('pointerdown', () => {
        this.actionBtnTop.play('btn-rocket-press');
        this.actionBtnTop.once('animationcomplete', () => {
          this.actionBtnTop.setFrame(0);
        });
        this.inputSystem.injectRocket();
      });

      // Bottom button — slash (red/blue)
      const scBot = TUNING.ACTION_BTN_SCALE_BOT;
      const botX = cw - TUNING.ACTION_BTN_PAD_RIGHT_BOT;
      const botY = TUNING.ACTION_BTN_PAD_TOP_BOT;

      this.actionBtnBottom = this.add.sprite(botX, botY, 'btn-slash', 0)
        .setScale(scBot).setDepth(dep).setScrollFactor(0).setVisible(false)
        .setInteractive({ useHandCursor: true });
      this.actionBtnBottom.on('pointerdown', () => {
        this.actionBtnBottom.play('btn-slash-press');
        this.actionBtnBottom.once('animationcomplete', () => {
          this.actionBtnBottom.setFrame(0);
        });
        this.inputSystem.injectAttack();
      });
    }

    // --- Slider Bar (vertical bar on road, left side) ---
    this.sliderBar = this.add.image(TUNING.SLIDER_BAR_X, TUNING.SLIDER_BAR_Y, 'slider-bar')
      .setScale(TUNING.SLIDER_BAR_SCALE)
      .setDepth(TUNING.SLIDER_BAR_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Slider Knob (centered on slider bar) ---
    this.sliderKnob = this.add.image(TUNING.SLIDER_BAR_X, TUNING.SLIDER_BAR_Y, 'slider-knob')
      .setScale(TUNING.SLIDER_BAR_SCALE)
      .setDepth(TUNING.SLIDER_BAR_DEPTH + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Profile Popup (opens on avatar click) ---
    this.profilePopup = new ProfilePopup(this);
    this.profileHud.onAvatarClick(() => {
      const onDeath = this.state === GameState.DEAD || this.state === GameState.NAME_ENTRY || this.state === GameState.DYING;
      const duringGameplay = this.state === GameState.PLAYING;
      this.musicPlayer.closeWMP();
      this.profilePopup.open(this.profilePopup.getName(), onDeath, duringGameplay);
    });
    this.musicPlayer.onWMPOpen(() => {
      if (this.profilePopup.isOpen()) this.profilePopup.close();
      // Fade out crosshair while WMP is open
      if (this.crosshair && this.crosshairActive && !this.crosshairHiddenByWMP) {
        this.crosshairHiddenByWMP = true;
        this.tweens.killTweensOf(this.crosshair);
        this.tweens.add({ targets: this.crosshair, alpha: 0, duration: 200 });
      }
    });
    this.musicPlayer.onWMPClose(() => {
      // Restore crosshair if it was active before WMP opened
      if (this.crosshair && this.crosshairHiddenByWMP && this.crosshairActive) {
        this.crosshairHiddenByWMP = false;
        this.tweens.killTweensOf(this.crosshair);
        this.tweens.add({ targets: this.crosshair, alpha: 1, duration: 200 });
      }
    });
    this.profilePopup.onProfileChanged((name, hasAvatar) => {
      if (hasAvatar) {
        const key = this.profilePopup.getAvatarTextureKey();
        if (key) this.profileHud.setAvatarTexture(key);
      } else {
        this.profileHud.setAvatarTexture('default-avatar');
      }
      if (this.state === GameState.TITLE) {
        this.profileHud.setVisible(true);
        this.profileHud.showProfileMode(name, this.getProfileRankText());
      } else if (this.state === GameState.PLAYING) {
        this.profileHud.showPlayingMode(name);
      }
    });
    // Load profile from Supabase early so the HUD is populated before the player sees it
    this.profilePopup.loadProfile();

    // Refresh HUD name + avatar after Spotify login/disconnect
    this.events.on('spotify-auth-changed', () => {
      const name = this.profilePopup.getName();
      const key = this.profilePopup.getAvatarTextureKey();
      if (key) this.profileHud.setAvatarTexture(key);
      if (this.state === GameState.TITLE) {
        this.profileHud.setVisible(true);
        this.profileHud.showProfileMode(name, this.getProfileRankText());
      } else if (this.state === GameState.PLAYING) {
        this.profileHud.showPlayingMode(name);
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
    // Spritesheet: 'loop-sheet' with manual frame stepping; fallback: static 'start-loop-00'
    const titleTexKey = this.titleAnimEnabled ? 'loop-sheet' : 'start-loop-00';
    this.titleLoopSprite = this.add.sprite(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      titleTexKey, this.titleAnimEnabled ? 0 : undefined
    ).setDepth(199);
    // Scale spritesheet frame (or static image) to fill screen
    let frameW: number, frameH: number;
    if (this.titleAnimEnabled) {
      // Spritesheet frame dimensions are known from the sheet info
      const frame = this.titleLoopSprite.texture.get(0);
      frameW = frame.width;
      frameH = frame.height;
    } else {
      const frameTex = this.textures.get('start-loop-00');
      frameW = frameTex.getSourceImage().width;
      frameH = frameTex.getSourceImage().height;
    }
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
    if (this.titleAnimEnabled) this._titleAnimPlay('loop');
    // Mobile without ?anim_level: static first frame (no animation)

    // --- Title reveal overlay (black, fades out after swipe-to-fullscreen completes) ---
    this.titleRevealOverlay = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
      0x000000, 1
    ).setDepth(201).setScrollFactor(0);
    if (!GAME_MODE.isPhoneMode) {
      // Desktop: no swipe, reveal immediately
      this.titleRevealOverlay.setAlpha(0);
    }

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

    // --- Song Select Screen ---
    this.songSelectScreen = new SongSelectScreen(this, {
      onPlay: (track, difficulty) => {
        this.rhythmMode = true;
        this.rhythmDifficulty = difficulty;
        this.setRhythmZonesVisible(true);
        // Load course then start
        loadCourseData(track.spotifyTrackId, difficulty).then((cd) => {
          if (cd) {
            this.courseData = cd;
            this.rhythmTrackId = track.spotifyTrackId;
            console.log('[RHYTHM] Course loaded for play:', track.title, difficulty, cd.events.length, 'events');
          }
          this.songSelectScreen.hide();
          // Set black overlay visible for enterStarting
          this.blackOverlay.setVisible(true).setAlpha(1);
          this.enterStarting();
        });
      },
      onBack: () => {
        this.songSelectScreen.hide();
        this.state = GameState.TITLE;
        this.titleContainer.setVisible(true);
      },
    });

    // --- Death screen ---
    this.deathContainer = this.add.container(0, 0).setDepth(200);
    const deathBg = this.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
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
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 450,
      GAME_MODE.mobileMode ? 'Tap to try again' : 'Press SPACEBAR to try again', {
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
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
      0x000000, 1
    );
    this.nameTitleText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 - 300,
      'NEW HIGH SCORE!', {
        fontSize: '144px',
        color: '#ffcc00',
        fontFamily: 'Early GameBoy',
      }
    ).setOrigin(0.5);
    const nameScoreLabel = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 - 140,
      '', {
        fontSize: '108px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    nameScoreLabel.setData('id', 'nameScoreLabel');
    const namePrompt = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 20,
      'ENTER YOUR NAME:', {
        fontSize: '72px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      }
    ).setOrigin(0.5);
    this.nameInputText = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 130,
      '_', {
        fontSize: '108px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.nameInputText.on('pointerdown', () => {
      if (this.nameHiddenInput) this.nameHiddenInput.focus();
    });
    this.nameSkipWarning = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 350,
      'Your score won\'t be saved! Press ESC again to skip.', {
        fontSize: '66px',
        color: '#ff4444',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setVisible(false);
    this.nameEntryContainer.add([nameBg, this.nameTitleText, nameScoreLabel, namePrompt, this.nameInputText, this.nameSkipWarning]);
    this.nameEntryContainer.setVisible(false);

    // ENTER button — scene-level (NOT inside container) so pointer events work reliably
    this.nameEnterBtn = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 300,
      '[ ENTER ]', {
        fontSize: '96px',
        color: '#00ff00',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        backgroundColor: '#003300',
        padding: { x: 72, y: 36 },
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
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      if (this.state === GameState.NAME_ENTRY) {
        this.confirmNameEntry();
      }
    });
    this.nameEnterBtn.setVisible(false);

    // "Are you sure?" prompt + Yes/No buttons (scene-level for pointer events)
    this.emptyNamePrompt = this.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2 + 200,
      'No name entered. Are you sure?', {
        fontSize: '72px',
        color: '#ff4444',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setDepth(212).setVisible(false);

    const btnStyle = {
      fontSize: '84px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      padding: { x: 72, y: 24 },
    };
    this.emptyNameYesBtn = this.add.text(
      TUNING.GAME_WIDTH / 2 - 300, TUNING.GAME_HEIGHT / 2 + 380,
      'YES', { ...btnStyle, color: '#ff4444', backgroundColor: '#330000' }
    ).setOrigin(0.5).setDepth(212).setInteractive({ useHandCursor: true }).setVisible(false);
    this.emptyNameYesBtn.on('pointerover', () => { this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }); this.emptyNameYesBtn.setColor('#ffffff').setBackgroundColor('#660000'); });
    this.emptyNameYesBtn.on('pointerout', () => this.emptyNameYesBtn.setColor('#ff4444').setBackgroundColor('#330000'));
    this.emptyNameYesBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      if (this.state === GameState.NAME_ENTRY && this.emptyNameVisible) {
        this.submitAsAnon();
      }
    });

    this.emptyNameNoBtn = this.add.text(
      TUNING.GAME_WIDTH / 2 + 300, TUNING.GAME_HEIGHT / 2 + 380,
      'NO', { ...btnStyle, color: '#00ff00', backgroundColor: '#003300' }
    ).setOrigin(0.5).setDepth(212).setInteractive({ useHandCursor: true }).setVisible(false);
    this.emptyNameNoBtn.on('pointerover', () => { this.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }); this.emptyNameNoBtn.setColor('#ffffff').setBackgroundColor('#006600'); });
    this.emptyNameNoBtn.on('pointerout', () => this.emptyNameNoBtn.setColor('#00ff00').setBackgroundColor('#003300'));
    this.emptyNameNoBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      if (this.state === GameState.NAME_ENTRY && this.emptyNameVisible) {
        this.hideEmptyNamePrompt();
      }
    });

    // Widescreen side curtains — cover the extra canvas width during title/tutorial/countdown.
    // Slide off-screen when gameplay starts, slide back on returnToTitle.
    const cOff = GAME_MODE.contentOffsetX;
    if (cOff > 0) {
      this.curtainLeft = this.add.rectangle(
        cOff / 2, TUNING.GAME_HEIGHT / 2,
        cOff + 4, TUNING.GAME_HEIGHT,
        0x000000
      ).setDepth(300).setScrollFactor(0);
      this.curtainRight = this.add.rectangle(
        GAME_MODE.canvasWidth - cOff / 2, TUNING.GAME_HEIGHT / 2,
        cOff + 4, TUNING.GAME_HEIGHT,
        0x000000
      ).setDepth(300).setScrollFactor(0);
    }

    // Black overlay for countdown (covers game world, below countdown numbers)
    this.blackOverlay = this.add.rectangle(
      GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
      0x000000
    ).setDepth(249).setScrollFactor(0).setVisible(false);

    // Pre-start cutscene (fullscreen, plays once after countdown "2" appears — unskippable)
    // Desktop: full-res PNGs (1924×1076). Mobile: half-res JPGs (962×538, ~68MB VRAM).
    this.preStartSprite = this.add.sprite(
      GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2, 'pre-start-00000'
    ).setDisplaySize(TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT)
     .setDepth(248).setScrollFactor(0).setVisible(false);

    // Intro-to-tutorial cutscene (all platforms — unskippable transition)
    this.introTutSprite = this.add.sprite(
      GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2, 'intro-tut-00000'
    ).setDisplaySize(TUNING.GAME_WIDTH * TUNING.INTRO_TUT_SCALE, TUNING.GAME_HEIGHT)
     .setDepth(248).setScrollFactor(0).setVisible(false);

    // Death exposure white overlay (above everything game-related)
    this.deathWhiteOverlay = this.add.rectangle(
      GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
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
      .setOrigin(0.5, 0.5).setScale(SKIP_BTN_SCALE).setAlpha(SKIP_BTN_PULSE_MAX).setDepth(248).setVisible(false).setInteractive({ useHandCursor: true }).setTintFill(0xffffff);
    // Position from right/bottom edges (margin is distance from edge to button center)
    this.tutorialSkipBtn.setPosition(
      TUNING.GAME_WIDTH - SKIP_BTN_MARGIN_RIGHT,
      TUNING.GAME_HEIGHT - SKIP_BTN_MARGIN_BOTTOM,
    );

    // Looping fade pulse — runs whenever button is not hovered
    const startSkipPulse = () => {
      this.tweens.killTweensOf(this.tutorialSkipBtn);
      this.tweens.add({
        targets: this.tutorialSkipBtn,
        alpha: { from: SKIP_BTN_PULSE_MAX, to: SKIP_BTN_PULSE_MIN },
        duration: SKIP_BTN_PULSE_DURATION,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    };

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
        alpha: SKIP_BTN_PULSE_MAX,
        scale: 0.5,
        duration: 400,
        ease: 'Sine.easeInOut',
        onComplete: () => startSkipPulse(),
      });
    });
    // Stash the starter so we can kick it off when the button becomes visible
    this.tutorialSkipBtn.setData('startPulse', startSkipPulse);
    this.tutorialSkipBtn.on('pointerdown', () => {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      // Eagerly resume AudioContext in user gesture (same reason as handleScreenTap)
      const ctx = (this.sound as any).context as AudioContext | undefined;
      if (ctx?.state === 'suspended') ctx.resume();
      this.primeCountdownAudio(); // Bless HTML5 Audio in gesture context for iOS
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
            this.tutorialSkipBtn.setAlpha(SKIP_BTN_PULSE_MAX);
            // Guard: if tutorial already completed during the 500ms button fade
            // (e.g. tap also advanced rage_wait → rage_black → enterStarting),
            // don't overwrite the countdown's black overlay with alpha 0.
            if (this.state !== GameState.TUTORIAL || this.tutorialPhase === 'done') return;
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
    this.reflectionSystem.setSlashSprite(this.slashSprite);
    this.slashActiveTimer = 0;
    this.slashCooldownTimer = 0;

    // Hide player until game starts
    this.playerSystem.setVisible(false);

    // Start hold text — shown during hold phase, hidden when ramp begins
    this.startHoldText = this.add.text(GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.mobileMode ? 'TAP AND HOLD TO GO' : 'HOLD SPACEBAR TO GO', {
      fontFamily: 'Early GameBoy',
      fontSize: '36px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1000).setScrollFactor(0).setVisible(false);

    // --- CRT post-processing (gated by device profile, ?crt=0/1 overrides) ---
    const crtParam = new URLSearchParams(location.search).get('crt');
    const crtOn = crtParam === '0' ? false : crtParam === '1' ? true : DEVICE_PROFILE.crt;
    if (crtOn) {
      this.cameras.main.setPostPipeline(CRTPipeline);
    }
    this.cameras.main.setPostPipeline(DamageFlashPipeline);

    // --- Adaptive canvas: center 1920px game content in the wider viewport ---
    this.cameras.main.setScroll(-GAME_MODE.contentOffsetX, 0);

    // --- renderScale: zoom camera to map 1920×1080 world onto smaller canvas ---
    // Origin(0,0) makes zoom scale from top-left: screen = worldPos * zoom.
    // At renderScale=0.5 on a 960×540 canvas, world (1920,1080) → screen (960,540).
    this.cameras.main.originX = 0;
    this.cameras.main.originY = 0;
    this.cameras.main.setZoom(GAME_MODE.renderScale);

    // --- Custom cursor (under CRT shader) — desktop only ---
    if (!GAME_MODE.mobileMode) {
      this.game.canvas.style.cursor = 'none';
      document.body.style.cursor = 'none';
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
    }

    // --- HTML cursor overlay (renders above everything including iframe) — desktop only ---
    if (!GAME_MODE.mobileMode) {
      this.htmlCursor = document.createElement('div');
      Object.assign(this.htmlCursor.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '999999', display: 'none',
      });
      const htmlCursorImg = new Image();
      htmlCursorImg.onload = () => {
        const cc = (window as any).__cursorConfig || { size: 48, strokeW: 0, tint: 0xff0000, strokeColor: 0x000000 };
        const aspect = htmlCursorImg.naturalWidth / htmlCursorImg.naturalHeight;
        const h = cc.size;
        const sw = cc.strokeW;
        const tintHex = '#' + cc.tint.toString(16).padStart(6, '0');
        const strokeHex = '#' + cc.strokeColor.toString(16).padStart(6, '0');
        const mask = '-webkit-mask-image:url(ui/cursor.png);mask-image:url(ui/cursor.png);' +
          '-webkit-mask-size:contain;mask-size:contain;' +
          '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;' +
          '-webkit-mask-position:center;mask-position:center;' +
          'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);';
        if (sw > 0) {
          const sH = h + sw * 2;
          const sW = Math.round(sH * aspect);
          const strokeDiv = document.createElement('div');
          strokeDiv.style.cssText = mask + 'width:' + sW + 'px;height:' + sH + 'px;background:' + strokeHex + ';';
          this.htmlCursor!.appendChild(strokeDiv);
        }
        const mainW = Math.round(h * aspect);
        const mainDiv = document.createElement('div');
        mainDiv.style.cssText = mask + 'width:' + mainW + 'px;height:' + h + 'px;background:' + tintHex + ';';
        this.htmlCursor!.appendChild(mainDiv);
      };
      htmlCursorImg.src = 'ui/cursor.png';
      document.body.appendChild(this.htmlCursor);

      // Global cursor tracking (works even when HTML overlays capture pointer events)
      const updateCursorFromEvent = (clientX: number, clientY: number) => {
        // Don't show GameScene cursor while BIOS overlay is visible
        const bios = document.getElementById('boot-overlay');
        if (bios && !bios.classList.contains('hidden')) return;
        const rect = this.game.canvas.getBoundingClientRect();
        const cx = clientX + TUNING.CURSOR_OFFSET_X;
        const cy = clientY + TUNING.CURSOR_OFFSET_Y;
        this.globalCursorX = ((cx - rect.left) / rect.width) * GAME_MODE.canvasWidth;
        this.globalCursorY = ((cy - rect.top) / rect.height) * TUNING.GAME_HEIGHT;
        // Position HTML cursor at offset
        this.htmlCursor!.style.display = '';
        this.htmlCursor!.style.left = cx + 'px';
        this.htmlCursor!.style.top = cy + 'px';
      };
      document.addEventListener('mousemove', (e) => updateCursorFromEvent(e.clientX, e.clientY));
      // Touch/pointer events for mobile cursor tracking
      document.addEventListener('pointerdown', (e) => updateCursorFromEvent(e.clientX, e.clientY));
      document.addEventListener('pointermove', (e) => updateCursorFromEvent(e.clientX, e.clientY));
    }

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
    // All keys registered unconditionally — gated by master + active at runtime
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleCRT.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.toggleCRT.active || this.debugPanelOpen) return;
      this.crtEnabled = !this.crtEnabled;
      const pipes = this.cameras.main.getPostPipeline(CRTPipeline);
      if (Array.isArray(pipes)) {
        pipes.forEach(p => p.active = this.crtEnabled);
      } else if (pipes) {
        pipes.active = this.crtEnabled;
      }
    });
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.crtDebug.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.crtDebug.active || this.debugPanelOpen) return;
      this.crtDebugVisible = !this.crtDebugVisible;
      this.crtDebugDom.setVisible(this.crtDebugVisible);
      if (this.crtDebugVisible) this.updateCRTDebugText();
    });

    // Apply TUNING volumes to BIOS audio elements before triggering the beep
    const bootOverlay = (window as any).__bootOverlay;
    if (bootOverlay?.bootupAudio) bootOverlay.bootupAudio.volume = TUNING.SFX_BIOS_BOOTUP_VOLUME * TUNING.SFX_BIOS_MASTER;
    if (bootOverlay?.biosCompleteAudio) bootOverlay.biosCompleteAudio.volume = TUNING.SFX_BIOS_BEEP_VOLUME * TUNING.SFX_BIOS_MASTER;

    // Signal boot overlay that the start screen is ready
    (window as any).__bootOverlay?.markStartScreenReady?.();

    // Start title music — timing depends on platform:
    if (GAME_MODE.isPhoneMode) {
      // Mobile: music starts AFTER swipe-to-fullscreen completes (first sound user hears)
      const fadeReveal = () => {
        // Hide UI corners until reveal completes (AFTER tryAutoplayMusic which resets opacity)
        this.profileHud.setAlpha(0);
        this.musicPlayer.setContainerOpacity(0);
        // 0.5s delay then 1.5s fade to reveal title animation
        this.time.delayedCall(500, () => {
          this.tweens.add({
            targets: this.titleRevealOverlay,
            alpha: 0,
            duration: 1500,
            ease: 'Linear',
          });
          // UI corners start fading in 1s after overlay starts (0.5s before overlay finishes)
          this.time.delayedCall(1000, () => {
            this.tweens.add({ targets: this.profileHud.getContainer(), alpha: 1, duration: 1500, ease: 'Linear' });
            this.musicPlayer.fadeContainerOpacity(1, 1500);
          });
        });
      };
      if ((window as any).__mobileSwipeComplete) {
        this.tryAutoplayMusic();
        fadeReveal(); // must be after tryAutoplayMusic so setContainerOpacity(0) isn't overridden
      } else {
        (window as any).__onMobileSwipeComplete = () => { this.tryAutoplayMusic(); fadeReveal(); };
      }
    } else if (bootOverlay?.waitForBeep) {
      // Desktop/tablet: music starts after BIOS beep finishes
      bootOverlay.waitForBeep(() => this.tryAutoplayMusic());
    } else {
      this.tryAutoplayMusic();
    }

    this.input.keyboard?.addKey(DEBUG_HOTKEYS.instantRage.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.instantRage.active || this.debugPanelOpen) return;
      if (this.state === GameState.PLAYING && this.rageTimer <= 0) {
        this.rageAmount = TUNING.RAGE_MAX;
        this.rageTimer = TUNING.RAGE_DURATION;
        this.playerSystem.playPoweredUp();
        this.musicPlayer.setVolumeBoost(TUNING.RAGE_MUSIC_VOLUME_BOOST);
        this.audioSystem.setDistortion(TUNING.RAGE_AUDIO_DISTORTION);
      }
    });
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.spectatorMode.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.spectatorMode.active || this.debugPanelOpen) return;
      this.spectatorMode = !this.spectatorMode;
      this.playerSystem.setSpectator(this.spectatorMode);
      this.spectatorLabel.setVisible(this.spectatorMode);
    });
    // Parallax layer toggles (keys 1-7)
    for (let i = 0; i < 7; i++) {
      const hotkey = [
        DEBUG_HOTKEYS.toggleLayer1, DEBUG_HOTKEYS.toggleLayer2, DEBUG_HOTKEYS.toggleLayer3,
        DEBUG_HOTKEYS.toggleLayer4, DEBUG_HOTKEYS.toggleLayer5, DEBUG_HOTKEYS.toggleLayer6,
        DEBUG_HOTKEYS.toggleLayer7,
      ][i];
      const layerIdx = i;
      this.input.keyboard?.addKey(hotkey.key).on('down', () => {
        if (!this.debugMasterEnabled || !hotkey.active || this.debugPanelOpen) return;
        this.parallaxSystem.toggleLayer(layerIdx);
        this.reflectionSystem.toggleLayer(layerIdx);
      });
    }
    // Sky toggle (key 8)
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleSky.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.toggleSky.active || this.debugPanelOpen) return;
      this.parallaxSystem.toggleSky();
      this.reflectionSystem.toggleSky();
    });
    // Reflection mask toggle (M)
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleRefMask.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.toggleRefMask.active || this.debugPanelOpen) return;
      this.reflectionSystem.toggleMask();
    });
    // Freeze frame toggle (T)
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.freezeFrame.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.freezeFrame.active || this.debugPanelOpen) return;
      this.debugFrozen = !this.debugFrozen;
    });
    // Road toggle (key 9)
    let roadVisible = true;
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.toggleRoad.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.toggleRoad.active || this.debugPanelOpen) return;
      roadVisible = !roadVisible;
      this.roadSystem.setVisible(roadVisible);
    });
    // Hide HUD (G) — only during gameplay
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.hideHud.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.hideHud.active || this.debugPanelOpen) return;
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
      this.reflectionSystem.setVisible(v);
      for (let i = 0; i < this.warningPool.length; i++) {
        this.warningPool[i].circle.setVisible(v);
        this.warningPool[i].preview.setVisible(v);
      }
      for (let i = 0; i < this.warningPillPool.length; i++) {
        this.warningPillPool[i].gfx.setVisible(v);
        this.warningPillPool[i].preview1.setVisible(v);
        this.warningPillPool[i].preview2.setVisible(v);
      }
      for (let i = 0; i < this.laneHighlights.length; i++) {
        this.laneHighlights[i].setVisible(false);
      }
      // Suppress explosions and screen shakes
      this.obstacleSystem.setSuppressExplosions(this.hudHidden);
      this.fxSystem.setSuppressShake(this.hudHidden);
    });

    this.input.keyboard?.addKey(DEBUG_HOTKEYS.startHold.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.startHold.active || this.debugPanelOpen) return;
      this.startHoldMode = !this.startHoldMode;
    });

    // Volume adjust toggle (V) + full-list readout HUD
    {
      const volFontSize = 36;
      const volLineH = 48;
      const volParamCount = 15; // 1 music + 14 sfx/bios
      const volPanelH = volParamCount * volLineH + 16;
      const volPanelW = 1040;
      const volTopY = volPanelH / 2;
      this.debugVolumeBg = this.add.rectangle(
        GAME_MODE.canvasWidth / 2, volTopY, volPanelW, volPanelH, 0x000000, 0.75
      ).setDepth(9999).setScrollFactor(0).setVisible(false);
      this.debugVolumeTexts = [];
      for (let i = 0; i < volParamCount; i++) {
        const y = 8 + i * volLineH + volLineH / 2;
        const txt = this.add.text(GAME_MODE.canvasWidth / 2 - volPanelW / 2 + 16, y, '', {
          fontSize: `${volFontSize}px`, color: '#ff0000', fontFamily: 'monospace',
        }).setOrigin(0, 0.5).setDepth(9999).setScrollFactor(0).setVisible(false);
        this.debugVolumeTexts.push(txt);
      }
    }
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.volumeAdjust.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.volumeAdjust.active || this.debugPanelOpen) return;
      this.debugVolumeActive = !this.debugVolumeActive;
      this.debugVolumeBg.setVisible(this.debugVolumeActive);
      for (const t of this.debugVolumeTexts) t.setVisible(this.debugVolumeActive);
    });

    // Sprite position panel (S) — same layout as volume panel
    {
      const spFontSize = 36;
      const spLineH = 48;
      const spParamCount = 14;
      const spPanelH = spParamCount * spLineH + 16;
      const spPanelW = 1040;
      const spTopY = spPanelH / 2;
      this.debugSpritePosBg = this.add.rectangle(
        GAME_MODE.canvasWidth / 2, spTopY, spPanelW, spPanelH, 0x000000, 0.75
      ).setDepth(9999).setScrollFactor(0).setVisible(false);
      this.debugSpritePosTexts = [];
      for (let i = 0; i < spParamCount; i++) {
        const y = 8 + i * spLineH + spLineH / 2;
        const txt = this.add.text(GAME_MODE.canvasWidth / 2 - spPanelW / 2 + 16, y, '', {
          fontSize: `${spFontSize}px`, color: '#ff0000', fontFamily: 'monospace',
        }).setOrigin(0, 0.5).setDepth(9999).setScrollFactor(0).setVisible(false);
        this.debugSpritePosTexts.push(txt);
      }
    }
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.spritePosition.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.spritePosition.active || this.debugPanelOpen) return;
      this.debugSpritePosActive = !this.debugSpritePosActive;
      this.debugSpritePosBg.setVisible(this.debugSpritePosActive);
      for (const t of this.debugSpritePosTexts) t.setVisible(this.debugSpritePosActive);
    });

    // Pre-start last frame overlay (F) — static image for composition reference (desktop only)
    if (!GAME_MODE.mobileMode && this.textures.exists('pre-start-00045')) {
      this.debugPreStartOverlay = this.add.image(
        GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2, 'pre-start-00045'
      ).setDisplaySize(GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT)
       .setDepth(247).setScrollFactor(0).setAlpha(0.5).setVisible(false);
    } else {
      // Placeholder for mobile — never shown
      this.debugPreStartOverlay = this.add.image(0, 0, '__DEFAULT').setVisible(false);
    }
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.preStartOverlay.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.preStartOverlay.active || this.debugPanelOpen) return;
      if (this.state !== GameState.PLAYING) return;
      this.debugPreStartOverlay.setVisible(!this.debugPreStartOverlay.visible);
    });

    // Text inspector (N) — cycle through all text objects to identify mystery text
    this._tiLabel = this.add.text(GAME_MODE.canvasWidth / 2, 60, '', {
      fontSize: '28px', color: '#00ff00', fontFamily: 'monospace',
      backgroundColor: '#000000', padding: { x: 12, y: 8 },
      wordWrap: { width: GAME_MODE.canvasWidth - 100 },
    }).setOrigin(0.5, 0).setDepth(99999).setScrollFactor(0).setVisible(false);
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.textInspect.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.textInspect.active || this.debugPanelOpen) return;
      this._tiActive = !this._tiActive;
      if (this._tiActive) {
        this._tiCollect();
        this._tiIdx = 0;
        this._tiShow();
      } else {
        this._tiClear();
        this._tiLabel.setVisible(false);
      }
    });

    // Click inspector (B) — click any element on screen to identify it
    this._ciGfx = this.add.graphics().setDepth(99999).setScrollFactor(0).setVisible(false);
    this._ciLabel = this.add.text(16, 16, '', {
      fontSize: '26px', color: '#00ff00', fontFamily: 'monospace',
      backgroundColor: '#000000', padding: { x: 10, y: 6 },
    }).setOrigin(0, 0).setDepth(99999).setScrollFactor(0).setVisible(false);
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.clickInspect.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.clickInspect.active || this.debugPanelOpen) return;
      this._ciActive = !this._ciActive;
      if (this._ciActive) {
        this._ciGfx.setVisible(true);
        this._ciLabel.setText('CLICK INSPECT: click any element (B exit)');
        this._ciLabel.setVisible(true);
        this._ciClickHandler = (e: MouseEvent) => this._ciOnClick(e);
        document.addEventListener('mousedown', this._ciClickHandler, true);
      } else {
        this._ciCleanup();
      }
    });

    // Debug panel — interactive overlay to toggle hotkeys on/off
    {
      const pad = 40;
      const fontSize = 32;
      const lineH = 44;
      const panelEntries: { label: string; key: string; desc: string }[] = [
        { label: 'gameplayInfo',    key: DEBUG_HOTKEYS.gameplayInfo.key,    desc: 'Gameplay debug info' },
        { label: 'musicSource',     key: DEBUG_HOTKEYS.musicSource.key,     desc: 'Music source label' },
        { label: 'jumpLeaderboard', key: DEBUG_HOTKEYS.jumpLeaderboard.key, desc: 'Jump to leaderboard' },
        { label: 'toggleCRT',       key: DEBUG_HOTKEYS.toggleCRT.key,       desc: 'Toggle CRT shader' },
        { label: 'crtDebug',        key: DEBUG_HOTKEYS.crtDebug.key,        desc: 'CRT tuning overlay' },
        { label: 'instantRage',     key: DEBUG_HOTKEYS.instantRage.key,     desc: 'Instant rage mode' },
        { label: 'spectatorMode',   key: DEBUG_HOTKEYS.spectatorMode.key,   desc: 'Spectator mode' },
        { label: 'toggleLayers',    key: '1-7',                             desc: 'Parallax layers' },
        { label: 'toggleSky',       key: DEBUG_HOTKEYS.toggleSky.key,       desc: 'Toggle sky' },
        { label: 'toggleRoad',      key: DEBUG_HOTKEYS.toggleRoad.key,      desc: 'Toggle road' },
        { label: 'hideHud',         key: DEBUG_HOTKEYS.hideHud.key,         desc: 'Hide HUD' },
        { label: 'volumeAdjust',    key: DEBUG_HOTKEYS.volumeAdjust.key,    desc: 'Volume adjust ↑↓' },
        { label: 'spritePosition', key: DEBUG_HOTKEYS.spritePosition.key,  desc: 'Sprite position ←→' },
        { label: 'preStartOverlay',key: DEBUG_HOTKEYS.preStartOverlay.key, desc: 'Pre-start last frame' },
        { label: 'toggleRefMask',   key: DEBUG_HOTKEYS.toggleRefMask.key,   desc: 'Reflection mask' },
        { label: 'freezeFrame',    key: DEBUG_HOTKEYS.freezeFrame.key,     desc: 'Freeze frame' },
        { label: 'showCollisions',  key: '-',                               desc: 'Collision hitboxes' },
        { label: 'startHold',       key: '`',                               desc: 'Skip start hold' },
        { label: 'textInspect',     key: DEBUG_HOTKEYS.textInspect.key,     desc: 'Text inspector ←→' },
        { label: 'clickInspect',    key: DEBUG_HOTKEYS.clickInspect.key,    desc: 'Click inspector' },
      ];

      this.debugHelpContainer = this.add.container(0, 0).setDepth(9999).setScrollFactor(0).setVisible(false);

      // Build rows
      let y = pad + 30;
      // Title
      const titleT = this.add.text(pad + 30, y, '  DEBUG PANEL', {
        fontFamily: 'monospace', fontSize: `${fontSize + 4}px`, color: '#ffffff',
      });
      this.debugHelpContainer.add(titleT);
      y += lineH;
      const divider = this.add.text(pad + 30, y, '  ──────────────────────────────────────────────────────────────────────', {
        fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#444444',
      });
      this.debugHelpContainer.add(divider);
      y += lineH;

      // Master toggle row
      this.debugMasterText = this.add.text(pad + 30, y, '', {
        fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#ff4444',
      });
      this.debugHelpContainer.add(this.debugMasterText);
      y += lineH + 8;

      // Hotkey rows — two-column layout
      this.debugPanelRows = [];
      const colWidth = 460;
      const halfCount = Math.ceil(panelEntries.length / 2);
      const startY = y;
      for (let i = 0; i < panelEntries.length; i++) {
        const col = i < halfCount ? 0 : 1;
        const row = i < halfCount ? i : i - halfCount;
        const xPos = pad + 30 + col * colWidth;
        const yPos = startY + row * lineH;
        const rowText = this.add.text(xPos, yPos, '', {
          fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#ff4444',
        });
        this.debugHelpContainer.add(rowText);
        this.debugPanelRows.push({ label: panelEntries[i].label, text: rowText });
      }
      y = startY + halfCount * lineH;

      // Footer
      y += 8;
      const footerT = this.add.text(pad + 30, y, '  [+] Close panel', {
        fontFamily: 'monospace', fontSize: `${fontSize - 4}px`, color: '#666666',
      });
      this.debugHelpContainer.add(footerT);
      y += lineH;

      // Background (sized to fit both columns)
      const bgWidth = pad + 30 + colWidth * 2 + 30;
      this.debugHelpBg = this.add.rectangle(pad, pad, bgWidth, y - pad + 20, 0x000000, 0.94)
        .setOrigin(0, 0).setDepth(9998).setScrollFactor(0).setVisible(false);

      // Refresh panel text colors
      const refreshPanel = () => {
        const masterColor = this.debugMasterEnabled ? '#00ff00' : '#ff4444';
        const masterLabel = this.debugMasterEnabled ? 'ON ' : 'OFF';
        this.debugMasterText.setText(`  [M] MASTER: ${masterLabel}`).setColor(masterColor);

        for (const row of this.debugPanelRows) {
          const entry = panelEntries.find(e => e.label === row.label)!;
          // For layer toggles, check if any layer is active
          let isActive: boolean;
          if (row.label === 'toggleLayers') {
            isActive = ['toggleLayer1','toggleLayer2','toggleLayer3','toggleLayer4','toggleLayer5','toggleLayer6','toggleLayer7']
              .some(k => (DEBUG_HOTKEYS as any)[k]?.active);
          } else {
            isActive = (DEBUG_HOTKEYS as any)[row.label]?.active ?? false;
          }
          const color = isActive ? '#00ff00' : '#ff4444';
          const keyStr = entry.key.length === 1 ? entry.key.toUpperCase() : entry.key;
          row.text.setText(`  [${keyStr}] ${entry.desc}`).setColor(color);
        }
      };

      // Key handler when panel is open
      const panelKeyHandler = (event: KeyboardEvent) => {
        if (!this.debugPanelOpen) return;
        const k = event.key.toUpperCase();

        // M = master toggle
        if (k === 'M') {
          this.debugMasterEnabled = !this.debugMasterEnabled;
          refreshPanel();
          return;
        }

        // Match key to a panel row and toggle its active state
        for (const row of this.debugPanelRows) {
          const entry = panelEntries.find(e => e.label === row.label)!;
          // Normalize the pressed key to match Phaser key names
          let matchKey = entry.key.toUpperCase();
          // Handle special key name mappings
          const keyMap: Record<string, string> = {
            'ZERO': '0', 'ONE': '1', 'TWO': '2', 'THREE': '3', 'FOUR': '4',
            'FIVE': '5', 'SIX': '6', 'SEVEN': '7', 'EIGHT': '8', 'NINE': '9',
            'PLUS': '+', 'MINUS': '-', 'BACKTICK': '`',
          };
          const displayKey = keyMap[matchKey] || matchKey;

          if (row.label === 'toggleLayers' && k >= '1' && k <= '7') {
            // Toggle all layer keys together
            const layerKeys = ['toggleLayer1','toggleLayer2','toggleLayer3','toggleLayer4','toggleLayer5','toggleLayer6','toggleLayer7'];
            const anyActive = layerKeys.some(lk => (DEBUG_HOTKEYS as any)[lk]?.active);
            for (const lk of layerKeys) {
              if ((DEBUG_HOTKEYS as any)[lk]) (DEBUG_HOTKEYS as any)[lk].active = !anyActive;
            }
            refreshPanel();
            return;
          } else if (k === displayKey && row.label !== 'toggleLayers') {
            (DEBUG_HOTKEYS as any)[row.label].active = !(DEBUG_HOTKEYS as any)[row.label].active;
            refreshPanel();
            return;
          }
        }
      };

      // + key toggles the panel
      this.input.keyboard?.addKey(DEBUG_HOTKEYS.showHelp.key).on('down', () => {
        this.debugPanelOpen = !this.debugPanelOpen;
        if (this.debugPanelOpen) refreshPanel();
        this.debugHelpBg.setVisible(this.debugPanelOpen);
        this.debugHelpContainer.setVisible(this.debugPanelOpen);
      });

      // Listen for raw keyboard events so we can intercept while panel is open
      this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
        if (this.debugPanelOpen) panelKeyHandler(event);
      });
    }

    // ── Rhythm zone visuals (kill zone, sweet spot, bonus zone) ──
    // Kill zone — red tinted rectangle on left side
    this.killZoneRect = this.add.rectangle(
      TUNING.RHYTHM_KILL_ZONE_X / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.RHYTHM_KILL_ZONE_X, TUNING.GAME_HEIGHT,
      TUNING.RHYTHM_KILL_ZONE_COLOR,
    ).setAlpha(TUNING.RHYTHM_KILL_ZONE_ALPHA).setDepth(50).setScrollFactor(0).setVisible(false);

    // Kill zone edge line — bright thin line at kill zone boundary
    this.killZoneEdge = this.add.rectangle(
      TUNING.RHYTHM_KILL_ZONE_X, TUNING.GAME_HEIGHT / 2,
      TUNING.RHYTHM_KILL_ZONE_LINE_WIDTH, TUNING.GAME_HEIGHT,
      TUNING.RHYTHM_KILL_ZONE_COLOR,
    ).setAlpha(TUNING.RHYTHM_KILL_ZONE_LINE_ALPHA).setDepth(50).setScrollFactor(0).setVisible(false);

    // Kill zone pulse tween
    this.tweens.add({
      targets: this.killZoneRect,
      alpha: { from: TUNING.RHYTHM_KILL_ZONE_PULSE_MIN, to: TUNING.RHYTHM_KILL_ZONE_PULSE_MAX },
      duration: TUNING.RHYTHM_KILL_ZONE_PULSE_DURATION,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      paused: true,
    });

    // Sweet spot — dashed vertical line at screen center
    this.sweetSpotLine = this.add.graphics().setDepth(50).setScrollFactor(0).setVisible(false);
    {
      const x = TUNING.RHYTHM_SWEET_SPOT_X;
      const dash = TUNING.RHYTHM_SWEET_SPOT_DASH;
      const gap = TUNING.RHYTHM_SWEET_SPOT_GAP;
      this.sweetSpotLine.lineStyle(TUNING.RHYTHM_SWEET_SPOT_LINE_WIDTH, TUNING.RHYTHM_SWEET_SPOT_COLOR, TUNING.RHYTHM_SWEET_SPOT_ALPHA);
      let y = 0;
      while (y < TUNING.GAME_HEIGHT) {
        this.sweetSpotLine.moveTo(x, y);
        this.sweetSpotLine.lineTo(x, Math.min(y + dash, TUNING.GAME_HEIGHT));
        y += dash + gap;
      }
      this.sweetSpotLine.strokePath();
    }

    // Bonus zone — subtle green rectangle centered on sweet spot
    this.bonusZoneRect = this.add.rectangle(
      TUNING.RHYTHM_SWEET_SPOT_X, TUNING.GAME_HEIGHT / 2,
      TUNING.RHYTHM_BONUS_ZONE_WIDTH, TUNING.GAME_HEIGHT,
      TUNING.RHYTHM_BONUS_ZONE_COLOR,
    ).setAlpha(TUNING.RHYTHM_BONUS_ZONE_ALPHA).setDepth(49).setScrollFactor(0).setVisible(false);

    // 2X popup text — reusable, starts invisible
    this.bonus2xPopup = this.add.text(0, 0, '2X', {
      fontFamily: 'Early GameBoy',
      fontSize: `${TUNING.RHYTHM_BONUS_POPUP_SIZE}px`,
      color: TUNING.RHYTHM_BONUS_POPUP_COLOR,
      stroke: '#003300',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setVisible(false);

    // Green flash overlay for 2X bonus
    this.bonusFlashOverlay = this.add.rectangle(
      GAME_MODE.canvasWidth / 2, TUNING.GAME_HEIGHT / 2,
      GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT,
      TUNING.RHYTHM_BONUS_FLASH_COLOR,
    ).setAlpha(0).setDepth(150).setScrollFactor(0);

    // Collision debug overlay
    this.collisionGfx = this.add.graphics().setDepth(9000);
    this.input.keyboard?.addKey(DEBUG_HOTKEYS.showCollisions.key).on('down', () => {
      if (!this.debugMasterEnabled || !DEBUG_HOTKEYS.showCollisions.active || this.debugPanelOpen) return;
      this.collisionDebug = !this.collisionDebug;
      if (!this.collisionDebug) this.collisionGfx.clear();
    });
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    // ── Robot pilot: process injected commands before anything else ──
    this.processTestCommands();

    // Block all game input while debug panel is open
    if (this.debugPanelOpen) {
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      this.inputSystem.getSpeedTap();
      return;
    }

    // Custom cursor follows pointer (uses global tracking to work over HTML overlays)
    this.cursorMain?.setPosition(this.globalCursorX, this.globalCursorY);
    this.cursorStroke?.setPosition(this.globalCursorX, this.globalCursorY);
    this.crosshair?.setPosition(this.globalCursorX, this.globalCursorY);

    // Debug freeze — stop all game logic, cursor still tracks
    if (this.debugFrozen) return;

    // Manual frame stepping for title animations (performance.now()-based, bypasses Phaser anim timer)
    this._titleAnimUpdate();

    // Fade cursor only when over the YouTube iframe (can't render Phaser on top of HTML video)
    const overIframe = this.musicPlayer.isCursorOverIframe();
    if (overIframe !== this.cursorOverUI) {
      this.cursorOverUI = overIframe;
      const alpha = overIframe ? 0 : 1;
      if (this.cursorMain) {
        this.tweens.killTweensOf(this.cursorMain);
        this.tweens.add({ targets: this.cursorMain, alpha, duration: 200 });
      }
      if (this.cursorStroke) {
        this.tweens.killTweensOf(this.cursorStroke);
        this.tweens.add({ targets: this.cursorStroke, alpha, duration: 200 });
      }
      if (this.crosshair) {
        this.tweens.killTweensOf(this.crosshair);
        this.tweens.add({ targets: this.crosshair, alpha, duration: 200 });
      }
    }

    // Z-order: hide WMP iframe when profile popup is in front
    const profOpen = this.profilePopup.isOpen();
    if (profOpen !== this.profileWasOpen) {
      this.profileWasOpen = profOpen;
      this.musicPlayer.setWMPBehind(profOpen);
    }

    this.perfSystem.update(dt);

    // Poll for track changes — hue-shift background + load beat/course data in Rhythm Mode
    const curTrackId = this.musicPlayer.getTrackId();
    if (curTrackId !== this.lastBeatTrackId) {
      this.lastBeatTrackId = curTrackId;
      if (curTrackId) {
        // Hue-shift background from album art (skip Death Pixie tracks)
        const artist = this.musicPlayer.getTrackArtist().toLowerCase();
        const isDeathPixie = artist === TUNING.INTRO_TRACK_ARTIST.toLowerCase();

        if (isDeathPixie) {
          this.skyGlowSystem.clearHue();
          this.laneHighlightColor = 0xff0000;
          for (const h of this.laneHighlights) h.setFillStyle(0xff0000, 0.1);
        } else {
          getDominantColor(curTrackId).then((color) => {
            if (this.lastBeatTrackId !== curTrackId) return; // stale
            if (color !== null) {
              console.log(`[SKY HUE] artist=${artist} color=#${color.toString(16).padStart(6,'0')} hue=${SkyGlowSystem.getHueDegrees(color).toFixed(1)}°`);
              this.skyGlowSystem.applyHueFromColor(color);
              this.laneHighlightColor = color;
              for (const h of this.laneHighlights) h.setFillStyle(color, 0.1);
            }
          });
        }

        // Rhythm Mode: fetch beat data for reactive visuals + course data for spawning
        if (this.rhythmMode) {
          fetchBeatData(curTrackId).then((bd) => {
            if (bd && this.lastBeatTrackId === curTrackId) {
              this.skyGlowSystem.setBeatData(curTrackId, bd);
            }
          });
          loadCourseData(curTrackId, this.rhythmDifficulty).then((cd) => {
            if (cd && this.lastBeatTrackId === curTrackId) {
              this.courseData = cd;
              this.rhythmTrackId = curTrackId;
              console.log('[RHYTHM] Course loaded:', curTrackId, this.rhythmDifficulty, cd.events.length, 'events');
            }
          });
        }
      } else {
        this.skyGlowSystem.clearHue();
        this.laneHighlightColor = 0xff0000;
        for (const h of this.laneHighlights) h.setFillStyle(0xff0000, 0.1);
        if (this.rhythmMode) this.skyGlowSystem.clearBeatData();
      }
    }

    this.inputSystem.update(dt);

    // Phone: HTML rotate-back overlay pauses gameplay (music continues)
    if (GAME_MODE.isPhoneMode && (window as any).__rotateBackActive) return;

    // Tablet: Phaser orientation overlay
    if (this.orientationOverlay) {
      this.orientationOverlay.update();
      if (this.orientationOverlay.isPaused()) return;
    }

    // Click inspector — ←→ cycle hits, enter copies
    if (this._ciActive && this.input.keyboard && this._ciHits.length > 0) {
      const lk = this.input.keyboard.addKey('LEFT');
      const rk = this.input.keyboard.addKey('RIGHT');
      const ek = this.input.keyboard.addKey('ENTER');
      if (Phaser.Input.Keyboard.JustDown(lk)) {
        this._ciIdx = (this._ciIdx - 1 + this._ciHits.length) % this._ciHits.length;
        this._ciShowHit();
      }
      if (Phaser.Input.Keyboard.JustDown(rk)) {
        this._ciIdx = (this._ciIdx + 1) % this._ciHits.length;
        this._ciShowHit();
      }
      if (Phaser.Input.Keyboard.JustDown(ek)) {
        navigator.clipboard.writeText(this._ciClipboard).catch(() => {});
      }
    }

    // Text inspector — left/right cycle, enter copies ID
    if (this._tiActive && this.input.keyboard && this._tiItems.length > 0) {
      const lk = this.input.keyboard.addKey('LEFT');
      const rk = this.input.keyboard.addKey('RIGHT');
      const ek = this.input.keyboard.addKey('ENTER');
      if (Phaser.Input.Keyboard.JustDown(lk)) {
        this._tiClear();
        this._tiIdx = (this._tiIdx - 1 + this._tiItems.length) % this._tiItems.length;
        this._tiShow();
      }
      if (Phaser.Input.Keyboard.JustDown(rk)) {
        this._tiClear();
        this._tiIdx = (this._tiIdx + 1) % this._tiItems.length;
        this._tiShow();
      }
      if (Phaser.Input.Keyboard.JustDown(ek)) {
        const item = this._tiItems[this._tiIdx];
        if (item) navigator.clipboard.writeText(item.id).catch(() => {});
      }
    }

    // Debug hotkeys polled in update() — gated by master toggle
    if (this.debugMasterEnabled && DEBUG_HOTKEYS.gameplayInfo.active && this.input.keyboard
        && Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(DEBUG_HOTKEYS.gameplayInfo.key))) {
      this.debugText.setVisible(!this.debugText.visible);
      if (!this.debugText.visible) this.debugText.setText('');
    }

    if (this.debugMasterEnabled && DEBUG_HOTKEYS.musicSource.active && this.input.keyboard
        && Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(DEBUG_HOTKEYS.musicSource.key))) {
      if (!this.debugMusicSourceText) {
        this.debugMusicSourceText = this.add.text(GAME_MODE.canvasWidth - 40, 150, '', {
          fontSize: '18px', color: '#00ff00', fontFamily: 'monospace',
        }).setOrigin(1, 0).setDepth(9999).setScrollFactor(0);
      }
      this.debugMusicSourceText.setVisible(!this.debugMusicSourceText.visible);
    }
    if (this.debugMusicSourceText?.visible) {
      this.debugMusicSourceText.setText(`SRC: ${this.musicPlayer.getSource().toUpperCase()}`);
    }

    // Volume adjust — left/right cycle params, up/down change value, enter copies
    if (this.debugVolumeActive && this.debugMasterEnabled && DEBUG_HOTKEYS.volumeAdjust.active && this.input.keyboard) {
      const sfxParams = [
        'MUSIC_VOL_COUNTDOWN',
        'SFX_BIOS_BOOTUP_VOLUME',
        'SFX_BIOS_BEEP_VOLUME',
        'SFX_EXPLODE_VOLUME',
        'SFX_ROCKET_FIRE_VOLUME',
        'SFX_AMMO_PICKUP_VOLUME',
        'SFX_OBSTACLE_KILL_VOLUME',
        'SFX_POTION_PICKUP_VOLUME',
        'SFX_POTION_USED_VOLUME',
        'IMPACT_VOLUME',
        'KATANA_SLASH_VOLUME',
        'ENGINE_SAMPLE_VOLUME',
        'ENGINE_SAMPLE_IDLE_VOLUME',
        'ENGINE_REV_VOL_BOOST',
      ];
      const totalParams = 1 + sfxParams.length;

      const step = 0.05;
      const upKey = this.input.keyboard.addKey('UP');
      const downKey = this.input.keyboard.addKey('DOWN');
      const leftKey = this.input.keyboard.addKey('LEFT');
      const rightKey = this.input.keyboard.addKey('RIGHT');

      if (this.debugKeyHeld(rightKey, dt, 'vol-right')) {
        this.debugVolumeIdx = (this.debugVolumeIdx + 1) % totalParams;
      }
      if (this.debugKeyHeld(leftKey, dt, 'vol-left')) {
        this.debugVolumeIdx = (this.debugVolumeIdx - 1 + totalParams) % totalParams;
      }

      // Build full param list — index 0 is the active music source
      const allParams: string[] = [];
      const isTitle = this.state === GameState.TITLE;
      const src = this.musicPlayer.getSource();
      if (isTitle) allParams.push('MUSIC_VOL_TITLE');
      else if (src === 'spotify') allParams.push('MUSIC_VOL_SPOTIFY');
      else allParams.push('MUSIC_VOL_YOUTUBE');
      allParams.push(...sfxParams);

      const param = allParams[this.debugVolumeIdx];
      let vol: number = (TUNING as any)[param];

      if (this.debugKeyHeld(upKey, dt, 'vol-up')) {
        vol = Math.round((vol + step) * 100) / 100;
        (TUNING as any)[param] = vol;
        if (this.debugVolumeIdx === 0) this.musicPlayer.applyVolume();
      }
      if (this.debugKeyHeld(downKey, dt, 'vol-down')) {
        vol = Math.max(0, Math.round((vol - step) * 100) / 100);
        (TUNING as any)[param] = vol;
        if (this.debugVolumeIdx === 0) this.musicPlayer.applyVolume();
      }

      const enterKey = this.input.keyboard.addKey('ENTER');
      if (Phaser.Input.Keyboard.JustDown(enterKey)) {
        const clipText = `${param}: ${vol},`;
        navigator.clipboard.writeText(clipText).catch(() => {});
      }

      // Update all lines — selected green, rest red
      for (let i = 0; i < this.debugVolumeTexts.length && i < allParams.length; i++) {
        const p = allParams[i];
        const v: number = (TUNING as any)[p];
        const selected = i === this.debugVolumeIdx;
        this.debugVolumeTexts[i].setText(`${selected ? '► ' : '  '}${p}: ${v}`);
        this.debugVolumeTexts[i].setColor(selected ? '#00ff00' : '#ff0000');
      }
    } else if (this.debugVolumeActive && (!this.debugMasterEnabled || !DEBUG_HOTKEYS.volumeAdjust.active)) {
      this.debugVolumeActive = false;
      this.debugVolumeBg.setVisible(false);
      for (const t of this.debugVolumeTexts) t.setVisible(false);
    }

    // Sprite position panel — up/down cycle sprites, left/right adjust X offset, enter copies
    if (this.debugSpritePosActive && this.debugMasterEnabled && DEBUG_HOTKEYS.spritePosition.active && this.input.keyboard) {
      const spriteParams = [
        'SPRITE_OFFSET_PLAYER',
        'SPRITE_OFFSET_ROAD',
        'SPRITE_OFFSET_RAILING',
        'SPRITE_OFFSET_PARALLAX_2',
        'SPRITE_OFFSET_PARALLAX_3',
        'SPRITE_OFFSET_PARALLAX_4',
        'SPRITE_OFFSET_PARALLAX_5',
        'SPRITE_OFFSET_PARALLAX_6',
        'SPRITE_OFFSET_PARALLAX_7',
        'SPRITE_OFFSET_SKY',
        'SPRITE_OFFSET_HOLD_TEXT',
        'SPRITE_OFFSET_HUD_LABEL',
        'SPRITE_OFFSET_HUD_SCORE',
        'SPRITE_OFFSET_PROFILE_HUD',
      ];
      const spStep = 10;
      const upKey = this.input.keyboard.addKey('UP');
      const downKey = this.input.keyboard.addKey('DOWN');
      const leftKey = this.input.keyboard.addKey('LEFT');
      const rightKey = this.input.keyboard.addKey('RIGHT');

      if (this.debugKeyHeld(downKey, dt, 'sp-down')) {
        this.debugSpritePosIdx = (this.debugSpritePosIdx + 1) % spriteParams.length;
      }
      if (this.debugKeyHeld(upKey, dt, 'sp-up')) {
        this.debugSpritePosIdx = (this.debugSpritePosIdx - 1 + spriteParams.length) % spriteParams.length;
      }

      const param = spriteParams[this.debugSpritePosIdx];
      let val: number = (TUNING as any)[param];

      if (this.debugKeyHeld(rightKey, dt, 'sp-right')) {
        val += spStep;
        (TUNING as any)[param] = val;
        this.applySpriteOffset(param, val);
      }
      if (this.debugKeyHeld(leftKey, dt, 'sp-left')) {
        val -= spStep;
        (TUNING as any)[param] = val;
        this.applySpriteOffset(param, val);
      }

      const enterKey = this.input.keyboard.addKey('ENTER');
      if (Phaser.Input.Keyboard.JustDown(enterKey)) {
        navigator.clipboard.writeText(`${param}: ${val},`).catch(() => {});
      }

      for (let i = 0; i < this.debugSpritePosTexts.length && i < spriteParams.length; i++) {
        const p = spriteParams[i];
        const v: number = (TUNING as any)[p];
        const selected = i === this.debugSpritePosIdx;
        this.debugSpritePosTexts[i].setText(`${selected ? '► ' : '  '}${p}: ${v}`);
        this.debugSpritePosTexts[i].setColor(selected ? '#00ff00' : '#ff0000');
      }
    } else if (this.debugSpritePosActive && (!this.debugMasterEnabled || !DEBUG_HOTKEYS.spritePosition.active)) {
      this.debugSpritePosActive = false;
      this.debugSpritePosBg.setVisible(false);
      for (const t of this.debugSpritePosTexts) t.setVisible(false);
    }

    if (this.debugMasterEnabled && DEBUG_HOTKEYS.jumpLeaderboard.active && this.input.keyboard
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

      // Hide all game elements (same cleanup as dying 'snap' phase)
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
      this.skyGlowSystem.setVisible(false);
      for (let i = 0; i < this.laneHighlights.length; i++) this.laneHighlights[i].setVisible(false);
      this.hideWarningPool();
      for (let i = 0; i < this.scorePopups.length; i++) {
        this.scorePopups[i].setActive(false).setVisible(false);
      }
      this.titleContainer.setVisible(false);
      this.musicPlayer.setVisible(false);
      this.deathWhiteOverlay.setVisible(false);

      this.deathContainer.setVisible(true);
      this.showDeathScreen(rank || 3);
    }

    switch (this.state) {
      case GameState.TITLE:
        this.updateTitle(dt);
        break;
      case GameState.SONG_SELECT:
        this.updateSongSelect(dt);
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

    // Test mode: sync state to window.__dpMotoTest for XCUITest polling
    this.syncTestState();

    // Vision system: lightweight state for WebDriver reads (separate from ?test=1)
    if ((window as any).__dpMotoHud) {
      const STATE_NAMES_V = ['TITLE','SONG_SELECT','TUTORIAL','STARTING','PLAYING','DYING','NAME_ENTRY','DEAD'];
      const visionData = {
        fps: Math.round(this.game.loop.actualFps),
        stateName: STATE_NAMES_V[this.state] || 'UNKNOWN',
        state: this.state,
        playerX: this.playerSystem?.getX() ?? 0,
        playerY: this.playerSystem?.getY() ?? 0,
        speed: this.playerSystem?.getPlayerSpeed() ?? 0,
        score: this.scoreSystem?.getScore() ?? 0,
        elapsed: this.elapsed,
        difficulty: this.difficultySystem?.getFactor() ?? 0,
        obstacleCount: this.obstacleSystem?.getActiveCount() ?? 0,
        alive: this.playerSystem?.isAlive() ?? false,
        frameCount: this.game.loop.frame,
      };
      (window as any).__dpMotoVision = visionData;
      this.debugHudSystem?.update(dt, visionData);
    }
  }

  // ─── Robot Pilot: Command Processing ──────────────────────
  private processTestCommands(): void {
    if (!TEST_MODE.active) return;
    const t = (window as any).__dpMotoTest;
    if (!t) return;
    const cmds = t.popCommands();
    const MAX_CMDS = 50;
    if (cmds.length > MAX_CMDS) {
      console.warn(`[test] Command flood: ${cmds.length} commands, processing first ${MAX_CMDS}`);
    }
    for (let i = 0; i < Math.min(cmds.length, MAX_CMDS); i++) {
      const raw = cmds[i];
      try {
        const cmd = typeof raw === 'object' ? raw : JSON.parse(raw);
        this.executeTestCommand(cmd);
      } catch {
        this.executeTestCommand({ type: raw });
      }
    }
  }

  private executeTestCommand(cmd: { type: string; [k: string]: any }): void {
    // Track last action for crash attribution
    const t = (window as any).__dpMotoTest;
    const details = cmd.type === 'move-y' ? `y=${cmd.y}` : cmd.type === 'set-seed' ? `seed=${cmd.seed}` : undefined;
    if (t?.setLastAction) t.setLastAction(cmd.type, details);

    switch (cmd.type) {
      case 'tap':
        // State-aware tap: bypass pointer-position dependencies
        if (this.state === GameState.TITLE) {
          this.audioSystem.start();
          this.rhythmMode = false;
          this.courseRunner = null;
          this.enterTutorial();
        } else if (this.state === GameState.DEAD) {
          // DEAD screen listens for speedTap, not anyInput
          this.inputSystem.injectSpeedTap();
        } else {
          this.anyInputPressed = true;
        }
        break;
      case 'speed-tap':
        this.inputSystem.injectSpeedTap();
        break;
      case 'attack':
        this.inputSystem.injectAttack();
        break;
      case 'rocket':
        this.inputSystem.injectRocket();
        break;
      case 'move-y':
        this.inputSystem.injectTargetY(cmd.y ?? 540);
        break;
      case 'die':
        if (this.state === GameState.PLAYING) this.enterDead();
        break;
      case 'return-title':
        this.returnToTitle();
        break;
      case 'skip-to-play':
        this.skipToPlaying();
        break;
      case 'set-seed':
        if (typeof cmd.seed === 'number') {
          this.weekSeed = cmd.seed;
          console.log(`[test] Seed set to ${cmd.seed}`);
        }
        break;
      case 'reset-run':
        // Composite: set seed (optional) → return to title → deterministic baseline
        if (typeof cmd.seed === 'number') this.weekSeed = cmd.seed;
        this.returnToTitle();
        break;
      case 'open-profile':
        this.musicPlayer.closeWMP();
        this.profilePopup.open(this.profilePopup.getName(), false, this.state === GameState.PLAYING);
        break;
      case 'close-profile':
        if (this.profilePopup.isOpen()) this.profilePopup.close();
        break;
      case 'toggle-music-menu':
        if (this.musicPlayer) {
          const wmp = (this.musicPlayer as any).wmpPopup;
          if (wmp?.toggle) wmp.toggle();
        }
        break;
      case 'submit-name':
        if (this.state === GameState.NAME_ENTRY) {
          this.enteredName = cmd.name || 'ROBOT';
          this.nameConfirmed = true;
        }
        break;
      case 'screenshot': {
        const t2 = (window as any).__dpMotoTest;
        if (t2?.captureScreenshot) t2.captureScreenshot();
        break;
      }
      default:
        console.warn(`[test] Unknown command: ${cmd.type}`);
    }
    console.log(`[test] Executed: ${cmd.type}`);
  }

  private skipToPlaying(): void {
    // Jump directly from any state to PLAYING, skipping BIOS/tutorial/countdown
    this.rhythmMode = false;
    this.courseRunner = null;
    this.audioSystem.start();
    this.startGame();
  }

  // ─── Test Mode State Sync ──────────────────────────────────
  private testFrameCount = 0;
  private testPrevStateName = '';
  private testStateVersion = 0;
  // Cumulative metrics (reset per run via resetTestMetrics)
  private testCollisions = 0;
  private testPickups = 0;
  private testRocketsFired = 0;
  private testObstaclesDestroyed = 0;

  private syncTestState(): void {
    const t = (window as any).__dpMotoTest;
    if (!t) return;
    const s = t.state;
    const STATE_NAMES = ['TITLE','SONG_SELECT','TUTORIAL','STARTING','PLAYING','DYING','NAME_ENTRY','DEAD'];
    const prev = this.testPrevStateName;
    s.state = this.state;
    s.stateName = STATE_NAMES[this.state] || 'UNKNOWN';
    s.elapsed = this.elapsed || 0;
    s.score = this.scoreSystem?.getScore() ?? 0;
    s.alive = this.state === GameState.PLAYING;
    s.biosVisible = !document.getElementById('boot-overlay')?.classList.contains('hidden');
    s.musicSource = this.musicPlayer?.getSource?.() || 'none';
    s.frameCount = ++this.testFrameCount;
    s.playerY = this.playerSystem?.getY?.() ?? 0;
    s.roadSpeed = 0; // roadSpeed is local to updatePlaying — not critical for test verification
    s.difficulty = this.difficultySystem?.getFactor?.() ?? 0;
    s.obstacleCount = this.obstacleSystem?.getActiveCount?.() ?? 0;
    s.lastUpdateMs = Date.now();
    s.seed = this.weekSeed ?? 0;
    if (prev !== s.stateName) {
      s.lastStateChangeTs = Date.now();
      this.testPrevStateName = s.stateName;
      this.testStateVersion++;
      console.log(`[test-mode] State: ${prev || 'INIT'} → ${s.stateName}`);
      // Clear crash suspect once game successfully reaches PLAYING
      if (s.stateName === 'PLAYING' && t.clearCrashSuspect) {
        t.clearCrashSuspect();
      }
    }
    s.stateVersion = this.testStateVersion;

    // ── Phase 3B: Sensors ──────────────────────────────────────
    s.player.x = this.playerSystem?.getX?.() ?? 0;
    s.player.y = this.playerSystem?.getY?.() ?? 0;
    s.player.speed = this.playerSystem?.getPlayerSpeed?.() ?? 0;
    s.player.alive = this.playerSystem?.isAlive?.() ?? false;
    s.player.shieldCount = this.shieldSystem?.getShields?.() ?? 0;
    s.player.rockets = this.pickupSystem?.getAmmo?.() ?? 0;

    s.metrics.collisions = this.testCollisions;
    s.metrics.pickups = this.testPickups;
    s.metrics.rocketsFired = this.testRocketsFired;
    s.metrics.obstaclesDestroyed = this.testObstaclesDestroyed;

    s.threat = this.obstacleSystem?.getNearestThreat?.(
      this.playerSystem?.getX?.() ?? 0,
      this.playerSystem?.getY?.() ?? 0
    ) ?? null;

    // ── Phase 3A: UI Snapshot ──────────────────────────────────
    s.ui.biosVisible = s.biosVisible;
    s.ui.titleVisible = this.titleContainer?.visible ?? false;
    s.ui.tutorialVisible = this.state === GameState.TUTORIAL;
    s.ui.hudVisible = !this.hudHidden;
    s.ui.wmpOpen = (this.musicPlayer as any)?.wmpPopup?.getIsOpen?.() ?? false;
    s.ui.profileOpen = this.profilePopup?.isOpen?.() ?? false;
    s.ui.deathScreenVisible = this.deathContainer?.visible ?? false;
    s.ui.countdownVisible = this.state === GameState.STARTING;
    s.ui.trackTitle = (this.musicPlayer as any)?.currentTrackName || null;
    s.ui.sceneName = 'Game';

    // ── Performance metrics (stress testing) ───────────────────
    s.fps = Math.round(this.game.loop.actualFps);
    s.fpsAvg = Math.round(this.perfSystem.getFps());
    s.qualityTier = this.perfSystem.getRenderTier();
    s.features.crt = this.crtEnabled && DEVICE_PROFILE.crt;
    s.features.reflections = !!this.reflectionSystem;
    s.features.carCount = DEVICE_PROFILE.carCount;
    s.features.parallaxLayers = DEVICE_PROFILE.parallaxLayers;
    s.features.mobileMode = GAME_MODE.mobileMode;
    s.features.simulatedDevice = (window as any).__deviceProfile?.label || null;
    // Track FPS min/max during PLAYING only
    if (this.state === GameState.PLAYING && s.fps > 0) {
      if (s.fps < s.fpsMin) s.fpsMin = s.fps;
      if (s.fps > s.fpsMax) s.fpsMax = s.fps;
    }
  }

  private updateTitle(dt: number): void {
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.skyGlowSystem.update(dt, this.musicPlayer.getPlaybackPosition().current);
    this.roadSystem.update(titleSpeed, dt);

    // Block title input during swipe-to-fullscreen overlay (title still animates)
    if ((window as any).__swipeLock) return;

    // Fallback: if mobile swipe completed but music never started, retry every frame
    // (startTitleMusic has its own guard — safe to call repeatedly, it no-ops if already playing)
    if (GAME_MODE.isPhoneMode && (window as any).__mobileSwipeComplete) {
      this.tryAutoplayMusic();
    }

    if (this.anyInputPressed) {
      this.anyInputPressed = false;
      // Drain queued inputs so they don't carry into gameplay
      this.inputSystem.getSpeedTap();
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      // Start audio on first user gesture
      this.audioSystem.start();

      const pointer = this.input.activePointer;
      if (!this.isTitleUIZone(pointer.x, pointer.y)) {
        this.rhythmMode = false;
        this.courseRunner = null;
        this.enterTutorial();
      }
    }
  }

  /** Check if a point is over a title-screen UI element (music player, profile HUD). */
  private isTitleUIZone(px: number, py: number): boolean {
    // Profile HUD — upper left (origin 40,40, avatar 128px + score/bar ~600px wide, ~180px tall)
    if (px < 680 && py < 220) return true;
    // Music player — upper right (pad 40 from right, pad 40 from top, width 740)
    if (px > TUNING.GAME_WIDTH - TUNING.MUSIC_UI_PAD_RIGHT - TUNING.MUSIC_UI_WIDTH - 40 && py < 200) return true;
    return false;
  }



  /** Show/hide kill zone, sweet spot line, and bonus zone visuals */
  private setRhythmZonesVisible(visible: boolean): void {
    this.killZoneRect.setVisible(visible);
    this.killZoneEdge.setVisible(visible);
    this.sweetSpotLine.setVisible(visible);
    this.bonusZoneRect.setVisible(visible);
    // Start/stop the kill zone pulse tween
    const pulseTween = this.tweens.getTweensOf(this.killZoneRect)[0];
    if (pulseTween) {
      if (visible) pulseTween.resume();
      else pulseTween.pause();
    }
  }

  /** Spawn the big green "2X" popup at screen center */
  private spawn2XPopup(): void {
    this.bonus2xPopup.setPosition(TUNING.RHYTHM_SWEET_SPOT_X, TUNING.GAME_HEIGHT / 2);
    this.bonus2xPopup.setAlpha(1).setScale(0.5).setVisible(true);
    this.tweens.killTweensOf(this.bonus2xPopup);
    this.tweens.add({
      targets: this.bonus2xPopup,
      scaleX: 2.0,
      scaleY: 2.0,
      alpha: 0,
      duration: TUNING.RHYTHM_BONUS_POPUP_DURATION,
      ease: 'Cubic.easeOut',
      onComplete: () => this.bonus2xPopup.setVisible(false),
    });
  }

  /** Green screen flash on 2X bonus collection */
  private trigger2XFlash(): void {
    this.bonusFlashOverlay.setAlpha(TUNING.RHYTHM_BONUS_FLASH_ALPHA);
    this.tweens.killTweensOf(this.bonusFlashOverlay);
    this.tweens.add({
      targets: this.bonusFlashOverlay,
      alpha: 0,
      duration: TUNING.RHYTHM_BONUS_FLASH_DURATION,
      ease: 'Power2',
    });
  }

  private enterSongSelect(): void {
    this.state = GameState.SONG_SELECT;
    this.titleContainer.setVisible(false);
    this.songSelectScreen.show();
  }

  private updateSongSelect(dt: number): void {
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.3;
    this.parallaxSystem.update(titleSpeed, dt);
    this.skyGlowSystem.update(dt, this.musicPlayer.getPlaybackPosition().current);
    this.roadSystem.update(titleSpeed, dt);
    this.songSelectScreen.update(dt);
  }

  private updateStarting(dt: number): void {
    // Keep background scrolling during countdown
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.skyGlowSystem.update(dt, this.musicPlayer.getPlaybackPosition().current);
    this.roadSystem.update(titleSpeed, dt);

    // Drain inputs so nothing queues up during countdown
    this.inputSystem.getSpeedTap();
    this.inputSystem.getAttackPressed();
    this.inputSystem.getRocketPressed();

    // Skip countdown on any click or key press — jump to pre-start cutscene (unskippable)
    if (this.anyInputPressed && this.countdownPhase !== 'done') {
      this.anyInputPressed = false;
      this.countdownPhase = 'done';
      this.countdownSprite.setVisible(false);
      this.tweens.killTweensOf(this.blackOverlay);
      if (this.cursorMain) this.tweens.killTweensOf(this.cursorMain);
      if (this.cursorStroke) this.tweens.killTweensOf(this.cursorStroke);
      this.cursorMain?.setAlpha(0);
      if (this.cursorStroke) this.cursorStroke.setAlpha(0);
      this._titleAnimStop();
      this.titleLoopSprite.setVisible(false);

      this.musicPlayer.skipCountdownAudio(); // Stop Phaser countdown audio (desktop)
      this.musicPlayer.revealForGameplay();
      this.playerSystem.reset();
      // Play pre-start cutscene over the black overlay — unskippable
      this.introTutPlaying = true;
      this.preStartSprite!.setVisible(true).setAlpha(1);
      this.preStartSprite!.play('pre-start-cutscene');
      // Start shuffle music now — countdown audio plays on top, finishes naturally
      if (GAME_MODE.isPhoneMode) this.musicPlayer.startPlaylistNow();
      this.preStartSprite!.once('animationcomplete', () => {
        this.introTutPlaying = false;
        this.startGame();
        this.spawnGraceTimer = TUNING.COUNTDOWN_SPAWN_DELAY;
        this.tweens.add({
          targets: this.preStartSprite!,
          alpha: 0,
          duration: 1000,
          onComplete: () => { this.preStartSprite?.setVisible(false); },
        });
      });
      // Fade black overlay out during the cutscene
      this.blackOverlay.setAlpha(1).setVisible(true);
      this.tweens.add({ targets: this.blackOverlay, alpha: 0, duration: 1000 });
      return;
    }

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
      }
    } else if (this.countdownPhase === 'delay') {
      const wait = this.countdownIndex < 0
        ? TUNING.COUNTDOWN_INITIAL_DELAY
        : TUNING.COUNTDOWN_DELAY;
      if (this.countdownPhaseTimer >= wait) {
        const nextIndex = this.countdownIndex + 1;
        if (nextIndex === TUNING.COUNTDOWN_FRAMES - 2) {
          // "2" appears — show it AND start the pre-start cutscene simultaneously.
          // "2" animates at depth 250 (on top), cutscene plays at 248 behind it.
          this.countdownIndex = nextIndex;
          this.countdownPhaseTimer = 0;
          this.countdownPhase = 'animate'; // Let "2" animate normally (fades out over 0.8s)
          this.countdownSprite.setFrame(this.countdownIndex);
          this.countdownSprite.setScale(0.5);
          this.countdownSprite.setAlpha(1);
          this.countdownSprite.setVisible(true);

          // Start cutscene + block input
          this.introTutPlaying = true;
          this.preStartSprite!.setVisible(true).setAlpha(1);
          this.preStartSprite!.play('pre-start-cutscene');
          // Start shuffle music now — countdown audio plays on top, finishes naturally
          if (GAME_MODE.isPhoneMode) this.musicPlayer.startPlaylistNow();
          this.preStartSprite!.once('animationcomplete', () => {
            this.introTutPlaying = false;
            this.countdownPhase = 'done';
            this.startGame();
            this.spawnGraceTimer = TUNING.COUNTDOWN_SPAWN_DELAY;
            this.tweens.add({
              targets: this.preStartSprite!,
              alpha: 0,
              duration: 1000,
              onComplete: () => { this.preStartSprite?.setVisible(false); },
            });
          });

          // Fade black overlay + cursor out, reveal music UI
          this.musicPlayer.revealForGameplay();
          this._titleAnimStop();
          this.titleLoopSprite.setVisible(false);

          this.playerSystem.reset();
          const fadeDur = TUNING.COUNTDOWN_DELAY * 1000;
          this.tweens.add({ targets: this.blackOverlay, alpha: 0, duration: fadeDur });
          this.tweens.add({ targets: this.cursorMain, alpha: 0, duration: fadeDur });
          if (this.cursorStroke) {
            this.tweens.add({ targets: this.cursorStroke, alpha: 0, duration: fadeDur });
          }
        } else if (nextIndex >= TUNING.COUNTDOWN_FRAMES - 1) {
          // Past "2" — cutscene is playing, just wait
          this.countdownPhase = 'cutscene';
          this.countdownPhaseTimer = 0;
          this.countdownSprite.setVisible(false);
        } else {
          // Show next number (5, 4, 3)
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

    // Reset widescreen curtains back to covering the sides
    if (this.curtainLeft && this.curtainRight) {
      const cOff = GAME_MODE.contentOffsetX;
      this.tweens.killTweensOf(this.curtainLeft);
      this.tweens.killTweensOf(this.curtainRight);
      this.curtainLeft.x = cOff / 2;
      this.curtainRight.x = GAME_MODE.canvasWidth - cOff / 2;
    }
    // Hide mobile accelerate button
    this.inputSystem.setPrimaryButtonVisible(false);

    this.debugPreStartOverlay.setVisible(false);
    this.reflectionSystem.setVisible(false);
    this.musicPlayer.resetForTitle();
    this.stopCountdownAudio(); // Clean up HTML5 Audio if still playing
    this.countdownAudioEl = null; // Force re-prime on next tutorial

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
    this.cursorMain?.setVisible(true).setAlpha(1);
    this.cursorStroke?.setVisible(true).setAlpha(1);

    // Hide mobile touch cursor (green triangle) during title
    this.inputSystem.setCursorVisible(false);

    // Clean up any active game state
    this.countdownPhase = 'done';
    this.dyingPhase = 'done';
    this.deathWhiteOverlay.setVisible(false);
    this.countdownSprite.setVisible(false);
    this.blackOverlay.setVisible(false);
    this.preStartSprite?.setVisible(false);
    this.preStartSprite?.stop();
    this.introTutSprite?.setVisible(false);
    this.introTutSprite?.stop();
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
    this.cameras.main.setZoom(GAME_MODE.renderScale);
    this.cameras.main.setScroll(-GAME_MODE.contentOffsetX, 0);
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

    // Reset auto-submit and global leaderboard state
    this.autoSubmitted = false;
    this.globalLeaderboardData = null;
    this.lastSubmittedRunId = null;
    this.deathBestText.setVisible(false);

    // Clean up rhythm mode / song select
    this.courseRunner = null;
    this.obstacleSystem.setTimerPaused(false);
    this.songSelectScreen.hide();
    this.setRhythmZonesVisible(false);

    // Restore road/parallax and show title screen
    this.roadSystem.setVisible(true);
    this.parallaxSystem.setVisible(true);
    this.skyGlowSystem.setVisible(true);
    this.titleLoopSprite.setVisible(true);
    if (this.titleAnimEnabled) this._titleAnimPlay('loop');
    this.titleContainer.setVisible(true);

    // Show music player in compact mode on title (revert gameplay shift)
    this.musicPlayer.setContainerOpacity(1);
    this.musicPlayer.setVisible(true);
    this.musicPlayer.setCompact(true);
    this.musicPlayer.setGameplayMode(false);

    this.profileHud.showProfileMode(this.profilePopup.getName(), this.getProfileRankText());
    this.profileHud.setAlpha(1);
    this.profileHud.setVisible(true);
  }

  /** Handle a screen tap/click for UI navigation (title, tutorial, countdown). */
  private handleScreenTap(): void {
    if (this.profilePopup?.isOpen()) return;
    const biosOverlay = document.getElementById('boot-overlay');
    if (biosOverlay && !biosOverlay.classList.contains('hidden')) return;
    if ((window as any).__swipeLock) return;
    // Block all input during unskippable cutscenes (intro-to-tutorial, pre-start)
    if (this.introTutPlaying) return;
    if (this.state === GameState.TUTORIAL || this.state === GameState.TITLE || this.state === GameState.STARTING) {
      this.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      // Eagerly resume AudioContext in user gesture — iOS Safari suspends it when no
      // WebAudio sources are active (title music uses HTML5 Audio, not WebAudio).
      // Without this, countdown-music.play() fires into a suspended context and is silent.
      const ctx = (this.sound as any).context as AudioContext | undefined;
      if (ctx?.state === 'suspended') ctx.resume();
    }
    if (this.state === GameState.TUTORIAL) {
      this.primeCountdownAudio(); // Bless HTML5 Audio in gesture context for iOS
      this.tutorialAdvance = true;
    } else if (this.state === GameState.TITLE) {
      this.anyInputPressed = true;
    } else if (this.state === GameState.STARTING) {
      this.anyInputPressed = true;
    }
  }

  private tryAutoplayMusic(): void {
    this.musicPlayer.startTitleMusic();
    this.musicPlayer.setVisible(true);
    this.musicPlayer.setCompact(true);
    this.musicPlayer.setGameplayMode(false);
    this.profileHud.showProfileMode(this.profilePopup.getName(), this.getProfileRankText());
    this.profileHud.setVisible(true);
  }

  private enterTutorial(): void {
    // Test mode: skip tutorial entirely (TITLE → STARTING)
    if (TEST_MODE.active && TEST_MODE.skipTutorial) {
      this.titleContainer.setVisible(false);
      this._titleAnimStop();
      this.titleLoopSprite.setVisible(false);

      this.enterStarting();
      return;
    }
    this.state = GameState.TUTORIAL;
    this.titleContainer.setVisible(false);

    // Switch from loop to play-once start animation (fire-and-forget visual underneath)
    if (this.titleAnimEnabled) {
      this._titleAnimPlay('play');
      this._titleAnimOnceComplete(() => {
        this._titleAnimStop();
        this.titleLoopSprite.setVisible(false);

      });
    } else {
      // No title-start animation loaded — just hide immediately
      this.titleLoopSprite.setVisible(false);

    }

    // Play intro-to-tutorial cutscene over everything (all platforms, unskippable)
    this.introTutPlaying = true;
    this.introTutSprite!.setVisible(true).setAlpha(1);
    this.introTutSprite!.play('intro-tut-cutscene');
    this.introTutSprite!.once('animationcomplete', () => {
      // Cutscene finished — fade it out to reveal the tutorial underneath
      this.tweens.add({
        targets: this.introTutSprite!,
        alpha: 0,
        duration: 1000,
        onComplete: () => {
          this.introTutSprite?.setVisible(false);
          this.introTutPlaying = false;
        },
      });
      // Cutscene fades out to reveal controls directly — skip black_reveal
      this.tutorialPhase = 'controls_wait';
      this.tutorialTimer = 0;
      this.tutorialAdvance = false;
      this.tutorialSkipBtn.setVisible(true).setAlpha(SKIP_BTN_PULSE_MAX).setScale(SKIP_BTN_SCALE).setTintFill(0xffffff).setInteractive({ useHandCursor: true });
      (this.tutorialSkipBtn.getData('startPulse') as () => void)();
    });

    // Prepare tutorial layers underneath the cutscene (hidden by black overlay)
    this.tutorialBlank.setVisible(true);
    this.tutorialControlsSprite.setVisible(true).setAlpha(1);
    if (!GAME_MODE.mobileMode) this.tutorialControlsSprite.play('tutorial-controls');
    this.tutorialObstaclesImage.setVisible(false).setAlpha(0);
    this.tutorialRageSprite.setVisible(false).setAlpha(0);

    // Black overlay starts hidden — will be shown when cutscene finishes
    this.blackOverlay.setVisible(false);

    // Start in 'done' — cutscene animationcomplete callback kicks off controls_wait
    this.tutorialPhase = 'done';
    this.tutorialTimer = 0;
    this.tutorialAdvance = false;
  }

  private updateTutorial(dt: number): void {
    // Keep background scrolling during tutorial
    const titleSpeed = TUNING.ROAD_BASE_SPEED * 0.5;
    this.parallaxSystem.update(titleSpeed, dt);
    this.skyGlowSystem.update(dt, this.musicPlayer.getPlaybackPosition().current);
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
          if (!GAME_MODE.mobileMode) this.tutorialRageSprite.play('tutorial-rage');
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
    // Show mobile cursor (green triangle) — gameplay is about to begin
    this.inputSystem.setCursorVisible(true);
    // Ensure black overlay is fully visible behind countdown numbers
    this.blackOverlay.setVisible(true).setAlpha(1);
    this.titleContainer.setVisible(false);
    this._titleAnimStop();
    this.titleLoopSprite.setVisible(false);

    // Fade cursor away during countdown (returns on resetToTitle)
    if (this.cursorMain) {
      this.tweens.killTweensOf(this.cursorMain);
      this.tweens.add({ targets: this.cursorMain, alpha: 0, duration: 400 });
    }
    if (this.cursorStroke) {
      this.tweens.killTweensOf(this.cursorStroke);
      this.tweens.add({ targets: this.cursorStroke, alpha: 0, duration: 400 });
    }
    if (this.htmlCursor) this.htmlCursor.style.display = 'none';

    // Fade out profile HUD + music player during countdown
    this.tweens.add({
      targets: this.profileHud.getContainer(),
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
    });
    this.musicPlayer.fadeContainerOpacity(0, 1500);
    this.time.delayedCall(1500, () => { this.musicPlayer.setVisible(false); });

    // Start countdown (5→2, then fade black to reveal game) — begin with initial delay
    this.countdownIndex = -1;
    this.countdownPhaseTimer = 0;
    this.countdownPhase = 'delay';
    this.countdownSprite.setVisible(false);

    // Mobile: play countdown audio via primed HTML5 Audio (Phaser WebAudio is unreliable on iOS).
    // The element was "blessed" by a user gesture during tutorial taps (see primeCountdownAudio).
    if (GAME_MODE.isPhoneMode && this.countdownAudioEl) {
      this.countdownAudioEl.currentTime = 0;
      this.countdownAudioEl.volume = TUNING.MUSIC_VOL_COUNTDOWN;
      this.countdownAudioEl.play().catch(() => {});
      console.log('[GameScene] countdown HTML5 Audio started');
    }

    // Test mode: fast countdown — inject tap on next frame to skip
    if (TEST_MODE.active && TEST_MODE.fastCountdown) {
      this.time.delayedCall(100, () => {
        this.anyInputPressed = true;
      });
    }
  }

  /** Prime an HTML5 Audio element for countdown music. MUST be called from a user gesture.
   *  iOS Safari requires the first .play() to happen inside a gesture handler. */
  private primeCountdownAudio(): void {
    if (this.countdownAudioEl || !GAME_MODE.isPhoneMode) return;
    const a = new Audio('assets/audio/music/hell_girl_countdown.mp3');
    a.loop = false; // Play once, never restart
    a.volume = 0;
    a.play().then(() => {
      a.pause(); // Blessed — can be .play()'d from non-gesture code now
      console.log('[GameScene] countdown audio primed');
    }).catch(() => {});
    this.countdownAudioEl = a;
  }

  /** Stop the HTML5 countdown audio (mobile). */
  private stopCountdownAudio(): void {
    if (this.countdownAudioEl) {
      this.countdownAudioEl.pause();
      this.countdownAudioEl.currentTime = 0;
    }
  }

  private setCrosshairMode(enabled: boolean): void {
    this.crosshairActive = enabled;
    this.crosshairHiddenByWMP = false;
    if (this.crosshair) this.tweens.killTweensOf(this.crosshair);
    if (enabled) {
      // Mobile: no cursors at all on touch devices
      if (GAME_MODE.mobileMode) {
        this.crosshair?.setVisible(false).setAlpha(0);
        this.cursorMain?.setVisible(false);
        if (this.cursorStroke) this.cursorStroke.setVisible(false);
        if (this.htmlCursor) this.htmlCursor.style.display = 'none';
      } else {
        this.crosshair?.setVisible(true).setAlpha(0);
        if (this.crosshair) this.tweens.add({ targets: this.crosshair, alpha: 1, duration: 1500 });
        this.cursorMain?.setVisible(false);
        if (this.cursorStroke) this.cursorStroke.setVisible(false);
      }
    } else {
      this.crosshair?.setVisible(false).setAlpha(0);
      // Desktop: restore pointer cursor
      if (!GAME_MODE.mobileMode) {
        this.cursorMain?.setVisible(true);
        if (this.cursorStroke) this.cursorStroke.setVisible(true);
      }
    }
  }

  /** Returns true on first press, then repeats after an initial delay when held. */
  // ─── Text Inspector helpers ────────────────────────────────
  private _tiCollect(): void {
    this._tiItems = [];
    // 1. All Phaser Text objects in the scene
    for (const obj of this.children.list) {
      if (obj instanceof Phaser.GameObjects.Text && obj !== this._tiLabel) {
        const t = obj.text.length > 40 ? obj.text.slice(0, 40) + '…' : obj.text;
        this._tiItems.push({
          id: `Phaser | "${t}" | d=${obj.depth} (${Math.round(obj.x)},${Math.round(obj.y)}) vis=${obj.visible} alpha=${obj.alpha}`,
          obj,
        });
      }
    }
    // 2. All HTML elements with direct text content
    const walk = (el: HTMLElement) => {
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3 && n.textContent && n.textContent.trim()) {
          const txt = n.textContent.trim();
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
          this._tiItems.push({
            id: `HTML <${tag}${id}${cls}> | "${txt.slice(0, 40)}" | color=${cs.color} display=${cs.display} rect=(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)})`,
            obj: el,
          });
        }
      }
      for (let i = 0; i < el.children.length; i++) {
        walk(el.children[i] as HTMLElement);
      }
    };
    walk(document.body);
  }

  private _tiShow(): void {
    if (this._tiItems.length === 0) { this._tiLabel.setText('No text items found'); this._tiLabel.setVisible(true); return; }
    const item = this._tiItems[this._tiIdx];
    if (item.obj instanceof Phaser.GameObjects.Text) {
      item.obj.setTint(0xff0000);
      item.obj.setVisible(true);
    } else if (item.obj instanceof HTMLElement) {
      item.obj.style.outline = '4px solid red';
      item.obj.style.outlineOffset = '-2px';
      this._tiOutlinedEl = item.obj;
    }
    this._tiLabel.setText(`[${this._tiIdx + 1}/${this._tiItems.length}] ${item.id}\n(← → cycle | ENTER copy | N exit)`);
    this._tiLabel.setVisible(true);
  }

  private _tiClear(): void {
    if (this._tiItems.length === 0) return;
    const item = this._tiItems[this._tiIdx];
    if (item.obj instanceof Phaser.GameObjects.Text) {
      item.obj.clearTint();
    }
    if (this._tiOutlinedEl) {
      this._tiOutlinedEl.style.outline = '';
      this._tiOutlinedEl.style.outlineOffset = '';
      this._tiOutlinedEl = null;
    }
  }

  // ─── Click Inspector helpers ───────────────────────────────
  private _ciOnClick(e: MouseEvent): void {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    const cx = e.clientX, cy = e.clientY;
    this._ciClearHighlight();
    this._ciHits = [];
    this._ciIdx = 0;

    const canvas = this.game.canvas;
    const cr = canvas.getBoundingClientRect();
    const gx = ((cx - cr.left) / cr.width) * GAME_MODE.canvasWidth;
    const gy = ((cy - cr.top) / cr.height) * TUNING.GAME_HEIGHT;

    // Collect ALL Phaser Text objects at click point
    for (const obj of this.children.list) {
      if (!(obj instanceof Phaser.GameObjects.Text)) continue;
      if (obj === this._tiLabel || obj === this._ciLabel) continue;
      const b = obj.getBounds();
      if (gx >= b.x && gx <= b.x + b.width && gy >= b.y && gy <= b.y + b.height) {
        const t = obj.text.length > 60 ? obj.text.slice(0, 60) + '…' : obj.text;
        this._ciHits.push({
          id: `Phaser.Text d=${obj.depth} "${t}" @(${Math.round(obj.x)},${Math.round(obj.y)}) vis=${obj.visible} a=${obj.alpha}`,
          phaser: obj,
        });
      }
    }

    // Collect ALL HTML elements at click point
    const htmlEls = document.elementsFromPoint(cx, cy) as HTMLElement[];
    for (const el of htmlEls) {
      if (el === document.body || el === document.documentElement || el.tagName === 'CANVAS') continue;
      let directText = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 3 && n.textContent?.trim()) directText += n.textContent.trim();
      }
      const tag = el.tagName.toLowerCase();
      const elId = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const txt = directText ? `"${directText.slice(0, 60)}"` : '(no text)';
      this._ciHits.push({
        id: `HTML <${tag}${elId}${cls}> ${txt} color=${cs.color} display=${cs.display} rect=(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)})`,
        html: el,
      });
    }

    if (this._ciHits.length === 0) {
      this._ciLabel.setText('nothing at click point');
    } else {
      this._ciShowHit();
    }
  }

  private _ciShowHit(): void {
    this._ciClearHighlight();
    const hit = this._ciHits[this._ciIdx];
    if (!hit) return;
    if (hit.phaser) {
      const b = hit.phaser.getBounds();
      this._ciGfx.lineStyle(3, 0x00ff00, 1);
      this._ciGfx.strokeRect(b.x, b.y, b.width, b.height);
    } else if (hit.html) {
      hit.html.style.outline = '3px solid #00ff00';
      hit.html.style.outlineOffset = '-1px';
      this._ciOutlinedEl = hit.html;
    }
    this._ciClipboard = hit.id;
    this._ciLabel.setText(`[${this._ciIdx + 1}/${this._ciHits.length}] ${hit.id}`);
  }

  private _ciClearHighlight(): void {
    this._ciGfx.clear();
    if (this._ciOutlinedEl) {
      this._ciOutlinedEl.style.outline = '';
      this._ciOutlinedEl.style.outlineOffset = '';
      this._ciOutlinedEl = null;
    }
  }

  private _ciCleanup(): void {
    this._ciClearHighlight();
    this._ciGfx.setVisible(false);
    this._ciLabel.setVisible(false);
    this._ciClipboard = '';
    this._ciHits = [];
    if (this._ciClickHandler) {
      document.removeEventListener('mousedown', this._ciClickHandler, true);
      this._ciClickHandler = null;
    }
  }

  private debugKeyHeld(key: Phaser.Input.Keyboard.Key, dt: number, id: string): boolean {
    if (!key.isDown) {
      delete this.debugRepeatTimers[id];
      return false;
    }
    if (!(id in this.debugRepeatTimers)) {
      // First frame pressed — fire immediately, schedule next after initial delay
      this.debugRepeatTimers[id] = 0.35;
      return true;
    }
    this.debugRepeatTimers[id] -= dt;
    if (this.debugRepeatTimers[id] <= 0) {
      this.debugRepeatTimers[id] += 0.05; // repeat every 50ms
      return true;
    }
    return false;
  }

  /** Apply a single sprite offset param to its game object (for real-time debug adjustment). */
  private applySpriteOffset(param: string, val: number): void {
    switch (param) {
      case 'SPRITE_OFFSET_PLAYER':
        this.playerSystem.getSprite().x = TUNING.PLAYER_START_X + val;
        break;
      case 'SPRITE_OFFSET_ROAD':
        this.roadSystem.resetScroll(val);
        break;
      case 'SPRITE_OFFSET_RAILING':
        this.parallaxSystem.setLayerOffset(0, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_2':
        this.parallaxSystem.setLayerOffset(1, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_3':
        this.parallaxSystem.setLayerOffset(2, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_4':
        this.parallaxSystem.setLayerOffset(3, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_5':
        this.parallaxSystem.setLayerOffset(4, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_6':
        this.parallaxSystem.setLayerOffset(5, val);
        break;
      case 'SPRITE_OFFSET_PARALLAX_7':
        this.parallaxSystem.setLayerOffset(6, val);
        break;
      case 'SPRITE_OFFSET_SKY':
        this.parallaxSystem.setSkyOffsetX(val);
        break;
      case 'SPRITE_OFFSET_HOLD_TEXT':
        this.startHoldText.x = GAME_MODE.canvasWidth / 2 + val;
        break;
      case 'SPRITE_OFFSET_HUD_LABEL':
        this.hudLabel.x = GAME_MODE.canvasWidth / 2 + val;
        break;
      case 'SPRITE_OFFSET_HUD_SCORE':
        this.hudHighScore.x = GAME_MODE.canvasWidth / 2 + val;
        break;
      case 'SPRITE_OFFSET_PROFILE_HUD':
        this.profileHud.setPosition(40 + val, 40);
        break;
    }
  }

  private startGame(): void {
    this.state = GameState.PLAYING;
    this.setCrosshairMode(true);
    this.musicPlayer.setCompact(false);
    this.musicPlayer.setGameplayMode(true);
    this.timeDilation = new TimeDilationSystem();
    this.wasDilating = false;
    this.elapsed = 0;
    // Reset test metrics for new run
    this.testCollisions = 0;
    this.testPickups = 0;
    this.testRocketsFired = 0;
    this.testObstaclesDestroyed = 0;
    this.spawnGraceTimer = 0;
    this.blackOverlay.setVisible(false);
    this.deathWhiteOverlay.setVisible(false);

    // Start gameplay UI at alpha 0 — fades in when curtains start sliding
    this.actionBtnTop.setVisible(true).setAlpha(0);
    this.actionBtnBottom.setVisible(true).setAlpha(0);
    this.sliderBar.setVisible(true).setAlpha(0);
    this.sliderKnob.setVisible(true).setAlpha(0);
    this.musicPlayer.setContainerOpacity(0);
    this.musicPlayer.setVisible(true);

    // Slide widescreen curtains off-screen to reveal the full gameplay canvas.
    // Delay 1100ms so the preStartSprite fade (1000ms) completes first —
    // otherwise the 1920px-wide fading sprite creates a vignette-like seam
    // as the curtains reveal the wider canvas behind it.
    const uiFadeIn = () => {
      const uiTargets = [this.actionBtnTop, this.actionBtnBottom, this.sliderBar, this.sliderKnob, this.hudLabel, this.hudHighScore];
      this.tweens.add({ targets: uiTargets, alpha: 1, duration: 2000, ease: 'Power2' });
      this.musicPlayer.fadeContainerOpacity(1, 2000);
    };
    if (this.curtainLeft && this.curtainRight) {
      const cOff = GAME_MODE.contentOffsetX;
      this.time.delayedCall(1100, () => {
        uiFadeIn();
        if (this.curtainLeft && this.curtainRight) {
          this.tweens.add({
            targets: this.curtainLeft,
            x: -cOff / 2,
            duration: 2000,
            ease: 'Cubic.Out',
          });
          this.tweens.add({
            targets: this.curtainRight,
            x: GAME_MODE.canvasWidth + cOff / 2,
            duration: 2000,
            ease: 'Cubic.Out',
            onComplete: () => {
              // Curtains fully off-screen — fade in the accelerate button
              if (GAME_MODE.mobileMode) {
                this.inputSystem.fadeInPrimaryButton(TUNING.MOBILE_BTN_FADE_IN);
              }
            },
          });
        }
      });
    } else if (GAME_MODE.mobileMode) {
      // No curtains (canvas = 1920) — fade in button after same delay
      this.time.delayedCall(1100, () => { uiFadeIn(); });
      this.time.delayedCall(1100 + 2000, () => {
        this.inputSystem.fadeInPrimaryButton(TUNING.MOBILE_BTN_FADE_IN);
      });
    } else {
      // Desktop, no curtains — fade in at same 1100ms delay
      this.time.delayedCall(1100, () => { uiFadeIn(); });
    }
    this.dyingPhase = 'done';
    this.roadSystem.setVisible(true);
    this.roadSystem.resetScroll(TUNING.SPRITE_OFFSET_ROAD);
    this.parallaxSystem.setVisible(true);
    this.skyGlowSystem.setVisible(true);
    this.parallaxSystem.resetScroll([
      TUNING.SPRITE_OFFSET_RAILING,
      TUNING.SPRITE_OFFSET_PARALLAX_2,
      TUNING.SPRITE_OFFSET_PARALLAX_3,
      TUNING.SPRITE_OFFSET_PARALLAX_4,
      TUNING.SPRITE_OFFSET_PARALLAX_5,
      TUNING.SPRITE_OFFSET_PARALLAX_6,
      TUNING.SPRITE_OFFSET_PARALLAX_7,
    ]);
    this.parallaxSystem.setSkyOffsetX(TUNING.SPRITE_OFFSET_SKY);
    this.reflectionSystem.setVisible(true);
    this.playerSystem.reset();
    if (this.spectatorMode) this.playerSystem.setSpectator(true);
    this.playerSystem.setVisible(true);
    this.obstacleSystem.reset(this.weekSeed);

    // Rhythm mode: use CourseRunner for obstacle spawning instead of timer
    if (this.rhythmMode && this.courseData) {
      const rhythmRoadSpeed = TUNING.ROAD_BASE_SPEED;
      this.courseRunner = new CourseRunner(
        this.courseData,
        (event) => {
          this.obstacleSystem.spawnFromCourse(event.type, event.lane, rhythmRoadSpeed);
        },
        rhythmRoadSpeed,
        TUNING.RHYTHM_KILL_ZONE_X,
        TUNING.OBSTACLE_SPAWN_MARGIN,
      );
      this.courseRunner.start();
      this.obstacleSystem.setTimerPaused(true);
      console.log('[RHYTHM] CourseRunner started —', this.courseData.events.length, 'events');
    } else {
      this.courseRunner = null;
      this.obstacleSystem.setTimerPaused(false);
    }

    this.difficultySystem.reset();
    this.scoreSystem.reset();
    this.fxSystem.reset();
    this.titleContainer.setVisible(false);
    this._titleAnimStop();
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
    this.hudLabel.setVisible(true).setAlpha(0);
    this.hudLabel.x = GAME_MODE.canvasWidth / 2 + TUNING.SPRITE_OFFSET_HUD_LABEL;
    this.hudHighScore.setVisible(true).setAlpha(0);
    this.hudHighScore.x = GAME_MODE.canvasWidth / 2 + TUNING.SPRITE_OFFSET_HUD_SCORE;
    this.profileHud.setVisible(true);
    this.profileHud.setPosition(40 + TUNING.SPRITE_OFFSET_PROFILE_HUD, 40);
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
    this.cameras.main.setZoom(GAME_MODE.renderScale);
    this.cameras.main.setScroll(-GAME_MODE.contentOffsetX, 0);
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
      this.startHoldText.x = GAME_MODE.canvasWidth / 2 + TUNING.SPRITE_OFFSET_HOLD_TEXT;
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
        // Rectangle hitbox
        const halfW = (w * TUNING.CAR_COLLISION_W) / 2;
        const halfH = (h * TUNING.CAR_COLLISION_H) / 2;
        const cx = obs.x + TUNING.CAR_COLLISION_OFFSET_X;
        const cy = obs.y + TUNING.CAR_COLLISION_OFFSET_Y;
        g.lineStyle(2, 0xffffff, 1);
        g.fillStyle(0xffffff, ALPHA);
        g.fillRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
        g.strokeRect(cx - halfW, cy - halfH, halfW * 2, halfH * 2);
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
    // Pause gameplay while profile popup is open
    if (this.profilePopup.isOpen()) {
      this.inputSystem.getAttackPressed();
      this.inputSystem.getRocketPressed();
      this.inputSystem.getSpeedTap();
      return;
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
      this.skyGlowSystem.update(dt, this.musicPlayer.getPlaybackPosition().current);
      this.reflectionSystem.update(0, dt);
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

    // ── Time dilation: scale dt for slow-mo ──
    this.timeDilation.update(dt);
    const timeScale = this.timeDilation.getScale();
    const hDt = dt * timeScale;
    const vDt = dt * this.timeDilation.getVerticalScale();

    if (this.timeDilation.isActive()) {
      this.musicPlayer.setPlaybackRate(this.timeDilation.getMusicRate());
      this.playerSystem.setAnimTimeScale(timeScale);
      if (this.slashSprite.anims.isPlaying) this.slashSprite.anims.timeScale = timeScale;
      this.wasDilating = true;
    } else if (this.wasDilating) {
      this.musicPlayer.setPlaybackRate(1);
      this.playerSystem.setAnimTimeScale(1);
      this.wasDilating = false;
    }

    this.elapsed += hDt;
    let baseRoadSpeed: number;
    if (this.rhythmMode) {
      baseRoadSpeed = TUNING.ROAD_BASE_SPEED; // fixed speed for beat-sync timing
    } else {
      baseRoadSpeed = TUNING.ROAD_BASE_SPEED + this.elapsed * TUNING.ROAD_SPEED_RAMP + this.roadSpeedBonus;
    }
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
    // In rhythm mode, skip rage speed boost to keep beat-sync timing deterministic
    const rageSpeedFactor = this.rhythmMode ? 1 : 1 + (TUNING.RAGE_SPEED_MULTIPLIER - 1) * rageFactor;
    const roadSpeed = baseRoadSpeed * rageSpeedFactor;

    // Spawn grace — no obstacles until timer expires (countdown intro period)
    if (this.spawnGraceTimer > 0) {
      this.spawnGraceTimer -= hDt;
    }

    this.difficultySystem.update(hDt);
    this.playerSystem.setInvincible(this.rageTimer > 0 || this.rageZoomProgress > 0);
    this.playerSystem.update(hDt, roadSpeed, baseRoadSpeed, vDt);

    // Remap green cursor Y → slider knob Y
    if (this.sliderKnob.visible) {
      const cursorY = this.inputSystem.getTargetY();
      const t = (cursorY - TUNING.ROAD_TOP_Y) / (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y);
      this.sliderKnob.setY(TUNING.SLIDER_KNOB_Y_MIN + t * (TUNING.SLIDER_KNOB_Y_MAX - TUNING.SLIDER_KNOB_Y_MIN));
    }

    this.scoreSystem.update(hDt, this.playerSystem.getPlayerSpeed());
    if (this.spawnGraceTimer <= 0) {
      this.obstacleSystem.update(hDt, roadSpeed, this.difficultySystem.getFactor(), rageFactor);
      // Rhythm mode: feed playback position to CourseRunner for beat-synced spawning
      if (this.courseRunner) {
        const playbackSec = this.musicPlayer.getPlaybackPosition().current;
        this.courseRunner.update(playbackSec);
      }
    }

    // Rhythm mode: destroy obstacles at kill zone (left edge) for beat-synced explosions
    if (this.rhythmMode) {
      const kzHits = this.obstacleSystem.checkKillZone(TUNING.RHYTHM_KILL_ZONE_X);
      for (let i = 0; i < kzHits.length; i++) {
        this.cameras.main.shake(80, 0.003); // subtle beat-sync shake
      }
    }

    this.updateLaneWarnings(roadSpeed);

    // Katana slash (checked BEFORE player collision so destroyed obstacles can't kill)
    this.slashCooldownTimer = Math.max(0, this.slashCooldownTimer - hDt);
    this.slashInvincibilityTimer = Math.max(0, this.slashInvincibilityTimer - hDt);

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
        this.testObstaclesDestroyed++;
        this.slashInvincibilityTimer = TUNING.KATANA_INVINCIBILITY;
        this.audioSystem.playObstacleKill();
        this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION, TUNING.SHAKE_DEATH_INTENSITY * 0.25);
        // this.timeDilation.trigger(); // disabled — kept for potential reuse

        // Distance-based bonus: left edge of slash = 100pts, right edge = min pts
        const slashLeft = this.playerSystem.getX() + slashOffset - slashWidth / 2;
        const dist = Math.max(0, hitX - slashLeft);
        const t = Math.min(dist / slashWidth, 1); // 0 = left edge, 1 = right edge
        const bonus = Math.round(TUNING.KATANA_KILL_POINTS_MAX - t * t * (TUNING.KATANA_KILL_POINTS_MAX - TUNING.KATANA_KILL_POINTS_MIN));
        this.awardBonus(bonus, 'katana');

        // Rhythm mode guardian: extra proximity-to-center scoring
        if (this.rhythmMode && this.obstacleSystem.wasLastSlashGuardian()) {
          const centerDist = Math.abs(hitX - TUNING.RHYTHM_SWEET_SPOT_X);
          const zoneHalf = TUNING.RHYTHM_GUARDIAN_ZONE_HALF;
          if (centerDist <= zoneHalf) {
            // Scale from base (at edge) to max (at center)
            const proximity = 1 - centerDist / zoneHalf; // 0 = edge, 1 = dead center
            const guardianBonus = Math.round(
              TUNING.RHYTHM_GUARDIAN_BASE_SCORE +
              proximity * (TUNING.RHYTHM_GUARDIAN_MAX_SCORE - TUNING.RHYTHM_GUARDIAN_BASE_SCORE)
            );
            this.awardBonus(guardianBonus, 'katana');
          } else {
            // Outside the zone — still get base points
            this.awardBonus(TUNING.RHYTHM_GUARDIAN_BASE_SCORE, 'default');
          }
        }

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
      this.slashSprite.setAngle(TUNING.SLASH_VFX_ANGLE);
      this.slashSprite.setVisible(true);
      this.slashSprite.setDepth(this.playerSystem.getY() - 0.3);
      this.slashSprite.play('slash-vfx-play');
      this.slashSprite.once('animationcomplete', () => {
        this.slashSprite.setVisible(false);
      });
      this.audioSystem.playSlash();
    }

    // Rocket launcher: right-click fires when ammo > 0 (spectator = infinite ammo)
    this.rocketCooldownTimer = Math.max(0, this.rocketCooldownTimer - hDt);
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
        this.testRocketsFired++;
        this.rocketCooldownTimer = TUNING.ROCKET_COOLDOWN;
      }
    }
    this.rocketSystem.update(hDt);

    // Player collisions (after slash so destroyed obstacles are already gone)
    // NOTE: rage timer is ticked AFTER collisions so it can't expire mid-frame
    const playerCollX = this.playerSystem.getX();
    const playerCollY = Math.max(this.playerSystem.getY() + TUNING.PLAYER_COLLISION_OFFSET_Y, TUNING.ROAD_TOP_Y);

    // Update pickups (scrolling + collection)
    this.pickupSystem.update(hDt, roadSpeed, playerCollX, playerCollY);
    if (this.pickupSystem.wasCollected()) {
      this.testPickups++;
      this.playerSystem.playCollectRocket();
      this.audioSystem.playAmmoPickup();
      // Check 2X bonus zone in rhythm mode
      let ammoScoreMult = 1;
      if (this.rhythmMode) {
        const colX = this.pickupSystem.getCollectedX();
        const bonusLeft = TUNING.RHYTHM_SWEET_SPOT_X - TUNING.RHYTHM_BONUS_ZONE_WIDTH / 2;
        const bonusRight = TUNING.RHYTHM_SWEET_SPOT_X + TUNING.RHYTHM_BONUS_ZONE_WIDTH / 2;
        if (colX >= bonusLeft && colX <= bonusRight) {
          ammoScoreMult = TUNING.RHYTHM_BONUS_SCORE_MULT;
          // Extra ammo (PickupSystem already gave 1)
          for (let i = 1; i < TUNING.RHYTHM_BONUS_AMMO_MULT; i++) {
            this.pickupSystem.addAmmoExternal();
          }
          this.spawn2XPopup();
          this.trigger2XFlash();
        }
      }
      this.awardBonus(TUNING.SCORE_PICKUP_ROCKET * ammoScoreMult, 'rocket');
    }

    // Update shield pickups (scrolling + collection)
    this.shieldSystem.update(hDt, roadSpeed, playerCollX, playerCollY);
    if (this.shieldSystem.wasCollected()) {
      this.testPickups++;
      this.playerSystem.playCollectShield();
      this.audioSystem.playPotionPickup();
      this.awardBonus(TUNING.SCORE_PICKUP_SHIELD, 'shield');
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
        this.testObstaclesDestroyed += hits.length;
        this.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION * 0.5, TUNING.SHAKE_DEATH_INTENSITY * 0.3);
        this.playerSystem.playCollectHit();
        for (let i = 0; i < hits.length; i++) {
          const pts = hits[i].type === ObstacleType.CAR
            ? TUNING.SCORE_CAR_INVINCIBLE
            : TUNING.SCORE_OBSTACLE_INVINCIBLE;
          this.awardBonus(pts, 'invincible');
        }
      }
      // Still check slow zones
      const result = this.obstacleSystem.checkCollision(playerCollX, playerCollY, pHalfW, pHalfH);
      if (result.slowOverlapping) {
        this.playerSystem.applyLeftwardPush(TUNING.SLOW_PUSH_RATE * hDt);
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
          this.testCollisions++;
          this.shieldSystem.consumeShield();
          this.obstacleSystem.spawnExplosion(result.hitX, result.hitY);
          this.audioSystem.playExplosion();
          this.audioSystem.playPotionUsed();
          this.playerSystem.playCollectHit();
          this.fxSystem.triggerDamage();
          if (this.rhythmMode && result.isEnemy) {
            // Enemy car shield ram — proximity scoring (reward, not penalty)
            const centerDist = Math.abs(result.hitX - TUNING.RHYTHM_SWEET_SPOT_X);
            const zoneHalf = TUNING.RHYTHM_ENEMY_CAR_ZONE_HALF;
            if (centerDist <= zoneHalf) {
              const proximity = 1 - centerDist / zoneHalf;
              const enemyBonus = Math.round(
                TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE +
                proximity * (TUNING.RHYTHM_ENEMY_CAR_MAX_SCORE - TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE)
              );
              this.awardBonus(enemyBonus, 'shield');
              if (proximity > 0.7) this.trigger2XFlash();
            } else {
              this.awardBonus(TUNING.RHYTHM_ENEMY_CAR_BASE_SCORE, 'shield');
            }
          } else {
            const shieldPts = result.hitType === ObstacleType.CAR
              ? TUNING.SCORE_CAR_SHIELD
              : TUNING.SCORE_OBSTACLE_SHIELD;
            this.awardBonus(shieldPts, 'damage');
          }
        } else {
          this.testCollisions++;
          this.playerSystem.kill();
        }
      }
      if (result.slowOverlapping) {
        this.playerSystem.applyLeftwardPush(TUNING.SLOW_PUSH_RATE * hDt);
      }
      this.fxSystem.onSlowOverlap(result.slowOverlapping);
    }

    // Rage mode tick — drain the bar so player can see time remaining
    // (ticked AFTER collisions so rage can't expire mid-frame leaving player vulnerable)
    if (this.rageTimer > 0) {
      this.rageTimer -= hDt;
      if (this.rageTimer <= 0) {
        this.rageTimer = 0;
        this.rageAmount = 0;
        this.playerSystem.stopPoweredUp();
        this.musicPlayer.setVolumeBoost(1.0);
        this.audioSystem.setDistortion(0);

        // End-of-rage shockwave: big explosion + destroy all obstacles to protect player
        const rageEndResult = this.obstacleSystem.destroyAllOnScreen(TUNING.RAGE_END_EXPLOSION_SCALE);
        const rageEndPts = rageEndResult.obstacles * TUNING.SCORE_RAGE_END_OBSTACLE
          + rageEndResult.cars * TUNING.SCORE_RAGE_END_CAR;
        if (rageEndPts > 0) {
          this.awardBonus(rageEndPts, 'invincible');
        }
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
      this.rageZoomProgress = Math.min(this.rageZoomProgress + hDt / TUNING.RAGE_ZOOM_IN_DURATION, 1);
    } else if (this.rageZoomProgress > 0) {
      // Zoom out (starts RAGE_ZOOM_OUT_DURATION seconds before rage expires)
      this.rageZoomProgress = Math.max(this.rageZoomProgress - hDt / TUNING.RAGE_ZOOM_OUT_DURATION, 0);
    }
    this.applyRageZoom();

    // FX: speed lines + edge warnings
    this.fxSystem.update(hDt, this.playerSystem.getPlayerSpeed(), roadSpeed, this.playerSystem.getX());

    // Rainbow-cycle active score popups
    this.updateScorePopupRainbow();

    // Audio: engine pitch/volume
    this.audioSystem.updateEngine(this.playerSystem.getPlayerSpeed(), roadSpeed, this.inputSystem.isSpaceHeld());

    // Check if player died this frame
    if (!this.playerSystem.isAlive()) {
      this.enterDead();
    }

    this.parallaxSystem.update(roadSpeed, hDt);
    this.skyGlowSystem.update(hDt, this.musicPlayer.getPlaybackPosition().current);
    this.skyGlowSystem.setRage(this.rageTimer > 0);
    this.roadSystem.update(roadSpeed, hDt);
    this.reflectionSystem.update(roadSpeed, hDt);

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
    this.profileHud.update(hDt);

    // Streak timer tick-down
    this.streakTimer = Math.max(0, this.streakTimer - hDt);

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
      for (let i = 0; i < this.warningPillPool.length; i++) {
        this.warningPillPool[i].gfx.setVisible(false);
        this.warningPillPool[i].preview1.setVisible(false);
        this.warningPillPool[i].preview2.setVisible(false);
      }
      for (let i = 0; i < this.laneHighlights.length; i++) {
        this.laneHighlights[i].setVisible(false);
      }
      this.reflectionSystem.setVisible(false);
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

    // Reset pool usage counters
    let poolIdx = 0;
    let pillIdx = 0;

    for (let lane = 0; lane < TUNING.LANE_COUNT; lane++) {
      const laneWarnings = warnings[lane];
      const laneY = laneCenters[lane];

      // --- Phase 1: detect CRASH + pickup/shield combo pairs ---
      const paired = new Set<number>();
      const comboForPickup = new Map<number, number>(); // pickupIdx → crashIdx

      for (let w = 0; w < laneWarnings.length; w++) {
        const wn = laneWarnings[w];
        if (wn.type !== 'pickup' && wn.type !== 'shield-pickup') continue;
        if (paired.has(w)) continue;

        // Find nearest preceding unpaired CRASH (sorted ascending by timeUntil)
        for (let c = w - 1; c >= 0; c--) {
          if (laneWarnings[c].type !== ObstacleType.CRASH) continue;
          if (paired.has(c)) continue;
          const timeDiff = wn.timeUntil - laneWarnings[c].timeUntil;
          if (timeDiff >= 0 && timeDiff < 1.5) {
            paired.add(w);
            paired.add(c);
            comboForPickup.set(w, c);
            break;
          }
        }
      }

      // --- Phase 2: build render entries in sorted order ---
      const entries: ({ combo: false; warning: LaneWarning } | { combo: true; crash: LaneWarning; pickup: LaneWarning })[] = [];

      for (let w = 0; w < laneWarnings.length; w++) {
        if (paired.has(w)) {
          if (comboForPickup.has(w)) {
            // Pickup entry — emit combo (crash folded in, no separate crash circle)
            const crashIdx = comboForPickup.get(w)!;
            entries.push({ combo: true, crash: laneWarnings[crashIdx], pickup: laneWarnings[w] });
          }
          continue; // skip paired crash entries (included in combo pill)
        }
        entries.push({ combo: false, warning: laneWarnings[w] });
      }

      // --- Phase 3: count total slots for positioning ---
      let totalSlots = 0;
      for (let r = 0; r < entries.length; r++) {
        totalSlots += entries[r].combo ? 2 : 1;
      }

      // --- Phase 4: render entries from earliest (left) to latest (right) ---
      let slotOff = 0;
      for (let r = 0; r < entries.length; r++) {
        const entry = entries[r];

        if (entry.combo) {
          // ── Combo pill (2 slots) ──
          const leftCx = TUNING.GAME_WIDTH - warningRadius - (totalSlots - 1 - slotOff) * circleDiameter;
          const rightCx = TUNING.GAME_WIDTH - warningRadius - (totalSlots - 1 - (slotOff + 1)) * circleDiameter;
          const pillCx = (leftCx + rightCx) / 2;

          // Alpha based on crash (first to arrive)
          const alpha = (1 - entry.crash.timeUntil / TUNING.LANE_WARNING_DURATION) * 0.8;

          // Stroke color from pickup type (yellow for rocket, green for shield — never orange)
          const strokeColor = entry.pickup.type === 'pickup'
            ? TUNING.WARNING_STROKE_ROCKET
            : TUNING.WARNING_STROKE_SHIELD;

          // Grow pill pool if needed
          if (pillIdx >= this.warningPillPool.length) {
            const gfx = this.add.graphics().setDepth(95).setVisible(false);
            const p1 = this.add.sprite(0, 0, 'obstacle-crash').setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
            const p2 = this.add.sprite(0, 0, 'obstacle-crash').setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
            this.warningPillPool.push({ gfx, preview1: p1, preview2: p2, currentKey1: '', currentKey2: '' });
          }

          const pill = this.warningPillPool[pillIdx];
          pillIdx++;

          // Draw pill shape (stadium: rounded rect where corner radius = half height)
          const pillW = circleDiameter * 2;
          const pillH = circleDiameter;
          pill.gfx.clear();
          pill.gfx.fillStyle(TUNING.WARNING_FILL_COLOR, TUNING.WARNING_FILL_ALPHA);
          pill.gfx.fillRoundedRect(pillCx - pillW / 2, laneY - pillH / 2, pillW, pillH, warningRadius);
          pill.gfx.lineStyle(TUNING.WARNING_STROKE_WIDTH, strokeColor, 1);
          pill.gfx.strokeRoundedRect(pillCx - pillW / 2, laneY - pillH / 2, pillW, pillH, warningRadius);
          pill.gfx.setAlpha(alpha).setVisible(true);

          // Crash preview (left half)
          const crashKey = 'obstacle-crash';
          if (pill.currentKey1 !== crashKey) {
            pill.currentKey1 = crashKey;
            pill.preview1.setTexture(crashKey).stop();
          }
          const crashTgtH = circleDiameter * TUNING.LANE_WARNING_PREVIEW_CRASH;
          const cFW = pill.preview1.width || 1;
          const cFH = pill.preview1.height || 1;
          pill.preview1.setDisplaySize(crashTgtH * (cFW / cFH), crashTgtH);
          pill.preview1.setPosition(leftCx, laneY);
          pill.preview1.setAlpha(alpha).setVisible(true);

          // Pickup/shield preview (right half)
          const pickupKey = entry.pickup.textureKey;
          const pickupScale = entry.pickup.type === 'pickup'
            ? TUNING.LANE_WARNING_PREVIEW_PICKUP
            : TUNING.LANE_WARNING_PREVIEW_SHIELD;
          if (pill.currentKey2 !== pickupKey) {
            pill.currentKey2 = pickupKey;
            pill.preview2.setTexture(pickupKey).stop();
          }
          const pTgtH = circleDiameter * pickupScale;
          const pFW = pill.preview2.width || 1;
          const pFH = pill.preview2.height || 1;
          pill.preview2.setDisplaySize(pTgtH * (pFW / pFH), pTgtH);
          pill.preview2.setPosition(rightCx, laneY);
          pill.preview2.setAlpha(alpha).setVisible(true);

          slotOff += 2;
        } else {
          // ── Single circle (1 slot) ──
          const warning = entry.warning;
          const cx = TUNING.GAME_WIDTH - warningRadius - (totalSlots - 1 - slotOff) * circleDiameter;

          // Grow pool if needed
          if (poolIdx >= this.warningPool.length) {
            const circle = this.add.circle(0, 0, warningRadius, TUNING.WARNING_FILL_COLOR, TUNING.WARNING_FILL_ALPHA)
              .setDepth(95).setVisible(false);
            const preview = this.add.sprite(0, 0, 'obstacle-crash')
              .setDepth(96).setVisible(false).setOrigin(0.5, 0.5);
            this.warningPool.push({ circle, preview, currentKey: '' });
          }

          const circleSlot = this.warningPool[poolIdx];
          poolIdx++;

          circleSlot.circle.setPosition(cx, laneY);
          circleSlot.preview.setPosition(cx, laneY);

          // Alpha fades in as obstacle approaches
          const warningDuration = warning.type === ObstacleType.CAR
            ? TUNING.LANE_WARNING_DURATION + TUNING.LANE_WARNING_CAR_EXTRA
            : TUNING.LANE_WARNING_DURATION;
          const alpha = (1 - warning.timeUntil / warningDuration) * 0.8;
          circleSlot.circle.setAlpha(alpha).setVisible(true);
          circleSlot.preview.setAlpha(alpha).setVisible(true);

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
              textureKey = 'puddle-tex';
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

          circleSlot.circle.setStrokeStyle(TUNING.WARNING_STROKE_WIDTH, strokeColor, alpha);

          if (circleSlot.currentKey !== textureKey) {
            circleSlot.currentKey = textureKey;
            if (warning.type === ObstacleType.CAR) {
              circleSlot.preview.setTexture(textureKey);
              circleSlot.preview.play(`${textureKey}-drive`);
            } else {
              circleSlot.preview.setTexture(textureKey);
              circleSlot.preview.stop();
            }
            // Tint puddle preview blue (white circle texture needs color)
            if (warning.type === ObstacleType.SLOW) {
              circleSlot.preview.setTint(TUNING.SLOW_COLOR);
            } else {
              circleSlot.preview.clearTint();
            }
          }

          const targetH = circleDiameter * scaleMultiplier;
          const frameW = circleSlot.preview.width || 1;
          const frameH = circleSlot.preview.height || 1;
          circleSlot.preview.setDisplaySize(targetH * (frameW / frameH), targetH);

          slotOff++;
        }
      }
    }

    // Hide unused circle pool slots
    for (let i = poolIdx; i < this.warningPool.length; i++) {
      this.warningPool[i].circle.setVisible(false);
      this.warningPool[i].preview.setVisible(false);
      this.warningPool[i].currentKey = '';
    }
    this.warningPoolUsed = poolIdx;

    // Hide unused pill pool slots
    for (let i = pillIdx; i < this.warningPillPool.length; i++) {
      this.warningPillPool[i].gfx.clear();
      this.warningPillPool[i].gfx.setVisible(false);
      this.warningPillPool[i].preview1.setVisible(false);
      this.warningPillPool[i].preview2.setVisible(false);
      this.warningPillPool[i].currentKey1 = '';
      this.warningPillPool[i].currentKey2 = '';
    }
    this.warningPillPoolUsed = pillIdx;
  }

  /** Hide all warning pool items */
  private hideWarningPool(): void {
    for (let i = 0; i < this.warningPool.length; i++) {
      this.warningPool[i].circle.setVisible(false);
      this.warningPool[i].preview.setVisible(false);
      this.warningPool[i].currentKey = '';
    }
    this.warningPoolUsed = 0;
    for (let i = 0; i < this.warningPillPool.length; i++) {
      this.warningPillPool[i].gfx.clear();
      this.warningPillPool[i].gfx.setVisible(false);
      this.warningPillPool[i].preview1.setVisible(false);
      this.warningPillPool[i].preview2.setVisible(false);
      this.warningPillPool[i].currentKey1 = '';
      this.warningPillPool[i].currentKey2 = '';
    }
    this.warningPillPoolUsed = 0;
  }

  /** Adjust all scrollFactor(0) HUD elements so they stay pinned during camera zoom.
   *  @param rageMultiplier 1.0 = no rage, >1 = zoomed in. Compensates for rage zoom only,
   *  NOT for renderScale (renderScale is the base zoom and should affect HUD normally). */
  private adjustHudForZoom(rageMultiplier: number): void {
    this.profileHud.adjustForZoom(rageMultiplier);
    // With camera origin(0,0): screen = worldPos * absoluteZoom.
    // To keep HUD at its base-zoom screen position during rage:
    //   worldPos' = targetWorldPos / rageMultiplier, scale' = 1 / rageMultiplier
    const invR = 1 / rageMultiplier;
    // hudLabel target position: (canvasWidth/2, 20)
    this.hudLabel.setScale(invR);
    this.hudLabel.setPosition(GAME_MODE.canvasWidth / 2 * invR, 20 * invR);
    // hudHighScore target position: (canvasWidth/2, 50)
    this.hudHighScore.setScale(invR);
    this.hudHighScore.setPosition(GAME_MODE.canvasWidth / 2 * invR, 50 * invR);
  }

  /** Apply camera zoom + scroll to create rage focal-length effect.
   *  Camera uses origin(0,0) so zoom scales from top-left: screen = (world - scroll) * zoom.
   *  Base zoom = renderScale; rage multiplies on top. */
  private applyRageZoom(): void {
    const rs = GAME_MODE.renderScale;
    if (this.rageZoomProgress <= 0) {
      this.cameras.main.setZoom(rs);
      this.cameras.main.setScroll(-GAME_MODE.contentOffsetX, 0);
      this.adjustHudForZoom(1);
      return;
    }
    // Ease in/out for smooth feel
    const t = this.rageZoomProgress * this.rageZoomProgress * (3 - 2 * this.rageZoomProgress); // smoothstep
    const rageMultiplier = 1 + (TUNING.RAGE_ZOOM_LEVEL - 1) * t;
    const absoluteZoom = rs * rageMultiplier;
    this.cameras.main.setZoom(absoluteZoom);
    this.adjustHudForZoom(rageMultiplier);

    // Compute desired camera center in world coordinates
    // With origin(0,0): visible width = renderW / absoluteZoom = GAME_WIDTH / rageMultiplier
    const halfVisW = TUNING.GAME_WIDTH / (2 * rageMultiplier);
    const halfVisH = TUNING.GAME_HEIGHT / (2 * rageMultiplier);

    // X: center on player, Y: lock bottom of road to bottom of screen
    let centerX = this.playerSystem.getX();
    let centerY = TUNING.ROAD_BOTTOM_Y - halfVisH;

    // Clamp so visible area never extends beyond game bounds (no black edges)
    centerX = Math.max(halfVisW, Math.min(TUNING.GAME_WIDTH - halfVisW, centerX));
    centerY = Math.max(halfVisH, Math.min(TUNING.GAME_HEIGHT - halfVisH, centerY));

    // With origin(0,0): scroll = worldCenter - halfVisible
    this.cameras.main.setScroll(centerX - halfVisW - GAME_MODE.contentOffsetX, centerY - halfVisH);
  }

  // Color palettes for score popups by interaction type
  private static readonly POPUP_COLORS: Record<string, string[]> = {
    damage:     ['#FF0000', '#CC0000', '#FF2222'],   // intense red for shield-absorb damage
    shield:     ['#FF4444', '#FF7777', '#CC2222'],   // red monochrome (main, pale, dark)
    rocket:     ['#FFDD00', '#FFEE55', '#CCB000'],   // yellow monochrome (main, pale, dark)
    katana:     ['#88FF00', '#AAFF44', '#66CC00'],   // lime green monochrome (main, pale, dark)
    invincible: ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00CCFF', '#0044FF', '#FF00FF'], // rainbow
    default:    ['#FFFFFF', '#EEEEEE', '#DDDDDD'],   // white monochrome
  };

  /** Award bonus points with streak tracking + HUD slam animation. */
  private awardBonus(basePoints: number, popupType: string): void {
    let finalPoints = basePoints;

    if (basePoints > 0) {
      // Positive points: apply streak bonus
      if (this.streakTimer > 0) {
        this.streakCount++;
      } else {
        this.streakCount = 0;
      }
      this.streakTimer = TUNING.SCORE_STREAK_WINDOW;
      const multiplier = 1 + this.streakCount * TUNING.SCORE_STREAK_BONUS;
      finalPoints = Math.round(basePoints * multiplier);
    }

    this.scoreSystem.addBonus(finalPoints);
    this.spawnScorePopup(finalPoints, popupType);

    // Trigger HUD slam with type-matched colors
    const colors = GameScene.POPUP_COLORS[popupType] || GameScene.POPUP_COLORS.default;
    this.profileHud.triggerScoreSlam(this.scoreSystem.getScore(), colors);
  }

  private spawnScorePopup(points: number, popupType: string = 'default'): void {
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
        fontSize: `${TUNING.SCORE_POPUP_FONT_SIZE}px`,
        color: '#ffffff',
        fontFamily: 'Early GameBoy',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(100);
      this.scorePopups.push(popup);
    }

    popup.setText(points < 0 ? `${points}` : `+${points}`);
    popup.setFontSize(TUNING.SCORE_POPUP_FONT_SIZE);
    popup.setData('popupType', popupType);

    // Flash the player sprite with the score type's color palette
    const flashColors = GameScene.POPUP_COLORS[popupType] || GameScene.POPUP_COLORS.default;
    this.playerSystem.flashScore(flashColors, TUNING.PLAYER_FLASH_DURATION);

    const startX = this.playerSystem.getX() + TUNING.SCORE_POPUP_OFFSET_X;
    const startY = this.playerSystem.getY() + TUNING.SCORE_POPUP_OFFSET_Y;
    popup.setPosition(startX, startY);
    popup.setAlpha(0);
    popup.setActive(true).setVisible(true);

    const fadeInMs = TUNING.SCORE_POPUP_FADE_IN * 1000;
    const holdMs = TUNING.SCORE_POPUP_HOLD * 1000;
    const fadeOutMs = TUNING.SCORE_POPUP_FADE_OUT * 1000;
    const totalMs = fadeInMs + holdMs + fadeOutMs;

    // Upward travel over the full duration
    this.tweens.add({
      targets: popup,
      y: startY + TUNING.SCORE_POPUP_TRAVEL_Y,
      duration: totalMs,
      ease: TUNING.SCORE_POPUP_EASE,
    });

    // Opacity: fade in → hold → fade out
    this.tweens.addCounter({
      from: 0,
      to: totalMs,
      duration: totalMs,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        if (t <= fadeInMs) {
          popup!.setAlpha(fadeInMs > 0 ? t / fadeInMs : 1);
        } else if (t <= fadeInMs + holdMs) {
          popup!.setAlpha(1);
        } else {
          const fadeT = (t - fadeInMs - holdMs) / fadeOutMs;
          popup!.setAlpha(1 - Math.min(fadeT, 1));
        }
      },
      onComplete: () => {
        popup!.setActive(false).setVisible(false);
      },
    });
  }

  /** Cycle active score popup colors through their palette (called every frame in updatePlaying). */
  private updateScorePopupRainbow(): void {
    const now = Date.now();
    for (let i = 0; i < this.scorePopups.length; i++) {
      const p = this.scorePopups[i];
      if (!p.active) continue;
      const type = (p.getData('popupType') as string) || 'default';
      const colors = GameScene.POPUP_COLORS[type] || GameScene.POPUP_COLORS.default;
      const idx = Math.floor(now / 80) % colors.length;
      p.setColor(colors[idx]);
    }
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
          this.skyGlowSystem.setVisible(false);
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

          // Show death screen shell immediately (behind white overlay)
          this.deathScoreText.setText(`SCORE: ${this.pendingScore}`);
          this.deathTimeText.setText(`TIME: ${Math.round(this.elapsed)}s`);
          this.deathRankText.setText('');
          this.deathBestText.setVisible(false);
          this.deathLeaderboardText.setText('');
          this.deathLbEntriesContainer.removeAll(true);
          this.highlightedRowTexts = [];
          this.deathContainer.setVisible(true);
          this.deathRestartText.setVisible(true);

          const profileName = this.profilePopup.getName();
          const hasProfileName = profileName !== 'ANON' && profileName.trim() !== '';

          if (this.rhythmMode && this.rhythmTrackId) {
            // ── Rhythm mode death: permanent per-track leaderboard ──
            const gen = this.deathGen;
            this.autoSubmitted = true;
            const trackId = this.rhythmTrackId;
            const diff = this.rhythmDifficulty;
            submitRhythmScore(trackId, diff, this.pendingScore, Math.round(this.elapsed), hasProfileName ? profileName : undefined).then(id => {
              if (gen !== this.deathGen) return;
              this.lastSubmittedRunId = id;
              return fetchRhythmTop10(trackId, diff);
            }).then(data => {
              if (gen !== this.deathGen) return;
              if (data) this.globalLeaderboardData = data;
            }).catch(() => {}).finally(() => {
              if (gen !== this.deathGen) return;
              this.prepareDeathScreenVisuals(0);
            });
          } else if (hasProfileName) {
            // Auto-submit with profile name — skip name entry entirely
            const rank = this.leaderboardSystem.submit(profileName, this.pendingScore, this.elapsed);
            const gen = this.deathGen;
            this.autoSubmitted = true;
            submitScore(this.pendingScore, this.elapsed, profileName).then(id => {
              if (gen !== this.deathGen) return;
              this.lastSubmittedRunId = id;
              return fetchGlobalTop10(this.weekKey);
            }).then(data => {
              if (gen !== this.deathGen) return;
              if (data) this.globalLeaderboardData = data;
            }).catch(() => {}).finally(() => {
              if (gen !== this.deathGen) return;
              this.prepareDeathScreenVisuals(rank);
            });
          } else if (this.pendingRank > 0 && this.pendingRank <= 10) {
            // Anon user scored top 10 — prompt for name before recording
            this.autoSubmitted = false;
            this.prepareNameEntryVisuals();
          } else {
            // Anon user outside top 10 — discard score, skip name entry,
            // just show the global leaderboard
            this.autoSubmitted = true;
            const gen = this.deathGen;
            fetchGlobalTop10(this.weekKey).then(data => {
              if (gen !== this.deathGen) return;
              if (data) this.globalLeaderboardData = data;
            }).catch(() => {}).finally(() => {
              if (gen !== this.deathGen) return;
              this.prepareDeathScreenVisuals(0);
            });
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

          // Hide profileHud on death/high-score screens
          this.profileHud.setVisible(false);

          // NOW activate the actual state
          if (!this.autoSubmitted) {
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
    this.debugPreStartOverlay.setVisible(false);
    this.reflectionSystem.setVisible(false);
    this.actionBtnTop.setVisible(false);
    this.actionBtnBottom.setVisible(false);
    this.sliderBar.setVisible(false);
    this.sliderKnob.setVisible(false);

    // Mobile: hide all cursors on death/high score screen
    if (GAME_MODE.mobileMode) {
      this.cursorMain?.setVisible(false);
      if (this.cursorStroke) this.cursorStroke.setVisible(false);
      this.crosshair?.setVisible(false);
      if (this.htmlCursor) this.htmlCursor.style.display = 'none';
      this.inputSystem.setPrimaryButtonVisible(false);
    }

    // Reset time dilation and restore music rate
    if (this.timeDilation) {
      this.timeDilation.reset();
      this.musicPlayer.setPlaybackRate(1);
      this.playerSystem.setAnimTimeScale(1);
      this.wasDilating = false;
    }

    // Restore HUD visibility if hidden by debug key
    if (this.hudHidden) {
      this.hudHidden = false;
      this.profileHud.setVisible(true);
      this.musicPlayer.setContainerOpacity(1);
      this.musicPlayer.setVisible(true);
      this.obstacleSystem.setSuppressExplosions(false);
      this.fxSystem.setSuppressShake(false);
    }

    // Close profile popup if open
    if (this.profilePopup.isOpen()) this.profilePopup.close();

    // Reset camera zoom before death transition
    this.rageZoomProgress = 0;
    this.cameras.main.setZoom(GAME_MODE.renderScale);
    this.cameras.main.setScroll(-GAME_MODE.contentOffsetX, 0);
    this.adjustHudForZoom(1);

    // Collapse music player to thumbnail-only + revert to title position/scale
    this.musicPlayer.setCompact(true);
    this.musicPlayer.setGameplayMode(false);

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

    // Reset global leaderboard state — fetch happens after submit completes
    this.globalLeaderboardData = null;
    this.lastSubmittedRunId = null;
    this.deathGen++;
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

    // Create hidden HTML input to trigger mobile keyboard
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = NAME_MAX_LENGTH;
    inp.autocomplete = 'off';
    inp.autocapitalize = 'characters';
    inp.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;z-index:9999;';
    document.body.appendChild(inp);
    this.nameHiddenInput = inp;

    // Sync hidden input → Phaser text on every keystroke
    inp.addEventListener('input', () => {
      if (this.state !== GameState.NAME_ENTRY) return;
      if (this.emptyNameVisible) this.hideEmptyNamePrompt();
      this.enteredName = inp.value.slice(0, NAME_MAX_LENGTH);
      this.nameInputText.setText(this.enteredName + '_');
    });

    // Focus the input to pop the mobile keyboard
    setTimeout(() => inp.focus(), 100);

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

      // Desktop: sync from keyboard events (hidden input handles mobile)
      if (event.key === 'Backspace') {
        this.enteredName = this.enteredName.slice(0, -1);
      } else if (event.key.length === 1 && this.enteredName.length < NAME_MAX_LENGTH) {
        this.enteredName += event.key;
      }
      this.nameInputText.setText(this.enteredName + '_');
      // Keep hidden input in sync for mobile
      if (this.nameHiddenInput) this.nameHiddenInput.value = this.enteredName;
    };
    this.input.keyboard?.on('keydown', this.nameKeyHandler);
  }

  /** Remove the hidden HTML input used for mobile keyboard */
  private removeNameHiddenInput(): void {
    if (this.nameHiddenInput) {
      this.nameHiddenInput.blur();
      this.nameHiddenInput.remove();
      this.nameHiddenInput = null;
    }
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

    // Build unified entry list from global data (preferred) or local fallback
    const globalData = this.globalLeaderboardData;
    const isGlobal = !!(globalData && globalData.length > 0);

    interface DisplayEntry { name: string; score: number; time: number; entryId: string | null; isCurrentPlayer: boolean }
    let entries: DisplayEntry[];
    let highlightIdx = -1;

    if (isGlobal) {
      entries = globalData!.map(e => ({
        name: e.username || 'ANON',
        score: e.score,
        time: e.timeSurvived || 0,
        entryId: e.id,
        isCurrentPlayer: !!(this.lastSubmittedRunId && e.id === this.lastSubmittedRunId),
      }));
      highlightIdx = entries.findIndex(e => e.isCurrentPlayer);
    } else {
      const localEntries = this.leaderboardSystem.getDisplayEntries();
      entries = localEntries.map(e => ({
        name: e.name,
        score: e.score,
        time: e.time,
        entryId: null,
        isCurrentPlayer: false,
      }));
      highlightIdx = (rank > 0 && rank <= 10) ? rank - 1 : -1;
    }

    // Show best score info when not in top 10 (local data)
    const profileName = this.profilePopup.getName();
    const hasProfileName = profileName !== 'ANON' && profileName.trim() !== '';
    if (!isGlobal && rank > 10 && hasProfileName) {
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

    // Rank text
    if (this.rhythmMode && isGlobal && highlightIdx >= 0) {
      this.deathRankText.setText(`#${highlightIdx + 1} ON THIS TRACK`);
    } else if (isGlobal && highlightIdx >= 0) {
      this.deathRankText.setText(`#${highlightIdx + 1} GLOBAL THIS WEEK`);
    } else if (!isGlobal && rank > 0 && rank <= 10) {
      this.deathRankText.setText(`#${rank} THIS WEEK`);
    } else if (!isGlobal && rank > 10) {
      this.deathRankText.setText(`YOUR SCORE RANKED #${rank}`);
    } else {
      this.deathRankText.setText('');
    }

    // Top 10 leaderboard display — top 3 get podium styling
    if (this.rhythmMode) {
      const diff = this.rhythmDifficulty.toUpperCase();
      this.deathLeaderboardText.setText(`── RHYTHM ${diff} TOP 10 ──`);
    } else {
      this.deathLeaderboardText.setText(isGlobal
        ? `── ${this.weekKey} GLOBAL TOP 10 ──`
        : `── ${this.weekKey} TOP 10 ──`);
    }

    // Clear previous entry rows
    this.deathLbEntriesContainer.removeAll(true);
    this.highlightedRowTexts = [];

    const headerH = 40;
    const baseY = this.deathLeaderboardText.y + headerH;

    const hasAvatar = this.textures.exists(AVATAR_TEXTURE_KEY);

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

      // Avatar: current player gets their pic, others get default anon
      const avatarKey = (i === highlightIdx && hasAvatar) ? AVATAR_TEXTURE_KEY : 'default-avatar';
      if (this.textures.exists(avatarKey)) {
        const avatar = this.add.image(avatarX, rowCenterY, avatarKey)
          .setDisplaySize(DLB_T3_AVATAR_R * 2, DLB_T3_AVATAR_R * 2);
        // Circular mask
        const maskGfx = this.make.graphics({});
        maskGfx.fillCircle(avatarX, rowCenterY, DLB_T3_AVATAR_R);
        avatar.setMask(maskGfx.createGeometryMask());
        this.deathLbEntriesContainer.add(avatar);
      } else {
        const inner = this.add.circle(avatarX, rowCenterY, DLB_T3_AVATAR_R, 0x222222);
        this.deathLbEntriesContainer.add(inner);
        const numLabel = this.add.text(avatarX, rowCenterY, String(i + 1), {
          fontSize: '20px', color: '#ffffff', fontFamily: 'Early GameBoy',
        }).setOrigin(0.5);
        this.deathLbEntriesContainer.add(numLabel);
      }

      // Rank (right-justified so "." aligns)
      const rankT = this.add.text(DLB_T3_X + DLB_T3_RANK_X, rowCenterY, `${String(i + 1).padStart(2, ' ')}.`, {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(rankT);
      rowTexts.push(rankT);

      // Name (left-justified)
      const nameT = this.add.text(DLB_T3_X + DLB_T3_NAME_X, rowCenterY, (e.name || 'ANON'), {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(nameT);
      rowTexts.push(nameT);

      // Time (right-justified)
      const timeT = this.add.text(DLB_T3_X + DLB_T3_TIME_X, rowCenterY, `${e.time}s`, {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(timeT);
      rowTexts.push(timeT);

      // Score (right-justified)
      const scoreT = this.add.text(DLB_T3_X + DLB_T3_SCORE_X, rowCenterY, String(e.score), {
        fontSize: DLB_T3_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(scoreT);
      rowTexts.push(scoreT);

      // ◄ marker (separate element)
      if (i === highlightIdx) {
        const markerT = this.add.text(DLB_T3_X + DLB_T3_MARKER_X, rowCenterY, '◄', {
          fontSize: DLB_T3_FONT, color: '#ffffff', fontFamily: 'Early GameBoy',
        }).setOrigin(0, 0.5);
        this.deathLbEntriesContainer.add(markerT);
        rowTexts.push(markerT);
      }

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

      // Rank (right-justified so "." aligns with top 3)
      const rankT = this.add.text(DLB_T3_X + DLB_T3_RANK_X, rowCenterY, `${String(i + 1).padStart(2, ' ')}.`, {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(rankT);
      rowTexts.push(rankT);

      // Name (left-justified)
      const nameT = this.add.text(DLB_T3_X + DLB_T3_NAME_X, rowCenterY, (e.name || 'ANON'), {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(0, 0.5);
      this.deathLbEntriesContainer.add(nameT);
      rowTexts.push(nameT);

      // Time (right-justified)
      const timeT = this.add.text(DLB_T3_X + DLB_T3_TIME_X, rowCenterY, `${e.time}s`, {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(timeT);
      rowTexts.push(timeT);

      // Score (right-justified)
      const scoreT = this.add.text(DLB_T3_X + DLB_T3_SCORE_X, rowCenterY, String(e.score), {
        fontSize: DLB_REST_FONT, color, fontFamily: 'Early GameBoy',
      }).setOrigin(1, 0.5);
      this.deathLbEntriesContainer.add(scoreT);
      rowTexts.push(scoreT);

      // ◄ marker (separate element)
      if (i === highlightIdx) {
        const markerT = this.add.text(DLB_T3_X + DLB_T3_MARKER_X, rowCenterY, '◄', {
          fontSize: DLB_REST_FONT, color: '#ffffff', fontFamily: 'Early GameBoy',
        }).setOrigin(0, 0.5);
        this.deathLbEntriesContainer.add(markerT);
        rowTexts.push(markerT);
      }

      if (i === highlightIdx) this.highlightedRowTexts = rowTexts;
      curY += DLB_REST_ROW_H;
    }

    this.highlightRank = highlightIdx >= 0 ? rank : 0;

    // Update restart prompt for rhythm vs normal mode + mobile
    if (GAME_MODE.mobileMode) {
      this.deathRestartText.setText(
        this.rhythmMode
          ? 'Tap = Play Again  |  Back = Song Select'
          : 'Tap to try again'
      );
    } else {
      this.deathRestartText.setText(
        this.rhythmMode
          ? 'SPACE = Play Again  |  ESC = Song Select'
          : 'Press SPACEBAR to try again'
      );
    }

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

      // Remove keyboard listener + hidden input
      if (this.nameKeyHandler) {
        this.input.keyboard?.off('keydown', this.nameKeyHandler);
        this.nameKeyHandler = null;
      }
      this.removeNameHiddenInput();

      // Submit score with name
      const name = this.enteredName.trim() || 'ANON';
      const rank = this.leaderboardSystem.submit(name, this.pendingScore, this.elapsed);

      // Hide name entry UI, transition to DEAD (death screen shell already visible from hold phase)
      this.nameEntryContainer.setVisible(false);
      this.nameEnterBtn.setVisible(false);
      this.state = GameState.DEAD;
      this.deadInputDelay = 0.5;

      // Async submit + fetch — render ONLY in .finally() to avoid local→global flash
      const gen3 = this.deathGen;
      if (this.rhythmMode && this.rhythmTrackId) {
        const trackId = this.rhythmTrackId;
        const diff = this.rhythmDifficulty;
        submitRhythmScore(trackId, diff, this.pendingScore, Math.round(this.elapsed), name).then(id => {
          if (gen3 !== this.deathGen) return;
          this.lastSubmittedRunId = id;
          return fetchRhythmTop10(trackId, diff);
        }).then(data => {
          if (gen3 !== this.deathGen) return;
          if (data) this.globalLeaderboardData = data;
        }).catch(() => {}).finally(() => {
          if (gen3 !== this.deathGen) return;
          this.prepareDeathScreenVisuals(rank);
        });
      } else {
        submitScore(this.pendingScore, this.elapsed, name).then(id => {
          if (gen3 !== this.deathGen) return;
          this.lastSubmittedRunId = id;
          return fetchGlobalTop10(this.weekKey);
        }).then(data => {
          if (gen3 !== this.deathGen) return;
          if (data) this.globalLeaderboardData = data;
        }).catch(() => {}).finally(() => {
          if (gen3 !== this.deathGen) return;
          this.prepareDeathScreenVisuals(rank);
        });
      }
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
