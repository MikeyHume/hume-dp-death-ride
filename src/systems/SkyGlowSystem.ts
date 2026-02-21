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

export class SkyGlowSystem {
  private scene: Phaser.Scene;
  private skyImage: Phaser.GameObjects.Image;
  private buildingLayers: readonly Phaser.GameObjects.TileSprite[];
  private layerTexKeys: readonly string[];   // original texture keys per layer
  private glowOverlay: Phaser.GameObjects.Rectangle;
  private rageActive = false;

  // Beat data for current track (Rhythm Mode only)
  private beatData: BeatData | null = null;
  private currentTrackId: string | null = null;

  // Static dominant color for glow overlay + building tints (0xRRGGBB or null)
  private staticColor: number | null = null;

  // Hue-shifted background state
  private origSkyTexKey: string;
  private origSkyScale: number;
  private hueShiftActive = false;
  private huedSkyTexKey = 'sky-hued';
  private huedLayerKeys = new Set<string>(); // keys we created for cleanup

  // Crossfade overlay for smooth sky transitions
  private crossfadeSky: Phaser.GameObjects.Image;
  private crossfadeTween: Phaser.Tweens.Tween | null = null;
  private prevHuedSkyTexKey = 'sky-hued-prev'; // second buffer for crossfade

  // Smoothed values (avoid jitter)
  private smoothBass = 0;
  private smoothPerc = 0;
  private smoothHarm = 0;
  private smoothEnergy = 0;
  private smoothHigh = 0;

  // Fallback elapsed time
  private elapsed = 0;

