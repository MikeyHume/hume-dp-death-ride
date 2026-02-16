import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class ShieldSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Image[] = [];
  private shields: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Pre-warm shield pickup pool
    for (let i = 0; i < 5; i++) {
      const img = scene.add.image(0, 0, 'pickup-shield');
      img.setDisplaySize(TUNING.SHIELD_DIAMETER, TUNING.SHIELD_DIAMETER);
      img.setActive(false).setVisible(false);
      this.pool.push(img);
    }
  }

  /** Spawn a shield pickup at the given world position */
  spawn(x: number, y: number): void {
    let img: Phaser.GameObjects.Image | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        img = this.pool[i];
        break;
      }
    }
    if (!img) {
      img = this.scene.add.image(0, 0, 'pickup-shield');
      img.setDisplaySize(TUNING.SHIELD_DIAMETER, TUNING.SHIELD_DIAMETER);
      this.pool.push(img);
    }

    img.setPosition(x, y);
    img.setActive(true).setVisible(true);
    img.setDepth(y + 0.05);
  }

  /** Scroll shield pickups left, check player collection */
  update(dt: number, roadSpeed: number, playerX: number, playerY: number, playerHalfW: number, playerHalfH: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const pickup = this.pool[i];
      if (!pickup.active) continue;

      // Scroll left at road speed
      pickup.x -= roadSpeed * dt;
      pickup.setDepth(pickup.y + 0.05);

      // Recycle if off-screen left
      if (pickup.x < -TUNING.SHIELD_DIAMETER) {
        pickup.setActive(false).setVisible(false);
        continue;
      }

      // Circle-vs-circle collection check
      if (this.shields < TUNING.SHIELD_MAX) {
        const dx = playerX - pickup.x;
        const dy = playerY - pickup.y;
        const collectRadius = Math.max(playerHalfW, playerHalfH) + TUNING.SHIELD_DIAMETER / 2;
        if (dx * dx + dy * dy < collectRadius * collectRadius) {
          pickup.setActive(false).setVisible(false);
          this.shields++;
        }
      }
    }
  }

  /** Expose pool for warning system iteration */
  getPool(): readonly Phaser.GameObjects.Image[] {
    return this.pool;
  }

  getShields(): number {
    return this.shields;
  }

  consumeShield(): boolean {
    if (this.shields > 0) {
      this.shields--;
      return true;
    }
    return false;
  }

  hideAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
    }
  }

  setVisible(visible: boolean): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setVisible(visible && this.pool[i].active);
    }
  }

  reset(): void {
    this.shields = 0;
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
