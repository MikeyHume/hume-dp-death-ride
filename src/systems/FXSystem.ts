import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';

export class FXSystem {
  private scene: Phaser.Scene;

  // Speed lines — pre-allocated horizontal lines in the upper screen area
  private speedLines: Phaser.GameObjects.Rectangle[] = [];

  // Edge warning overlays (left + right red gradient rectangles)
  private leftWarn: Phaser.GameObjects.Rectangle;
  private rightWarn: Phaser.GameObjects.Rectangle;

  // Screen flash overlay
  private flashOverlay: Phaser.GameObjects.Rectangle;

  // Track slow overlap to fire shake only on first contact
  private wasSlowOverlapping: boolean = false;

  // Debug: suppress camera shakes (G key clean-screen mode)
  private suppressShake: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // --- Speed lines ---
    for (let i = 0; i < TUNING.SPEED_LINE_COUNT; i++) {
      const y = Math.random() * TUNING.GAME_HEIGHT;
      const w = 60 + Math.random() * 120;
      const line = scene.add.rectangle(
        Math.random() * TUNING.GAME_WIDTH, y,
        w, 2,
        TUNING.SPEED_LINE_COLOR
      ).setAlpha(0).setDepth(50);
      this.speedLines.push(line);
    }

    // --- Edge warning overlays ---
    this.leftWarn = scene.add.rectangle(
      TUNING.EDGE_WARN_DISTANCE / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.EDGE_WARN_DISTANCE, TUNING.GAME_HEIGHT,
      0xff0000
    ).setAlpha(0).setDepth(90).setOrigin(0.5, 0.5);

    this.rightWarn = scene.add.rectangle(
      TUNING.GAME_WIDTH - TUNING.EDGE_WARN_DISTANCE / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.EDGE_WARN_DISTANCE, TUNING.GAME_HEIGHT,
      0xff0000
    ).setAlpha(0).setDepth(90).setOrigin(0.5, 0.5);

    // --- Flash overlay (full screen, hidden) ---
    this.flashOverlay = scene.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      TUNING.FLASH_DEATH_COLOR
    ).setAlpha(0).setDepth(150);
  }

  update(dt: number, playerSpeed: number, roadSpeed: number, playerX: number): void {
    this.updateSpeedLines(dt, playerSpeed, roadSpeed);
    this.updateEdgeWarnings(playerX);
  }

  private updateSpeedLines(dt: number, playerSpeed: number, roadSpeed: number): void {
    const quality = GAME_MODE.quality;

    // Low quality: skip speed lines entirely
    if (quality === 'low') {
      for (let i = 0; i < this.speedLines.length; i++) {
        this.speedLines[i].setAlpha(0);
      }
      return;
    }

    const threshold = roadSpeed * TUNING.SPEED_LINE_THRESHOLD;
    const intensity = playerSpeed > threshold
      ? Math.min((playerSpeed - threshold) / (roadSpeed * (TUNING.MAX_SPEED_MULTIPLIER - TUNING.SPEED_LINE_THRESHOLD)), 1)
      : 0;

    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i];
      if (quality === 'medium' && i % 2 !== 0) {
        line.setAlpha(0);
        continue;
      }
      if (intensity > 0) {
        line.setAlpha(intensity * TUNING.SPEED_LINE_ALPHA_MAX * (0.3 + Math.random() * 0.7));
        // Scroll lines left relative to road speed
        line.x -= roadSpeed * TUNING.SPEED_LINE_SCROLL * dt;
        if (line.x < -200) {
          line.x = TUNING.GAME_WIDTH + Math.random() * 200;
          line.y = Math.random() * TUNING.GAME_HEIGHT;
        }
      } else {
        line.setAlpha(0);
      }
    }
  }

  private updateEdgeWarnings(playerX: number): void {
    // Left warning
    const leftDist = playerX - TUNING.PLAYER_MIN_X;
    if (leftDist < TUNING.EDGE_WARN_DISTANCE) {
      const t = 1 - leftDist / TUNING.EDGE_WARN_DISTANCE;
      this.leftWarn.setAlpha(t * TUNING.EDGE_WARN_ALPHA_MAX);
    } else {
      this.leftWarn.setAlpha(0);
    }

    // Right warning
    const rightDist = TUNING.PLAYER_MAX_X - playerX;
    if (rightDist < TUNING.EDGE_WARN_DISTANCE) {
      const t = 1 - rightDist / TUNING.EDGE_WARN_DISTANCE;
      this.rightWarn.setAlpha(t * TUNING.EDGE_WARN_ALPHA_MAX);
    } else {
      this.rightWarn.setAlpha(0);
    }
  }

  setSuppressShake(suppress: boolean): void {
    this.suppressShake = suppress;
  }

  /** Shake + flash on player death */
  triggerDeath(): void {
    if (!this.suppressShake) this.scene.cameras.main.shake(TUNING.SHAKE_DEATH_DURATION, TUNING.SHAKE_DEATH_INTENSITY);
    this.flashOverlay.setAlpha(1);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: TUNING.FLASH_DEATH_DURATION,
      ease: 'Power2',
    });
  }

  /** Brief shake when first entering a slow zone */
  onSlowOverlap(isOverlapping: boolean): void {
    if (isOverlapping && !this.wasSlowOverlapping && !this.suppressShake) {
      this.scene.cameras.main.shake(TUNING.SHAKE_SLOW_DURATION, TUNING.SHAKE_SLOW_INTENSITY);
    }
    this.wasSlowOverlapping = isOverlapping;
  }

  /** Reset FX state for new game */
  reset(): void {
    this.wasSlowOverlapping = false;
    this.flashOverlay.setAlpha(0);
    this.leftWarn.setAlpha(0);
    this.rightWarn.setAlpha(0);
    for (let i = 0; i < this.speedLines.length; i++) {
      this.speedLines[i].setAlpha(0);
    }
  }
}
