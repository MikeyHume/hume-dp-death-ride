import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

const MODAL_DEPTH = 1500;
const DIALOG_W = 500;
const DIALOG_H = 220;
const BTN_W = 140;
const BTN_H = 50;
const BTN_GAP = 40;

export class DisconnectModal {
  private scene: Phaser.Scene;
  private backdrop: Phaser.GameObjects.Rectangle;
  private container: Phaser.GameObjects.Container;
  private resolvePromise: ((confirmed: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = TUNING.GAME_WIDTH / 2;
    const cy = TUNING.GAME_HEIGHT / 2;

    // Dimmed full-screen overlay — blocks clicks behind it
    this.backdrop = scene.add.rectangle(cx, cy, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(MODAL_DEPTH)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);
    this.backdrop.on('pointerdown', () => this.answer(false));

    // Container for dialog content
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
    const title = scene.add.text(0, -DIALOG_H / 2 + 50, 'Disconnect Spotify?', {
      fontSize: '26px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(title);

    // YES button
    const btnY = DIALOG_H / 2 - 60;
    const yesX = -(BTN_W / 2 + BTN_GAP / 2);
    const yesBg = scene.add.graphics();
    yesBg.fillStyle(0x5a0b0b, 1);
    yesBg.fillRoundedRect(yesX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8);
    this.container.add(yesBg);

    const yesLabel = scene.add.text(yesX, btnY, 'YES', {
      fontSize: '24px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ff4444',
    }).setOrigin(0.5);
    this.container.add(yesLabel);

    const yesHit = scene.add.zone(yesX, btnY, BTN_W, BTN_H)
      .setInteractive({ useHandCursor: true });
    yesHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    yesHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME }); this.answer(true); });
    this.container.add(yesHit);

    // NO button
    const noX = BTN_W / 2 + BTN_GAP / 2;
    const noBg = scene.add.graphics();
    noBg.fillStyle(0x1DB954, 1);
    noBg.fillRoundedRect(noX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, 8);
    this.container.add(noBg);

    const noLabel = scene.add.text(noX, btnY, 'NO', {
      fontSize: '24px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(noLabel);

    const noHit = scene.add.zone(noX, btnY, BTN_W, BTN_H)
      .setInteractive({ useHandCursor: true });
    noHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    noHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME }); this.answer(false); });
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
