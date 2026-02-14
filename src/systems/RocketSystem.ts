import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ObstacleSystem } from './ObstacleSystem';

export class RocketSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Image[] = [];
  private obstacleSystem: ObstacleSystem;

  // Callbacks
  public onHit: ((x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene, obstacleSystem: ObstacleSystem) {
    this.scene = scene;
    this.obstacleSystem = obstacleSystem;

    // Pre-warm rocket pool
    for (let i = 0; i < 10; i++) {
      const rocket = scene.add.image(0, 0, 'rocket-projectile');
      rocket.setDisplaySize(TUNING.ROCKET_DISPLAY_W, TUNING.ROCKET_DISPLAY_H);
      rocket.setActive(false).setVisible(false);
      this.pool.push(rocket);
    }
  }

  /** Fire a rocket from the given position */
  fire(x: number, y: number): void {
    let rocket: Phaser.GameObjects.Image | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        rocket = this.pool[i];
        break;
      }
    }
    if (!rocket) {
      rocket = this.scene.add.image(0, 0, 'rocket-projectile');
      rocket.setDisplaySize(TUNING.ROCKET_DISPLAY_W, TUNING.ROCKET_DISPLAY_H);
      this.pool.push(rocket);
    }

    rocket.setPosition(x, y);
    rocket.setActive(true).setVisible(true);
    rocket.setDepth(y + 0.15);
  }

  /** Move rockets right, check collisions, recycle off-screen */
  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const rocket = this.pool[i];
      if (!rocket.active) continue;

      // Move rightward
      rocket.x += TUNING.ROCKET_SPEED * dt;

      // Recycle if off-screen right
      if (rocket.x > TUNING.GAME_WIDTH + 100) {
        rocket.setActive(false).setVisible(false);
        continue;
      }

      // Check collision against obstacles
      const hitResult = this.obstacleSystem.checkProjectileCollision(rocket.x, rocket.y, TUNING.ROCKET_RADIUS);
      if (hitResult) {
        rocket.setActive(false).setVisible(false);
        if (this.onHit) this.onHit(hitResult.x, hitResult.y);
      }
    }
  }

  hideAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
    }
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
    }
  }

  destroy(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].destroy();
    }
    this.pool.length = 0;
  }
}
