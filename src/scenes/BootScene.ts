import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ensureAnonUser } from '../systems/AuthSystem';
import { GAME_MODE } from '../config/gameMode';

export const TITLE_LOOP_FRAME_COUNT = 27;
export const TITLE_START_FRAME_COUNT = 25;
export const PRE_START_FRAME_COUNT = 46;
export const INTRO_TO_TUT_FRAME_COUNT = 27;
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Apply BIOS volume as early as possible (bootup audio is already playing from index.html)
    const bootOverlay = (window as any).__bootOverlay;
    if (bootOverlay?.bootupAudio) bootOverlay.bootupAudio.volume = TUNING.SFX_BIOS_BOOTUP_VOLUME * TUNING.SFX_BIOS_MASTER;
    if (bootOverlay?.biosCompleteAudio) bootOverlay.biosCompleteAudio.volume = TUNING.SFX_BIOS_BEEP_VOLUME * TUNING.SFX_BIOS_MASTER;
    if (bootOverlay?.biosClickAudio) bootOverlay.biosClickAudio.volume = TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER;

    // Report real load progress to the boot overlay (clamped 0..0.9)
    this.load.on('progress', (value: number) => {
      (window as any).__bootOverlay?.setProgress?.(value);
    });
    // Frame sequences: ~1.3 GB VRAM total — skip on mobile, load only first frame as static
    if (!GAME_MODE.mobileMode) {
      for (let i = 0; i < TITLE_LOOP_FRAME_COUNT; i++) {
        const idx = String(i).padStart(2, '0');
        this.load.image(`start-loop-${idx}`, `assets/start/start_loop/DP_Death_Ride_Title_Loop${idx}.jpg`);
      }
      for (let i = 0; i < TITLE_START_FRAME_COUNT; i++) {
        const idx = String(i).padStart(2, '0');
        this.load.image(`start-play-${idx}`, `assets/start/start_play/DP_Death_Ride_Title_Start${idx}.jpg`);
      }
      for (let i = 0; i < PRE_START_FRAME_COUNT; i++) {
        const idx = String(i).padStart(5, '0');
        this.load.image(`pre-start-${idx}`, `assets/cutscenes/pre_start/v02/pre_start_v02__${idx}.png`);
      }
      for (let i = 0; i < INTRO_TO_TUT_FRAME_COUNT; i++) {
        const idx = String(i).padStart(5, '0');
        this.load.image(`intro-tut-${idx}`, `assets/cutscenes/intro_to_tut/v3/intro_to_tut_v03__${idx}.jpg`);
      }
    } else {
      // Mobile: load only first frame of title loop for static title background
      this.load.image('start-loop-00', 'assets/start/start_loop/DP_Death_Ride_Title_Loop00.jpg');
    }
    // Mobile: load half-res nearest-neighbor sprite sheets (_mobile suffix)
    // Same texture keys, same animations, just smaller textures + frame dims
    const mob = GAME_MODE.mobileMode;
    const sfx = mob ? '_mobile' : '';                                     // file suffix
    const ms = TUNING.MOBILE_SPRITE_SCALE;
    const fw = (w: number) => mob ? Math.floor(w * ms) : w;              // scale frame width
    const fh = (h: number) => mob ? Math.floor(h * ms) : h;              // scale frame height

    this.load.spritesheet('player-ride', `assets/dp_player/dp_moto_v03${sfx}.png`, {
      frameWidth: fw(TUNING.PLAYER_FRAME_WIDTH),
      frameHeight: fh(TUNING.PLAYER_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-start', `assets/dp_player/dp_start${sfx}.png`, {
      frameWidth: fw(TUNING.START_ANIM_FRAME_WIDTH),
      frameHeight: fh(TUNING.START_ANIM_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-attack', `assets/dp_player/dp_attack${sfx}.png`, {
      frameWidth: fw(TUNING.PLAYER_ATTACK_FRAME_WIDTH),
      frameHeight: fh(TUNING.PLAYER_ATTACK_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-powered', `assets/dp_player/dp_powered_up${sfx}.png`, {
      frameWidth: fw(TUNING.POWERED_FRAME_WIDTH),
      frameHeight: fh(TUNING.POWERED_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-speedup', `assets/dp_player/dp_speed_up${sfx}.png`, {
      frameWidth: fw(TUNING.SPEEDUP_FRAME_WIDTH),
      frameHeight: fh(TUNING.SPEEDUP_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-rocket-launch', `assets/dp_player/dp_rocket_lancher_v2${sfx}.png`, {
      frameWidth: fw(TUNING.ROCKET_LAUNCHER_FRAME_WIDTH),
      frameHeight: fh(TUNING.ROCKET_LAUNCHER_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-collect-rocket', `assets/COL/COL_rocket${sfx}.png`, {
      frameWidth: fw(TUNING.COL_FRAME_WIDTH),
      frameHeight: fh(TUNING.COL_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-collect-shield', `assets/COL/COL_shield${sfx}.png`, {
      frameWidth: fw(TUNING.COL_FRAME_WIDTH),
      frameHeight: fh(TUNING.COL_FRAME_HEIGHT),
    });
    this.load.spritesheet('player-collect-hit', `assets/COL/COL_hit${sfx}.png`, {
      frameWidth: fw(TUNING.COL_FRAME_WIDTH),
      frameHeight: fh(TUNING.COL_FRAME_HEIGHT),
    });
    this.load.spritesheet('rocket-projectile', `assets/pickups/rocket_Projectile${sfx}.png`, {
      frameWidth: fw(TUNING.ROCKET_PROJ_FRAME_W),
      frameHeight: fh(TUNING.ROCKET_PROJ_FRAME_H),
    });
    this.load.audio('countdown-music', 'assets/audio/music/hell_girl_countdown.mp3');
    this.load.audio('sfx-click', 'assets/audio/sfx/mouse click.mp3');
    this.load.audio('sfx-hover', 'assets/audio/sfx/mouse hover.mp3');
    this.load.audio('sfx-explode', 'assets/audio/sfx/explode.mp3');
    this.load.audio('sfx-rocket-fire', 'assets/audio/sfx/rocket_fire.mp3');
    this.load.audio('sfx-engine', 'assets/audio/sfx/motorcycle engine.mp3');
    this.load.audio('sfx-ammo-pickup', 'assets/audio/sfx/ammo_pickup.mp3');
    this.load.audio('sfx-obstacle-kill', 'assets/audio/sfx/obstacle_kill.mp3');
    this.load.audio('sfx-potion-pickup', 'assets/audio/sfx/potion_pickup.mp3');
    this.load.audio('sfx-potion-used', 'assets/audio/sfx/potion_used.mp3');
    this.load.spritesheet('pickup-rocket', `assets/pickups/rocket pickup${sfx}.png`, {
      frameWidth: fw(TUNING.PICKUP_FRAME_SIZE),
      frameHeight: fh(TUNING.PICKUP_FRAME_SIZE),
    });
    this.load.image('obstacle-crash', 'assets/obstacles/road_barrier_01.png');
    this.load.image('obstacle-reflection-alt', 'assets/obstacles/road_barrier_01_reflection_alt.png');
    this.load.image('puddle-tex', 'assets/background/puddle example.png');
    this.load.image('road-img', 'assets/background/road.jpg');
    this.load.image('sky-img', 'assets/background/sky.jpg');
    this.load.image('buildings-back', 'assets/background/buildings_back_row_dark.png');
    this.load.image('buildings-front', 'assets/background/buildings_Front_row_dark.png');
    this.load.image('buildings-big', 'assets/background/buildings_Front_row_dark.png');
    this.load.image('railing', 'assets/background/railing_dark.jpg');

    // Car sprite sheets (all 20, mobile uses _mobile half-res variants)
    for (let c = 1; c <= TUNING.CAR_COUNT; c++) {
      const key = `car-${String(c).padStart(3, '0')}`;
      this.load.spritesheet(key, `assets/cars/car_${String(c).padStart(3, '0')}${sfx}.png`, {
        frameWidth: fw(TUNING.CAR_FRAME_WIDTH),
        frameHeight: fh(TUNING.CAR_FRAME_HEIGHT),
      });
    }

    // Explosion sprite sheet
    this.load.spritesheet('explosion', `assets/vfx/vfx_explosion${sfx}.png`, {
      frameWidth: fw(TUNING.EXPLOSION_FRAME_SIZE),
      frameHeight: fh(TUNING.EXPLOSION_FRAME_SIZE),
    });

    // Slash VFX sprite sheet (8 frames horizontal strip, frame 0 is blank)
    this.load.spritesheet('slash-vfx', `assets/vfx/slash${sfx}.png`, {
      frameWidth: fw(TUNING.SLASH_VFX_FRAME_WIDTH),
      frameHeight: fh(TUNING.SLASH_VFX_FRAME_HEIGHT),
    });

    // Countdown sprite sheet (3×2 grid, 600×600 per frame, last frame blank)
    this.load.spritesheet('countdown', `assets/start/countdown${sfx}.png`, {
      frameWidth: fw(TUNING.COUNTDOWN_FRAME_SIZE),
      frameHeight: fh(TUNING.COUNTDOWN_FRAME_SIZE),
    });

    // UI assets
    this.load.image('spotify-text-logo', 'ui/spotify_text_logo_.png');
    this.load.image('sign-in', 'ui/sign_in.png');
    this.load.image('cursor', 'ui/cursor.png');
    this.load.image('crosshair', 'ui/crosshair.png');
    this.load.image('rocket-icon', 'assets/pickups/rocket_icon.png');
    this.load.image('rocket-icon-empty', 'assets/pickups/rocket_empty_icon.png');
    this.load.spritesheet('pickup-shield', `assets/pickups/shield_pickup${sfx}.png`, {
      frameWidth: fw(TUNING.SHIELD_FRAME_WIDTH),
      frameHeight: fh(TUNING.SHIELD_FRAME_HEIGHT),
    });
    this.load.image('shield-icon', 'assets/pickups/shield_icon.png');
    this.load.image('shield-icon-empty', 'assets/pickups/shield_empty_icon.png');
    this.load.image('ui-music-menu', 'ui/music menu.png');
    this.load.image('ui-skip', 'ui/skip.png');
    this.load.image('ui-unmuted', 'ui/unmuted.png');
    this.load.image('ui-muted', 'ui/muted.png');
    this.load.image('ui-insta', 'ui/insta.png');
    this.load.image('default-avatar', 'assets/profiles/dp_anon_pic.jpg');
    this.load.image('add-pic-icon', 'ui/add_pic_icon.png');

    // Tutorial assets
    this.load.image('tutorial-skip', 'assets/tutorial/skip_v02.png');
    this.load.image('tutorial-blank', 'assets/tutorial/how_to_play_v2.jpg');
    this.load.image('tutorial-obstacles', 'assets/tutorial/tut_v2/rules_v2.jpg');
    if (!GAME_MODE.mobileMode) {
      for (let i = 0; i < TUNING.TUTORIAL_CONTROLS_FRAMES; i++) {
        const idx = String(i).padStart(2, '0');
        const fileIdx = String(i).padStart(5, '0');
        this.load.image(`tutorial-controls-${idx}`, `assets/tutorial/controls_v4/controls_v4__${fileIdx}.jpg`);
      }
      for (let i = 0; i < TUNING.TUTORIAL_RAGE_FRAMES; i++) {
        this.load.image(`tutorial-rage-${i}`, `assets/tutorial/tut_v2/rage_v2/rage_v2_${i}.jpg`);
      }
    } else {
      // Mobile: load only first frame of each for static display
      this.load.image('tutorial-controls-00', 'assets/tutorial/controls_v4/controls_v4__00000.jpg');
      this.load.image('tutorial-rage-0', 'assets/tutorial/tut_v2/rage_v2/rage_v2_0.jpg');
    }
  }

  async create() {
    // Frame sequence animations — desktop only (mobile uses static frames)
    if (!GAME_MODE.mobileMode) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < TITLE_LOOP_FRAME_COUNT; i++) {
        frames.push({ key: `start-loop-${String(i).padStart(2, '0')}` });
      }
      this.anims.create({ key: 'title-loop', frames, frameRate: 12, repeat: -1 });

      const startFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < TITLE_START_FRAME_COUNT; i++) {
        startFrames.push({ key: `start-play-${String(i).padStart(2, '0')}` });
      }
      this.anims.create({ key: 'title-start', frames: startFrames, frameRate: 12, repeat: 0 });

      const preStartFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < PRE_START_FRAME_COUNT; i++) {
        preStartFrames.push({ key: `pre-start-${String(i).padStart(5, '0')}` });
      }
      this.anims.create({ key: 'pre-start-cutscene', frames: preStartFrames, frameRate: 12, repeat: 0 });

      const introTutFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < INTRO_TO_TUT_FRAME_COUNT; i++) {
        introTutFrames.push({ key: `intro-tut-${String(i).padStart(5, '0')}` });
      }
      this.anims.create({ key: 'intro-tut-cutscene', frames: introTutFrames, frameRate: 12, repeat: 0 });
    }

    // Player start animation (plays once before ride loop)
    this.anims.create({
      key: 'player-start',
      frames: this.anims.generateFrameNumbers('player-start', { start: 0, end: TUNING.START_ANIM_FRAMES - 1 }),
      frameRate: TUNING.START_ANIM_FPS,
      repeat: 0,
    });

    // Player ride animation (looping spritesheet)
    this.anims.create({
      key: 'player-ride',
      frames: this.anims.generateFrameNumbers('player-ride', { start: 0, end: TUNING.PLAYER_ANIM_FRAMES - 1 }),
      frameRate: TUNING.PLAYER_RIDE_FPS,
      repeat: -1,
    });

    // Player attack animation (plays once)
    this.anims.create({
      key: 'player-attack',
      frames: this.anims.generateFrameNumbers('player-attack', { start: 0, end: TUNING.PLAYER_ATTACK_ANIM_FRAMES - 1 }),
      frameRate: TUNING.PLAYER_ATTACK_FPS,
      repeat: 0,
    });

    // Player rocket launcher animation (plays once)
    this.anims.create({
      key: 'player-rocket-launch',
      frames: this.anims.generateFrameNumbers('player-rocket-launch', { start: 0, end: TUNING.ROCKET_LAUNCHER_ANIM_FRAMES - 1 }),
      frameRate: TUNING.ROCKET_LAUNCHER_FPS,
      repeat: 0,
    });

    // COL animations (all share same frame layout — rocket, shield, hit)
    for (const key of ['player-collect-rocket', 'player-collect-shield', 'player-collect-hit']) {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: TUNING.COL_ANIM_FRAMES - 1 }),
        frameRate: TUNING.COL_FPS * TUNING.COL_SPEED,
        repeat: 0,
      });
    }

    // Rocket projectile — intro plays full sequence once, then loops from frame LOOP_START
    this.anims.create({
      key: 'rocket-proj-intro',
      frames: this.anims.generateFrameNumbers('rocket-projectile', { start: 0, end: TUNING.ROCKET_PROJ_FRAMES - 1 }),
      frameRate: TUNING.ROCKET_PROJ_FPS,
      repeat: 0,
    });
    this.anims.create({
      key: 'rocket-proj-loop',
      frames: this.anims.generateFrameNumbers('rocket-projectile', { start: TUNING.ROCKET_PROJ_LOOP_START, end: TUNING.ROCKET_PROJ_FRAMES - 1 }),
      frameRate: TUNING.ROCKET_PROJ_FPS,
      repeat: -1,
    });

    // Powered-up intro (full sequence, plays once)
    this.anims.create({
      key: 'player-powered-intro',
      frames: this.anims.generateFrameNumbers('player-powered', { start: 0, end: TUNING.POWERED_ANIM_FRAMES - 1 }),
      frameRate: TUNING.POWERED_FPS,
      repeat: 0,
    });

    // Powered-up loop (last 4 frames, loops)
    this.anims.create({
      key: 'player-powered-loop',
      frames: this.anims.generateFrameNumbers('player-powered', { start: TUNING.POWERED_LOOP_START, end: TUNING.POWERED_ANIM_FRAMES - 1 }),
      frameRate: TUNING.POWERED_FPS,
      repeat: -1,
    });

    // Speed-up intro
    this.anims.create({
      key: 'player-speedup-intro',
      frames: this.anims.generateFrameNumbers('player-speedup', { start: 0, end: TUNING.SPEEDUP_INTRO_END }),
      frameRate: TUNING.SPEEDUP_FPS,
      repeat: 0,
    });

    // Speed-up loop
    this.anims.create({
      key: 'player-speedup-loop',
      frames: this.anims.generateFrameNumbers('player-speedup', { start: TUNING.SPEEDUP_LOOP_START, end: TUNING.SPEEDUP_LOOP_END }),
      frameRate: TUNING.SPEEDUP_FPS,
      repeat: -1,
    });

    // Speed-up outro
    this.anims.create({
      key: 'player-speedup-outro',
      frames: this.anims.generateFrameNumbers('player-speedup', { start: TUNING.SPEEDUP_OUTRO_START, end: TUNING.SPEEDUP_OUTRO_END }),
      frameRate: TUNING.SPEEDUP_FPS,
      repeat: 0,
    });

    // Car drive animations (all 20 cars, mobile uses half-res sheets)
    for (let c = 1; c <= TUNING.CAR_COUNT; c++) {
      const key = `car-${String(c).padStart(3, '0')}`;
      this.anims.create({
        key: `${key}-drive`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: TUNING.CAR_ANIM_FRAMES - 1 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    // Tutorial animations — desktop only (mobile shows static first frame)
    if (!GAME_MODE.mobileMode) {
      const tutControlsFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < TUNING.TUTORIAL_CONTROLS_FRAMES; i++) {
        tutControlsFrames.push({ key: `tutorial-controls-${String(i).padStart(2, '0')}` });
      }
      this.anims.create({ key: 'tutorial-controls', frames: tutControlsFrames, frameRate: 12, repeat: -1 });

      const tutRageFrames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < TUNING.TUTORIAL_RAGE_FRAMES; i++) {
        tutRageFrames.push({ key: `tutorial-rage-${i}` });
      }
      this.anims.create({ key: 'tutorial-rage', frames: tutRageFrames, frameRate: 12, repeat: -1 });
    }

    // Explosion animation (plays once at 12fps)
    this.anims.create({
      key: 'explosion-play',
      frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: TUNING.EXPLOSION_ANIM_FRAMES - 1 }),
      frameRate: 12,
      repeat: 0,
    });

    // Slash VFX animation (frames 1-7, skipping blank frame 0)
    this.anims.create({
      key: 'slash-vfx-play',
      frames: this.anims.generateFrameNumbers('slash-vfx', {
        start: 1,
        end: TUNING.SLASH_VFX_FRAMES,
      }),
      frameRate: TUNING.SLASH_VFX_BASE_FPS * TUNING.SLASH_VFX_SPEED,
      repeat: 0,
    });

    // Rocket launcher pickup animation (looping spritesheet)
    this.anims.create({
      key: 'pickup-rocket-anim',
      frames: this.anims.generateFrameNumbers('pickup-rocket', { start: 0, end: TUNING.PICKUP_ANIM_FRAMES - 1 }),
      frameRate: TUNING.PICKUP_ANIM_FPS * TUNING.PICKUP_ANIM_SPEED,
      repeat: -1,
    });

    // Soft feathered glow texture for pickup (concentric circles = radial gradient)
    const glowSize = 256;
    const glowGfx = this.add.graphics();
    const glowSteps = 24;
    for (let i = 0; i < glowSteps; i++) {
      const ratio = 1 - i / glowSteps;
      glowGfx.fillStyle(0xffff00, 0.04);
      glowGfx.fillCircle(glowSize / 2, glowSize / 2, ratio * glowSize / 2);
    }
    glowGfx.generateTexture('pickup-glow', glowSize, glowSize);
    glowGfx.destroy();

    // Shield pickup animation (looping spritesheet)
    this.anims.create({
      key: 'pickup-shield-anim',
      frames: this.anims.generateFrameNumbers('pickup-shield', { start: 0, end: TUNING.SHIELD_ANIM_FRAMES - 1 }),
      frameRate: TUNING.SHIELD_ANIM_FPS * TUNING.SHIELD_ANIM_SPEED,
      repeat: -1,
    });

    // Soft feathered red glow texture for shield pickup
    const shieldGlowGfx = this.add.graphics();
    for (let i = 0; i < glowSteps; i++) {
      const ratio = 1 - i / glowSteps;
      shieldGlowGfx.fillStyle(0xff0000, 0.04);
      shieldGlowGfx.fillCircle(glowSize / 2, glowSize / 2, ratio * glowSize / 2);
    }
    shieldGlowGfx.generateTexture('shield-glow', glowSize, glowSize);
    shieldGlowGfx.destroy();

    // Soft feathered glow for rocket lane targeting (tight core, fast falloff)
    // Uses cubic falloff: brightness = (1 - r)^3 — hot center, drops quickly, long soft tail.
    const rocketGlowGfx = this.add.graphics();
    const rocketGlowSteps = TUNING.ROCKET_GLOW_STEPS;
    const peak = TUNING.ROCKET_GLOW_STEP_ALPHA * rocketGlowSteps;
    for (let i = 0; i < rocketGlowSteps; i++) {
      const radius = 1 - i / rocketGlowSteps; // 1.0 (outermost) → ~0 (innermost)
      // Target accumulated brightness: cubic falloff from center
      const bHere = peak * (1 - radius) * (1 - radius) * (1 - radius);
      const prevR = (i > 0) ? 1 - (i - 1) / rocketGlowSteps : 1.0;
      const bPrev = peak * (1 - prevR) * (1 - prevR) * (1 - prevR);
      const ringAlpha = Math.min(Math.max(bHere - bPrev, 0), 1);
      rocketGlowGfx.fillStyle(0xffffff, ringAlpha);
      rocketGlowGfx.fillCircle(glowSize / 2, glowSize / 2, radius * glowSize / 2);
    }
    rocketGlowGfx.generateTexture('rocket-lane-glow', glowSize, glowSize);
    rocketGlowGfx.destroy();

    // Rocket projectile spritesheet — loaded in preload(), animations created here

    // Force-load custom fonts before transitioning (browser won't load them until something uses them)
    await Promise.all([
      document.fonts.load('48px "Early GameBoy"'),
      document.fonts.load('24px "Alagard"'),
    ]);

    await ensureAnonUser();
    this.scene.start('GameScene');
  }
}
