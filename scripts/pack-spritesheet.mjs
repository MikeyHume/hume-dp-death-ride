#!/usr/bin/env node
/**
 * pack-spritesheet.mjs — Packs individual JPEG/PNG frames into a single spritesheet
 *
 * Usage:
 *   node scripts/pack-spritesheet.mjs --all --unified          (960×540 unified for all sequences)
 *   node scripts/pack-spritesheet.mjs --sequence start_loop --scale 0.5
 *   node scripts/pack-spritesheet.mjs --all --scale 0.35
 *   node scripts/pack-spritesheet.mjs --statics               (resize tutorial static images)
 *
 * Outputs:
 *   <outDir>/<sequence>_sheet[_u|_s50].jpg   (spritesheet image)
 *   <outDir>/<sequence>_sheet[_u|_s50].json  (Phaser atlas JSON)
 *   <outDir>/<sequence>_sheet[_u|_s50]_info.json  (spritesheet metadata)
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ── Unified target resolution (exact 16:9) ──
const TARGET_W = 960;
const TARGET_H = 540;

// ── Sequence configs ──

const SEQUENCES = {
  start_loop: {
    dir: 'public/assets/start/start_loop',
    outDir: 'public/assets/start',
    pattern: /^DP_Death_Ride_Title_Loop(\d+)\.jpg$/,
    prefix: 'start-loop',
  },
  start_play: {
    dir: 'public/assets/start/start_play',
    outDir: 'public/assets/start',
    pattern: /^DP_Death_Ride_Title_Start(\d+)\.jpg$/,
    prefix: 'start-play',
  },
  pre_start: {
    dir: 'public/assets/cutscenes/pre_start/v02',
    outDir: 'public/assets/cutscenes/pre_start',
    pattern: /^pre_start_v02__(\d+)\.png$/,
    prefix: 'pre-start',
  },
  intro_tut: {
    dir: 'public/assets/cutscenes/intro_to_tut/v3',
    outDir: 'public/assets/cutscenes/intro_to_tut',
    pattern: /^intro_to_tut_v03__(\d+)\.jpg$/,
    prefix: 'intro-tut',
  },
  tut_controls: {
    dir: 'public/assets/tutorial/controls_v4',
    outDir: 'public/assets/tutorial',
    pattern: /^controls_v4__(\d+)\.jpg$/,
    prefix: 'tut-controls',
  },
  tut_rage: {
    dir: 'public/assets/tutorial/tut_v2/rage_v2',
    outDir: 'public/assets/tutorial',
    pattern: /^rage_v2_(\d+)\.jpg$/,
    prefix: 'tut-rage',
  },
};

// Tutorial static images (single frames, not sequences)
const STATICS = [
  { src: 'public/assets/tutorial/how_to_play_v2.jpg', outDir: 'public/assets/tutorial', name: 'how_to_play_v2' },
  { src: 'public/assets/tutorial/tut_v2/rules_v2.jpg', outDir: 'public/assets/tutorial', name: 'rules_v2' },
];

const MAX_TEXTURE_SIZE = 8192; // Conservative iOS WebGL limit

// ── CLI args ──

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  return args[i + 1] || def;
}
const hasFlag = (name) => args.includes(`--${name}`);

const unified = hasFlag('unified');
const scale = unified ? 1.0 : parseFloat(getArg('scale', '0.35'));
const quality = parseInt(getArg('quality', '85'), 10);
const dryRun = hasFlag('dry-run');
const doAll = hasFlag('all');
const doStatics = hasFlag('statics') || doAll;
const seqName = getArg('sequence', doAll ? null : 'start_loop');

const sequencesToPack = doAll
  ? Object.keys(SEQUENCES)
  : seqName ? [seqName] : [];

if (sequencesToPack.length === 0 && !doStatics) {
  console.error('Usage: --sequence <name> | --all | --statics');
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

  // Determine frame dimensions
  let fw, fh;
  if (unified) {
    fw = TARGET_W;
    fh = TARGET_H;
    console.log(`\n▓ Packing ${name}: ${files.length} frames @ unified ${fw}×${fh} quality=${quality}`);
  } else {
    const firstMeta = await sharp(path.join(srcDir, files[0])).metadata();
    const frameW = Math.round(firstMeta.width * scale);
    const frameH = Math.round(firstMeta.height * scale);
    // Ensure even dimensions (JPEG requirement)
    fw = frameW % 2 === 0 ? frameW : frameW + 1;
    fh = frameH % 2 === 0 ? frameH : frameH + 1;
    console.log(`\n▓ Packing ${name}: ${files.length} frames @ scale=${scale} quality=${quality}`);
    console.log(`  Source: ${firstMeta.width}×${firstMeta.height} → Scaled: ${fw}×${fh}`);
  }

  // Calculate optimal grid
  const numFrames = files.length;
  let bestCols = numFrames;
  let bestRows = 1;
  let bestWaste = Infinity;

  for (let cols = 1; cols <= numFrames; cols++) {
    const rows = Math.ceil(numFrames / cols);
    const sheetW = cols * fw;
    const sheetH = rows * fh;

    if (sheetW > MAX_TEXTURE_SIZE || sheetH > MAX_TEXTURE_SIZE) continue;

    const waste = (cols * rows - numFrames) * fw * fh;
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
    console.error(`    Try a smaller --scale value or lower unified target.`);
    return;
  }

  const estMB = (sheetW * sheetH * 4 / 1024 / 1024).toFixed(1);
  console.log(`  VRAM estimate: ${estMB} MB (RGBA)`);

  if (dryRun) {
    console.log('  [DRY RUN] Would generate sheet — skipping.');
    return;
  }

  // Resize all frames (fit: 'cover' crops to exact target ratio, removeAlpha normalizes PNG→RGB)
  console.log('  Resizing frames...');
  const resized = [];
  for (const file of files) {
    const buf = await sharp(path.join(srcDir, file))
      .resize(fw, fh, { fit: 'cover', kernel: sharp.kernel.nearest })
      .removeAlpha()
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

  const sheetBuf = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .composite(composites)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  // Output paths
  const suffix = unified ? '_u' : (scale < 1.0 ? `_s${Math.round(scale * 100)}` : '');
  const outDir = path.resolve(seq.outDir);
  const sheetFile = `${name}_sheet${suffix}.jpg`;
  const jsonFile = `${name}_sheet${suffix}.json`;
  const sheetPath = path.join(outDir, sheetFile);
  const jsonPath = path.join(outDir, jsonFile);

  // Ensure output directory exists
  fs.mkdirSync(outDir, { recursive: true });

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
      scale: unified ? 'unified' : String(scale),
      frameWidth: fw,
      frameHeight: fh,
      frameCount: numFrames,
      cols: bestCols,
      rows: bestRows,
    },
  };

  fs.writeFileSync(jsonPath, JSON.stringify(atlas, null, 2));
  console.log(`  ✓ Atlas: ${jsonFile}`);

  // Compute relative URL from public/ root
  const relUrl = path.relative(path.resolve('public'), sheetPath).replace(/\\/g, '/');

  // Spritesheet-format metadata (for Phaser load.spritesheet)
  const spritesheetInfo = {
    key: `${name}_sheet`,
    url: relUrl,
    frameWidth: fw,
    frameHeight: fh,
    frameCount: numFrames,
    columns: bestCols,
    rows: bestRows,
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    vramMB: parseFloat(estMB),
    scale: unified ? 'unified' : scale,
  };
  const infoPath = path.join(outDir, `${name}_sheet${suffix}_info.json`);
  fs.writeFileSync(infoPath, JSON.stringify(spritesheetInfo, null, 2));
  console.log(`  ✓ Info: ${name}_sheet${suffix}_info.json`);

  return spritesheetInfo;
}

// ── Resize static tutorial images ──

async function resizeStatics() {
  console.log('\n▓ Resizing static tutorial images...');
  const fw = unified ? TARGET_W : Math.round(2752 * scale);
  const fh = unified ? TARGET_H : Math.round(1536 * scale);
  const suffix = unified ? '_u' : (scale < 1.0 ? `_s${Math.round(scale * 100)}` : '');

  for (const s of STATICS) {
    const srcPath = path.resolve(s.src);
    if (!fs.existsSync(srcPath)) {
      console.error(`  Static not found: ${srcPath}`);
      continue;
    }
    const outPath = path.join(path.resolve(s.outDir), `${s.name}${suffix}.jpg`);
    await sharp(srcPath)
      .resize(fw, fh, { fit: 'cover', kernel: sharp.kernel.nearest })
      .removeAlpha()
      .jpeg({ quality, mozjpeg: true })
      .toFile(outPath);
    const stat = fs.statSync(outPath);
    console.log(`  ✓ ${s.name}${suffix}.jpg (${(stat.size / 1024).toFixed(0)} KB) → ${fw}×${fh}`);
  }
}

// ── Run ──

(async () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   SPRITESHEET PACKER                 ║');
  console.log('╚══════════════════════════════════════╝');
  if (unified) {
    console.log(`  Mode: UNIFIED ${TARGET_W}×${TARGET_H}`);
  } else {
    console.log(`  Mode: scale=${scale}`);
  }

  const results = [];
  for (const name of sequencesToPack) {
    const info = await packSequence(name);
    if (info) results.push(info);
  }

  if (doStatics) {
    await resizeStatics();
  }

  if (results.length > 0) {
    console.log('\n── Summary ──');
    let totalVram = 0;
    for (const r of results) {
      console.log(`  ${r.key}: ${r.frameWidth}×${r.frameHeight} × ${r.frameCount}f → ${r.sheetWidth}×${r.sheetHeight} (${r.vramMB} MB VRAM)`);
      totalVram += r.vramMB;
    }
    console.log(`  ─────────────────────────────────`);
    console.log(`  Total VRAM: ${totalVram.toFixed(1)} MB`);
  }

  console.log('\nDone.');
})();
