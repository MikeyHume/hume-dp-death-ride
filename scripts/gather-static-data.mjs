#!/usr/bin/env node
/**
 * gather-static-data.mjs — Collects metadata for all static (non-animated) images.
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Every static image loaded in BootScene.ts
const images = [
  // BACKGROUND
  { id: 'road-img', section: 'Background', label: 'Road (full)', file: 'public/assets/background/road.jpg', gate: 'desktop/tablet' },
  { id: 'road-img-m', section: 'Background', label: 'Road (mobile)', file: 'public/assets/background/road_mobile.jpg', gate: 'liteMode' },
  { id: 'railing', section: 'Background', label: 'Railing (full)', file: 'public/assets/background/railing_dark.jpg', gate: 'desktop/tablet' },
  { id: 'railing-m', section: 'Background', label: 'Railing (mobile)', file: 'public/assets/background/railing_dark_mobile.jpg', gate: 'liteMode' },
  { id: 'sky-img', section: 'Background', label: 'Sky', file: 'public/assets/background/sky.jpg', gate: 'always' },
  { id: 'buildings-back', section: 'Background', label: 'Buildings Back Row', file: 'public/assets/background/buildings_back_row_dark.png', gate: 'always' },
  { id: 'buildings-front', section: 'Background', label: 'Buildings Front Row', file: 'public/assets/background/buildings_Front_row_dark.png', gate: 'always' },
  { id: 'buildings-big', section: 'Background', label: 'Big Buildings', file: 'public/assets/background/big_buildings_v03.png', gate: 'non-lite' },
  { id: 'puddle-tex', section: 'Background', label: 'Puddle Texture', file: 'public/assets/background/puddle example.png', gate: 'always' },

  // OBSTACLES
  { id: 'obstacle-crash', section: 'Obstacles', label: 'Road Barrier', file: 'public/assets/obstacles/road_barrier_01.png', gate: 'always' },
  { id: 'obstacle-refl-alt', section: 'Obstacles', label: 'Barrier Reflection', file: 'public/assets/obstacles/road_barrier_01_reflection_alt.png', gate: 'always' },

  // TITLE
  { id: 'start-loop-00', section: 'Title', label: 'Title Loop Frame 0 (fallback)', file: 'public/assets/start/start_loop/DP_Death_Ride_Title_Loop00.jpg', gate: 'no titleAnim' },
  { id: 'dp-close', section: 'Title', label: 'Close-up Shot', file: 'public/assets/dp_close.jpg', gate: 'always' },

  // CUTSCENES (desktop only — individual frames)
  { id: 'pre-start-00', section: 'Cutscenes', label: 'Pre-Start Frame (×46)', file: 'public/assets/cutscenes/pre_start/v02/pre_start_v02__00000.jpg', gate: 'desktop only', multiplier: 46 },
  { id: 'intro-tut-00', section: 'Cutscenes', label: 'Intro-Tut Frame (×27)', file: 'public/assets/cutscenes/intro_to_tut/v3/intro_to_tut_v03__00000.jpg', gate: 'desktop only', multiplier: 27 },
  { id: 'intro-tut-m', section: 'Cutscenes', label: 'Intro-Tut Mobile (1 frame)', file: 'public/assets/cutscenes/intro_to_tut/v3_mobile/intro_to_tut_v03__00000.jpg', gate: 'mobile only' },

  // UI
  { id: 'spotify-text-logo', section: 'UI', label: 'Spotify Logo', file: 'public/ui/spotify_text_logo_.png', gate: 'always' },
  { id: 'sign-in', section: 'UI', label: 'Sign In Button', file: 'public/ui/sign_in.png', gate: 'always' },
  { id: 'cursor', section: 'UI', label: 'Cursor', file: 'public/ui/cursor.png', gate: 'always' },
  { id: 'crosshair', section: 'UI', label: 'Crosshair', file: 'public/ui/crosshair.png', gate: 'always' },
  { id: 'rocket-icon', section: 'UI', label: 'Rocket Icon', file: 'public/assets/pickups/rocket_icon.png', gate: 'always' },
  { id: 'rocket-icon-empty', section: 'UI', label: 'Rocket Icon Empty', file: 'public/assets/pickups/rocket_empty_icon.png', gate: 'always' },
  { id: 'shield-icon', section: 'UI', label: 'Shield Icon', file: 'public/assets/pickups/shield_icon.png', gate: 'always' },
  { id: 'shield-icon-empty', section: 'UI', label: 'Shield Icon Empty', file: 'public/assets/pickups/shield_empty_icon.png', gate: 'always' },
  { id: 'ui-music-menu', section: 'UI', label: 'Music Menu Icon', file: 'public/ui/music menu.png', gate: 'always' },
  { id: 'ui-skip', section: 'UI', label: 'Skip Icon', file: 'public/ui/skip.png', gate: 'always' },
  { id: 'ui-unmuted', section: 'UI', label: 'Unmuted Icon', file: 'public/ui/unmuted.png', gate: 'always' },
  { id: 'ui-muted', section: 'UI', label: 'Muted Icon', file: 'public/ui/muted.png', gate: 'always' },
  { id: 'ui-insta', section: 'UI', label: 'Instagram Icon', file: 'public/ui/insta.png', gate: 'always' },
  { id: 'default-avatar', section: 'UI', label: 'Default Avatar', file: 'public/assets/profiles/dp_anon_pic.jpg', gate: 'always' },
  { id: 'add-pic-icon', section: 'UI', label: 'Add Photo Icon', file: 'public/ui/add_pic_icon.png', gate: 'always' },
  { id: 'play-music', section: 'UI', label: 'Play Music Overlay', file: 'public/assets/start/play_music.png', gate: 'always' },

  // TUTORIAL
  { id: 'tutorial-skip', section: 'Tutorial', label: 'Skip Button', file: 'public/assets/tutorial/skip_v02.png', gate: 'always' },
  { id: 'tutorial-blank', section: 'Tutorial', label: 'How To Play (full)', file: 'public/assets/tutorial/how_to_play_v2.jpg', gate: 'desktop' },
  { id: 'tutorial-blank-m', section: 'Tutorial', label: 'How To Play (mobile)', file: 'public/assets/tutorial/how_to_play_v2_mobile.jpg', gate: 'mobile' },
  { id: 'tutorial-obstacles', section: 'Tutorial', label: 'Obstacles Page', file: 'public/assets/tutorial/obstacles.jpg', gate: 'always' },
  { id: 'tutorial-controls-00', section: 'Tutorial', label: 'Controls Frame (×29 desktop)', file: 'public/assets/tutorial/controls_v4/controls_v4__00000.jpg', gate: 'desktop ×29', multiplier: 29 },
  { id: 'tutorial-controls-m', section: 'Tutorial', label: 'Controls (mobile, 1 frame)', file: 'public/assets/tutorial/controls_v4_mobile/controls_v4__00000.jpg', gate: 'mobile' },
  { id: 'tutorial-rage-0', section: 'Tutorial', label: 'Rage Frame (×4 desktop)', file: 'public/assets/tutorial/tut_v2/rage_v2/rage_v2_0.jpg', gate: 'desktop ×4', multiplier: 4 },
  { id: 'tutorial-rage-m', section: 'Tutorial', label: 'Rage (mobile, 1 frame)', file: 'public/assets/tutorial/tut_v2/rage_v2_mobile/rage_v2_0.jpg', gate: 'mobile' },

  // PROCEDURAL (estimated)
  { id: 'pickup-glow', section: 'Procedural', label: 'Pickup Glow (256×256)', file: null, gate: 'always', fixedW: 256, fixedH: 256 },
  { id: 'shield-glow', section: 'Procedural', label: 'Shield Glow (256×256)', file: null, gate: 'always', fixedW: 256, fixedH: 256 },
  { id: 'rocket-lane-glow', section: 'Procedural', label: 'Rocket Lane Glow (256×256)', file: null, gate: 'always', fixedW: 256, fixedH: 256 },
];

function bar(val, max, width = 25) {
  const f = '\u2588', e = '\u2591';
  const filled = Math.round((val / max) * width);
  return f.repeat(Math.min(filled, width)) + e.repeat(Math.max(0, width - filled));
}

function color(c, t) { return `\x1b[${c}m${t}\x1b[0m`; }
const red = t => color(31, t), yellow = t => color(33, t), green = t => color(32, t);
const cyan = t => color(36, t), dim = t => color(90, t), bold = t => color(1, t);

function vramColor(mb) { return mb > 10 ? red : mb > 3 ? yellow : green; }

async function main() {
  const results = [];

  for (const img of images) {
    if (img.file) {
      const filePath = path.join(ROOT, img.file);
      try {
        const meta = await sharp(filePath).metadata();
        const w = meta.width, h = meta.height;
        const mult = img.multiplier || 1;
        const vram = (w * h * 4) / (1024 * 1024);
        const fileBytes = fs.statSync(filePath).size;
        results.push({ ...img, w, h, vram, totalVram: vram * mult, fileKB: fileBytes / 1024, fileMB: fileBytes / (1024 * 1024) });
      } catch (e) {
        results.push({ ...img, w: 0, h: 0, vram: 0, totalVram: 0, fileKB: 0, fileMB: 0, error: e.message });
      }
    } else {
      // Procedural
      const w = img.fixedW, h = img.fixedH;
      const vram = (w * h * 4) / (1024 * 1024);
      results.push({ ...img, w, h, vram, totalVram: vram, fileKB: 0, fileMB: 0 });
    }
  }

  // Save
  fs.mkdirSync(path.join(ROOT, 'telemetry'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'telemetry', 'static-images-inventory.json'), JSON.stringify(results, null, 2));

  // Print report
  const W = 105;
  const line = '\u2550'.repeat(W - 2);
  const thinLine = '\u2500'.repeat(W - 4);

  console.log();
  console.log(`\u2554${line}\u2557`);
  console.log(`\u2551${bold('  DP MOTO \u2014 STATIC IMAGE ASSET REPORT').padEnd(W + 7)}\u2551`);
  console.log(`\u2560${line}\u2563`);

  const maxVram = Math.max(...results.map(r => r.totalVram));
  let currentSection = '';

  for (const r of results) {
    if (r.section !== currentSection) {
      currentSection = r.section;
      console.log(`\u2551  ${cyan('\u2500\u2500 ' + currentSection.toUpperCase())} ${'\u2500'.repeat(W - currentSection.length - 10)}  \u2551`);
    }

    const vc = vramColor(r.totalVram);
    const dims = r.w ? `${r.w}\u00D7${r.h}` : '?';
    const mult = r.multiplier ? `\u00D7${r.multiplier}` : '';
    const vramStr = r.multiplier
      ? `${r.vram.toFixed(1)}${mult}=${r.totalVram.toFixed(1)}`
      : `${r.totalVram.toFixed(2)}`;
    const fileStr = r.fileMB > 0 ? `${r.fileMB.toFixed(2)}MB` : dim('proc');
    const gateStr = dim(r.gate.padEnd(16));
    const vBar = bar(r.totalVram, maxVram, 20);

    console.log(`\u2551  ${r.label.padEnd(30)} ${dims.padEnd(12)} ${gateStr} ${vc(vBar)} ${vc((vramStr + 'MB').padStart(14))} ${fileStr.padStart(8)} \u2551`);
  }

  // Totals by gate
  console.log(`\u2560${line}\u2563`);
  console.log(`\u2551  ${cyan('\u2550\u2550 VRAM TOTALS BY LOADING CONTEXT')} ${'\u2550'.repeat(W - 38)} \u2551`);
  console.log(`\u2551  ${thinLine}  \u2551`);

  // Desktop: always + desktop-only + non-lite
  const alwaysVram = results.filter(r => r.gate === 'always').reduce((s, r) => s + r.totalVram, 0);
  const desktopOnlyVram = results.filter(r => r.gate.includes('desktop')).reduce((s, r) => s + r.totalVram, 0);
  const nonLiteVram = results.filter(r => r.gate.includes('non-lite') || r.gate.includes('desktop/tablet')).reduce((s, r) => s + r.totalVram, 0);
  const mobileOnlyVram = results.filter(r => r.gate.includes('mobile') || r.gate.includes('liteMode')).reduce((s, r) => s + r.totalVram, 0);

  const desktopTotal = alwaysVram + desktopOnlyVram + nonLiteVram;
  const mobileTotal = alwaysVram + mobileOnlyVram;

  const maxTot = Math.max(desktopTotal, mobileTotal, 1);

  console.log(`\u2551  ${'Always loaded'.padEnd(20)} ${bar(alwaysVram, maxTot, 40)} ${green((alwaysVram.toFixed(1) + ' MB').padStart(10))}${' '.repeat(30)} \u2551`);
  console.log(`\u2551  ${'Desktop-only'.padEnd(20)} ${bar(desktopOnlyVram, maxTot, 40)} ${yellow((desktopOnlyVram.toFixed(1) + ' MB').padStart(10))}${' '.repeat(30)} \u2551`);
  console.log(`\u2551  ${'Non-lite (dt/tab)'.padEnd(20)} ${bar(nonLiteVram, maxTot, 40)} ${yellow((nonLiteVram.toFixed(1) + ' MB').padStart(10))}${' '.repeat(30)} \u2551`);
  console.log(`\u2551  ${'Mobile-only'.padEnd(20)} ${bar(mobileOnlyVram, maxTot, 40)} ${green((mobileOnlyVram.toFixed(1) + ' MB').padStart(10))}${' '.repeat(30)} \u2551`);
  console.log(`\u2551  ${thinLine}  \u2551`);
  console.log(`\u2551  ${bold('Desktop total statics:').padEnd(30)} ${red((desktopTotal.toFixed(1) + ' MB').padStart(10))}${' '.repeat(60)} \u2551`);
  console.log(`\u2551  ${bold('Mobile total statics:').padEnd(30)} ${green((mobileTotal.toFixed(1) + ' MB').padStart(10))}${' '.repeat(60)} \u2551`);

  // Top 5 hogs
  console.log(`\u2560${line}\u2563`);
  console.log(`\u2551  ${cyan('\u2550\u2550 TOP 5 STATIC VRAM HOGS')} ${'\u2550'.repeat(W - 30)} \u2551`);
  const top5 = [...results].sort((a, b) => b.totalVram - a.totalVram).slice(0, 5);
  for (let i = 0; i < top5.length; i++) {
    const r = top5[i];
    const vc = vramColor(r.totalVram);
    console.log(`\u2551  ${(i + 1 + '.').padStart(3)} ${r.label.padEnd(32)} ${vc(bar(r.totalVram, top5[0].totalVram, 35))} ${vc((r.totalVram.toFixed(1) + ' MB').padStart(10))} ${dim(r.gate)}${' '.repeat(Math.max(0, 8))} \u2551`);
  }

  console.log(`\u255A${line}\u255D`);
  console.log(`\nTotal static images: ${results.length}`);
}

main();
