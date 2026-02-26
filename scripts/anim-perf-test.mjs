#!/usr/bin/env node
/**
 * anim-perf-test.mjs — Animation playback performance test runner
 *
 * Tests different animation loading strategies (individual images, spritesheet, atlas)
 * on a real iPhone via mac-agent, measuring frame timing precision and judder.
 *
 * Prerequisites:
 *   - Vite dev server running on PC (npm run dev)
 *   - mac-agent running on Mac (scripts/start-mac-agent.sh)
 *   - iPhone connected to Mac via USB
 *   - Spritesheets generated: node scripts/pack-spritesheet.mjs --all --scale 0.5
 *
 * Usage:
 *   node scripts/anim-perf-test.mjs                    # Full test matrix
 *   node scripts/anim-perf-test.mjs --runs 5           # 5 runs per config
 *   node scripts/anim-perf-test.mjs --only spritesheet # Single variant
 *   node scripts/anim-perf-test.mjs --dry-run          # Preview only
 *   node scripts/anim-perf-test.mjs --no-crt           # Skip CRT-on tests
 *   node scripts/anim-perf-test.mjs --scale 50         # Only test half-res
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────
const VITE_BASE = process.env.VITE_URL || 'http://localhost:8081';
const GAME_BASE = process.env.GAME_URL || 'http://192.168.1.150:8081';

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}
function hasFlag(name) { return args.includes(`--${name}`); }

const RUNS_PER_CONFIG = parseInt(getArg('runs', '3'), 10);
const DRY_RUN = hasFlag('dry-run');
const ONLY_VARIANT = getArg('only', null);
const ONLY_SCALE = getArg('scale', null);
const NO_CRT = hasFlag('no-crt');
const TEST_ADAPTIVE = hasFlag('adaptive');
const SETTLE = parseInt(getArg('settle', '5'), 10);
const DURATION = parseInt(getArg('duration', '15'), 10);
const COOLDOWN_MS = 6000;

// Test page waits settle + duration + a bit of overhead before posting results
const RESULT_TIMEOUT = (SETTLE + DURATION + 10) * 1000;

// ── Test Matrix ─────────────────────────────────────────────────
const VARIANTS = ['individual', 'spritesheet', 'atlas', 'manual', 'manual-perf'];
const SCALES = [100, 50];   // full-res, half-res
const CRT_STATES = [false, true];
const ADAPTIVE_STATES = TEST_ADAPTIVE ? [false, true] : [false];

// Build test configs
const configs = [];
for (const variant of VARIANTS) {
  for (const scale of SCALES) {
    for (const crt of CRT_STATES) {
      for (const adaptive of ADAPTIVE_STATES) {
        if (ONLY_VARIANT && variant !== ONLY_VARIANT) continue;
        if (ONLY_SCALE && scale !== parseInt(ONLY_SCALE, 10)) continue;
        if (NO_CRT && crt) continue;

        // Individual variant doesn't have scale variants (always loads from start_loop/)
        if (variant === 'individual' && scale !== 100) continue;

        // Manual variants use spritesheet assets, so no full-res individual
        if ((variant === 'manual' || variant === 'manual-perf') && scale === 100) continue;

        // Manual variants always use adaptive internally, skip explicit adaptive flag
        if ((variant === 'manual' || variant === 'manual-perf') && adaptive) continue;

        configs.push({
          variant,
          scale,
          crt,
          adaptive,
          label: `${variant}${scale < 100 ? ` s${scale}` : ''}${crt ? ' +CRT' : ''}${adaptive ? ' ADAPT' : ''}`,
        });
      }
    }
  }
}

// ── Agent relay ─────────────────────────────────────────────────
let lastResultCount = 0;

async function postTask(task) {
  const res = await fetch(`${VITE_BASE}/agent/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return res.json();
}

async function waitResult(taskId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(800);
    try {
      const res = await fetch(`${VITE_BASE}/agent/results`);
      const all = await res.json();
      for (let i = all.length - 1; i >= Math.max(0, lastResultCount - 1); i--) {
        if (all[i]?.taskId === taskId) {
          lastResultCount = all.length;
          return all[i];
        }
      }
    } catch {}
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ANSI colors ─────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

function classifyJudder(judder) {
  if (judder < 10) return { status: 'SMOOTH', color: C.green, icon: '★' };
  if (judder < 20) return { status: 'GOOD', color: C.green, icon: '●' };
  if (judder < 35) return { status: 'OK', color: C.yellow, icon: '○' };
  if (judder < 50) return { status: 'ROUGH', color: C.yellow, icon: '~' };
  return { status: 'BAD', color: C.red, icon: '✗' };
}

function classifyStdDev(stddev) {
  if (stddev < 5) return { color: C.green };
  if (stddev < 15) return { color: C.yellow };
  return { color: C.red };
}

function progressBar(val, max, width = 25) {
  const filled = Math.max(0, Math.min(width, Math.round((val / max) * width)));
  const empty = Math.max(0, width - filled);
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ── Dry run ─────────────────────────────────────────────────────
function dryRun() {
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  ANIM PERF TEST · DRY RUN · ${configs.length} configs × ${RUNS_PER_CONFIG} runs = ${configs.length * RUNS_PER_CONFIG} total${' '.repeat(22)}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  for (const cfg of configs) {
    console.log(`${C.cyan}║${C.reset}  ${C.bold}${cfg.label.padEnd(25)}${C.reset}  ${C.dim}variant=${cfg.variant} scale=${cfg.scale} crt=${cfg.crt}${C.reset}`);
  }

  const totalRuns = configs.length * RUNS_PER_CONFIG;
  const perRun = (COOLDOWN_MS / 1000) + SETTLE + DURATION + 5;
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.dim}Total runs: ${totalRuns} · ~${perRun}s each · Est: ~${Math.round(totalRuns * perRun / 60)} minutes${C.reset}`);
  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);
}

// ── Main test loop ──────────────────────────────────────────────
async function runTests() {
  // Connectivity checks
  console.log(`\n${C.cyan}  Checking agent relay at ${VITE_BASE}...${C.reset}`);
  try {
    const statusRes = await fetch(`${VITE_BASE}/agent/status`);
    const status = await statusRes.json();
    console.log(`${C.green}  ✓ Agent relay online (${status.tasks} tasks, ${status.results} results)${C.reset}`);
    lastResultCount = status.results;
  } catch {
    console.log(`${C.red}  ✗ Cannot reach Vite server at ${VITE_BASE}${C.reset}`);
    process.exit(1);
  }

  console.log(`${C.cyan}  Pinging mac-agent...${C.reset}`);
  const pingId = `anim-ping-${Date.now()}`;
  await postTask({ type: 'health-check', _id: pingId });
  const pingResult = await waitResult(pingId, 30000);
  // Accept any response from mac-agent (ok:false just means game isn't loaded, agent is still alive)
  if (!pingResult) {
    console.log(`${C.red}  ✗ Mac agent not responding (no result at all)${C.reset}`);
    process.exit(1);
  }
  console.log(`${C.green}  ✓ Mac agent alive, iPhone connected${C.reset}`);

  // Warmup
  console.log(`${C.cyan}  Warming up...${C.reset}`);
  const warmId = `anim-warmup-${Date.now()}`;
  await postTask({ type: 'navigate', _id: warmId, url: `${GAME_BASE}/stress/cooldown.html` });
  await waitResult(warmId, 15000);
  await sleep(3000);
  console.log(`${C.green}  ✓ Warmup complete${C.reset}`);

  // Header
  const totalRuns = configs.length * RUNS_PER_CONFIG;
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  ANIM PERF TEST · ${configs.length} configs × ${RUNS_PER_CONFIG} runs · iPhone 12 Mini${' '.repeat(26)}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  const allResults = [];
  const startTime = Date.now();
  let runNum = 0;

  for (const cfg of configs) {
    const configRuns = [];

    for (let run = 0; run < RUNS_PER_CONFIG; run++) {
      runNum++;
      const ts = Date.now();
      const tag = `${cfg.variant}-s${cfg.scale}-crt${cfg.crt ? 1 : 0}-r${run}`;
      const taskId = `anim-${tag}-${ts}`;
      const progress = `[${runNum}/${totalRuns}]`;

      process.stdout.write(`${C.cyan}║${C.reset}  ${C.bold}${cfg.label.padEnd(25)}${C.reset}  run ${run + 1}/${RUNS_PER_CONFIG}  ${C.dim}testing...${C.reset}  ${C.dim}${progress}${C.reset}`);

      let runResult = {
        config: cfg.label,
        variant: cfg.variant,
        scale: cfg.scale,
        crt: cfg.crt,
        run,
        crashed: false,
        data: null,
      };

      try {
        // 1. Cooldown — navigate to blank page to flush GPU
        // Note: non-game pages return ok:false in navigate results — that's fine,
        // we only care that the agent responded (not null = session alive)
        const cdId = `anim-cd-${tag}-${ts}`;
        await postTask({ type: 'navigate', _id: cdId, url: `${GAME_BASE}/stress/cooldown.html` });
        const cdResult = await waitResult(cdId, 15000);
        if (!cdResult) {
          // No response at all — session might be dead, try recovery
          const hcId = `anim-hc-${tag}-${ts}`;
          await postTask({ type: 'health-check', _id: hcId });
          const hcResult = await waitResult(hcId, 25000);
          if (!hcResult) {
            runResult.crashed = true;
            throw new Error('SESSION_DEAD');
          }
          const cd2Id = `anim-cd2-${tag}-${ts}`;
          await postTask({ type: 'navigate', _id: cd2Id, url: `${GAME_BASE}/stress/cooldown.html` });
          await waitResult(cd2Id, 15000);
        }
        await sleep(COOLDOWN_MS);

        // 2. Navigate to test page
        const testParams = new URLSearchParams({
          variant: cfg.variant,
          scale: String(cfg.scale),
          crt: cfg.crt ? '1' : '0',
          adaptive: cfg.adaptive ? '1' : '0',
          settle: String(SETTLE),
          duration: String(DURATION),
          fps: '12',
          taskId,
        });
        const testUrl = `${GAME_BASE}/test-anim-perf.html?${testParams}`;

        const navId = `anim-nav-${tag}-${ts}`;
        await postTask({ type: 'navigate', _id: navId, url: testUrl });
        const navResult = await waitResult(navId, 20000);
        // Navigate to test page — ok:false is normal (not the game), just need any response
        if (!navResult) {
          runResult.crashed = true;
        }

        if (!runResult.crashed) {
          // 3. Wait for the test page to finish and post results
          const result = await waitResult(taskId, RESULT_TIMEOUT);
          if (result && result.ok) {
            runResult.data = result;
          } else {
            runResult.crashed = true;
          }
        }
      } catch (e) {
        if (e.message === 'SESSION_DEAD') {
          runResult.crashed = true;
        }
      }

      // Display result
      if (runResult.crashed) {
        process.stdout.write(`\r${C.cyan}║${C.reset}  ${C.bold}${cfg.label.padEnd(25)}${C.reset}  run ${run + 1}/${RUNS_PER_CONFIG}  ${C.red}CRASH${C.reset}${' '.repeat(50)}\n`);
      } else if (runResult.data) {
        const d = runResult.data;
        const judCls = classifyJudder(d.animJudder || 100);
        const stdCls = classifyStdDev(d.animStdDev || 100);
        const fpsStr = `${String(Math.round(d.gameFps || 0)).padStart(2)} FPS`;
        const animStr = `anim ${(d.effectiveAnimFps || 0).toFixed(1)}fps`;
        const judStr = `judder ${(d.animJudder || 0).toFixed(0)}%`;
        const stdStr = `σ ${(d.animStdDev || 0).toFixed(1)}ms`;

        process.stdout.write(
          `\r${C.cyan}║${C.reset}  ${C.bold}${cfg.label.padEnd(25)}${C.reset}  run ${run + 1}/${RUNS_PER_CONFIG}  ` +
          `${C.green}${fpsStr}${C.reset}  ${C.cyan}${animStr}${C.reset}  ` +
          `${judCls.color}${judStr}${C.reset}  ${stdCls.color}${stdStr}${C.reset}  ` +
          `${judCls.color}${judCls.icon} ${judCls.status}${C.reset}${' '.repeat(10)}\n`
        );
      }

      configRuns.push(runResult);
    }

    // Aggregate config stats
    const validRuns = configRuns.filter(r => !r.crashed && r.data);
    const crashCount = configRuns.filter(r => r.crashed).length;

    if (validRuns.length > 0) {
      const avgGameFps = validRuns.reduce((s, r) => s + r.data.gameFps, 0) / validRuns.length;
      const avgAnimFps = validRuns.reduce((s, r) => s + r.data.effectiveAnimFps, 0) / validRuns.length;
      const avgJudder = validRuns.reduce((s, r) => s + r.data.animJudder, 0) / validRuns.length;
      const avgStdDev = validRuns.reduce((s, r) => s + r.data.animStdDev, 0) / validRuns.length;
      const avgLoad = validRuns.reduce((s, r) => s + r.data.loadTimeMs, 0) / validRuns.length;

      const judCls = classifyJudder(avgJudder);
      const bar = progressBar(60 - avgJudder, 60);

      console.log(`${C.cyan}║${C.reset}  ${C.bold}${C.white}  → ${cfg.label.padEnd(23)}${C.reset}  ${judCls.color}${bar}${C.reset}  ${C.green}${C.bold}${avgGameFps.toFixed(0)} FPS${C.reset}  ${C.cyan}anim ${avgAnimFps.toFixed(1)}${C.reset}  ${judCls.color}${C.bold}judder ${avgJudder.toFixed(0)}%${C.reset}  ${C.dim}σ ${avgStdDev.toFixed(1)}ms  load ${avgLoad.toFixed(0)}ms  crash:${crashCount}${C.reset}`);
    } else {
      console.log(`${C.cyan}║${C.reset}  ${C.bold}${C.white}  → ${cfg.label.padEnd(23)}${C.reset}  ${C.red}ALL CRASHED (${crashCount}/${RUNS_PER_CONFIG})${C.reset}`);
    }
    console.log(`${C.cyan}║${C.reset}  ${C.dim}${'─'.repeat(80)}${C.reset}`);

    allResults.push({
      label: cfg.label,
      variant: cfg.variant,
      scale: cfg.scale,
      crt: cfg.crt,
      runs: configRuns.map(r => ({
        run: r.run,
        crashed: r.crashed,
        gameFps: r.data?.gameFps || 0,
        effectiveAnimFps: r.data?.effectiveAnimFps || 0,
        animJudder: r.data?.animJudder || 0,
        animStdDev: r.data?.animStdDev || 0,
        animDurationAvg: r.data?.animDurationAvg || 0,
        loadTimeMs: r.data?.loadTimeMs || 0,
        textureCount: r.data?.textureCount || 0,
        vramMB: r.data?.vramMB || 0,
      })),
      avgGameFps: validRuns.length > 0 ? parseFloat((validRuns.reduce((s, r) => s + r.data.gameFps, 0) / validRuns.length).toFixed(1)) : 0,
      avgAnimFps: validRuns.length > 0 ? parseFloat((validRuns.reduce((s, r) => s + r.data.effectiveAnimFps, 0) / validRuns.length).toFixed(1)) : 0,
      avgJudder: validRuns.length > 0 ? parseFloat((validRuns.reduce((s, r) => s + r.data.animJudder, 0) / validRuns.length).toFixed(1)) : 0,
      avgStdDev: validRuns.length > 0 ? parseFloat((validRuns.reduce((s, r) => s + r.data.animStdDev, 0) / validRuns.length).toFixed(1)) : 0,
      avgLoadMs: validRuns.length > 0 ? Math.round(validRuns.reduce((s, r) => s + r.data.loadTimeMs, 0) / validRuns.length) : 0,
      textureCount: validRuns[0]?.data?.textureCount || 0,
      vramMB: validRuns[0]?.data?.vramMB || 0,
      crashCount,
    });
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Summary
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.bold}${C.white}SUMMARY — sorted by smoothness (lowest judder)${C.reset}  ${C.dim}(${elapsed}s elapsed)${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  const sorted = [...allResults].filter(r => r.avgGameFps > 0).sort((a, b) => a.avgJudder - b.avgJudder);
  for (const r of sorted) {
    const judCls = classifyJudder(r.avgJudder);
    const bar = progressBar(60 - r.avgJudder, 60, 20);
    console.log(
      `${C.cyan}║${C.reset}  ${judCls.color}${judCls.icon}${C.reset} ${C.bold}${r.label.padEnd(25)}${C.reset}  ` +
      `${judCls.color}${bar}${C.reset}  ` +
      `${C.green}${String(r.avgGameFps).padStart(4)} FPS${C.reset}  ` +
      `${judCls.color}${C.bold}judder ${String(r.avgJudder).padStart(4)}%${C.reset}  ` +
      `${C.dim}σ ${r.avgStdDev.toFixed(1)}ms  load ${r.avgLoadMs}ms  tex ${r.textureCount}  ${r.vramMB}MB${C.reset}  ` +
      `${r.crashCount > 0 ? C.red + r.crashCount + ' crash' : C.green + 'stable'}${C.reset}`
    );
  }

  // Recommendation
  if (sorted.length > 0) {
    const best = sorted[0];
    console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
    console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.yellow}${C.bold}★ SMOOTHEST: "${best.label}" — ${best.avgGameFps} FPS, ${best.avgJudder}% judder, σ ${best.avgStdDev.toFixed(1)}ms${C.reset}`);
    console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.dim}  Load: ${best.avgLoadMs}ms · Textures: ${best.textureCount} · VRAM: ${best.vramMB} MB${C.reset}`);
  }

  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    device: 'iPhone 12 Mini (Braelynn)',
    runsPerConfig: RUNS_PER_CONFIG,
    settle: SETTLE,
    duration: DURATION,
    elapsedSeconds: elapsed,
    configs: allResults,
  };

  const telDir = join(ROOT, 'telemetry');
  if (!existsSync(telDir)) mkdirSync(telDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(telDir, `anim-perf-${ts}.json`);
  writeFileSync(archivePath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Archive: ${archivePath}${C.reset}`);

  const stressDir = join(ROOT, 'public', 'stress');
  if (!existsSync(stressDir)) mkdirSync(stressDir, { recursive: true });
  const latestPath = join(stressDir, 'anim-perf-latest.json');
  writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Viewer:  ${VITE_BASE}/stress/anim-perf.html${C.reset}\n`);
}

// ── Entry ───────────────────────────────────────────────────────
if (DRY_RUN) {
  dryRun();
} else {
  runTests().catch(err => {
    console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
    process.exit(1);
  });
}
