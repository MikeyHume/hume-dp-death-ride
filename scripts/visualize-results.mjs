#!/usr/bin/env node
/**
 * visualize-results.mjs — Comprehensive visual report combining:
 * 1. Animation inventory (VRAM, file sizes, dimensions)
 * 2. iPhone 12 Mini perf test results (judder, FPS, stddev)
 * 3. Tier feature matrix
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Load Data ──────────────────────────────────────────────────
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'telemetry', 'all-anims-inventory.json'), 'utf8'));
let iphoneResults = null;
try {
  iphoneResults = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'stress', 'anim-perf-latest.json'), 'utf8'));
} catch (e) { /* no iphone results */ }

// ── Helper Functions ───────────────────────────────────────────
function bar(val, max, width = 25) {
  const filled = Math.round((val / max) * width);
  const full = '\u2588';
  const empty = '\u2591';
  return full.repeat(Math.min(filled, width)) + empty.repeat(Math.max(0, width - filled));
}

function color(code, text) { return `\x1b[${code}m${text}\x1b[0m`; }
function red(t) { return color(31, t); }
function yellow(t) { return color(33, t); }
function green(t) { return color(32, t); }
function cyan(t) { return color(36, t); }
function dim(t) { return color(90, t); }
function bold(t) { return color(1, t); }

function gradeColor(grade) {
  if (grade === 'A') return green;
  if (grade === 'B') return (t) => color(32, t);
  if (grade === 'C') return yellow;
  if (grade === 'D') return (t) => color(33, t);
  return red;
}

function vramColor(mb) {
  if (mb > 50) return red;
  if (mb > 20) return yellow;
  return green;
}

// ── Report ─────────────────────────────────────────────────────
const W = 100;
const line = '\u2550'.repeat(W - 2);
const thinLine = '\u2500'.repeat(W - 4);

console.log();
console.log(`\u2554${line}\u2557`);
console.log(`\u2551${bold('  DP MOTO \u2014 ANIMATION PERFORMANCE & ASSET REPORT').padEnd(W + 7)}\u2551`);
console.log(`\u2551${dim('  ' + new Date().toISOString().replace('T', ' ').slice(0, 19)).padEnd(W + 7)}\u2551`);
console.log(`\u2560${line}\u2563`);

// ── Section 1: iPhone 12 Mini Perf Results ─────────────────────
if (iphoneResults && iphoneResults.configs) {
  console.log(`\u2551  ${cyan('\u2550\u2550 IPHONE 12 MINI PLAYBACK TEST RESULTS')} ${'\u2550'.repeat(W - 44)} \u2551`);
  console.log(`\u2551  ${dim('Device: ' + iphoneResults.device + ' | Duration: ' + iphoneResults.duration + 's | Runs: ' + iphoneResults.runsPerConfig + 'x each')}${' '.repeat(20)}\u2551`);
  console.log(`\u2551  ${thinLine}  \u2551`);

  // Header
  console.log(`\u2551  ${'Config'.padEnd(30)} ${'FPS'.padStart(5)} ${'Judder'.padStart(8)} ${'  \u03C3(ms)'.padStart(8)} ${'Grade'.padStart(6)}  ${bar(0, 0, 25)}  ${'Load'.padStart(6)} \u2551`);
  console.log(`\u2551  ${'\u2500'.repeat(30)} ${'\u2500'.repeat(5)} ${'\u2500'.repeat(8)} ${'\u2500'.repeat(8)} ${'\u2500'.repeat(6)}  ${'\u2500'.repeat(25)}  ${'\u2500'.repeat(6)} \u2551`);

  for (const config of iphoneResults.configs) {
    const runs = config.runs.filter(r => !r.crashed);
    if (runs.length === 0) continue;

    const avgFps = runs.reduce((s, r) => s + r.gameFps, 0) / runs.length;
    const avgJudder = runs.reduce((s, r) => s + r.animJudder, 0) / runs.length;
    const avgStddev = runs.reduce((s, r) => s + r.animStdDev, 0) / runs.length;
    const avgLoad = runs.reduce((s, r) => s + r.loadTimeMs, 0) / runs.length;

    let grade;
    if (avgJudder < 15) grade = 'A';
    else if (avgJudder < 30) grade = 'B';
    else if (avgJudder < 50) grade = 'C';
    else if (avgJudder < 75) grade = 'D';
    else grade = 'F';

    const judderBar = bar(avgJudder, 100, 25);
    const jColor = avgJudder < 20 ? green : avgJudder < 40 ? yellow : red;
    const gColor = gradeColor(grade);
    const fpsColor = avgFps >= 55 ? green : avgFps >= 40 ? yellow : red;

    const label = config.label.padEnd(30);
    console.log(`\u2551  ${label} ${fpsColor(avgFps.toFixed(0).padStart(5))} ${jColor((avgJudder.toFixed(0) + '%').padStart(8))} ${avgStddev.toFixed(1).padStart(8)} ${gColor(grade.padStart(6))}  ${jColor(judderBar)}  ${dim(avgLoad.toFixed(0).padStart(5) + 'ms')} \u2551`);
  }
}

