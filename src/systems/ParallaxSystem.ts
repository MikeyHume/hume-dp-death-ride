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

// ── Building layer tuning ──
// Scale: 1.0 = fill screen width, >1 = bigger, <1 = smaller
// Offset Y: positive = shift down, negative = shift up (px added to bottomY)
const BUILDINGS_BIG_SCALE = 3;      // layer 3: big buildings
const BUILDINGS_BIG_OFFSET_Y = -25;     // layer 3: vertical offset
const BUILDINGS_CLOSE_SCALE = 2;      // layer 4: buildings-front, largest
const BUILDINGS_CLOSE_OFFSET_Y = 5;   // layer 4: vertical offset
const BUILDINGS_MID_SCALE = 1.25;     // layer 5: buildings-front flipped
const BUILDINGS_MID_OFFSET_Y = 10;     // layer 5: vertical offset
const BUILDINGS_FRONT_SCALE = 1.0;    // layer 6: buildings-front
const BUILDINGS_FRONT_OFFSET_Y = 10;   // layer 6: vertical offset
const BUILDINGS_BACK_OFFSET_Y = 0;    // layer 7: buildings-back vertical offset
const RAILING_SCALE = 6;            // layer 1: railing (1.0 = fill width, >1 = bigger)
const RAILING_OFFSET_Y = -58;           // layer 1: vertical offset
const RAILING_DEPTH = 2;              // layer 1: depth (must be above road at 0)

export class ParallaxSystem {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private staticBg!: Phaser.GameObjects.Image;
  private speedFactors: number[] = [];
  private scrollCompensation: number[] = []; // 1/tileScale per layer (compensates scaled tiles)

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

    // --- Static background (layer 8): sky image, fill width + 10px taller, top-aligned ---
    this.staticBg = scene.add.image(TUNING.GAME_WIDTH / 2, 0, 'sky-img');
    this.staticBg.setOrigin(0.5, 0);
    const skyBaseScale = TUNING.GAME_WIDTH / this.staticBg.width;
    const skyBaseH = this.staticBg.height * skyBaseScale;
    const skyScale = (skyBaseH + 10) / this.staticBg.height;
    this.staticBg.setScale(skyScale);
    this.staticBg.setDepth(-10);

