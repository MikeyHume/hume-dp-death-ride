import { TUNING } from '../config/tuning';

export class ScoreSystem {
  private score: number = 0;

  update(dt: number, playerSpeed: number): void {
    // Base distance score + speed bonus multiplier
    const speedMultiplier = 1 + playerSpeed * TUNING.SCORE_SPEED_MULTIPLIER;
    this.score += TUNING.SCORE_DISTANCE_RATE * speedMultiplier * dt;
  }

  addBonus(points: number): void {
    this.score += points;
  }

  getScore(): number {
    return Math.floor(this.score);
  }

  reset(): void {
    this.score = 0;
  }
}
