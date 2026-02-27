import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';

const MODAL_DEPTH = 1500;
const isMobile = GAME_MODE.mobileMode;
const MOB = isMobile ? 2 : 1;
const DIALOG_W = 700 * MOB;
const DIALOG_H = 350 * MOB;
const BTN_W = 280 * MOB;
const BTN_H = 100 * MOB;
const BTN_GAP = 40 * MOB;

export class DisconnectModal {
  private scene: Phaser.Scene;
  private backdrop: Phaser.GameObjects.Rectangle;
  private container: Phaser.GameObjects.Container;
  private resolvePromise: ((confirmed: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = GAME_MODE.canvasWidth / 2;
    const cy = TUNING.GAME_HEIGHT / 2;

    // Dimmed full-screen overlay — blocks clicks behind it
    this.backdrop = scene.add.rectangle(cx, cy, GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(MODAL_DEPTH)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);
    this.backdrop.name = 'disconnect-backdrop';
    this.backdrop.on('pointerdown', (_ptr: Phaser.Input.Pointer, _lx: number, _ly: number, _ev: Phaser.Types.Input.EventData) => {
      // Only dismiss if tap is OUTSIDE the dialog panel
      const px = _ptr.x - cx;
      const py = _ptr.y - cy;
      if (Math.abs(px) > DIALOG_W / 2 || Math.abs(py) > DIALOG_H / 2) {
        this.answer(false);
      }
    });

    // Container for dialog content (cx already = canvasWidth/2 via scrollFactor(0))
    this.container = scene.add.container(cx, cy)
      .setDepth(MODAL_DEPTH + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // Dialog panel
    const panel = scene.add.graphics();
    panel.fillStyle(0x1a1a2e, 0.95);
    panel.fillRoundedRect(-DIALOG_W / 2, -DIALOG_H / 2, DIALOG_W, DIALOG_H, 16);
    panel.lineStyle(2, 0x444466, 0.8);
    panel.strokeRoundedRect(-DIALOG_W / 2, -DIALOG_H / 2, DIALOG_W, DIALOG_H, 16);
    this.container.add(panel);

    // Title text
    const title = scene.add.text(0, -DIALOG_H / 2 + 50 * MOB, 'Disconnect Spotify?', {
      fontSize: `${26 * MOB}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(title);

    // YES button
    const btnY = DIALOG_H / 2 - 60 * MOB;
    const yesX = -(BTN_W / 2 + BTN_GAP / 2);
    const yesBg = scene.add.graphics();
    yesBg.fillStyle(0x1DB954, 1);
    yesBg.fillRoundedRect(yesX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8);
    this.container.add(yesBg);

    const yesLabel = scene.add.text(yesX, btnY, 'YES', {
      fontSize: `${24 * MOB}px`,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(yesLabel);

    // DEBUG: pink hit area so we can see where the tap zone is
    const yesHit = scene.add.rectangle(yesX, btnY, BTN_W, BTN_H, 0xff00ff, 0.3)
      .setInteractive({ useHandCursor: true });
    yesHit.name = 'disconnect-yes';
    yesHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    yesHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER }); this.answer(true); });
    this.container.add(yesHit);

    // NO button
    const noX = BTN_W / 2 + BTN_GAP / 2;
    const noBg = scene.add.graphics();
    noBg.fillStyle(0x5a0b0b, 1);
    noBg.fillRoundedRect(noX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8);
    this.container.add(noBg);

    const noLabel = scene.add.text(noX, btnY, 'NO', {
      fontSize: `${24 * MOB}px`,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(noLabel);

    // DEBUG: pink hit area so we can see where the tap zone is
    const noHit = scene.add.rectangle(noX, btnY, BTN_W, BTN_H, 0xff00ff, 0.3)
      .setInteractive({ useHandCursor: true });
    noHit.name = 'disconnect-no';
    noHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    noHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER }); this.answer(false); });
    this.container.add(noHit);
  }

  /** Show the modal and return a promise that resolves to true (YES) or false (NO). */
  show(): Promise<boolean> {
    this.backdrop.setVisible(true);
    this.container.setVisible(true);
    return new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private answer(confirmed: boolean): void {
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    if (this.resolvePromise) {
      this.resolvePromise(confirmed);
      this.resolvePromise = null;
    }
  }

  destroy(): void {
    this.container.destroy();
    this.backdrop.destroy();
  }
}
