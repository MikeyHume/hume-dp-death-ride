import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ensureAnonUser } from '../systems/AuthSystem';

const TITLE_LOOP_FRAME_COUNT = 27;
const TITLE_START_FRAME_COUNT = 25;
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Report real load progress to the boot overlay (clamped 0..0.9)
    this.load.on('progress', (value: number) => {
      (window as any).__bootOverlay?.setProgress?.(value);
    });
    for (let i = 0; i < TITLE_LOOP_FRAME_COUNT; i++) {
      const idx = String(i).padStart(2, '0');
      this.load.image(`start-loop-${idx}`, `assets/start/start_loop/DP_Death_Ride_Title_Loop${idx}.jpg`);
    }
    for (let i = 0; i < TITLE_START_FRAME_COUNT; i++) {
      const idx = String(i).padStart(2, '0');
      this.load.image(`start-play-${idx}`, `assets/start/start_play/DP_Death_Ride_Title_Start${idx}.jpg`);
    }
    this.load.spritesheet('player-ride', 'assets/dp_player/dp_moto_v03.png', {
      frameWidth: TUNING.PLAYER_FRAME_WIDTH,
      frameHeight: TUNING.PLAYER_FRAME_HEIGHT,
    });
    this.load.spritesheet('player-attack', 'assets/dp_player/dp_attack.png', {
      frameWidth: TUNING.PLAYER_ATTACK_FRAME_WIDTH,
      frameHeight: TUNING.PLAYER_ATTACK_FRAME_HEIGHT,
    });
    this.load.spritesheet('player-powered', 'assets/dp_player/dp_powered_up.png', {
      frameWidth: TUNING.POWERED_FRAME_WIDTH,
      frameHeight: TUNING.POWERED_FRAME_HEIGHT,
    });
    this.load.spritesheet('player-speedup', 'assets/dp_player/dp_speed_up.png', {
      frameWidth: TUNING.SPEEDUP_FRAME_WIDTH,
      frameHeight: TUNING.SPEEDUP_FRAME_HEIGHT,
    });
    this.load.spritesheet('player-rocket-launch', 'assets/dp_player/dp_rocket_lancher_v2.png', {
      frameWidth: TUNING.ROCKET_LAUNCHER_FRAME_WIDTH,
      frameHeight: TUNING.ROCKET_LAUNCHER_FRAME_HEIGHT,
    });
    this.load.audio('title-music', 'assets/audio/music/red malibu 1.5.wav');
    this.load.audio('countdown-music', 'assets/audio/music/hell_girl_countdown.mp3');
    this.load.audio('sfx-click', 'assets/audio/sfx/mouse click.mp3');
    this.load.audio('sfx-hover', 'assets/audio/sfx/mouse hover.mp3');
    this.load.image('play-music-overlay', 'assets/start/play_music.png');
    this.load.image('obstacle-crash', 'assets/obstacles/road_barrier_01.png');
    this.load.image('road-img', 'assets/background/road.jpg');
    this.load.image('sky-img', 'assets/background/sky.jpg');
    this.load.image('buildings-back', 'assets/background/buildings_back_row_dark.png');
    this.load.image('buildings-front', 'assets/background/buildings_Front_row_dark.png');
    this.load.image('buildings-big', 'assets/background/buildings_Front_row_dark.png');
    this.load.image('railing', 'assets/background/railing_dark.jpg');

    // Car sprite sheets (20 animated cars)
    for (let c = 1; c <= TUNING.CAR_COUNT; c++) {
      const key = `car-${String(c).padStart(3, '0')}`;
      this.load.spritesheet(key, `assets/cars/car_${String(c).padStart(3, '0')}.png`, {
        frameWidth: TUNING.CAR_FRAME_WIDTH,
        frameHeight: TUNING.CAR_FRAME_HEIGHT,
      });
    }

    // Explosion sprite sheet
    this.load.spritesheet('explosion', 'assets/vfx/vfx_explosion.png', {
      frameWidth: TUNING.EXPLOSION_FRAME_SIZE,
      frameHeight: TUNING.EXPLOSION_FRAME_SIZE,
    });

    // Slash VFX sprite sheet (8 frames horizontal strip, frame 0 is blank)
    this.load.spritesheet('slash-vfx', 'assets/vfx/slash.png', {
      frameWidth: TUNING.SLASH_VFX_FRAME_WIDTH,
      frameHeight: TUNING.SLASH_VFX_FRAME_HEIGHT,
    });

    // Countdown sprite sheet (3×2 grid, 600×600 per frame, last frame blank)
    this.load.spritesheet('countdown', 'assets/start/countdown.png', {
      frameWidth: TUNING.COUNTDOWN_FRAME_SIZE,
      frameHeight: TUNING.COUNTDOWN_FRAME_SIZE,
    });

    // UI assets
    this.load.image('spotify-text-logo', 'ui/spotify_text_logo_.png');
    this.load.image('sign-in', 'ui/sign_in.png');
    this.load.image('cursor', 'ui/cursor.png');
    this.load.image('ui-skip', 'ui/skip.png');
    this.load.image('ui-unmuted', 'ui/unmuted.png');
    this.load.image('ui-muted', 'ui/muted.png');
    this.load.image('ui-insta', 'ui/insta.png');

    // Tutorial assets
    this.load.image('tutorial-skip', 'assets/tutorial/skip_v02.png');
    this.load.image('tutorial-blank', 'assets/tutorial/how_to_play_v2.jpg');
    this.load.image('tutorial-obstacles', 'assets/tutorial/tut_v2/rules_v2.jpg');
    for (let i = 0; i < TUNING.TUTORIAL_CONTROLS_FRAMES; i++) {
      const idx = String(i).padStart(2, '0');
      const fileIdx = String(i).padStart(5, '0');
      this.load.image(`tutorial-controls-${idx}`, `assets/tutorial/controls_v4/controls_v4__${fileIdx}.jpg`);
    }
    for (let i = 0; i < TUNING.TUTORIAL_RAGE_FRAMES; i++) {
      this.load.image(`tutorial-rage-${i}`, `assets/tutorial/tut_v2/rage_v2/rage_v2_${i}.jpg`);
    }
  }

  async create() {
    // Title loop animation (from loaded image sequence)
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < TITLE_LOOP_FRAME_COUNT; i++) {
      frames.push({ key: `start-loop-${String(i).padStart(2, '0')}` });
    }
    this.anims.create({
      key: 'title-loop',
      frames,
      frameRate: 12,
      repeat: -1,
    });

    // Start play animation (plays once after spacebar)
    const startFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < TITLE_START_FRAME_COUNT; i++) {
      startFrames.push({ key: `start-play-${String(i).padStart(2, '0')}` });
    }
    this.anims.create({
      key: 'title-start',
      frames: startFrames,
      frameRate: 12,
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

    // Slow obstacle (blue, single tile — stretched via setDisplaySize at spawn)
    const slowGfx = this.add.graphics();
    slowGfx.fillStyle(TUNING.SLOW_COLOR);
    slowGfx.fillRect(0, 0, TUNING.SLOW_TILE_SIZE, TUNING.SLOW_TILE_SIZE);
    slowGfx.generateTexture('obstacle-slow', TUNING.SLOW_TILE_SIZE, TUNING.SLOW_TILE_SIZE);
    slowGfx.destroy();

    // Car drive animations (20 sprite sheets, 59 usable frames each at 12fps)
    for (let c = 1; c <= TUNING.CAR_COUNT; c++) {
      const key = `car-${String(c).padStart(3, '0')}`;
      this.anims.create({
        key: `${key}-drive`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: TUNING.CAR_ANIM_FRAMES - 1 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    // Tutorial controls animation (29 frames, 12fps, loops)
    const tutControlsFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < TUNING.TUTORIAL_CONTROLS_FRAMES; i++) {
      tutControlsFrames.push({ key: `tutorial-controls-${String(i).padStart(2, '0')}` });
    }
    this.anims.create({
      key: 'tutorial-controls',
      frames: tutControlsFrames,
      frameRate: 12,
      repeat: -1,
    });

    // Tutorial rage animation (4 frames, 12fps, loops)
    const tutRageFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 0; i < TUNING.TUTORIAL_RAGE_FRAMES; i++) {
      tutRageFrames.push({ key: `tutorial-rage-${i}` });
    }
    this.anims.create({
      key: 'tutorial-rage',
      frames: tutRageFrames,
      frameRate: 12,
      repeat: -1,
    });

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

    // Rocket launcher pickup (large yellow circle)
    const pickupGfx = this.add.graphics();
    pickupGfx.fillStyle(TUNING.PICKUP_COLOR, 0.8);
    pickupGfx.fillCircle(TUNING.PICKUP_DIAMETER / 2, TUNING.PICKUP_DIAMETER / 2, TUNING.PICKUP_DIAMETER / 2);
    pickupGfx.lineStyle(3, 0xffaa00, 1);
    pickupGfx.strokeCircle(TUNING.PICKUP_DIAMETER / 2, TUNING.PICKUP_DIAMETER / 2, TUNING.PICKUP_DIAMETER / 2);
    pickupGfx.generateTexture('pickup-rocket', TUNING.PICKUP_DIAMETER, TUNING.PICKUP_DIAMETER);
    pickupGfx.destroy();

    // Shield pickup (green sphere placeholder)
    const shieldGfx = this.add.graphics();
    shieldGfx.fillStyle(TUNING.SHIELD_COLOR, 0.8);
    shieldGfx.fillCircle(TUNING.SHIELD_DIAMETER / 2, TUNING.SHIELD_DIAMETER / 2, TUNING.SHIELD_DIAMETER / 2);
    shieldGfx.lineStyle(3, 0x00aa00, 1);
    shieldGfx.strokeCircle(TUNING.SHIELD_DIAMETER / 2, TUNING.SHIELD_DIAMETER / 2, TUNING.SHIELD_DIAMETER / 2);
    shieldGfx.generateTexture('pickup-shield', TUNING.SHIELD_DIAMETER, TUNING.SHIELD_DIAMETER);
    shieldGfx.destroy();

    // Rocket projectile (small yellow ellipse)
    const rocketGfx = this.add.graphics();
    rocketGfx.fillStyle(TUNING.ROCKET_COLOR);
    rocketGfx.fillEllipse(TUNING.ROCKET_DISPLAY_W / 2, TUNING.ROCKET_DISPLAY_H / 2, TUNING.ROCKET_DISPLAY_W, TUNING.ROCKET_DISPLAY_H);
    rocketGfx.generateTexture('rocket-projectile', TUNING.ROCKET_DISPLAY_W, TUNING.ROCKET_DISPLAY_H);
    rocketGfx.destroy();

    // Force-load custom fonts before transitioning (browser won't load them until something uses them)
    await Promise.all([
      document.fonts.load('48px "Early GameBoy"'),
      document.fonts.load('24px "Alagard"'),
    ]);

    await ensureAnonUser();
    this.scene.start('GameScene');
  }
}
