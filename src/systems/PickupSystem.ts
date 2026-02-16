import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class PickupSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Image[] = [];
  private ammo: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Pre-warm pickup pool
    for (let i = 0; i < 10; i++) {
      const img = scene.add.image(0, 0, 'pickup-rocket');
      img.setDisplaySize(TUNING.PICKUP_DIAMETER, TUNING.PICKUP_DIAMETER);
      img.setActive(false).setVisible(false);
      this.pool.push(img);
    }
  }

  /** Spawn a pickup at the given world position */
  spawn(x: number, y: number): void {
    let img: Phaser.GameObjects.Image | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        img = this.pool[i];
        break;
      }
    }
    if (!img) {
      img = this.scene.add.image(0, 0, 'pickup-rocket');
      img.setDisplaySize(TUNING.PICKUP_DIAMETER, TUNING.PICKUP_DIAMETER);
      this.pool.push(img);
    }

    img.setPosition(x, y);
    img.setActive(true).setVisible(true);
    img.setDepth(y + 0.05);
  }

  /** Scroll pickups left, check player collection */
  update(dt: number, roadSpeed: number, playerX: number, playerY: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const pickup = this.pool[i];
      if (!pickup.active) continue;

      // Scroll left at road speed
      pickup.x -= roadSpeed * dt;
      pickup.setDepth(pickup.y + 0.05);

      // Recycle if off-screen left
      if (pickup.x < -TUNING.PICKUP_DIAMETER) {
        pickup.setActive(false).setVisible(false);
        continue;
      }

      // Lane-based collection: same lane + player passed pickup center X
      if (this.ammo < TUNING.PICKUP_MAX_AMMO && playerX >= pickup.x) {
        const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
        const playerLane = Math.min(Math.floor((playerY - TUNING.ROAD_TOP_Y) / laneH), TUNING.LANE_COUNT - 1);
        const pickupLane = Math.min(Math.floor((pickup.y - TUNING.ROAD_TOP_Y) / laneH), TUNING.LANE_COUNT - 1);
        if (playerLane === pickupLane) {
          pickup.setActive(false).setVisible(false);
          this.ammo++;
        }
      }
    }
  }

  /** Show/hide HUD circles (no-op, ProfileHud handles display now) */
  setHUDVisible(_visible: boolean): void {}

  /** Expose pool for external iteration (e.g. warning system) */
  getPool(): readonly Phaser.GameObjects.Image[] {
    return this.pool;
  }

  getAmmo(): number {
    return this.ammo;
  }

  consumeAmmo(): boolean {
    if (this.ammo > 0) {
      this.ammo--;
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
    this.ammo = 0;
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