// ── Section 2: Full Asset Inventory ────────────────────────────
console.log(`\u2560${line}\u2563`);
console.log(`\u2551  ${cyan('\u2550\u2550 COMPLETE ANIMATION ASSET INVENTORY')} ${'\u2550'.repeat(W - 42)} \u2551`);
console.log(`\u2551  ${thinLine}  \u2551`);

const maxVram = Math.max(...inventory.map(r => r.vram * (r.carMultiplier || 1)));

let currentSection = '';
for (const r of inventory) {
  if (r.section !== currentSection) {
    currentSection = r.section;
    console.log(`\u2551  ${cyan('\u2500\u2500 ' + currentSection.toUpperCase())} ${'\u2500'.repeat(W - currentSection.length - 10)}  \u2551`);
  }

  const totalVram = r.vram * (r.carMultiplier || 1);
  const vc = vramColor(totalVram);
  const vramStr = r.carMultiplier
    ? `${r.vram}\u00D7${r.carMultiplier}=${totalVram.toFixed(0)}`
    : `${r.vram}`;

  const engineTag = r.engine === 'manual-perf' ? green('\u2713') : r.engine === 'phaser-anim' ? yellow('P') : dim('M');
  const liteTag = r.liteSkip ? red('L') : ' ';
  const vBar = bar(totalVram, maxVram, 18);

  console.log(`\u2551  ${engineTag}${liteTag} ${r.label.padEnd(28)} ${dim(r.frames + 'f').padStart(7)} ${dim('@' + r.fps + 'fps').padEnd(8)} ${vc(vBar)} ${vc(vramStr.padStart(10) + 'MB')} ${dim((r.fileMB + 'MB').padStart(7))} \u2551`);
}

// ── Section 3: VRAM Budget Comparison ──────────────────────────
console.log(`\u2560${line}\u2563`);
console.log(`\u2551  ${cyan('\u2550\u2550 VRAM BUDGET BY DEVICE TIER')} ${'\u2550'.repeat(W - 34)} \u2551`);
console.log(`\u2551  ${thinLine}  \u2551`);

// Calculate per-tier VRAM budgets
const tiers = {
  'Desktop': { filter: r => r.variant === 'desktop', carCount: 20, lite: false },
  'Tablet': { filter: r => r.variant === 'desktop', carCount: 5, lite: false },
  'Phone-High (A14+)': { filter: r => r.variant === 'mobile' || r.variant === 'phone-high', carCount: 2, lite: true },
  'Gen-Mobile': { filter: r => r.variant === 'mobile' || r.variant === 'phone-low', carCount: 2, lite: true },
  'Phone-Low (A12)': { filter: r => r.variant === 'mobile' || r.variant === 'phone-low', carCount: 0, lite: true },
};

