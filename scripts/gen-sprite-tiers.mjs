#!/usr/bin/env node
/**
 * gen-sprite-tiers.mjs — Generate nearest-neighbor downscaled spritesheet tiers.
 *
 * Creates multiple resolution tiers for player animation spritesheets.
 * Uses sharp with nearest-neighbor (no interpolation) for crisp retro pixels.
 *
 * Tiers: s75 (75%), s50 (50%, already exists), s37 (37.5%), s25 (25%)
 *
 * Usage:
 *   node scripts/gen-sprite-tiers.mjs          # generate all tiers
 *   node scripts/gen-sprite-tiers.mjs --dry     # show what would be created
 *   node scripts/gen-sprite-tiers.mjs --tier s25 # generate only one tier
 *
 * Output structure:
 *   public/assets/dp_player/dp_attack.png          (original 100%)
 *   public/assets/dp_player/dp_attack_mobile.png   (existing 50%, unchanged)
 *   public/assets/dp_player/dp_attack_s75.png      (new 75%)
 *   public/assets/dp_player/dp_attack_s37.png      (new 37.5%)
 *   public/assets/dp_player/dp_attack_s25.png      (new 25%)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// ── Spritesheet Manifest ──
// All player animation spritesheets that need tier variants.
// "mobile" suffix variants already exist at 50% scale — we skip s50 generation.
const SHEETS = [
  // dp_player directory
  { file: 'public/assets/dp_player/dp_attack.png',             fw: 821,  fh: 590  },
  { file: 'public/assets/dp_player/dp_moto_v03.png',           fw: 702,  fh: 590  },
  { file: 'public/assets/dp_player/dp_start.png',              fw: 824,  fh: 708  },
  { file: 'public/assets/dp_player/dp_powered_up.png',         fw: 1076, fh: 697  },
  { file: 'public/assets/dp_player/dp_speed_up.png',           fw: 655,  fh: 469  },
  { file: 'public/assets/dp_player/dp_rocket_lancher_v2.png',  fw: 802,  fh: 488  },
  // COL directory
  { file: 'public/assets/COL/COL_rocket.png',                  fw: 840,  fh: 637  },
  { file: 'public/assets/COL/COL_shield.png',                  fw: 840,  fh: 637  },
  { file: 'public/assets/COL/COL_hit.png',                     fw: 840,  fh: 637  },
  // VFX directory
  { file: 'public/assets/vfx/slash.png',                       fw: 140,  fh: 120  },
  { file: 'public/assets/vfx/vfx_explosion.png',               fw: 440,  fh: 440  },
];

// Tiers to generate (scale factor, suffix)
// s50 = _mobile (already exists) — skip these
const TIERS = [
  { scale: 0.75,  suffix: '_s75' },
  { scale: 0.375, suffix: '_s37' },
  { scale: 0.25,  suffix: '_s25' },
];

const ROOT = process.cwd();
const dryRun = process.argv.includes('--dry');
const onlyTier = process.argv.find(a => a.startsWith('--tier='))?.split('=')[1]
               || (process.argv.includes('--tier') ? process.argv[process.argv.indexOf('--tier') + 1] : null);

async function generateTier(sheet, tier) {
  const srcPath = path.join(ROOT, sheet.file);
  if (!fs.existsSync(srcPath)) {
    console.error(`  SKIP (not found): ${sheet.file}`);
    return null;
  }

  const ext = path.extname(sheet.file);
  const base = sheet.file.slice(0, -ext.length);
  const outFile = `${base}${tier.suffix}${ext}`;
  const outPath = path.join(ROOT, outFile);

  // Read source image metadata
  const meta = await sharp(srcPath).metadata();
  const newW = Math.round(meta.width * tier.scale);
  const newH = Math.round(meta.height * tier.scale);
  const framW = Math.floor(sheet.fw * tier.scale);
  const framH = Math.floor(sheet.fh * tier.scale);
  const vramMB = ((newW * newH * 4) / (1024 * 1024)).toFixed(1);

  if (dryRun) {
    console.log(`  ${tier.suffix}: ${newW}x${newH} (frame ${framW}x${framH}) VRAM=${vramMB}MB → ${outFile}`);
    return { outFile, newW, newH, framW, framH, vramMB };
  }

  // Resize with nearest-neighbor for crisp pixels
  await sharp(srcPath)
    .resize(newW, newH, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 6 })
    .toFile(outPath);

  const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  ${tier.suffix}: ${newW}x${newH} (frame ${framW}x${framH}) VRAM=${vramMB}MB ${sizeKB}KB → ${path.basename(outFile)}`);
  return { outFile, newW, newH, framW, framH, vramMB, sizeKB };
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Spritesheet Tier Generator (nearest-neighbor)      ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  const tiersToGen = onlyTier ? TIERS.filter(t => t.suffix === `_${onlyTier}` || t.suffix === onlyTier) : TIERS;
  if (tiersToGen.length === 0) {
    console.error(`Unknown tier: ${onlyTier}. Available: ${TIERS.map(t => t.suffix.slice(1)).join(', ')}`);
    process.exit(1);
  }

  if (dryRun) console.log('DRY RUN — showing what would be created:\n');

  const manifest = {};
  let totalFiles = 0;

  for (const sheet of SHEETS) {
    const name = path.basename(sheet.file, path.extname(sheet.file));
    console.log(`${name} (${sheet.file}):`);
    manifest[name] = { src: sheet.file, fw: sheet.fw, fh: sheet.fh, tiers: {} };

    for (const tier of tiersToGen) {
      const result = await generateTier(sheet, tier);
      if (result) {
        manifest[name].tiers[tier.suffix.slice(1)] = {
          file: result.outFile,
          fw: result.framW,
          fh: result.framH,
          vramMB: parseFloat(result.vramMB),
        };
        totalFiles++;
      }
    }
    console.log('');
  }

  // Also output the manifest as JSON for BootScene to reference
  const manifestPath = path.join(ROOT, 'public/assets/sprite_tier_manifest.json');
  if (!dryRun) {
    // Build full manifest including existing variants
    const fullManifest = {};
    for (const sheet of SHEETS) {
      const name = path.basename(sheet.file, path.extname(sheet.file));
      const ext = path.extname(sheet.file);
      fullManifest[name] = {
        tiers: {
          s100: { file: sheet.file.replace('public/', ''), fw: sheet.fw, fh: sheet.fh },
          s75:  manifest[name]?.tiers?.s75  ? { file: manifest[name].tiers.s75.file.replace('public/', ''),  fw: manifest[name].tiers.s75.fw,  fh: manifest[name].tiers.s75.fh } : null,
          s50:  { file: sheet.file.replace('public/', '').replace(ext, `_mobile${ext}`), fw: Math.floor(sheet.fw * 0.5), fh: Math.floor(sheet.fh * 0.5) },
          s37:  manifest[name]?.tiers?.s37  ? { file: manifest[name].tiers.s37.file.replace('public/', ''),  fw: manifest[name].tiers.s37.fw,  fh: manifest[name].tiers.s37.fh } : null,
          s25:  manifest[name]?.tiers?.s25  ? { file: manifest[name].tiers.s25.file.replace('public/', ''),  fw: manifest[name].tiers.s25.fw,  fh: manifest[name].tiers.s25.fh } : null,
        }
      };
    }
    fs.writeFileSync(manifestPath, JSON.stringify(fullManifest, null, 2));
    console.log(`Manifest written: ${manifestPath}`);
  }

  // VRAM summary per tier
  console.log('\n── VRAM Summary ──');
  for (const tier of [{ scale: 1.0, suffix: '_s100' }, { scale: 0.75, suffix: '_s75' }, { scale: 0.5, suffix: '_s50' }, { scale: 0.375, suffix: '_s37' }, { scale: 0.25, suffix: '_s25' }]) {
    let totalVRAM = 0;
    for (const sheet of SHEETS) {
      const srcPath = path.join(ROOT, sheet.file);
      if (!fs.existsSync(srcPath)) continue;
      const meta = await sharp(srcPath).metadata();
      const w = Math.round(meta.width * tier.scale);
      const h = Math.round(meta.height * tier.scale);
      totalVRAM += (w * h * 4) / (1024 * 1024);
    }
    const bar = '█'.repeat(Math.round(totalVRAM / 10)) + '░'.repeat(Math.max(0, 40 - Math.round(totalVRAM / 10)));
    console.log(`  ${tier.suffix.slice(1).padStart(4)}: ${bar} ${totalVRAM.toFixed(1)} MB`);
  }

  console.log(`\n${dryRun ? 'Would create' : 'Created'} ${totalFiles} files from ${SHEETS.length} source sheets.`);
}

main().catch(err => { console.error(err); process.exit(1); });
