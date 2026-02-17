import { TUNING } from '../config/tuning';

const enum TDilState { IDLE, RAMP_DOWN, HOLD, RAMP_UP }

export class TimeDilationSystem {
  private state: TDilState = TDilState.IDLE;
  private timer: number = 0;
  private scale: number = 1;

  /** Trigger the slow-mo sequence. Safe to call mid-sequence (restarts ramp-down). */
  trigger(): void {
    this.state = TDilState.RAMP_DOWN;
    this.timer = 0;
  }

  /** Advance using REAL (unscaled) dt so durations are wall-clock predictable. */
  update(realDt: number): void {
    if (this.state === TDilState.IDLE) return;

    this.timer += realDt;

    switch (this.state) {
      case TDilState.RAMP_DOWN: {
        const t = Math.min(this.timer / TUNING.TDIL_RAMP_DOWN_DURATION, 1);
        const eased = Math.pow(t, TUNING.TDIL_RAMP_DOWN_EASE);
        this.scale = 1 - eased * (1 - TUNING.TDIL_MIN_SCALE);
        if (t >= 1) {
          this.state = TDilState.HOLD;
          this.timer = 0;
          this.scale = TUNING.TDIL_MIN_SCALE;
        }
        break;
      }
      case TDilState.HOLD: {
        this.scale = TUNING.TDIL_MIN_SCALE;
        if (this.timer >= TUNING.TDIL_HOLD_DURATION) {
          this.state = TDilState.RAMP_UP;
          this.timer = 0;
        }
        break;
      }
      case TDilState.RAMP_UP: {
        const t = Math.min(this.timer / TUNING.TDIL_RAMP_UP_DURATION, 1);
        const eased = Math.pow(t, TUNING.TDIL_RAMP_UP_EASE);
        this.scale = TUNING.TDIL_MIN_SCALE + eased * (1 - TUNING.TDIL_MIN_SCALE);
        if (t >= 1) {
          this.state = TDilState.IDLE;
          this.scale = 1;
        }
        break;
      }
    }
  }

  /** Global time scale (1.0 = normal, TDIL_MIN_SCALE = max slow). */
  getScale(): number {
    return this.scale;
  }

  /** Vertical movement scale — blended toward real-time via TDIL_VERTICAL_BLEND. */
  getVerticalScale(): number {
    return this.scale + (1 - this.scale) * TUNING.TDIL_VERTICAL_BLEND;
  }

  /** Music playback rate, clamped to YouTube API floor. */
  getMusicRate(): number {
    return Math.max(TUNING.TDIL_MUSIC_MIN_RATE, this.scale);
  }

  /** True when any dilation phase is active (not idle). */
  isActive(): boolean {
    return this.state !== TDilState.IDLE;
  }

  reset(): void {
    this.state = TDilState.IDLE;
    this.timer = 0;
    this.scale = 1;
  }
}
