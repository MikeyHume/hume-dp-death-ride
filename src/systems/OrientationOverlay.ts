import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class OrientationOverlay {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private paused = false;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.rectangle(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT,
      0x000000, 0.92
    ).setDepth(2000).setScrollFactor(0).setVisible(false);

    this.label = scene.add.text(
      TUNING.GAME_WIDTH / 2, TUNING.GAME_HEIGHT / 2,
      'Rotate your device', {
        fontSize: '48px',
        color: '#ffffff',
        fontFamily: 'Retro Gaming',
        align: 'center',
      }
    ).setOrigin(0.5).setDepth(2001).setScrollFactor(0).setVisible(false);

    // Initial check
    this.checkOrientation();
  }

  update(): void {
    this.checkOrientation();
  }

  private checkOrientation(): void {
    let landscape: boolean;
    if (window.matchMedia) {
      landscape = window.matchMedia('(orientation: landscape)').matches;
    } else {
      landscape = window.innerWidth > window.innerHeight;
    }

    if (landscape && this.paused) {
      this.paused = false;
      this.bg.setVisible(false);
      this.label.setVisible(false);
    } else if (!landscape && !this.paused) {
      this.paused = true;
      this.bg.setVisible(true);
      this.label.setVisible(true);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }
}
