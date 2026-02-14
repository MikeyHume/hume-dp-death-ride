import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

// Layer definitions: bottom Y positions and speed factors
// All layers extend from their bottomY up to Y=0 (top of screen)
const LAYER_BOTTOMS = [
  540,  // Layer 1 (front): same as road top, full speed
  490,  // Layer 2: 50px above layer 1 bottom
  450,  // Layer 3: 40px above layer 2 bottom
  420,  // Layer 4: 30px above layer 3 bottom
  400,  // Layer 5: 20px above layer 4 bottom
  390,  // Layer 6: 10px above layer 5 bottom
  385,  // Layer 7: 5px above layer 6 bottom (slowest mover)
  385,  // Layer 8: same as layer 7 (static background)
];

// Test pattern colors per layer (front to back)
const LAYER_COLORS: [number, number][] = [
  [0x44cc44, 0x2d8a2d],  // Layer 1: green
  [0x88cc33, 0x5d8a22],  // Layer 2: yellow-green
  [0xcccc22, 0x8a8a16],  // Layer 3: yellow
  [0xcc8822, 0x8a5c16],  // Layer 4: orange
  [0xcc3333, 0x8a2222],  // Layer 5: red
  [0x8833cc, 0x5c228a],  // Layer 6: purple
  [0x3344cc, 0x222d8a],  // Layer 7: blue
  [0x222255, 0x1a1a40],  // Layer 8: dark blue (static BG)
];

const LAYER_COUNT = LAYER_BOTTOMS.length;
const SCROLLING_LAYERS = LAYER_COUNT - 1; // last layer is static

export class ParallaxSystem {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private staticBg!: Phaser.GameObjects.Image;
  private speedFactors: number[] = [];

  constructor(scene: Phaser.Scene) {
    const sectionW = TUNING.PARALLAX_SECTION_WIDTH;
    const slowest = TUNING.PARALLAX_SLOWEST_FACTOR;

    // Compute speed factors for scrolling layers only (exclude static bg)
    for (let i = 0; i < SCROLLING_LAYERS; i++) {
      if (i === 0) {
        this.speedFactors.push(1.0); // front layer matches road
      } else {
        const t = i / (SCROLLING_LAYERS - 1);
        this.speedFactors.push(Math.pow(slowest, t));
      }
    }

    // --- Static background (layer 8): single full-width image ---
    const bgIndex = LAYER_COUNT - 1;
    const bgBottomY = LAYER_BOTTOMS[bgIndex];
    const bgHeight = bgBottomY;
    const bgCenterY = bgBottomY / 2;
    const [bgColorA] = LAYER_COLORS[bgIndex];

    const bgTexKey = 'parallax-test-bg';
    const bgGfx = scene.add.graphics();
    bgGfx.fillStyle(bgColorA, 1);
    bgGfx.fillRect(0, 0, TUNING.GAME_WIDTH, bgHeight);
    bgGfx.generateTexture(bgTexKey, TUNING.GAME_WIDTH, bgHeight);
    bgGfx.destroy();

    this.staticBg = scene.add.image(TUNING.GAME_WIDTH / 2, bgCenterY, bgTexKey);
    this.staticBg.setDepth(-10);

    // --- Scrolling layers (1-7): tiled test textures, back to front ---
    for (let i = SCROLLING_LAYERS - 1; i >= 0; i--) {
      const bottomY = LAYER_BOTTOMS[i];
      const height = bottomY;
      const centerY = bottomY / 2;
      const [colorA, colorB] = LAYER_COLORS[i];

      const texKey = `parallax-test-${i}`;
      const texW = sectionW * 2;
      const fillH = Math.max(1, Math.round(height * 0.1));
      const fillTop = height - fillH;

      const gfx = scene.add.graphics();
      gfx.fillStyle(colorA, 1);
      gfx.fillRect(0, fillTop, sectionW, fillH);
      gfx.fillStyle(colorB, 1);
      gfx.fillRect(sectionW, fillTop, sectionW, fillH);
      gfx.generateTexture(texKey, texW, height);
      gfx.destroy();

      const tile = scene.add.tileSprite(
        TUNING.GAME_WIDTH / 2, centerY,
        TUNING.GAME_WIDTH, height,
        texKey
      );
      tile.setDepth(-3 - (SCROLLING_LAYERS - 1 - i)); // front = -3, back = -9

      this.layers.push(tile);
    }

    // Reverse so index 0 = layer 0 (front) for easier update logic
    this.layers.reverse();
  }

  update(roadSpeed: number, dt: number): void {
    const scrollBase = roadSpeed * dt;
    for (let i = 0; i < this.layers.length; i++) {
      const factor = this.speedFactors[i];
      if (factor > 0) {
        this.layers[i].tilePositionX += scrollBase * factor;
      }
    }
  }

  setVisible(visible: boolean): void {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].setVisible(visible);
    }
    this.staticBg.setVisible(visible);
  }

  destroy(): void {
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers.length = 0;
    this.staticBg.destroy();
  }
}