    // --- Scrolling layers (1-7): tiled textures, back to front ---
    for (let i = SCROLLING_LAYERS - 1; i >= 0; i--) {
      const bottomY = LAYER_BOTTOMS[i];
      const depth = -3 - i; // layer 1 (i=0, front) = -3, layer 7 (i=6, back) = -9

      if (i === SCROLLING_LAYERS - 1) {
        // Layer 7: buildings back row image, scaled uniformly to fill screen width
        const tex = scene.textures.get('buildings-back');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const scale = TUNING.GAME_WIDTH / imgW;
        const scaledH = imgH * scale;
        const adjBottom = bottomY + BUILDINGS_BACK_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          'buildings-back'
        );
        tile.setTileScale(scale, scale);
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(1 / scale);
      } else if (i === SCROLLING_LAYERS - 5) {
        // Layer 3: big buildings image, scaled from bottom
        const tex = scene.textures.get('buildings-big');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const baseScale = TUNING.GAME_WIDTH / imgW;
        const scale = baseScale * BUILDINGS_BIG_SCALE;
        const scaledH = imgH * scale;
        const adjBottom = bottomY + BUILDINGS_BIG_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          'buildings-big'
        );
        tile.setTileScale(scale, scale);
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(1 / scale);
      } else if (i === SCROLLING_LAYERS - 4) {
        // Layer 4: front buildings image, scaled up more from bottom
        const tex = scene.textures.get('buildings-front');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const baseScale = TUNING.GAME_WIDTH / imgW;
        const scale = baseScale * BUILDINGS_CLOSE_SCALE;
        const scaledH = imgH * scale;
        const adjBottom = bottomY + BUILDINGS_CLOSE_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          'buildings-front'
        );
        tile.setTileScale(scale, scale);
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(1 / scale);
      } else if (i === SCROLLING_LAYERS - 3) {
        // Layer 5: front buildings image flipped horizontally, scaled up from bottom
        const tex = scene.textures.get('buildings-front');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const baseScale = TUNING.GAME_WIDTH / imgW;
        const scale = baseScale * BUILDINGS_MID_SCALE;
        const scaledH = imgH * scale;
        const adjBottom = bottomY + BUILDINGS_MID_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          'buildings-front'
        );
        tile.setTileScale(-scale, scale); // negative X = horizontal flip
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(-1 / scale); // negate to keep scroll direction correct
      } else if (i === SCROLLING_LAYERS - 2) {
        // Layer 6: front buildings image, scaled from bottom
        const tex = scene.textures.get('buildings-front');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const baseScale = TUNING.GAME_WIDTH / imgW;
        const scale = baseScale * BUILDINGS_FRONT_SCALE;
        const scaledH = imgH * scale;
        const adjBottom = bottomY + BUILDINGS_FRONT_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          'buildings-front'
        );
        tile.setTileScale(scale, scale);
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(1 / scale);
      } else if (i === 0) {
        // Layer 1: railing image, bottom-aligned at road top, rendered above road
        // Source image may exceed GPU max texture size, so downsample to a safe width
        const tex = scene.textures.get('railing');
        const srcImg = tex.getSourceImage() as HTMLImageElement;
        const imgW = srcImg.width;
        const imgH = srcImg.height;
        const maxW = 4096;
        let texKey = 'railing';
        let usedW = imgW;
        let usedH = imgH;
        if (imgW > maxW) {
          // Downsample onto a canvas texture
          usedH = Math.round(imgH * (maxW / imgW));
          usedW = maxW;
          const canvasTex = scene.textures.createCanvas('railing-safe', usedW, usedH);
          const ctx = canvasTex!.getContext();
          ctx.drawImage(srcImg, 0, 0, usedW, usedH);
          canvasTex!.refresh();
          texKey = 'railing-safe';
        }
        const baseScale = TUNING.GAME_WIDTH / usedW;
        const scale = baseScale * RAILING_SCALE;
        const scaledH = usedH * scale;
        const adjBottom = bottomY + RAILING_OFFSET_Y;

        const tile = scene.add.tileSprite(
          TUNING.GAME_WIDTH / 2,
          adjBottom - scaledH / 2, // bottom-aligned at adjusted bottomY
          TUNING.GAME_WIDTH,
          scaledH,
          texKey
        );
        tile.setTileScale(scale, scale);
        tile.setDepth(RAILING_DEPTH);
        this.layers.push(tile);
        this.scrollCompensation.push(1 / scale);
      } else {
        // Test pattern layers (layer 2)
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
        tile.setDepth(depth);
        this.layers.push(tile);
        this.scrollCompensation.push(1);
      }
    }

    // Reverse so index 0 = layer 0 (front) for easier update logic
    this.layers.reverse();
    this.scrollCompensation.reverse();
  }

  update(roadSpeed: number, dt: number): void {
    const scrollBase = roadSpeed * dt;
    for (let i = 0; i < this.layers.length; i++) {
      const factor = this.speedFactors[i];
      if (factor > 0) {
        // scrollCompensation converts screen-space scroll to texture-space for scaled tiles
        this.layers[i].tilePositionX += scrollBase * factor * this.scrollCompensation[i];
      }
    }
  }

  toggleLayer(layerIndex: number): void {
    if (layerIndex >= 0 && layerIndex < this.layers.length) {
      const layer = this.layers[layerIndex];
      layer.setVisible(!layer.visible);
    }
  }

  toggleSky(): void {
    this.staticBg.setVisible(!this.staticBg.visible);
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
