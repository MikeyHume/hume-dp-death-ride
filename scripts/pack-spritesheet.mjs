#!/usr/bin/env node
/**
 * pack-spritesheet.mjs — Packs individual JPEG/PNG frames into a single spritesheet
 *
 * Usage:
 *   node scripts/pack-spritesheet.mjs --sequence start_loop --scale 1.0 --quality 85
 *   node scripts/pack-spritesheet.mjs --sequence start_play --scale 0.5
 *   node scripts/pack-spritesheet.mjs --all --scale 0.5
 *
 * Outputs:
 *   public/assets/start/<sequence>_sheet[_s50].jpg   (spritesheet image)
 *   public/assets/start/<sequence>_sheet[_s50].json  (Phaser atlas JSON)
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ── Config ──

const SEQUENCES = {
  start_loop: {
    dir: 'public/assets/start/start_loop',
    pattern: /^DP_Death_Ride_Title_Loop(\d+)\.jpg$/,
    prefix: 'start-loop',
  },
  start_play: {
    dir: 'public/assets/start/start_play',
    pattern: /^DP_Death_Ride_Title_Start(\d+)\.jpg$/,
    prefix: 'start-play',
  },
};

const MAX_TEXTURE_SIZE = 16384; // iOS max WebGL texture dimension

// ── CLI args ──

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  return args[i + 1] || def;
}
const hasFlag = (name) => args.includes(`--${name}`);

const scale = parseFloat(getArg('scale', '1.0'));
const quality = parseInt(getArg('quality', '85'), 10);
const dryRun = hasFlag('dry-run');
const doAll = hasFlag('all');
const seqName = getArg('sequence', doAll ? null : 'start_loop');

const sequencesToPack = doAll
  ? Object.keys(SEQUENCES)
  : seqName ? [seqName] : [];

if (sequencesToPack.length === 0) {
  console.error('Usage: --sequence <name> | --all');
  process.exit(1);
}

// ── Main ──

async function packSequence(name) {
  const seq = SEQUENCES[name];
  if (!seq) {
    console.error(`Unknown sequence: ${name}`);
    return;
  }

  const srcDir = path.resolve(seq.dir);
  if (!fs.existsSync(srcDir)) {
    console.error(`Source directory not found: ${srcDir}`);
    return;
  }

  // Discover and sort frames
  const files = fs.readdirSync(srcDir)
    .filter(f => seq.pattern.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(seq.pattern)[1], 10);
      const nb = parseInt(b.match(seq.pattern)[1], 10);
      return na - nb;
    });

  if (files.length === 0) {
    console.error(`No frames found in ${srcDir}`);
    return;
  }

  console.log(`\n▓ Packing ${name}: ${files.length} frames @ scale=${scale} quality=${quality}`);

  // Get frame dimensions from first frame
  const firstMeta = await sharp(path.join(srcDir, files[0])).metadata();
  const srcW = firstMeta.width;
  const srcH = firstMeta.height;
  const frameW = Math.round(srcW * scale);
  const frameH = Math.round(srcH * scale);

  // Ensure even dimensions (JPEG requirement)
  const fw = frameW % 2 === 0 ? frameW : frameW + 1;
  const fh = frameH % 2 === 0 ? frameH : frameH + 1;

  console.log(`  Source: ${srcW}×${srcH} → Scaled: ${fw}×${fh}`);

  // Calculate optimal grid
  const numFrames = files.length;
  let bestCols = numFrames;
  let bestRows = 1;
  let bestWaste = Infinity;

  for (let cols = 1; cols <= numFrames; cols++) {
    const rows = Math.ceil(numFrames / cols);
    const sheetW = cols * fw;
    const sheetH = rows * fh;

    // Must fit within texture limits
    if (sheetW > MAX_TEXTURE_SIZE || sheetH > MAX_TEXTURE_SIZE) continue;

    const waste = (cols * rows - numFrames) * fw * fh;
    // Prefer squarish layouts — add penalty for extreme aspect ratios
    const aspect = Math.max(sheetW / sheetH, sheetH / sheetW);
    const penalty = waste + aspect * 1000;

    if (penalty < bestWaste) {
      bestWaste = penalty;
      bestCols = cols;
      bestRows = rows;
    }
  }

  const sheetW = bestCols * fw;
  const sheetH = bestRows * fh;
  console.log(`  Grid: ${bestCols}×${bestRows} = ${sheetW}×${sheetH} (${numFrames} frames, ${bestCols * bestRows - numFrames} empty)`);

  if (sheetW > MAX_TEXTURE_SIZE || sheetH > MAX_TEXTURE_SIZE) {
    console.error(`  ✗ Sheet ${sheetW}×${sheetH} exceeds max texture size ${MAX_TEXTURE_SIZE}!`);
    console.error(`    Try a smaller --scale value.`);
    return;
  }

  const estMB = (sheetW * sheetH * 4 / 1024 / 1024).toFixed(1);
  console.log(`  VRAM estimate: ${estMB} MB (RGBA)`);

  if (dryRun) {
    console.log('  [DRY RUN] Would generate sheet — skipping.');
    return;
  }

  // Resize all frames
  console.log('  Resizing frames...');
  const resized = [];
  for (const file of files) {
    const buf = await sharp(path.join(srcDir, file))
      .resize(fw, fh, { fit: 'fill', kernel: sharp.kernel.nearest })
      .raw()
      .toBuffer();
    resized.push(buf);
  }

  // Composite into spritesheet
  console.log('  Compositing spritesheet...');
  const composites = resized.map((buf, i) => {
    const col = i % bestCols;
    const row = Math.floor(i / bestCols);
    return {
      input: buf,
      raw: { width: fw, height: fh, channels: 3 },
      left: col * fw,
      top: row * fh,
    };
  });

  // Create blank canvas and composite all frames
  const sheetBuf = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .composite(composites)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  // Output paths
  const scaleSuffix = scale < 1.0 ? `_s${Math.round(scale * 100)}` : '';
  const outDir = path.resolve('public/assets/start');
  const sheetFile = `${name}_sheet${scaleSuffix}.jpg`;
  const jsonFile = `${name}_sheet${scaleSuffix}.json`;
  const sheetPath = path.join(outDir, sheetFile);
  const jsonPath = path.join(outDir, jsonFile);

  fs.writeFileSync(sheetPath, sheetBuf);
  console.log(`  ✓ Sheet: ${sheetFile} (${(sheetBuf.length / 1024).toFixed(0)} KB)`);

  // Generate Phaser atlas JSON (hash format)
  const atlasFrames = {};
  for (let i = 0; i < numFrames; i++) {
    const col = i % bestCols;
    const row = Math.floor(i / bestCols);
    const key = `${seq.prefix}-${String(i).padStart(2, '0')}`;
    atlasFrames[key] = {
      frame: { x: col * fw, y: row * fh, w: fw, h: fh },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
      sourceSize: { w: fw, h: fh },
    };
  }

  const atlas = {
    frames: atlasFrames,
    meta: {
      app: 'pack-spritesheet.mjs',
      version: '1.0',
      image: sheetFile,
      format: 'RGBA8888',
      size: { w: sheetW, h: sheetH },
      scale: String(scale),
      frameWidth: fw,
      frameHeight: fh,
      frameCount: numFrames,
      cols: bestCols,
      rows: bestRows,
    },
  };

  fs.writeFileSync(jsonPath, JSON.stringify(atlas, null, 2));
  console.log(`  ✓ Atlas: ${jsonFile}`);

  // Also generate spritesheet-format metadata (for Phaser load.spritesheet)
  const spritesheetInfo = {
    key: `${name}_sheet`,
    url: `assets/start/${sheetFile}`,
    frameWidth: fw,
    frameHeight: fh,
    frameCount: numFrames,
    columns: bestCols,
    rows: bestRows,
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    vramMB: parseFloat(estMB),
    scale,
  };
  const infoPath = path.join(outDir, `${name}_sheet${scaleSuffix}_info.json`);
  fs.writeFileSync(infoPath, JSON.stringify(spritesheetInfo, null, 2));
  console.log(`  ✓ Info: ${name}_sheet${scaleSuffix}_info.json`);

  return spritesheetInfo;
}

// ── Run ──

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   SPRITESHEET PACKER                 ║');
  console.log('╚══════════════════════════════════════╝');

  const results = [];
  for (const name of sequencesToPack) {
    const info = await packSequence(name);
    if (info) results.push(info);
  }

  if (results.length > 0) {
    console.log('\n── Summary ──');
    for (const r of results) {
      console.log(`  ${r.key}: ${r.frameWidth}×${r.frameHeight} × ${r.frameCount}f → ${r.sheetWidth}×${r.sheetHeight} (${r.vramMB} MB VRAM)`);
    }
  }

  console.log('\nDone.');
})();
