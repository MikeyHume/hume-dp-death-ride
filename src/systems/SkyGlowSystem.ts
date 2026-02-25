import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ParallaxSystem } from './ParallaxSystem';

/**
 * Beat data format from pre-computed audio analysis.
 * All band/energy arrays are uint8 (0-255) at fixed resolution_ms intervals.
 */
export interface BeatData {
  resolution_ms: number;
  duration_s: number;
  bpm: number;
  sample_count: number;
  bands: {
    bass: number[];
    low_mid: number[];
    mid: number[];
    high_mid: number[];
    high: number[];
  };
  energy: number[];
  percussive: number[];
  harmonic: number[];
  onset_env: number[];
  centroid: number[];
  beats: number[];
  onsets: number[];
}

/**
 * SkyGlowSystem — hue-rotates the background (sky + all parallax layers)
 * using Phaser preFX ColorMatrix.
 *
 * Concept: assume the background's reference hue is red (0°).
 * Given a target color extracted from album art, calculate the hue angle
 * from red to that color, then rotate ALL background hues by that angle.
 * This preserves tonal relationships in the original art — every color
 * shifts together, maintaining contrast and detail.
 *
 * The preFX is applied per-object (sky image + each TileSprite layer),
 * so road objects and UI are completely unaffected.
 */
export class SkyGlowSystem {
  private scene: Phaser.Scene;

  // PreFX ColorMatrix instances for hue rotation
  private skyFx: Phaser.FX.ColorMatrix | null = null;
  private layerFx: (Phaser.FX.ColorMatrix | null)[] = [];
  private roadFxList: Phaser.FX.ColorMatrix[] = [];

  // Hue angle tween state (degrees)
  private tweenTarget = { angle: 0 };
  private hueTween: Phaser.Tweens.Tween | null = null;

  // Beat data (kept for future rhythm mode)
  private beatData: BeatData | null = null;

  constructor(scene: Phaser.Scene, parallax: ParallaxSystem) {
    this.scene = scene;
    const sky = parallax.getSky();
    const layers = parallax.getLayers();

    // Add hue rotation preFX to sky image
    if (sky.preFX) {
      this.skyFx = sky.preFX.addColorMatrix();
    }

    // Add hue rotation preFX to each parallax layer
    for (const layer of layers) {
      this.layerFx.push(layer.preFX?.addColorMatrix() ?? null);
    }
  }

  /** Add the road container's sprites to the hue rotation group (call after RoadSystem is created).
   *  NOTE: preFX on individual sequential sprites causes framebuffer alignment gaps between tiles.
   *  Road hue is intentionally skipped — sky + parallax layers carry the hue shift, and the road's
   *  dark color means the missing hue rotation is imperceptible. */
  setRoadTile(_roadContainer: Phaser.GameObjects.Container): void {
    // No-op: applying preFX ColorMatrix to individual sprites in a tiled strip
    // causes each sprite to render through its own FBO, introducing sub-pixel seams.
  }

