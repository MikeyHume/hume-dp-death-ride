import { GAME_MODE, QualityTier } from '../config/gameMode';

const SAMPLE_COUNT = 120;       // ~2s at 60fps
const DOWNGRADE_HOLD = 2;       // seconds below threshold before downgrade
const UPGRADE_HOLD = 5;         // seconds above threshold before upgrade
const COOLDOWN_AFTER_CHANGE = 10; // seconds before considering another change

const THRESHOLD_LOW = 50;       // avg FPS below this → 'low'
const THRESHOLD_MEDIUM = 57;    // avg FPS below this → 'medium'
const THRESHOLD_UPGRADE = 58;   // avg FPS above this to consider upgrade

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

    const current = GAME_MODE.quality;

    // Check downgrade
    if (current !== 'low') {
      const threshold = current === 'high' ? THRESHOLD_MEDIUM : THRESHOLD_LOW;
      if (this.avg < threshold) {
        this.belowTimer += dt;
        this.aboveTimer = 0;
        if (this.belowTimer >= DOWNGRADE_HOLD) {
          this.setQuality(current === 'high' ? 'medium' : 'low');
        }
      } else {
        this.belowTimer = 0;
      }
    }

    // Check upgrade
    if (current !== 'high') {
      if (this.avg > THRESHOLD_UPGRADE) {
        this.aboveTimer += dt;
        this.belowTimer = 0;
        if (this.aboveTimer >= UPGRADE_HOLD) {
          this.setQuality(current === 'low' ? 'medium' : 'high');
        }
      } else {
        this.aboveTimer = 0;
      }
    }
  }

  private setQuality(tier: QualityTier): void {
    GAME_MODE.quality = tier;
    this.belowTimer = 0;
    this.aboveTimer = 0;
    this.cooldown = COOLDOWN_AFTER_CHANGE;
    console.log(`PerfSystem: quality → ${tier} (avg ${this.avg.toFixed(1)} FPS)`);
  }

  getQuality(): QualityTier {
    return GAME_MODE.quality;
  }

  getFps(): number {
    return this.avg;
  }
}
