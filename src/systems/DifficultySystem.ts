import { TUNING } from '../config/tuning';

export class DifficultySystem {
  private elapsed: number = 0;

  update(dt: number): void {
    this.elapsed += dt;
  }

  /** Returns 0..1 representing current difficulty */
  getFactor(): number {
    return Math.min(this.elapsed / TUNING.DIFFICULTY_RAMP_DURATION, 1);
  }

  reset(): void {
    this.elapsed = 0;
  }
}