  constructor(scene: Phaser.Scene, parallax: ParallaxSystem) {
    this.scene = scene;
    this.skyImage = parallax.getSky();
    this.buildingLayers = parallax.getLayers();
    this.layerTexKeys = parallax.getTextureKeys();

    // Save original sky texture info for restoring later
    this.origSkyTexKey = 'sky-img';
    this.origSkyScale = this.skyImage.scaleX;

    // Crossfade overlay: sits on top of the sky, fades out to reveal new hue
    this.crossfadeSky = scene.add.image(this.skyImage.x, this.skyImage.y, this.origSkyTexKey);
    this.crossfadeSky.setOrigin(this.skyImage.originX, this.skyImage.originY);
    this.crossfadeSky.setScale(this.origSkyScale);
    this.crossfadeSky.setDepth(this.skyImage.depth + 0.01); // just above the real sky
    this.crossfadeSky.setAlpha(0); // hidden until needed

    // Bright overlay above all buildings (depth -2.5), below road (depth 0)
    const skyH = TUNING.ROAD_TOP_Y;
    this.glowOverlay = scene.add.rectangle(
      TUNING.GAME_WIDTH / 2, skyH / 2,
      TUNING.GAME_WIDTH, skyH,
      TUNING.SKY_GLOW_COLOR, 0
    );
    this.glowOverlay.setDepth(-2.5);
    this.glowOverlay.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Load beat data for a track (Rhythm Mode). */
  setBeatData(trackId: string, data: BeatData): void {
    this.currentTrackId = trackId;
    this.beatData = data;
  }

  /** Clear beat data (e.g. when switching to Normal Mode). */
  clearBeatData(): void {
    this.currentTrackId = null;
    this.beatData = null;
    this.smoothBass = 0;
    this.smoothPerc = 0;
    this.smoothHarm = 0;
    this.smoothEnergy = 0;
    this.smoothHigh = 0;
  }

  /**
   * Set static dominant color for glow overlay + building tints.
   * Pass null to clear.
   */
  setStaticColor(color: number | null): void {
    this.staticColor = color;
  }

  /**
   * Extract the most colorful dominant color from a thumbnail image.
   * Uses k-means with 3 clusters, picks the most saturated centroid,
   * then pushes to full saturation + full brightness (HSV S=1, V=1).
   * Returns a single 0xRRGGBB value.
   */
  static extractDominantColor(img: HTMLImageElement): number {
    const size = TUNING.SKY_GRADIENT_SAMPLE_SIZE;
    const iters = TUNING.SKY_GRADIENT_KMEANS_ITERS;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0xcc44aa;

    ctx.drawImage(img, 0, 0, size, size);
    let data: ImageData;
    try {
      data = ctx.getImageData(0, 0, size, size);
    } catch {
      return 0xcc44aa;
    }

    const pixels: [number, number, number][] = [];
    for (let i = 0; i < data.data.length; i += 4) {
      pixels.push([data.data[i], data.data[i + 1], data.data[i + 2]]);
    }
    if (pixels.length === 0) return 0xcc44aa;

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

    let bestIdx = 0;
    let bestSat = -1;
    for (let c = 0; c < 3; c++) {
      const [r, g, b] = centroids[c];
      const sat = rgbSaturation(r, g, b);
      if (sat > bestSat) { bestSat = sat; bestIdx = c; }
    }

    return pushFullSatBright(centroids[bestIdx][0], centroids[bestIdx][1], centroids[bestIdx][2]);
  }

  /**
   * Hue-shift the sky and ALL parallax layers (buildings + railing) to match the target color.
   * Uses canvas 'hue' composite: keeps original luminance/saturation, replaces hue.
   * Sky crossfades over TUNING.SKY_HUE_TRANSITION_MS; buildings snap instantly.
   */
  applyHueShift(color: number): void {
    const cssColor = hexToCSS(color);

    // ── Sky crossfade: double-buffer swap, old sky fades out on overlay ──
    if (this.hueShiftActive) {
      if (this.crossfadeTween) { this.crossfadeTween.stop(); this.crossfadeTween = null; }
      // Swap buffer keys: old sky canvas moves to prev slot (still intact)
      const tmp = this.huedSkyTexKey;
      this.huedSkyTexKey = this.prevHuedSkyTexKey;
      this.prevHuedSkyTexKey = tmp;
      // Show old sky on crossfade overlay, fade it out
      this.crossfadeSky.setTexture(this.prevHuedSkyTexKey);
      this.crossfadeSky.setScale(this.origSkyScale);
      this.crossfadeSky.setAlpha(1);
      this.crossfadeTween = this.scene.tweens.add({
        targets: this.crossfadeSky,
        alpha: 0,
        duration: TUNING.SKY_HUE_TRANSITION_MS,
        ease: 'Sine.easeInOut',
      });
    }

    // ── Hue-shift sky image (new color into current buffer) ──
    this.hueShiftTexture(this.origSkyTexKey, this.huedSkyTexKey, cssColor);
    this.skyImage.setTexture(this.huedSkyTexKey);
    this.skyImage.setScale(this.origSkyScale);
    this.skyImage.clearTint();

    // ── Hue-shift each parallax layer texture ──
    const processed = new Map<string, string>();
    for (let i = 0; i < this.buildingLayers.length; i++) {
      const origKey = this.layerTexKeys[i];
      let huedKey = processed.get(origKey);
      if (!huedKey) {
        huedKey = origKey + '-hued';
        this.hueShiftTexture(origKey, huedKey, cssColor);
        processed.set(origKey, huedKey);
        this.huedLayerKeys.add(huedKey);
      }
      this.buildingLayers[i].setTexture(huedKey);
    }

    this.hueShiftActive = true;
  }

  /** Create/update a hue-shifted canvas texture from an existing texture. */
  private hueShiftTexture(srcKey: string, destKey: string, cssColor: string): void {
    const srcImg = this.scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
    const w = srcImg.naturalWidth || srcImg.width;
    const h = srcImg.naturalHeight || srcImg.height;

    let canvasTex: Phaser.Textures.CanvasTexture;
    if (this.scene.textures.exists(destKey)) {
      canvasTex = this.scene.textures.get(destKey) as Phaser.Textures.CanvasTexture;
    } else {
      canvasTex = this.scene.textures.createCanvas(destKey, w, h)!;
    }
    const ctx = canvasTex.getContext();

    // Draw original as base
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(srcImg, 0, 0, w, h);

    // Apply hue blend: replaces hue while keeping luminance + saturation
    ctx.globalCompositeOperation = 'hue';
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'source-over';
    canvasTex.refresh();
  }

  /** Whether a hue-shifted background is currently applied. */
  isHueShiftActive(): boolean {
    return this.hueShiftActive;
  }

  /** Restore all textures to originals. */
  clearHueShift(): void {
    if (!this.hueShiftActive) return;

    // Stop any running crossfade
    if (this.crossfadeTween) { this.crossfadeTween.stop(); this.crossfadeTween = null; }
    this.crossfadeSky.setAlpha(0);

    // Restore sky
    this.skyImage.setTexture(this.origSkyTexKey);
    this.skyImage.setScale(this.origSkyScale);
    this.skyImage.clearTint();

    // Restore each layer to its original texture
    for (let i = 0; i < this.buildingLayers.length; i++) {
      this.buildingLayers[i].setTexture(this.layerTexKeys[i]);
    }

    this.hueShiftActive = false;
  }

  /** Sample a uint8 array at a given time position. Returns 0-1. */
  private sampleAt(arr: number[], timeSec: number): number {
    if (!this.beatData || arr.length === 0) return 0;
    const idx = (timeSec * 1000) / this.beatData.resolution_ms;
    const i0 = Math.floor(idx);
    const i1 = i0 + 1;
    if (i0 < 0) return arr[0] / 255;
    if (i0 >= arr.length - 1) return arr[arr.length - 1] / 255;
    const frac = idx - i0;
    return ((arr[i0] * (1 - frac) + arr[i1] * frac)) / 255;
  }

  /**
   * Update visual effects. positionSec = current playback position in the track.
   * Pass -1 if no track is playing.
   */
  update(dt: number, positionSec: number): void {
    this.elapsed += dt;

    // ── Rhythm Mode: beat-reactive visuals ──
    if (this.beatData && positionSec >= 0) {
      const bass   = this.sampleAt(this.beatData.bands.bass, positionSec);
      const perc   = this.sampleAt(this.beatData.percussive, positionSec);
      const harm   = this.sampleAt(this.beatData.harmonic, positionSec);
      const energy = this.sampleAt(this.beatData.energy, positionSec);

      const sm = TUNING.SKY_GLOW_SMOOTHING;
      this.smoothBass   += (bass   - this.smoothBass)   * sm;
      this.smoothPerc   += (perc   - this.smoothPerc)   * sm;
      this.smoothHarm   += (harm   - this.smoothHarm)   * sm;
      this.smoothEnergy += (energy - this.smoothEnergy) * sm;

      const rageMult = this.rageActive ? TUNING.SKY_GLOW_RAGE_MULT : 1.0;

      // Sky glow overlay: driven by bass + overall energy
      const glowIntensity = Math.min(
        (this.smoothBass * TUNING.SKY_GLOW_BASS_WEIGHT +
         this.smoothEnergy * TUNING.SKY_GLOW_ENERGY_WEIGHT) * rageMult,
        1
      );
      const glowColor = this.rageActive ? TUNING.SKY_GLOW_RAGE_COLOR
        : (this.staticColor ?? TUNING.SKY_GLOW_COLOR);
      this.glowOverlay.setFillStyle(glowColor);
      this.glowOverlay.setAlpha(glowIntensity * TUNING.SKY_GLOW_ALPHA_MAX);

      // Building bloom: driven by harmonic + percussive (additive tint on top of hue-shifted textures)
      const bloomColor = this.rageActive ? TUNING.SKY_BLOOM_RAGE_COLOR
        : (this.staticColor ?? TUNING.SKY_BLOOM_COLOR);
      const bloomIntensity = Math.min(
        (this.smoothHarm * TUNING.SKY_BLOOM_HARM_WEIGHT +
         this.smoothPerc * TUNING.SKY_BLOOM_PERC_WEIGHT) * rageMult,
        1
      );
      const bTint = lerpColor(0xffffff, bloomColor, bloomIntensity * TUNING.SKY_BLOOM_TINT_STRENGTH);
      for (let idx = 1; idx < this.buildingLayers.length; idx++) {
        this.buildingLayers[idx].setTint(bTint);
      }
      return;
    }

    // ── Normal Mode: glow overlay only (hue-shifted textures already applied) ──
    if (this.staticColor !== null) {
      this.glowOverlay.setFillStyle(this.staticColor);
      this.glowOverlay.setAlpha(TUNING.SKY_GLOW_STATIC_OVERLAY_ALPHA);
      return;
    }

    // ── No data, no color: clear everything ──
    this.glowOverlay.setAlpha(0);
    if (this.hueShiftActive) this.clearHueShift();
    for (let idx = 0; idx < this.buildingLayers.length; idx++) {
      this.buildingLayers[idx].clearTint();
    }
  }

  setRage(active: boolean): void {
    if (active === this.rageActive) return;
    this.rageActive = active;
    this.glowOverlay.setFillStyle(
      active ? TUNING.SKY_GLOW_RAGE_COLOR : TUNING.SKY_GLOW_COLOR
    );
  }

  setVisible(visible: boolean): void {
    this.glowOverlay.setVisible(visible);
    if (!visible) {
      for (let idx = 0; idx < this.buildingLayers.length; idx++) {
        this.buildingLayers[idx].clearTint();
      }
    }
  }

  destroy(): void {
    this.glowOverlay.destroy();
    if (this.crossfadeTween) this.crossfadeTween.stop();
    this.crossfadeSky.destroy();
    // Clean up hue-shifted textures
    if (this.scene.textures.exists(this.huedSkyTexKey)) {
      this.scene.textures.remove(this.huedSkyTexKey);
    }
    if (this.scene.textures.exists(this.prevHuedSkyTexKey)) {
      this.scene.textures.remove(this.prevHuedSkyTexKey);
    }
    for (const key of this.huedLayerKeys) {
      if (this.scene.textures.exists(key)) {
        this.scene.textures.remove(key);
      }
    }
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

/** Lerp between two RGB colors. t=0 → colorA, t=1 → colorB */
function lerpColor(colorA: number, colorB: number, t: number): number {
  const rA = (colorA >> 16) & 0xff;
  const gA = (colorA >> 8) & 0xff;
  const bA = colorA & 0xff;
  const rB = (colorB >> 16) & 0xff;
  const gB = (colorB >> 8) & 0xff;
  const bB = colorB & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return (r << 16) | (g << 8) | b;
}

/** Convert 0xRRGGBB to CSS '#rrggbb' string */
function hexToCSS(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
