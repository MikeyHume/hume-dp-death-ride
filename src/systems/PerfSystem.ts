import { GAME_MODE } from '../config/gameMode';
import type { DeviceTier } from '../util/device';

const SAMPLE_COUNT = 120;       // ~2s at 60fps
const DOWNGRADE_HOLD = 2;       // seconds below threshold before downgrade
const UPGRADE_HOLD = 5;         // seconds above threshold before upgrade
const COOLDOWN_AFTER_CHANGE = 10; // seconds before considering another change

const THRESHOLD_LOW = 50;       // avg FPS below this → downgrade
const THRESHOLD_UPGRADE = 58;   // avg FPS above this to consider upgrade

/** Ordered from highest to lowest — PerfSystem walks this chain. */
const TIER_CHAIN: DeviceTier[] = ['desktop', 'tablet', 'phone-high', 'gen-mobile', 'phone-low'];

export class PerfSystem {
  private samples: number[] = [];
  private sampleIndex = 0;
  private filled = false;

  private belowTimer = 0;       // seconds spent below current threshold
  private aboveTimer = 0;       // seconds spent above upgrade threshold
  private cooldown = 0;         // seconds remaining before next quality change

  private avg = 60;

  update(dt: number): void {
    // Record frame time as instantaneous FPS
    const fps = dt > 0 ? 1 / dt : 60;
    if (this.samples.length < SAMPLE_COUNT) {
      this.samples.push(fps);
    } else {
      this.samples[this.sampleIndex] = fps;
    }
    this.sampleIndex = (this.sampleIndex + 1) % SAMPLE_COUNT;
    if (this.samples.length >= SAMPLE_COUNT) this.filled = true;

    if (!this.filled) return;

    // Compute rolling average
    let sum = 0;
    for (let i = 0; i < SAMPLE_COUNT; i++) sum += this.samples[i];
    this.avg = sum / SAMPLE_COUNT;

    // Cooldown
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.belowTimer = 0;
      this.aboveTimer = 0;
      return;
    }

    const currentIdx = TIER_CHAIN.indexOf(GAME_MODE.renderTier);

    // Check downgrade (can't go lower than phone-low)
    if (currentIdx < TIER_CHAIN.length - 1) {
      if (this.avg < THRESHOLD_LOW) {
        this.belowTimer += dt;
        this.aboveTimer = 0;
        if (this.belowTimer >= DOWNGRADE_HOLD) {
          this.setRenderTier(TIER_CHAIN[currentIdx + 1]);
        }
      } else {
        this.belowTimer = 0;
      }
    }

    // Check upgrade (can't go higher than desktop)
    if (currentIdx > 0) {
      if (this.avg > THRESHOLD_UPGRADE) {
        this.aboveTimer += dt;
        this.belowTimer = 0;
        if (this.aboveTimer >= UPGRADE_HOLD) {
          this.setRenderTier(TIER_CHAIN[currentIdx - 1]);
        }
      } else {
        this.aboveTimer = 0;
      }
    }
  }

  private setRenderTier(tier: DeviceTier): void {
    GAME_MODE.renderTier = tier;
    this.belowTimer = 0;
    this.aboveTimer = 0;
    this.cooldown = COOLDOWN_AFTER_CHANGE;
    console.log(`PerfSystem: renderTier → ${tier} (avg ${this.avg.toFixed(1)} FPS)`);
  }

  getRenderTier(): DeviceTier {
    return GAME_MODE.renderTier;
  }

  getFps(): number {
    return this.avg;
  }
}
