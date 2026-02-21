/**
 * CourseRunner — drives time-based obstacle spawning from pre-computed course JSON.
 * In rhythm mode, replaces the timer-based ObstacleSystem spawning.
 *
 * Lead times are computed per-type so obstacles arrive at the kill zone on-beat:
 *  - CRASH/SLOW/pickups: normalLeadTime = travelDist / roadSpeed
 *  - CAR: carLeadTime = travelDist / (roadSpeed * (1 - CAR_SPEED_FACTOR))
 *  - car_crash_beat: pre-computed per-event lead stored in event.lead
 */

import { TUNING } from '../config/tuning';

export interface CourseEvent {
  t: number;    // seconds into the song when this event should "hit"
  lane: number; // 0-3 (top to bottom)
  type: string; // 'crash' | 'car' | 'slow' | 'pickup_ammo' | 'pickup_shield' | 'car_crash_beat' | 'guardian' | 'enemy_car'
  lead?: number; // optional pre-computed lead time (used by car_crash_beat)
}

export interface CourseData {
  spotify_track_id: string;
  difficulty: string;
  name: string;
  duration_s: number;
  bpm: number;
  version: number;
  seed: number;
  score: Record<string, number>;
  attempts: number;
  events: CourseEvent[];
}

export class CourseRunner {
  private events: CourseEvent[];
  private durationSec: number;
  private nextIdx = 0;
  private onSpawn: (event: CourseEvent) => void;
  private active = false;
  private normalLeadTime: number;
  private carLeadTime: number;
  private enemyCarLeadTime: number;

  constructor(
    data: CourseData,
    onSpawn: (event: CourseEvent) => void,
    roadSpeed: number,
    killZoneX: number,
    spawnMargin: number,
  ) {
    this.events = data.events;
    this.durationSec = data.duration_s;
    this.onSpawn = onSpawn;

    const spawnX = TUNING.GAME_WIDTH + spawnMargin;
    const dist = spawnX - killZoneX;
    this.normalLeadTime = dist / roadSpeed;
    this.carLeadTime = dist / (roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR));
    // Enemy cars timed to reach sweet spot (center), not kill zone
    const enemyDist = spawnX - TUNING.RHYTHM_SWEET_SPOT_X;
    this.enemyCarLeadTime = enemyDist / (roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR));
  }

  start(): void {
    this.nextIdx = 0;
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  /** Call each frame with current music playback position in seconds. */
  update(playbackSec: number): void {
    if (!this.active) return;

    while (this.nextIdx < this.events.length) {
      const ev = this.events[this.nextIdx];
      // Per-type lead times: car_crash_beat uses pre-computed lead, enemy_car targets sweet spot
      let lead: number;
      if (ev.lead != null) lead = ev.lead;
      else if (ev.type === 'enemy_car') lead = this.enemyCarLeadTime;
      else if (ev.type === 'car') lead = this.carLeadTime;
      else lead = this.normalLeadTime;
      if (ev.t > playbackSec + lead) break;
      this.onSpawn(ev);
      this.nextIdx++;
    }
  }

  /** True when all events have been dispatched and playback is past the song end. */
  isComplete(playbackSec: number): boolean {
    return this.nextIdx >= this.events.length && playbackSec >= this.durationSec;
  }

  /** 0-1 progress through the song. */
  getProgress(playbackSec: number): number {
    return this.durationSec > 0 ? Math.min(playbackSec / this.durationSec, 1) : 0;
  }

  getDurationSec(): number {
    return this.durationSec;
  }

  reset(): void {
    this.nextIdx = 0;
    this.active = false;
  }
}

/**
 * Load a pre-computed course JSON from public/courses/{trackId}/{difficulty}.json
 */
export async function loadCourseData(trackId: string, difficulty: string): Promise<CourseData | null> {
  try {
    const url = `courses/${trackId}/${difficulty}.json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
