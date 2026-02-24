/**
 * DebugHudSystem — Canvas-rendered debug overlay for the vision system.
 *
 * Activated by ?hud=1 URL param. Completely independent of ?test=1.
 * Renders FPS, state, player position, obstacles, and recent inputs
 * directly ON the game canvas so they appear in every screenshot.
 *
 * Safe on iOS Safari — no polling, no fetch, no command queue.
 */

import { TUNING } from '../config/tuning';

export interface HudData {
  fps: number;
  stateName: string;
  playerX: number;
  playerY: number;
  speed: number;
  difficulty: number;
  obstacleCount: number;
  score: number;
  elapsed: number;
  alive: boolean;
}

export class DebugHudSystem {
  private scene: Phaser.Scene;
  private bg: Phaser.GameObjects.Rectangle;
  private texts: Phaser.GameObjects.Text[];
  private inputRing: string[] = [];
  private readonly MAX_INPUTS = 3;
  private frameCount = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const T = TUNING;
    const rows = 5;
    const totalHeight = T.HUD_PADDING * 2 + rows * T.HUD_ROW_HEIGHT;

    // Semi-transparent background
    this.bg = scene.add.rectangle(
      T.HUD_X + T.HUD_WIDTH / 2,
      T.HUD_Y + totalHeight / 2,
      T.HUD_WIDTH,
      totalHeight,
      0x000000,
      T.HUD_BG_ALPHA
    ).setDepth(T.HUD_DEPTH).setScrollFactor(0);

    // Create 5 text rows
    this.texts = [];
    for (let i = 0; i < rows; i++) {
      const text = scene.add.text(
        T.HUD_X + T.HUD_PADDING,
        T.HUD_Y + T.HUD_PADDING + i * T.HUD_ROW_HEIGHT,
        '',
        {
          fontFamily: 'monospace',
          fontSize: `${T.HUD_FONT_SIZE}px`,
          color: '#ffffff',
        }
      ).setDepth(T.HUD_DEPTH + 1).setScrollFactor(0);
      this.texts.push(text);
    }
  }

  update(_dt: number, data: HudData): void {
    this.frameCount++;
    const T = TUNING;

    // Row 0: FPS + State
    const fpsColor = data.fps >= T.HUD_FPS_GREEN ? '#00ff00'
      : data.fps >= T.HUD_FPS_YELLOW ? '#ffff00' : '#ff0000';
    const stateColor = data.stateName === 'PLAYING' ? '#ffffff'
      : data.stateName === 'DEAD' ? '#ff8800' : '#00ffff';
    this.texts[0].setText(`FPS: ${data.fps}  STATE: ${data.stateName}`);
    // Apply mixed colors via setStyle — first word gets FPS color
    this.texts[0].setColor(fpsColor);

    // Row 1: Player position + speed
    this.texts[1].setText(
      `Pos: (${Math.round(data.playerX)}, ${Math.round(data.playerY)})  Spd: ${Math.round(data.speed)}  Diff: ${data.difficulty.toFixed(2)}`
    );
    this.texts[1].setColor('#cccccc');

    // Row 2: Obstacles + alive
    const aliveStr = data.alive ? 'ALIVE' : 'DEAD';
    const aliveColor = data.alive ? '#00ff00' : '#ff4444';
    this.texts[2].setText(`Obs: ${data.obstacleCount}  ${aliveStr}  Score: ${data.score}`);
    this.texts[2].setColor(aliveColor);

    // Row 3: Recent inputs
    const inputStr = this.inputRing.length > 0
      ? this.inputRing.map(i => `[${i}]`).join(' ')
      : '[none]';
    this.texts[3].setText(`Input: ${inputStr}`);
    this.texts[3].setColor('#aaaaaa');

    // Row 4: Frame + elapsed
    this.texts[4].setText(
      `Frame: ${this.frameCount}  Time: ${data.elapsed.toFixed(1)}s`
    );
    this.texts[4].setColor('#888888');
  }

  recordInput(type: string): void {
    this.inputRing.push(type);
    if (this.inputRing.length > this.MAX_INPUTS) this.inputRing.shift();
  }

  destroy(): void {
    this.bg.destroy();
    this.texts.forEach(t => t.destroy());
  }
}
