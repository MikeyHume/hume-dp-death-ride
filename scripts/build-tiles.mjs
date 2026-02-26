#!/usr/bin/env node
/**
 * build-tiles.mjs — Generate GPU-friendly tiling textures from oversized source assets.
 *
 * RESIZE (not crop) — all original art preserved, just scaled to POT width.
 * Road:    12001×534 → 2048×534 resize (full content, POT width)
 * Lines:   Pre-extract bright pixels from resized road → transparent PNG
 * Railing: 18559×100 → 2048×100 resize (full content, POT width)
 *
 * Run: node scripts/build-tiles.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BG = path.join(ROOT, 'public', 'assets', 'background');

const TILE_WIDTH = 2048;
const ROAD_LINES_THRESHOLD = 80; // matches RoadSystem.ts ROAD_LINES_BRIGHTNESS_THRESHOLD

async function buildRoadTile() {
  const src = path.join(BG, 'road.jpg');
  const dst = path.join(BG, 'road_tile.jpg');

  const meta = await sharp(src).metadata();
  console.log(`Road source: ${meta.width}×${meta.height}`);

  // Resize full road to POT width, keep original height
  await sharp(src)
    .resize(TILE_WIDTH, meta.height, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toFile(dst);

  const out = await sharp(dst).metadata();
  console.log(`Road tile:   ${out.width}×${out.height} → ${dst}`);
  return { width: out.width, height: out.height };
}

async function buildRoadLinesTile(tileWidth, tileHeight) {
  const src = path.join(BG, 'road.jpg');
  const dst = path.join(BG, 'road_lines_tile.png');

  // Resize to same dimensions as road tile, then extract lines
  const { data, info } = await sharp(src)
    .resize(tileWidth, tileHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = data;
  // Zero out dark pixels (same logic as RoadSystem.ts)
  for (let i = 0; i < px.length; i += 4) {
    const brightness = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    if (brightness < ROAD_LINES_THRESHOLD) {
      px[i + 3] = 0; // transparent
    }
  }

  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(dst);

  const out = await sharp(dst).metadata();
  const fileSize = (await sharp(dst).toBuffer()).length;
  console.log(`Road lines:  ${out.width}×${out.height} → ${dst} (${(fileSize / 1024).toFixed(0)} KB)`);
}

async function buildRailingTile() {
  const src = path.join(BG, 'railing_dark.jpg');
  const dst = path.join(BG, 'railing_tile.jpg');

  const meta = await sharp(src).metadata();
  console.log(`\nRailing src: ${meta.width}×${meta.height}`);

  // Resize full railing to POT width, keep original height
  await sharp(src)
    .resize(TILE_WIDTH, meta.height, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toFile(dst);

  const out = await sharp(dst).metadata();
  console.log(`Railing tile: ${out.width}×${out.height} → ${dst}`);
}

async function main() {
  console.log('=== Building GPU-friendly tile textures (RESIZE, no content loss) ===\n');

  const road = await buildRoadTile();
  await buildRoadLinesTile(road.width, road.height);
  await buildRailingTile();

  // VRAM comparison
  const oldRoadVram = (12001 * 534 * 4) / (1024 * 1024);
  const newRoadVram = (TILE_WIDTH * 534 * 4) / (1024 * 1024);
  const oldRailVram = (18559 * 100 * 4) / (1024 * 1024);
  const newRailVram = (TILE_WIDTH * 100 * 4) / (1024 * 1024);

  console.log('\n=== VRAM SAVINGS ===');
  console.log(`Road:    ${oldRoadVram.toFixed(1)} MB × 2 (+ lines) = ${(oldRoadVram * 2).toFixed(1)} MB → ${newRoadVram.toFixed(1)} MB × 2 = ${(newRoadVram * 2).toFixed(1)} MB  (saved ${(oldRoadVram * 2 - newRoadVram * 2).toFixed(1)} MB)`);
  console.log(`Railing: ${oldRailVram.toFixed(1)} MB → ${newRailVram.toFixed(1)} MB  (saved ${(oldRailVram - newRailVram).toFixed(1)} MB)`);
  console.log(`TOTAL:   saved ${(oldRoadVram * 2 - newRoadVram * 2 + oldRailVram - newRailVram).toFixed(1)} MB VRAM`);
}

main().catch(console.error);
