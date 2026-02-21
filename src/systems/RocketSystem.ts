import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ObstacleSystem, ObstacleType } from './ObstacleSystem';

export class RocketSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Sprite[] = [];
  private obstacleSystem: ObstacleSystem;

  // Parallel arrays per rocket
  private lanes: number[] = [];
  private ages: number[] = [];
  private glows: Phaser.GameObjects.Image[] = [];

  // Callbacks
  public onHit: ((x: number, y: number, type?: ObstacleType, isEnemy?: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene, obstacleSystem: ObstacleSystem) {
    this.scene = scene;
    this.obstacleSystem = obstacleSystem;

    // Pre-warm rocket pool
    for (let i = 0; i < 10; i++) {
      const rocket = scene.add.sprite(0, 0, 'rocket-projectile');
      rocket.setDisplaySize(TUNING.ROCKET_PROJ_FRAME_W * TUNING.ROCKET_PROJ_SCALE, TUNING.ROCKET_PROJ_FRAME_H * TUNING.ROCKET_PROJ_SCALE);
      rocket.setActive(false).setVisible(false);
      this.pool.push(rocket);
      this.lanes.push(0);
      this.ages.push(0);

      const glow = scene.add.image(0, 0, 'rocket-lane-glow');
      glow.setBlendMode(Phaser.BlendModes.SCREEN);
      glow.setTint(TUNING.ROCKET_GLOW_COLOR);
      glow.setAlpha(TUNING.ROCKET_GLOW_ALPHA);
      glow.setActive(false).setVisible(false);
      this.glows.push(glow);
    }
  }

  /** Fire a rocket from the given position, locked to the specified lane */
  fire(x: number, y: number, lane: number): void {
    let rocket: Phaser.GameObjects.Sprite | null = null;
    let idx = -1;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        rocket = this.pool[i];
        idx = i;
        break;
      }
    }
    if (!rocket) {
      rocket = this.scene.add.sprite(0, 0, 'rocket-projectile');
      rocket.setDisplaySize(TUNING.ROCKET_PROJ_FRAME_W * TUNING.ROCKET_PROJ_SCALE, TUNING.ROCKET_PROJ_FRAME_H * TUNING.ROCKET_PROJ_SCALE);
      idx = this.pool.length;
      this.pool.push(rocket);
      this.lanes.push(0);
      this.ages.push(0);

      const glow = this.scene.add.image(0, 0, 'rocket-lane-glow');
      glow.setBlendMode(Phaser.BlendModes.SCREEN);
      glow.setTint(TUNING.ROCKET_GLOW_COLOR);
      glow.setAlpha(TUNING.ROCKET_GLOW_ALPHA);
      glow.setActive(false).setVisible(false);
      this.glows.push(glow);
    }

    // Scale offset by perspective so it stays proportional at all Y positions
    const pT = Phaser.Math.Clamp(
      (y - TUNING.ROAD_TOP_Y) / (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y),
      0, 1
    );
    const perspScale = TUNING.PLAYER_SCALE_TOP + pT * (TUNING.PLAYER_SCALE_BOTTOM - TUNING.PLAYER_SCALE_TOP);
    rocket.setPosition(x + TUNING.ROCKET_PROJ_OFFSET_X * perspScale, y + TUNING.ROCKET_PROJ_OFFSET_Y * perspScale);
    rocket.setActive(true).setVisible(true);
    rocket.setDepth(y + 0.15);
    this.lanes[idx] = lane;
    this.ages[idx] = 0;

    // Activate lane glow (ellipse centered on lane, follows rocket X)
    const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
    const laneCenterY = TUNING.ROAD_TOP_Y + lane * laneH + laneH / 2;
    const glowH = laneH * perspScale;
    const glowW = glowH * TUNING.ROCKET_GLOW_WIDTH_MULT;
    const glow = this.glows[idx];
    glow.setDisplaySize(glowW, glowH);
    glow.setPosition(rocket.x, laneCenterY);
    glow.setDepth(rocket.y - 0.5);
    glow.setAlpha(TUNING.ROCKET_GLOW_ALPHA);
    glow.setActive(true).setVisible(true);

    // Play intro once, then chain into the loop
    rocket.play('rocket-proj-intro');
    rocket.once('animationcomplete', () => {
      if (rocket!.active) rocket!.play('rocket-proj-loop');
    });
  }

  /** Move rockets right, check lane-based collisions, recycle off-screen */
  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const rocket = this.pool[i];
      if (!rocket.active) continue;

      // Perspective scale based on Y position (same as player)
      const pT = Phaser.Math.Clamp(
        (rocket.y - TUNING.ROAD_TOP_Y) / (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y),
        0, 1
      );
      const perspScale = TUNING.PLAYER_SCALE_TOP + pT * (TUNING.PLAYER_SCALE_BOTTOM - TUNING.PLAYER_SCALE_TOP);
      const baseW = TUNING.ROCKET_PROJ_FRAME_W * TUNING.ROCKET_PROJ_SCALE;
      const baseH = TUNING.ROCKET_PROJ_FRAME_H * TUNING.ROCKET_PROJ_SCALE;
      rocket.setDisplaySize(baseW * perspScale, baseH * perspScale);

      // Move rightward — exponential ramp from 0 to max speed over RAMP_TIME
      this.ages[i] += dt;
      const t = Math.min(this.ages[i] / TUNING.ROCKET_RAMP_TIME, 1);
      const speed = TUNING.ROCKET_SPEED * (t * t);
      rocket.x += speed * dt;

      // Track glow to rocket X
      this.glows[i].setPosition(rocket.x, this.glows[i].y);

      // Recycle if off-screen right
      if (rocket.x > TUNING.GAME_WIDTH + 100) {
        rocket.stop();
        rocket.setActive(false).setVisible(false);
        this.glows[i].setActive(false).setVisible(false);
        continue;
      }

      // Check lane-based collision against obstacles
      const hitResult = this.obstacleSystem.checkLaneProjectileCollision(rocket.x, this.lanes[i]);
      if (hitResult) {
        rocket.stop();
        rocket.setActive(false).setVisible(false);
        this.glows[i].setActive(false).setVisible(false);
        if (this.onHit) this.onHit(hitResult.x, hitResult.y, hitResult.type, hitResult.isEnemy);
      }
    }
  }

  hideAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].stop();
      this.pool[i].setActive(false).setVisible(false);
      this.glows[i].setActive(false).setVisible(false);
    }
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].stop();
      this.pool[i].setActive(false).setVisible(false);
      this.glows[i].setActive(false).setVisible(false);
    }
  }

  getPool(): readonly Phaser.GameObjects.Sprite[] {
    return this.pool;
  }

  destroy(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].destroy();
      this.glows[i].destroy();
    }
    this.pool.length = 0;
    this.lanes.length = 0;
    this.ages.length = 0;
    this.glows.length = 0;
  }
}
