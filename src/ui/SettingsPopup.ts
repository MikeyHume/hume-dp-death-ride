import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';

// ── Popup chrome (matches ProfilePopup) ──
const isMobile = GAME_MODE.mobileMode;
const POPUP_W = isMobile ? 1380 : 690;
const POPUP_H = 900;
const POPUP_DEPTH = 1400;
const POPUP_RADIUS = 20;
const POPUP_BG = 0x1a1a2e;
const POPUP_BG_ALPHA = 0.95;
const POPUP_BORDER = 0x444466;
const POPUP_BORDER_ALPHA = 0.8;
const BACKDROP_ALPHA = 0.6;

// ── Title ──
const TITLE_Y = -POPUP_H / 2 + 50;

// ── Exit button (matches ProfilePopup) ──
const EXIT_MOB_SCALE = isMobile ? 3 : 1;
const EXIT_Y = POPUP_H / 2 - (isMobile ? 120 : 60);
const EXIT_BTN_W = 200 * EXIT_MOB_SCALE;
const EXIT_BTN_H = 50 * EXIT_MOB_SCALE;
const EXIT_BTN_RADIUS = 10;
const EXIT_BTN_BG = 0x442222;
const EXIT_BTN_STROKE = 0xff4444;
const EXIT_BTN_STROKE_ALPHA = 0.6;
const EXIT_TEXT_FONT = `${28 * EXIT_MOB_SCALE}px`;
const EXIT_TEXT_COLOR = '#ff4444';

// ── Debug toggle ──
const TOGGLE_Y = -60;
const TOGGLE_ROW_W = 400 * (isMobile ? 2 : 1);
const TOGGLE_ROW_H = 60 * (isMobile ? 2 : 1);
const TOGGLE_RADIUS = 8;
const TOGGLE_LABEL_FONT = `${24 * (isMobile ? 2 : 1)}px`;
const TOGGLE_VALUE_FONT = `${22 * (isMobile ? 2 : 1)}px`;

export class SettingsPopup {
  private scene: Phaser.Scene;
  private backdrop: Phaser.GameObjects.Rectangle;
  private container: Phaser.GameObjects.Container;
  private _isOpen = false;
  private closedAt = 0;

  // Debug toggle state
  private debugEnabled: boolean;
  private debugValueText!: Phaser.GameObjects.Text;
  private debugToggleBg!: Phaser.GameObjects.Graphics;
  private onDebugToggle: (enabled: boolean) => void;

  // Close callback
  private closeCallback: (() => void) | null = null;

