import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

const PILL_W = TUNING.SHIELD_PILL_W;
const PILL_H = TUNING.SHIELD_PILL_H;
const PILL_GAP = TUNING.SHIELD_PILL_GAP;
const PILL_RADIUS = TUNING.SHIELD_PILL_CORNER_RADIUS;
const PILL_BG_COLOR = TUNING.SHIELD_PILL_BG_COLOR;
const PILL_BG_ALPHA = TUNING.SHIELD_PILL_BG_ALPHA;
const PILL_ACTIVE_COLOR = TUNING.SHIELD_PILL_ACTIVE_COLOR;
const PILL_ACTIVE_ALPHA = 0.9;
const PILL_Y = TUNING.SHIELD_PILL_Y;

export class ShieldHud {
  private container: Phaser.GameObjects.Container;
  private activePills: Phaser.GameObjects.Graphics[] = [];
  private currentShields: number = 0;

  constructor(scene: Phaser.Scene) {
    const totalW = PILL_W * TUNING.SHIELD_MAX + PILL_GAP * (TUNING.SHIELD_MAX - 1);
    const startX = -totalW / 2;

    this.container = scene.add.container(TUNING.GAME_WIDTH / 2, PILL_Y)
      .setDepth(1300).setScrollFactor(0);

    for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
      const x = startX + i * (PILL_W + PILL_GAP);

      // Background pill (always visible)
      const bg = scene.add.graphics();
      bg.fillStyle(PILL_BG_COLOR, PILL_BG_ALPHA);
      bg.fillRoundedRect(x, -PILL_H / 2, PILL_W, PILL_H, PILL_RADIUS);
      this.container.add(bg);

      // Active pill overlay (neon green, shown when shield is active)
      const active = scene.add.graphics();
      active.fillStyle(PILL_ACTIVE_COLOR, PILL_ACTIVE_ALPHA);
      active.fillRoundedRect(x, -PILL_H / 2, PILL_W, PILL_H, PILL_RADIUS);
      active.setVisible(false);
      this.container.add(active);
      this.activePills.push(active);
    }

    // Start hidden
    this.container.setVisible(false);
  }

  update(shields: number): void {
    if (shields !== this.currentShields) {
      this.currentShields = shields;
      for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
        this.activePills[i].setVisible(i < shields);
      }
    }
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  /** Counter-scale and reposition so camera zoom doesn't push HUD off-screen */
  adjustForZoom(zoom: number): void {
    const cam = this.container.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    this.container.setScale(1 / zoom);
    this.container.setPosition(
      cx + (TUNING.GAME_WIDTH / 2 - cx) / zoom,
      cy + (PILL_Y - cy) / zoom,
    );
  }

  destroy(): void {
    this.container.destroy();
  }
}
