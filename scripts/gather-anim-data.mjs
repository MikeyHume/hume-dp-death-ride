#!/usr/bin/env node
/**
 * gather-anim-data.mjs — Collects metadata for all animation assets.
 * Outputs JSON with dimensions, VRAM, file sizes, frame counts.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const anims = [
  // TITLE
  { id: 'title-loop-full', section: 'Title Screen', label: 'Title Loop (full)', file: 'public/assets/start/start_loop_sheet.jpg', frameW: 1928, frameH: 1076, frames: 27, fps: 12, loop: true, variant: 'desktop', engine: 'manual-perf' },
  { id: 'title-loop-s50', section: 'Title Screen', label: 'Title Loop (s50)', file: 'public/assets/start/start_loop_sheet_s50.jpg', frameW: 964, frameH: 538, frames: 27, fps: 12, loop: true, variant: 'phone-high', engine: 'manual-perf' },
  { id: 'title-loop-s25', section: 'Title Screen', label: 'Title Loop (s25)', file: 'public/assets/start/start_loop_sheet_s25.jpg', frameW: 482, frameH: 269, frames: 27, fps: 12, loop: true, variant: 'phone-low', engine: 'manual-perf' },
  { id: 'title-start-full', section: 'Title Screen', label: 'Title Start (full)', file: 'public/assets/start/start_play_sheet.jpg', frameW: 1928, frameH: 1076, frames: 25, fps: 12, loop: false, variant: 'desktop', engine: 'manual-perf' },
  { id: 'title-start-s50', section: 'Title Screen', label: 'Title Start (s50)', file: 'public/assets/start/start_play_sheet_s50.jpg', frameW: 964, frameH: 538, frames: 25, fps: 12, loop: false, variant: 'phone-high', engine: 'manual-perf' },
  { id: 'title-start-s25', section: 'Title Screen', label: 'Title Start (s25)', file: 'public/assets/start/start_play_sheet_s25.jpg', frameW: 482, frameH: 269, frames: 25, fps: 12, loop: false, variant: 'phone-low', engine: 'manual-perf' },

  // PLAYER
  { id: 'player-ride', section: 'Player', label: 'Ride (9f @12fps)', file: 'public/assets/dp_player/dp_moto_v03.png', frameW: 702, frameH: 590, frames: 9, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'player-ride-m', section: 'Player', label: 'Ride Mobile', file: 'public/assets/dp_player/dp_moto_v03_mobile.png', frameW: 351, frameH: 295, frames: 9, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim' },
  { id: 'player-attack', section: 'Player', label: 'Attack (21f @30fps)', file: 'public/assets/dp_player/dp_attack.png', frameW: 821, frameH: 590, frames: 21, fps: 30, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-attack-m', section: 'Player', label: 'Attack Mobile', file: 'public/assets/dp_player/dp_attack_mobile.png', frameW: 410, frameH: 295, frames: 21, fps: 30, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-start', section: 'Player', label: 'Start (14f @12fps)', file: 'public/assets/dp_player/dp_start.png', frameW: 824, frameH: 708, frames: 14, fps: 12, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-start-m', section: 'Player', label: 'Start Mobile', file: 'public/assets/dp_player/dp_start_mobile.png', frameW: 412, frameH: 354, frames: 14, fps: 12, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-powered', section: 'Player', label: 'Powered Up (18f @12fps)', file: 'public/assets/dp_player/dp_powered_up.png', frameW: 1076, frameH: 697, frames: 18, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-powered-m', section: 'Player', label: 'Powered Up Mobile', file: 'public/assets/dp_player/dp_powered_up_mobile.png', frameW: 538, frameH: 348, frames: 18, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-speedup', section: 'Player', label: 'Speed Up (64f @24fps)', file: 'public/assets/dp_player/dp_speed_up.png', frameW: 655, frameH: 469, frames: 64, fps: 24, loop: true, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-speedup-m', section: 'Player', label: 'Speed Up Mobile', file: 'public/assets/dp_player/dp_speed_up_mobile.png', frameW: 327, frameH: 234, frames: 64, fps: 24, loop: true, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-rocket', section: 'Player', label: 'Rocket Launch (20f @12fps)', file: 'public/assets/dp_player/dp_rocket_lancher_v2.png', frameW: 802, frameH: 488, frames: 20, fps: 12, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'player-rocket-m', section: 'Player', label: 'Rocket Launch Mobile', file: 'public/assets/dp_player/dp_rocket_lancher_v2_mobile.png', frameW: 401, frameH: 244, frames: 20, fps: 12, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },

  // COL
  { id: 'col-rocket', section: 'Collection FX', label: 'Collect Rocket (19f @24fps)', file: 'public/assets/COL/COL_rocket.png', frameW: 840, frameH: 637, frames: 19, fps: 24, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'col-rocket-m', section: 'Collection FX', label: 'Collect Rocket Mobile', file: 'public/assets/COL/COL_rocket_mobile.png', frameW: 420, frameH: 318, frames: 19, fps: 24, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'col-shield', section: 'Collection FX', label: 'Collect Shield (19f @24fps)', file: 'public/assets/COL/COL_shield.png', frameW: 840, frameH: 637, frames: 19, fps: 24, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'col-shield-m', section: 'Collection FX', label: 'Collect Shield Mobile', file: 'public/assets/COL/COL_shield_mobile.png', frameW: 420, frameH: 318, frames: 19, fps: 24, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },
  { id: 'col-hit', section: 'Collection FX', label: 'Collect Hit (19f @24fps)', file: 'public/assets/COL/COL_hit.png', frameW: 840, frameH: 637, frames: 19, fps: 24, loop: false, variant: 'desktop', engine: 'phaser-anim', liteSkip: true },
  { id: 'col-hit-m', section: 'Collection FX', label: 'Collect Hit Mobile', file: 'public/assets/COL/COL_hit_mobile.png', frameW: 420, frameH: 318, frames: 19, fps: 24, loop: false, variant: 'mobile', engine: 'phaser-anim', liteSkip: true },

  // PICKUPS
  { id: 'pickup-rocket', section: 'Pickups', label: 'Rocket Pickup (31f @12fps)', file: 'public/assets/pickups/rocket pickup.png', frameW: 300, frameH: 300, frames: 31, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'pickup-rocket-m', section: 'Pickups', label: 'Rocket Pickup Mobile', file: 'public/assets/pickups/rocket pickup_mobile.png', frameW: 150, frameH: 150, frames: 31, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim' },
  { id: 'pickup-shield', section: 'Pickups', label: 'Shield Pickup (17f @12fps)', file: 'public/assets/pickups/shield_pickup.png', frameW: 300, frameH: 300, frames: 17, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'pickup-shield-m', section: 'Pickups', label: 'Shield Pickup Mobile', file: 'public/assets/pickups/shield_pickup_mobile.png', frameW: 150, frameH: 150, frames: 17, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim' },
  { id: 'rocket-proj', section: 'Pickups', label: 'Rocket Projectile (20f @12fps)', file: 'public/assets/pickups/rocket_Projectile.png', frameW: 385, frameH: 200, frames: 20, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'rocket-proj-m', section: 'Pickups', label: 'Rocket Projectile Mobile', file: 'public/assets/pickups/rocket_Projectile_mobile.png', frameW: 192, frameH: 100, frames: 20, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim' },

  // VFX
  { id: 'explosion', section: 'VFX', label: 'Explosion (7f @12fps)', file: 'public/assets/vfx/vfx_explosion.png', frameW: 440, frameH: 440, frames: 7, fps: 12, loop: false, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'explosion-m', section: 'VFX', label: 'Explosion Mobile', file: 'public/assets/vfx/vfx_explosion_mobile.png', frameW: 220, frameH: 220, frames: 7, fps: 12, loop: false, variant: 'mobile', engine: 'phaser-anim' },
  { id: 'slash', section: 'VFX', label: 'Slash (7f @24fps)', file: 'public/assets/vfx/slash.png', frameW: 140, frameH: 120, frames: 8, fps: 24, loop: false, variant: 'desktop', engine: 'phaser-anim' },
  { id: 'slash-m', section: 'VFX', label: 'Slash Mobile', file: 'public/assets/vfx/slash_mobile.png', frameW: 70, frameH: 60, frames: 8, fps: 24, loop: false, variant: 'mobile', engine: 'phaser-anim' },

  // CARS
  { id: 'car-001', section: 'Cars', label: 'Car 001 (59f @12fps)', file: 'public/assets/cars/car_001.png', frameW: 441, frameH: 186, frames: 59, fps: 12, loop: true, variant: 'desktop', engine: 'phaser-anim', carMultiplier: 20 },
  { id: 'car-001-m', section: 'Cars', label: 'Car 001 Mobile', file: 'public/assets/cars/car_001_mobile.png', frameW: 220, frameH: 93, frames: 59, fps: 12, loop: true, variant: 'mobile', engine: 'phaser-anim', carMultiplier: 3 },

  // COUNTDOWN
  { id: 'countdown', section: 'UI', label: 'Countdown (5f @1fps)', file: 'public/assets/start/countdown.png', frameW: 600, frameH: 600, frames: 5, fps: 1, loop: false, variant: 'desktop', engine: 'manual' },
  { id: 'countdown-m', section: 'UI', label: 'Countdown Mobile', file: 'public/assets/start/countdown_mobile.png', frameW: 300, frameH: 300, frames: 5, fps: 1, loop: false, variant: 'mobile', engine: 'manual' },
];

async function main() {
  const results = [];
  for (const a of anims) {
    const filePath = path.join(ROOT, a.file);
    try {
      const meta = await sharp(filePath).metadata();
      const vram = (meta.width * meta.height * 4) / (1024 * 1024);
      const fileBytes = fs.statSync(filePath).size;
      results.push({
        ...a,
        sheetW: meta.width,
        sheetH: meta.height,
        vram: parseFloat(vram.toFixed(1)),
        fileKB: parseFloat((fileBytes / 1024).toFixed(0)),
        fileMB: parseFloat((fileBytes / (1024 * 1024)).toFixed(2)),
      });
    } catch (e) {
      results.push({ ...a, sheetW: 0, sheetH: 0, vram: 0, fileKB: 0, fileMB: 0, error: e.message });
    }
  }

  // Save
  fs.mkdirSync(path.join(ROOT, 'telemetry'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'telemetry', 'all-anims-inventory.json'), JSON.stringify(results, null, 2));

  // Print report
  printReport(results);
}

function bar(val, max, width = 30, ch = '\u2588', empty = '\u2591') {
  const filled = Math.round((val / max) * width);
  return ch.repeat(Math.min(filled, width)) + empty.repeat(Math.max(0, width - filled));
}

function printReport(results) {
  const W = 90;
  const line = '\u2550'.repeat(W - 2);

  console.log(`\n\u2554${line}\u2557`);
  console.log(`\u2551  DP MOTO \u2014 COMPLETE ANIMATION ASSET INVENTORY${' '.repeat(W - 50)}\u2551`);
  console.log(`\u2560${line}\u2563`);

  let currentSection = '';
  const maxVram = Math.max(...results.map(r => r.vram * (r.carMultiplier || 1)));

  for (const r of results) {
    if (r.section !== currentSection) {
      currentSection = r.section;
      console.log(`\u2551 \x1b[36m\u2550\u2550 ${currentSection.toUpperCase()} ${'═'.repeat(W - currentSection.length - 8)}\x1b[0m \u2551`);
    }

    const totalVram = r.vram * (r.carMultiplier || 1);
    const vramBar = bar(totalVram, maxVram, 20);
    const vramColor = totalVram > 50 ? '\x1b[31m' : totalVram > 20 ? '\x1b[33m' : '\x1b[32m';
    const vramStr = (r.carMultiplier ? `${r.vram}×${r.carMultiplier}=${totalVram.toFixed(0)}` : `${r.vram}`).padStart(10);

    const label = r.label.padEnd(28);
    const dims = `${r.sheetW}×${r.sheetH}`.padEnd(12);
    const meta = `${r.frames}f @${r.fps}fps`.padEnd(12);
    const fileStr = `${r.fileMB.toFixed(1)}MB`.padStart(7);
    const engineIcon = r.engine === 'manual-perf' ? '\x1b[32m\u2713\x1b[0m' : r.engine === 'phaser-anim' ? '\x1b[33mP\x1b[0m' : '\x1b[90mM\x1b[0m';

    console.log(`\u2551 ${engineIcon} ${label} ${dims}${meta}${vramColor}${vramBar}\x1b[0m ${vramStr}MB ${fileStr} \u2551`);
  }

  // Totals
  console.log(`\u2560${line}\u2563`);

  const desktopResults = results.filter(r => r.variant === 'desktop');
  const mobileResults = results.filter(r => r.variant === 'mobile' || r.variant === 'phone-high' || r.variant === 'phone-low');

  // Desktop total VRAM (all assets loaded)
  let desktopVram = 0;
  for (const r of desktopResults) {
    desktopVram += r.vram * (r.carMultiplier || 1);
  }

  // Phone-high total VRAM (title s50 + mobile sheets - liteSkip)
  const phoneHighSheets = results.filter(r =>
    (r.variant === 'mobile' && !r.liteSkip) || r.variant === 'phone-high'
  );
  let phoneHighVram = 0;
  for (const r of phoneHighSheets) {
    const mult = r.carMultiplier ? Math.min(r.carMultiplier, 2) : 1;
    phoneHighVram += r.vram * mult;
  }

  // Phone-low (lite mode: only ride + essential, no heavy anims)
  const phoneLowSheets = results.filter(r =>
    (r.variant === 'mobile' && !r.liteSkip) || r.variant === 'phone-low'
  );
  let phoneLowVram = 0;
  for (const r of phoneLowSheets) {
    phoneLowVram += r.vram;  // no car multiplier on phone-low (0 cars)
  }

  let desktopFile = 0, phoneHighFile = 0, phoneLowFile = 0;
  for (const r of desktopResults) desktopFile += r.fileMB * (r.carMultiplier || 1);
  for (const r of phoneHighSheets) phoneHighFile += r.fileMB * (r.carMultiplier ? Math.min(r.carMultiplier, 2) : 1);
  for (const r of phoneLowSheets) phoneLowFile += r.fileMB;

  console.log(`\u2551  VRAM BUDGET BY TIER:${' '.repeat(W - 24)}\u2551`);
  console.log(`\u2551  \x1b[36mDesktop\x1b[0m     ${bar(desktopVram, 1000, 40)} \x1b[31m${desktopVram.toFixed(0)} MB\x1b[0m (${desktopFile.toFixed(0)} MB disk)${' '.repeat(Math.max(0, W - 75))}\u2551`);
  console.log(`\u2551  \x1b[33mPhone-High\x1b[0m  ${bar(phoneHighVram, 1000, 40)} \x1b[33m${phoneHighVram.toFixed(0)} MB\x1b[0m (${phoneHighFile.toFixed(0)} MB disk)${' '.repeat(Math.max(0, W - 75))}\u2551`);
  console.log(`\u2551  \x1b[32mPhone-Low\x1b[0m   ${bar(phoneLowVram, 1000, 40)} \x1b[32m${phoneLowVram.toFixed(0)} MB\x1b[0m (${phoneLowFile.toFixed(0)} MB disk)${' '.repeat(Math.max(0, W - 75))}\u2551`);

  console.log(`\u2560${line}\u2563`);
  console.log(`\u2551  LEGEND: \x1b[32m\u2713\x1b[0m = manual perf.now()  \x1b[33mP\x1b[0m = Phaser anim system  \x1b[90mM\x1b[0m = manual stepped${' '.repeat(Math.max(0, W - 72))}\u2551`);
  console.log(`\u2551  \x1b[32m\u2588\x1b[0m = <20MB  \x1b[33m\u2588\x1b[0m = 20-50MB  \x1b[31m\u2588\x1b[0m = >50MB VRAM${' '.repeat(Math.max(0, W - 52))}\u2551`);
  console.log(`\u255A${line}\u255D`);

  // Summary
  console.log(`\nTotal unique animations: ${results.length}`);
  console.log(`Desktop-only assets: ${desktopResults.length}`);
  console.log(`Mobile assets: ${mobileResults.length}`);
  console.log(`Lite-mode skipped: ${results.filter(r => r.liteSkip).length}`);
}

main();