  constructor(scene: Phaser.Scene, opts: {
    debugEnabled: boolean;
    onDebugToggle: (enabled: boolean) => void;
  }) {
    this.scene = scene;
    this.debugEnabled = opts.debugEnabled;
    this.onDebugToggle = opts.onDebugToggle;

    const cx = GAME_MODE.canvasWidth / 2;
    const cy = TUNING.GAME_HEIGHT / 2;

    /* ---------- Backdrop ---------- */
    this.backdrop = scene.add.rectangle(cx, cy, GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT, 0x000000, BACKDROP_ALPHA)
      .setDepth(POPUP_DEPTH).setScrollFactor(0).setInteractive().setVisible(false);
    this.backdrop.name = 'settings-backdrop';
    this.backdrop.on('pointerdown', () => this.close());

    /* ---------- Container ---------- */
    this.container = scene.add.container(cx, cy)
      .setDepth(POPUP_DEPTH + 1).setScrollFactor(0).setVisible(false);

    /* ---------- Panel BG ---------- */
    const panel = scene.add.graphics();
    panel.fillStyle(POPUP_BG, POPUP_BG_ALPHA);
    panel.fillRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, POPUP_RADIUS);
    panel.lineStyle(2, POPUP_BORDER, POPUP_BORDER_ALPHA);
    panel.strokeRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, POPUP_RADIUS);
    this.container.add(panel);

    /* ---------- Title ---------- */
    this.container.add(
      scene.add.text(0, TITLE_Y, 'SETTINGS', {
        fontSize: '36px', fontFamily: 'Early GameBoy', color: '#ffffff',
      }).setOrigin(0.5),
    );

    /* ---------- Debug Toggle ---------- */
    this.createDebugToggle();

    /* ---------- EXIT Button ---------- */
    this.createExitButton();
  }

  /* ============ Debug Toggle ============ */

  private createDebugToggle(): void {
    // Row background
    this.debugToggleBg = this.scene.add.graphics();
    this.updateToggleBg();
    this.container.add(this.debugToggleBg);

    // Label
    this.container.add(
      this.scene.add.text(-TOGGLE_ROW_W / 2 + 20, TOGGLE_Y, 'DEBUG', {
        fontSize: TOGGLE_LABEL_FONT, fontFamily: 'monospace', fontStyle: 'bold', color: '#cccccc',
      }).setOrigin(0, 0.5),
    );

    // Value text (ON / OFF)
    this.debugValueText = this.scene.add.text(TOGGLE_ROW_W / 2 - 20, TOGGLE_Y, '', {
      fontSize: TOGGLE_VALUE_FONT, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0.5);
    this.updateToggleLabel();
    this.container.add(this.debugValueText);

    // Hit zone
    const hit = this.scene.add.zone(0, TOGGLE_Y, TOGGLE_ROW_W, TOGGLE_ROW_H)
      .setInteractive({ useHandCursor: true });
    hit.name = 'settings-debug-toggle';
    hit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    hit.on('pointerdown', () => {
      this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      this.debugEnabled = !this.debugEnabled;
      this.updateToggleLabel();
      this.updateToggleBg();
      this.onDebugToggle(this.debugEnabled);
    });
    this.container.add(hit);
  }

  private updateToggleLabel(): void {
    if (this.debugEnabled) {
      this.debugValueText.setText('ON').setColor('#00ff00');
    } else {
      this.debugValueText.setText('OFF').setColor('#ff4444');
    }
  }

  private updateToggleBg(): void {
    this.debugToggleBg.clear();
    const bgColor = this.debugEnabled ? 0x1a2e1a : 0x2e1a1a;
    const strokeColor = this.debugEnabled ? 0x44ff44 : 0xff4444;
    this.debugToggleBg.fillStyle(bgColor, 0.6);
    this.debugToggleBg.fillRoundedRect(-TOGGLE_ROW_W / 2, TOGGLE_Y - TOGGLE_ROW_H / 2, TOGGLE_ROW_W, TOGGLE_ROW_H, TOGGLE_RADIUS);
    this.debugToggleBg.lineStyle(2, strokeColor, 0.5);
    this.debugToggleBg.strokeRoundedRect(-TOGGLE_ROW_W / 2, TOGGLE_Y - TOGGLE_ROW_H / 2, TOGGLE_ROW_W, TOGGLE_ROW_H, TOGGLE_RADIUS);
  }

  /* ============ EXIT Button ============ */

  private createExitButton(): void {
    const exitBg = this.scene.add.graphics();
    exitBg.fillStyle(EXIT_BTN_BG, 0.9);
    exitBg.fillRoundedRect(-EXIT_BTN_W / 2, EXIT_Y - EXIT_BTN_H / 2, EXIT_BTN_W, EXIT_BTN_H, EXIT_BTN_RADIUS);
    exitBg.lineStyle(2, EXIT_BTN_STROKE, EXIT_BTN_STROKE_ALPHA);
    exitBg.strokeRoundedRect(-EXIT_BTN_W / 2, EXIT_Y - EXIT_BTN_H / 2, EXIT_BTN_W, EXIT_BTN_H, EXIT_BTN_RADIUS);
    this.container.add(exitBg);

    this.container.add(
      this.scene.add.text(0, EXIT_Y, 'EXIT', {
        fontSize: EXIT_TEXT_FONT, fontFamily: 'monospace', fontStyle: 'bold', color: EXIT_TEXT_COLOR,
      }).setOrigin(0.5),
    );

    const exitHit = this.scene.add.zone(0, EXIT_Y, EXIT_BTN_W, EXIT_BTN_H)
      .setInteractive({ useHandCursor: true });
    exitHit.name = 'settings-exit';
    exitHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    exitHit.on('pointerdown', () => {
      this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      this.close();
    });
    this.container.add(exitHit);
  }

  /* ============ Public API ============ */

  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.backdrop.setVisible(true);
    this.container.setVisible(true);
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.closedAt = Date.now();
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    if (this.closeCallback) this.closeCallback();
  }

  toggle(): void {
    if (this._isOpen) this.close(); else this.open();
  }

  isOpen(): boolean {
    // Grace period after close to prevent accidental re-opens
    if (!this._isOpen && Date.now() - this.closedAt < 100) return true;
    return this._isOpen;
  }

  /** Update debug toggle state from external source. */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.updateToggleLabel();
    this.updateToggleBg();
  }

  onClose(cb: () => void): void {
    this.closeCallback = cb;
  }

  /** Check if cursor is over the popup. */
  isCursorOver(): boolean {
    return this._isOpen;
  }
}
