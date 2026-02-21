/**
 * Generate mobile-resolution sprite sheets using nearest-neighbor scaling.
 * Keeps the retro pixel aesthetic while cutting VRAM by ~75%.
 *
 * Usage: node scripts/generate_mobile_assets.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SCALE = 0.5;
const PUBLIC = path.join(__dirname, '..', 'public');

// All sprite sheets that need mobile copies: [src, frameW, frameH]
const SHEETS = [
  // Player
  ['assets/dp_player/dp_moto_v03.png', 702, 590],
  ['assets/dp_player/dp_start.png', 824, 708],
  ['assets/dp_player/dp_attack.png', 821, 590],
  ['assets/dp_player/dp_powered_up.png', 1076, 697],
  ['assets/dp_player/dp_speed_up.png', 655, 469],
  ['assets/dp_player/dp_rocket_lancher_v2.png', 802, 488],
  // COL
  ['assets/COL/COL_rocket.png', 840, 637],
  ['assets/COL/COL_shield.png', 840, 637],
  ['assets/COL/COL_hit.png', 840, 637],
  // Pickups
  ['assets/pickups/rocket_Projectile.png', 385, 200],
  ['assets/pickups/rocket pickup.png', 300, 300],
  ['assets/pickups/shield_pickup.png', 300, 300],
  // VFX
  ['assets/vfx/vfx_explosion.png', 440, 440],
  ['assets/vfx/slash.png', 140, 120],
  // Countdown
  ['assets/start/countdown.png', 600, 600],
];

// Cars: 20 sheets, same frame size
for (let c = 1; c <= 20; c++) {
  SHEETS.push([`assets/cars/car_${String(c).padStart(3, '0')}.png`, 441, 186]);
}

async function processSheet(relPath, frameW, frameH) {
  const srcPath = path.join(PUBLIC, relPath);

  // Build mobile output path: insert _mobile before extension
  const ext = path.extname(relPath);
  const base = relPath.slice(0, -ext.length);
  const dstRel = `${base}_mobile${ext}`;
  const dstPath = path.join(PUBLIC, dstRel);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });

  // Read original to get dimensions
  const meta = await sharp(srcPath).metadata();
  const origW = meta.width;
  const origH = meta.height;

  // Calculate grid
  const cols = Math.round(origW / frameW);
  const rows = Math.round(origH / frameH);

  // Mobile frame dimensions (integer)
  const mFrameW = Math.floor(frameW * SCALE);
  const mFrameH = Math.floor(frameH * SCALE);

  // Mobile sheet dimensions (exact grid fit)
  const mSheetW = cols * mFrameW;
  const mSheetH = rows * mFrameH;

  // Resize with nearest-neighbor
  await sharp(srcPath)
    .resize(mSheetW, mSheetH, { kernel: 'nearest' })
    .png({ compressionLevel: 6 })
    .toFile(dstPath);

  const origVRAM = (origW * origH * 4 / 1024 / 1024).toFixed(1);
  const mobileVRAM = (mSheetW * mSheetH * 4 / 1024 / 1024).toFixed(1);

  console.log(`  ${relPath}`);
  console.log(`    ${origW}x${origH} -> ${mSheetW}x${mSheetH} (frame: ${frameW}x${frameH} -> ${mFrameW}x${mFrameH})`);
  console.log(`    VRAM: ${origVRAM} MB -> ${mobileVRAM} MB`);

  return { relPath, dstRel, mFrameW, mFrameH, origVRAM: parseFloat(origVRAM), mobileVRAM: parseFloat(mobileVRAM) };
}

async function main() {
  console.log(`Generating mobile sprite sheets at ${SCALE}x scale (nearest-neighbor)\n`);

  let totalOrig = 0;
  let totalMobile = 0;

  for (const [relPath, frameW, frameH] of SHEETS) {
    try {
      const result = await processSheet(relPath, frameW, frameH);
      totalOrig += result.origVRAM;
      totalMobile += result.mobileVRAM;
    } catch (err) {
      console.error(`  ERROR: ${relPath}: ${err.message}`);
    }
  }

  console.log(`\n=== TOTALS ===`);
  console.log(`Original VRAM: ${totalOrig.toFixed(0)} MB`);
  console.log(`Mobile VRAM:   ${totalMobile.toFixed(0)} MB`);
  console.log(`Savings:       ${(totalOrig - totalMobile).toFixed(0)} MB (${((1 - totalMobile/totalOrig) * 100).toFixed(0)}%)`);
}

main().catch(console.error);
