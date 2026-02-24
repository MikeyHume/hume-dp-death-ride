/**
 * generate-mobile-images.mjs
 *
 * Creates half-resolution, compressed JPEG variants of tutorial/cutscene images
 * for mobile devices. Output goes to _mobile/ subdirectories alongside originals.
 *
 * Usage: node scripts/generate-mobile-images.mjs
 *
 * Requires: sharp (already in devDependencies)
 */

import sharp from 'sharp';
import { readdir, mkdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';

const PUBLIC = 'public';
const MOBILE_SCALE = 0.5;  // 1920x1080 → 960x540
const JPEG_QUALITY = 70;   // Higher compression for mobile

// All image directories/files that mobile loads (from BootScene.ts analysis)
const TARGETS = [
  // Intro-to-tutorial cutscene: 27 frames (mobile loads frame 00000)
  { dir: 'assets/cutscenes/intro_to_tut/v3', pattern: /\.jpg$/i },
  // Tutorial controls: 29 frames (mobile loads frame 00000)
  { dir: 'assets/tutorial/controls_v4', pattern: /\.jpg$/i },
  // Tutorial rage: multiple frames (mobile loads frame 0)
  { dir: 'assets/tutorial/tut_v2/rage_v2', pattern: /\.jpg$/i },
  // Standalone tutorial images
  { file: 'assets/tutorial/how_to_play_v2.jpg' },
  { file: 'assets/tutorial/tut_v2/rules_v2.jpg' },
];

async function processFile(srcPath, dstPath) {
  const meta = await sharp(srcPath).metadata();
  const newW = Math.round(meta.width * MOBILE_SCALE);
  const newH = Math.round(meta.height * MOBILE_SCALE);

  await sharp(srcPath)
    .resize(newW, newH, { kernel: 'lanczos3' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(dstPath);

  const srcStat = await stat(srcPath);
  const dstStat = await stat(dstPath);
  const savings = ((1 - dstStat.size / srcStat.size) * 100).toFixed(0);

  console.log(
    `  ${basename(srcPath)}: ${(srcStat.size / 1024).toFixed(0)}KB → ` +
    `${(dstStat.size / 1024).toFixed(0)}KB (${newW}×${newH}, -${savings}%)`
  );
}

async function processDirectory(relDir, pattern) {
  const srcDir = join(PUBLIC, relDir);
  const dstDir = join(PUBLIC, relDir + '_mobile');

  try {
    await mkdir(dstDir, { recursive: true });
  } catch { /* exists */ }

  const files = (await readdir(srcDir)).filter(f => pattern.test(f));
  console.log(`\n${relDir}: ${files.length} files → ${relDir}_mobile/`);

  for (const file of files) {
    await processFile(join(srcDir, file), join(dstDir, file));
  }
}

async function processStandaloneFile(relPath) {
  const srcPath = join(PUBLIC, relPath);
  const ext = extname(relPath);
  const base = relPath.slice(0, -ext.length);
  const dstPath = join(PUBLIC, base + '_mobile' + ext);

  console.log(`\n${relPath} → ${base}_mobile${ext}`);
  await processFile(srcPath, dstPath);
}

async function main() {
  console.log('=== Generating mobile image variants ===');
  console.log(`Scale: ${MOBILE_SCALE}x, JPEG quality: ${JPEG_QUALITY}\n`);

  for (const target of TARGETS) {
    if (target.dir) {
      await processDirectory(target.dir, target.pattern);
    } else if (target.file) {
      await processStandaloneFile(target.file);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