  /**
   * Extract the most colorful dominant color from a thumbnail image.
   * Uses k-means with 3 clusters, picks the most saturated centroid,
   * then pushes to full saturation + full brightness (HSV S=1, V=1).
   * Returns a single 0xRRGGBB value.
   */
  static extractDominantColor(img: HTMLImageElement): number {
    const size = TUNING.SKY_HUE_SAMPLE_SIZE;
    const iters = TUNING.SKY_HUE_KMEANS_ITERS;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0xff0000;

    ctx.drawImage(img, 0, 0, size, size);
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, size, size);
    } catch {
      return 0xff0000;
    }

    const pixels: [number, number, number][] = [];
    for (let i = 0; i < data.data.length; i += 4) {
      pixels.push([data.data[i], data.data[i + 1], data.data[i + 2]]);
    }
    if (pixels.length === 0) return 0xff0000;

    const n = pixels.length;
    let centroids: [number, number, number][] = [
      pixels[0],
      pixels[Math.floor(n / 3)],
      pixels[Math.floor(2 * n / 3)],
    ];

    for (let iter = 0; iter < iters; iter++) {
      const sums: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const counts = [0, 0, 0];

      for (let p = 0; p < n; p++) {
        const px = pixels[p];
        let minDist = Infinity;
        let minIdx = 0;
        for (let c = 0; c < 3; c++) {
          const dr = px[0] - centroids[c][0];
          const dg = px[1] - centroids[c][1];
          const db = px[2] - centroids[c][2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) { minDist = dist; minIdx = c; }
        }
        sums[minIdx][0] += px[0];
        sums[minIdx][1] += px[1];
        sums[minIdx][2] += px[2];
        counts[minIdx]++;
      }

      for (let c = 0; c < 3; c++) {
        if (counts[c] > 0) {
          centroids[c] = [
            Math.round(sums[c][0] / counts[c]),
            Math.round(sums[c][1] / counts[c]),
            Math.round(sums[c][2] / counts[c]),
          ];
        }
      }
    }

    // Pick the centroid whose hue is FURTHEST from red (0°).
    // Since the background is red, we want the color that creates the most
    // visible shift. Filter out near-achromatic clusters (sat < 0.15).
    const MIN_SAT = 0.15;
    let bestIdx = 0;
    let bestDist = -1;
    let fallbackIdx = 0;
    let fallbackSat = -1;

    for (let c = 0; c < 3; c++) {
      const [cr, cg, cb] = centroids[c];
      const sat = rgbSaturation(cr, cg, cb);

      // Track most saturated as fallback
      if (sat > fallbackSat) { fallbackSat = sat; fallbackIdx = c; }

      if (sat < MIN_SAT) continue; // skip achromatic

      // Circular distance from red (0°) — range 0-180
      const hue = extractHueDegrees(pushFullSatBright(cr, cg, cb));
      const dist = Math.min(hue, 360 - hue);
      if (dist > bestDist) { bestDist = dist; bestIdx = c; }
    }

    // If no centroid passed the saturation filter, use the most saturated one
    if (bestDist < 0) bestIdx = fallbackIdx;

    return pushFullSatBright(centroids[bestIdx][0], centroids[bestIdx][1], centroids[bestIdx][2]);
  }

  /** Get the hue angle (0-360°) from a 0xRRGGBB color. */
  static getHueDegrees(color: number): number {
    return extractHueDegrees(color);
  }

  /**
   * Hue-rotate the background to match a target color.
   * Extracts the hue angle from the color (reference = red = 0°),
   * then smoothly rotates all background objects' hues by that angle.
   */
  applyHueFromColor(color: number): void {
    const targetDeg = extractHueDegrees(color);

    // Stop any existing transition
    if (this.hueTween) { this.hueTween.stop(); this.hueTween = null; }

    // Calculate shortest path around the hue circle
    let diff = targetDeg - this.tweenTarget.angle;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    const newTarget = this.tweenTarget.angle + diff;

    this.hueTween = this.scene.tweens.add({
      targets: this.tweenTarget,
      angle: newTarget,
      duration: TUNING.SKY_HUE_TRANSITION_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.applyAngle(this.tweenTarget.angle),
    });
  }

  /** Reset hue rotation back to original (0°). */
  clearHue(): void {
    if (this.hueTween) { this.hueTween.stop(); this.hueTween = null; }
    this.tweenTarget.angle = 0;
    this.applyAngle(0);
  }

  /** Apply a hue rotation angle (degrees) to all background objects. */
  private applyAngle(degrees: number): void {
    const normalized = ((degrees % 360) + 360) % 360;

    if (this.skyFx) {
      this.skyFx.reset();
      if (normalized !== 0) this.skyFx.hue(normalized);
    }
    for (const fx of this.layerFx) {
      if (fx) {
        fx.reset();
        if (normalized !== 0) fx.hue(normalized);
      }
    }
    for (const fx of this.roadFxList) {
      fx.reset();
      if (normalized !== 0) fx.hue(normalized);
    }
  }

  // ── Stubs for future rhythm mode (no-op for now) ──
  setBeatData(_trackId: string, data: BeatData): void { this.beatData = data; }
  clearBeatData(): void { this.beatData = null; }
  setStaticColor(_color: number | null): void {}
  update(_dt: number, _positionSec: number): void {}
  setRage(_active: boolean): void {}
  setVisible(_visible: boolean): void {}

  destroy(): void {
    if (this.hueTween) this.hueTween.stop();
    // preFX is cleaned up by Phaser when game objects are destroyed
  }
}

/** Get HSV saturation from RGB (0-255). Returns 0-1. */
function rgbSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/** Push an RGB color to full saturation and full brightness (HSV S=1, V=1). Returns 0xRRGGBB. */
function pushFullSatBright(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0xff00ff;

  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  const c = 1;
  const x = 1 - Math.abs((h / 60) % 2 - 1);
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }

  const ro = Math.round(r1 * 255);
  const go = Math.round(g1 * 255);
  const bo = Math.round(b1 * 255);
  return (ro << 16) | (go << 8) | bo;
}

/** Extract hue angle (0-360°) from a 0xRRGGBB color. */
function extractHueDegrees(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;

  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;
  return h;
}