const maxTierVram = 1200;
for (const [tierName, cfg] of Object.entries(tiers)) {
  let totalVram = 0;
  let totalFile = 0;
  let sheetCount = 0;

  for (const r of inventory) {
    if (!cfg.filter(r)) continue;
    if (cfg.lite && r.liteSkip) continue;

    let mult = 1;
    if (r.carMultiplier) mult = Math.min(r.carMultiplier, cfg.carCount);
    if (mult === 0) continue;

    totalVram += r.vram * mult;
    totalFile += r.fileMB * mult;
    sheetCount += mult;
  }

  const budgetBar = bar(totalVram, maxTierVram, 40);
  const tc = totalVram > 200 ? red : totalVram > 100 ? yellow : green;

  console.log(`\u2551  ${tierName.padEnd(20)} ${tc(budgetBar)} ${tc((totalVram.toFixed(0) + ' MB').padStart(8))} ${dim('(' + totalFile.toFixed(0) + 'MB disk, ' + sheetCount + ' sheets)')}${' '.repeat(Math.max(0, 10))} \u2551`);
}

// ── Section 4: Top VRAM Hogs ───────────────────────────────────
console.log(`\u2560${line}\u2563`);
console.log(`\u2551  ${cyan('\u2550\u2550 TOP 10 VRAM HOGS')} ${'\u2550'.repeat(W - 24)} \u2551`);

const sorted = [...inventory]
  .map(r => ({ ...r, totalVram: r.vram * (r.carMultiplier || 1) }))
  .sort((a, b) => b.totalVram - a.totalVram)
  .slice(0, 10);

for (let i = 0; i < sorted.length; i++) {
  const r = sorted[i];
  const rank = `${i + 1}.`.padStart(3);
  const vc = vramColor(r.totalVram);
  const hogBar = bar(r.totalVram, sorted[0].totalVram, 30);
  const liteTag = r.liteSkip ? red(' [LITE-SKIP]') : '';
  console.log(`\u2551  ${rank} ${r.label.padEnd(30)} ${vc(hogBar)} ${vc((r.totalVram.toFixed(0) + ' MB').padStart(8))}${liteTag}${' '.repeat(Math.max(0, W - 85))} \u2551`);
}

// ── Section 5: Playback Engine Summary ─────────────────────────
console.log(`\u2560${line}\u2563`);
console.log(`\u2551  ${cyan('\u2550\u2550 PLAYBACK ENGINE ASSIGNMENT')} ${'\u2550'.repeat(W - 34)} \u2551`);
console.log(`\u2551  ${thinLine}  \u2551`);

const manualPerf = inventory.filter(r => r.engine === 'manual-perf');
const phaserAnim = inventory.filter(r => r.engine === 'phaser-anim');
const manual = inventory.filter(r => r.engine === 'manual');

console.log(`\u2551  ${green('\u2713 manual perf.now()')}  ${manualPerf.length} anims — ${dim('Title loop + start (lowest judder, ~40% +CRT)')}${' '.repeat(24)} \u2551`);
console.log(`\u2551  ${yellow('P Phaser animation')}  ${phaserAnim.length} anims — ${dim('All gameplay spritesheets (standard Phaser timer)')}${' '.repeat(18)} \u2551`);
console.log(`\u2551  ${dim('M manual stepped')}    ${manual.length} anims — ${dim('Countdown (1fps, frame-by-frame in GameScene)')}${' '.repeat(20)} \u2551`);

// ── Footer ─────────────────────────────────────────────────────
console.log(`\u2560${line}\u2563`);
console.log(`\u2551  LEGEND:                                                                                            \u2551`);
console.log(`\u2551  ${green('\u2588')} = <20MB VRAM  ${yellow('\u2588')} = 20-50MB  ${red('\u2588')} = >50MB     ${red('L')} = Skipped in liteMode (phones)                     \u2551`);
console.log(`\u2551  Grade: ${green('A')}<15%  ${green('B')}<30%  ${yellow('C')}<50%  ${yellow('D')}<75%  ${red('F')}>75% judder                                              \u2551`);
console.log(`\u255A${line}\u255D`);
