import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class AudioSystem {
  private scene: Phaser.Scene;
  private ctx: AudioContext | null = null;
  private started: boolean = false;

  // Engine sample playback
  private engineSound: Phaser.Sound.BaseSound | null = null;
  private enginePlaying: boolean = false;
  private distortionAmount: number = 0;
  private revBurst: number = 0;
  private wasSpaceHeld: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Must be called from a user gesture (e.g. first Space press) */
  start(): void {
    if (this.started) return;
    this.started = true;

    try {
      this.ctx = new AudioContext();
    } catch (e) {
      console.warn('AudioSystem: AudioContext creation failed', e);
    }

    // Start the engine sample loop
    this.startEngineLoop();
  }

  /** Start looping motorcycle engine sample */
  private startEngineLoop(): void {
    if (!this.scene.cache.audio.exists('sfx-engine')) return;

    this.engineSound = this.scene.sound.add('sfx-engine', {
      loop: true,
      volume: TUNING.ENGINE_SAMPLE_IDLE_VOLUME,
      rate: TUNING.ENGINE_IDLE_RATE,
    });
    this.engineSound.play();
    this.enginePlaying = true;
  }

  /** Update engine pitch + volume based on player speed and input */
  updateEngine(playerSpeed: number, roadSpeed: number, spaceHeld: boolean): void {
    if (!this.engineSound || !this.enginePlaying) return;

    // Detect space press edge → trigger rev burst
    if (spaceHeld && !this.wasSpaceHeld) {
      this.revBurst = 1;
    }
    this.wasSpaceHeld = spaceHeld;

    // Decay rev burst (~0.25s at default decay=4)
    if (this.revBurst > 0) {
      this.revBurst = Math.max(0, this.revBurst - TUNING.ENGINE_REV_DECAY * (1 / 60));
    }

    const maxSpeed = roadSpeed * TUNING.MAX_SPEED_MULTIPLIER;
    const speedRatio = maxSpeed > 0 ? Math.min(playerSpeed / maxSpeed, 1) : 0;

    let targetRate: number;
    let targetVol: number;

    if (spaceHeld || playerSpeed > 0) {
      // Active engine: playback rate and volume scale with speed
      targetRate = TUNING.ENGINE_IDLE_RATE + speedRatio * (TUNING.ENGINE_MAX_RATE - TUNING.ENGINE_IDLE_RATE);
      targetVol = TUNING.ENGINE_SAMPLE_IDLE_VOLUME + speedRatio * (TUNING.ENGINE_SAMPLE_VOLUME - TUNING.ENGINE_SAMPLE_IDLE_VOLUME);
    } else {
      // Idle: low pitch, quiet
      targetRate = TUNING.ENGINE_IDLE_RATE;
      targetVol = TUNING.ENGINE_SAMPLE_IDLE_VOLUME;
    }

    // Rev burst: instant spike on tap that decays
    targetRate += this.revBurst * TUNING.ENGINE_REV_RATE_BOOST;
    targetVol += this.revBurst * TUNING.ENGINE_REV_VOL_BOOST;

    // Rage/boost: higher pitch, louder, meaner
    targetRate += this.distortionAmount * TUNING.ENGINE_RAGE_RATE_BOOST;
    targetVol *= (1 + this.distortionAmount * 1.5);

    // Smooth toward targets
    const s = TUNING.ENGINE_SMOOTHING;
    const snd = this.engineSound as any;
    const curRate = snd.rate ?? TUNING.ENGINE_IDLE_RATE;
    const curVol = snd.volume ?? TUNING.ENGINE_SAMPLE_IDLE_VOLUME;

    snd.setRate(curRate + (targetRate - curRate) * s);
    snd.setVolume(curVol + (targetVol - curVol) * s);
  }

  /** Set engine distortion/rage intensity (0 = clean, 1 = full rage) */
  setDistortion(amount: number): void {
    this.distortionAmount = amount;
  }

  /** Rocket launch sound from audio file */
  playRocketLaunch(): void {
    if (this.scene.cache.audio.exists('sfx-rocket-fire')) {
      this.scene.sound.play('sfx-rocket-fire', { volume: TUNING.SFX_ROCKET_FIRE_VOLUME });
    }
  }

  /** Silence engine (death / title screen) */
  silenceEngine(): void {
    if (!this.engineSound || !this.enginePlaying) return;
    (this.engineSound as any).setVolume(0);
  }

  /** Explosion sound from audio file */
  playExplosion(): void {
    if (this.scene.cache.audio.exists('sfx-explode')) {
      this.scene.sound.play('sfx-explode', { volume: TUNING.SFX_EXPLODE_VOLUME });
    }
  }

  /** Ammo pickup sound */
  playAmmoPickup(): void {
    if (this.scene.cache.audio.exists('sfx-ammo-pickup')) {
      this.scene.sound.play('sfx-ammo-pickup', { volume: TUNING.SFX_EXPLODE_VOLUME });
    }
  }

  /** Obstacle killed by slash sound */
  playObstacleKill(): void {
    if (this.scene.cache.audio.exists('sfx-obstacle-kill')) {
      this.scene.sound.play('sfx-obstacle-kill', { volume: TUNING.SFX_EXPLODE_VOLUME });
    }
  }

  /** Potion/shield pickup sound */
  playPotionPickup(): void {
    if (this.scene.cache.audio.exists('sfx-potion-pickup')) {
      this.scene.sound.play('sfx-potion-pickup', { volume: TUNING.SFX_EXPLODE_VOLUME });
    }
  }

  /** Potion/shield consumed on hit sound */
  playPotionUsed(): void {
    if (this.scene.cache.audio.exists('sfx-potion-used')) {
      this.scene.sound.play('sfx-potion-used', { volume: TUNING.SFX_EXPLODE_VOLUME });
    }
  }

  /** Katana whoosh sound */
  playSlash(): void {
    if (!this.ctx) return;

    // High-frequency noise sweep for a blade whoosh
    const length = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Bandpass-like sweep: envelope peaks in middle, noise filtered by sine
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * (1 - t * 0.5);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = TUNING.KATANA_SLASH_VOLUME;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  /** Short noise burst for crash / death impact */
  playImpact(): void {
    if (!this.ctx) return;

    // White noise buffer
    const length = Math.floor(this.ctx.sampleRate * TUNING.IMPACT_DURATION);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length); // decaying noise
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = TUNING.IMPACT_VOLUME;

    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  destroy(): void {
    if (this.engineSound) {
      this.engineSound.stop();
      this.engineSound.destroy();
    }
    if (this.ctx) {
      this.ctx.close();
    }
  }
}
