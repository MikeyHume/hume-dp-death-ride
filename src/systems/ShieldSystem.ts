import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class ShieldSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Sprite[] = [];
  private glowPool: Phaser.GameObjects.Image[] = [];
  private shields: number = 0;
  private justCollected: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Pre-warm shield pickup pool with paired glow sprites
    const size = TUNING.SHIELD_DIAMETER * TUNING.SHIELD_ANIM_SCALE;
    for (let i = 0; i < 5; i++) {
      const glow = this.createGlow();
      const spr = scene.add.sprite(0, 0, 'pickup-shield');
      spr.setDisplaySize(size, size);
      spr.setActive(false).setVisible(false);
      this.pool.push(spr);
      this.glowPool.push(glow);
    }
  }

  private createGlow(): Phaser.GameObjects.Image {
    const glowSize = TUNING.SHIELD_DIAMETER * TUNING.SHIELD_GLOW_SCALE;
    const glow = this.scene.add.image(0, 0, 'shield-glow');
    glow.setDisplaySize(glowSize, glowSize);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setVisible(false);
    return glow;
  }

  /** Spawn a shield pickup at the given world position */
  spawn(x: number, y: number): void {
    let idx = -1;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      const spr = this.scene.add.sprite(0, 0, 'pickup-shield');
      const size = TUNING.SHIELD_DIAMETER * TUNING.SHIELD_ANIM_SCALE;
      spr.setDisplaySize(size, size);
      this.pool.push(spr);
      this.glowPool.push(this.createGlow());
      idx = this.pool.length - 1;
    }

    const spr = this.pool[idx];
    const glow = this.glowPool[idx];

    const adjustedY = y + TUNING.PICKUP_Y_OFFSET;
    spr.setPosition(x, adjustedY);
    spr.setActive(true).setVisible(true);
    spr.setDepth(y + 0.05);
    spr.setData('baseY', adjustedY);
    spr.play('pickup-shield-anim');

    glow.setPosition(x, adjustedY);
    glow.setVisible(true);
    glow.setDepth(y + 0.04);
  }

  /** Scroll shield pickups left, check player collection, animate hover + glow */
  update(dt: number, roadSpeed: number, playerX: number, playerY: number): void {
    this.justCollected = false;
    const time = this.scene.time.now / 1000;

    for (let i = 0; i < this.pool.length; i++) {
      const pickup = this.pool[i];
      const glow = this.glowPool[i];
      if (!pickup.active) continue;

      // Scroll left at road speed
      pickup.x -= roadSpeed * dt;
      const baseY: number = pickup.getData('baseY');

      // Hover: sine-based ease in/out bob
      const hoverOffset = Math.sin(time * TUNING.SHIELD_HOVER_SPEED * Math.PI * 2) * TUNING.SHIELD_HOVER_AMOUNT;
      pickup.y = baseY + hoverOffset;
      pickup.setDepth(baseY + 0.05);

      // Sync glow position + pulse
      glow.x = pickup.x;
      glow.y = pickup.y;
      glow.setDepth(baseY + 0.04);
      const pulse = 0.5 + 0.5 * Math.sin(time * TUNING.SHIELD_GLOW_PULSE_SPEED * Math.PI * 2);
      glow.setAlpha(0.4 + pulse * 0.6);
      const baseGlowSize = TUNING.SHIELD_DIAMETER * TUNING.SHIELD_GLOW_SCALE;
      const glowScale = 1 + pulse * 0.15;
      glow.setDisplaySize(baseGlowSize * glowScale, baseGlowSize * glowScale);

      // Recycle if off-screen left
      if (pickup.x < -TUNING.SHIELD_DIAMETER) {
        pickup.setActive(false).setVisible(false);
        glow.setVisible(false);
        continue;
      }

      // Lane-based collection: same lane + player passed pickup center X
      if (playerX >= pickup.x) {
        const laneH = (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y) / TUNING.LANE_COUNT;
        const playerLane = Math.min(Math.floor((playerY - TUNING.ROAD_TOP_Y) / laneH), TUNING.LANE_COUNT - 1);
        const pickupLane = Math.min(Math.floor((baseY - TUNING.ROAD_TOP_Y) / laneH), TUNING.LANE_COUNT - 1);
        if (playerLane === pickupLane) {
          pickup.setActive(false).setVisible(false);
          glow.setVisible(false);
          if (this.shields < TUNING.SHIELD_MAX) this.shields++;
          this.justCollected = true;
        }
      }
    }
  }

  /** Returns true once per frame if a shield was collected */
  wasCollected(): boolean {
    return this.justCollected;
  }

  /** Expose pool for warning system iteration */
  getPool(): readonly Phaser.GameObjects.Sprite[] {
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
      this.glowPool[i].setVisible(false);
    }
  }

  setVisible(visible: boolean): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setVisible(visible && this.pool[i].active);
      this.glowPool[i].setVisible(visible && this.pool[i].active);
    }
  }

  reset(): void {
    this.shields = 0;
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
      this.glowPool[i].setVisible(false);
    }
  }

  destroy(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].destroy();
      this.glowPool[i].destroy();
    }
    this.pool.length = 0;
    this.glowPool.length = 0;
  }
}
