#!/usr/bin/env node
/**
 * anim-stress-test.mjs — Test all 50 animation resolution levels on a real iPhone
 *
 * Tests each level (L00-L49) with optional CRT shader, measuring FPS performance.
 * Results saved as JSON + displayed as retro progress bars in console.
 *
 * Prerequisites:
 *   - Vite dev server running on PC (npm run dev)
 *   - mac-agent running on Mac (scripts/start-mac-agent.sh)
 *   - iPhone connected to Mac via USB with Safari Web Inspector enabled
 *
 * Usage:
 *   node scripts/anim-stress-test.mjs                         # All 50 levels, CRT on
 *   node scripts/anim-stress-test.mjs --no-crt                # All 50 levels, no CRT
 *   node scripts/anim-stress-test.mjs --start 20 --end 30     # Levels 20-30 only
 *   node scripts/anim-stress-test.mjs --settle 10             # 10s settle time (default 6)
 *   node scripts/anim-stress-test.mjs --dry-run               # Preview only, no device needed
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────
const VITE_BASE = process.env.VITE_URL || 'http://localhost:8081';
const GAME_BASE = process.env.GAME_URL || 'http://192.168.1.150:8081';

// Parse args manually (no external deps)
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}
function hasFlag(name) { return args.includes(`--${name}`); }

const START_LEVEL = parseInt(getArg('start', '0'), 10);
const END_LEVEL = parseInt(getArg('end', '49'), 10);
const CRT_ON = !hasFlag('no-crt');
const SETTLE_MS = parseInt(getArg('settle', '6'), 10) * 1000;
const DRY_RUN = hasFlag('dry-run');
const SAMPLES = 3;       // FPS readings per level
const SAMPLE_GAP = 2000; // ms between readings

// ── Dimension math (matches generate_anim_levels.py) ────────────
function calcDimensions(level) {
  const scale = 1.0 - level * 0.02;
  let w = Math.max(2, Math.round(1920 * scale));
  let h = Math.max(2, Math.round(1080 * scale));
  if (w % 2 !== 0) w++;
  if (h % 2 !== 0) h++;
  return { w, h };
}
function calcVRAM(w, h, frames = 27) {
  return (w * h * 4 * frames) / (1024 * 1024);
}

// ── Agent relay helpers ─────────────────────────────────────────
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
    await sleep(600);
    try {
      const res = await fetch(`${VITE_BASE}/agent/results`);
      const all = await res.json();
      // Find result matching our taskId (check from the end, newest first)
      for (let i = all.length - 1; i >= lastResultCount - 1 && i >= 0; i--) {
        if (all[i]?.taskId === taskId) {
          lastResultCount = all.length;
          return all[i];
        }
      }
    } catch (e) {
      // Vite server may be temporarily busy
    }
  }
  return null; // timeout
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ANSI colors for console ─────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// ── Status classification ───────────────────────────────────────
function classifyFPS(avg, crashed, errors) {
  if (crashed) return { status: 'CRASH', color: C.red, icon: '☠', bar: C.red };
  if (avg === 0) return { status: 'DEAD', color: C.red, icon: '☠', bar: C.red };
  if (errors > 0) return { status: 'ERROR', color: C.red, icon: '✗', bar: C.red };
  if (avg < 15) return { status: 'FAIL', color: C.red, icon: '✗', bar: C.red };
  if (avg < 20) return { status: 'ROUGH', color: C.yellow, icon: '~', bar: C.yellow };
  if (avg < 25) return { status: 'OK', color: C.yellow, icon: '○', bar: C.yellow };
  if (avg < 30) return { status: 'GOOD', color: C.green, icon: '●', bar: C.green };
  return { status: 'SMOOTH', color: C.green, icon: '★', bar: C.green };
}

function progressBar(fps, maxFps = 60, width = 30) {
  const filled = Math.min(width, Math.round((fps / maxFps) * width));
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ── Dry run mode ────────────────────────────────────────────────
function dryRun() {
  const levels = [];
  for (let l = START_LEVEL; l <= END_LEVEL; l++) {
    const { w, h } = calcDimensions(l);
    const vram = calcVRAM(w, h);
    levels.push({ level: l, w, h, vram });
  }

  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  ANIM STRESS TEST · DRY RUN · ${levels.length} levels · CRT ${CRT_ON ? 'ON' : 'OFF'}${' '.repeat(Math.max(0, 29 - String(levels.length).length))}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  for (const { level, w, h, vram } of levels) {
    const lStr = `L${String(level).padStart(2, '0')}`;
    const dimStr = `${String(w).padStart(4)}×${String(h).padEnd(4)}`;
    const vramStr = `${String(Math.round(vram)).padStart(3)} MB`;
    const bar = progressBar(60 - level, 60);
    console.log(`${C.cyan}║${C.reset}  ${C.bold}${lStr}${C.reset}  ${dimStr}  ${vramStr}  ${C.dim}${bar}${C.reset}  ${C.dim}(estimated)${C.reset}`);
  }

  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n  ${C.dim}Estimated time: ~${Math.round(levels.length * 16 / 60)} minutes${C.reset}\n`);
}

// ── Main test loop ──────────────────────────────────────────────
async function runTests() {
  const results = [];
  const totalLevels = END_LEVEL - START_LEVEL + 1;

  // Check agent connectivity
  console.log(`\n${C.cyan}  Checking agent relay at ${VITE_BASE}...${C.reset}`);
  try {
    const statusRes = await fetch(`${VITE_BASE}/agent/status`);
    const status = await statusRes.json();
    console.log(`${C.green}  ✓ Agent relay online (${status.tasks} tasks, ${status.results} results)${C.reset}`);
    lastResultCount = status.results;
  } catch (e) {
    console.log(`${C.red}  ✗ Cannot reach Vite server at ${VITE_BASE}${C.reset}`);
    console.log(`${C.red}    Make sure 'npm run dev' is running.${C.reset}`);
    process.exit(1);
  }

  // Verify mac-agent is responding by posting a simple health-check
  console.log(`${C.cyan}  Pinging mac-agent...${C.reset}`);
  const pingId = `stress-ping-${Date.now()}`;
  await postTask({ type: 'health-check', _id: pingId });
  const pingResult = await waitResult(pingId, 30000);
  if (!pingResult) {
    console.log(`${C.red}  ✗ Mac agent not responding (30s timeout)${C.reset}`);
    console.log(`${C.red}    Make sure mac-agent is running on the Mac.${C.reset}`);
    console.log(`${C.dim}    Start: ssh -i ~/.ssh/mac_agent maclaude@192.168.1.25 'cd ~/dev/play_tester && bash scripts/start-mac-agent.sh --device iphone-xs'${C.reset}`);
    process.exit(1);
  }
  if (pingResult.ok) {
    console.log(`${C.green}  ✓ Mac agent alive, iPhone connected${C.reset}`);
  } else {
    console.log(`${C.yellow}  ⚠ Mac agent responded but health check failed: ${pingResult.error || 'unknown'}${C.reset}`);
    console.log(`${C.yellow}    Proceeding anyway...${C.reset}`);
  }

  // Warmup: load blank page to ensure clean GPU state
  console.log(`${C.cyan}  Warming up (loading blank page to flush GPU memory)...${C.reset}`);
  const warmupId = `stress-warmup-${Date.now()}`;
  await postTask({ type: 'navigate', _id: warmupId, url: `${GAME_BASE}/stress/cooldown.html` });
  await waitResult(warmupId, 15000);
  await sleep(5000);
  console.log(`${C.green}  ✓ Warmup complete${C.reset}`);

  // Header
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  ANIM STRESS TEST · L${String(START_LEVEL).padStart(2, '0')}-L${String(END_LEVEL).padStart(2, '0')} · CRT ${CRT_ON ? 'ON ' : 'OFF'} · ${totalLevels} levels${' '.repeat(Math.max(0, 25 - String(totalLevels).length))}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  const startTime = Date.now();

  for (let level = START_LEVEL; level <= END_LEVEL; level++) {
    const { w, h } = calcDimensions(level);
    const vram = calcVRAM(w, h);
    const lStr = `L${String(level).padStart(2, '0')}`;
    const dimStr = `${String(w).padStart(4)}×${String(h).padEnd(4)}`;
    const vramStr = `${String(Math.round(vram)).padStart(3)} MB`;
    const progress = `[${level - START_LEVEL + 1}/${totalLevels}]`;

    process.stdout.write(`${C.cyan}║${C.reset}  ${C.bold}${lStr}${C.reset}  ${dimStr}  ${vramStr}  ${C.dim}testing...${C.reset}  ${C.dim}${progress}${C.reset}`);

    // Build test URL
    const params = new URLSearchParams({ test: '1', anim_level: String(level) });
    if (CRT_ON) params.set('crt', '1');
    const testUrl = `${GAME_BASE}/?${params}`;
    const ts = Date.now();

    let levelResult = {
      level,
      width: w,
      height: h,
      vramMB: Math.round(vram * 10) / 10,
      fpsSamples: [],
      fpsAvg: 0,
      fpsMin: 0,
      fpsMax: 0,
      errors: 0,
      crashed: false,
      timeout: false,
      status: 'UNKNOWN',
    };

    try {
      // Step 1: Health-check to ensure session is alive (recovers from previous crashes)
      const hcId = `stress-hc-L${String(level).padStart(2, '0')}-${ts}`;
      await postTask({ type: 'health-check', _id: hcId });
      const hcResult = await waitResult(hcId, 25000);
      if (!hcResult?.ok) {
        // Session is dead and couldn't recover — skip this and all remaining levels
        levelResult.crashed = true;
        levelResult.status = 'CRASH';
        throw new Error('SESSION_DEAD');
      }

      // Step 2: Navigate to test URL
      const navId = `stress-nav-L${String(level).padStart(2, '0')}-${ts}`;
      await postTask({ type: 'navigate', _id: navId, url: testUrl });
      const navResult = await waitResult(navId, 20000);
      if (!navResult?.ok) {
        levelResult.crashed = true;
        levelResult.status = 'CRASH';
      }

      if (!levelResult.crashed) {
        // Step 3: Wait for boot + settle
        await sleep(SETTLE_MS + 4000);  // 6s settle + 4s boot margin

        // Step 4: Sample FPS (3 readings, 2s apart)
        for (let s = 0; s < SAMPLES; s++) {
          const readId = `stress-fps-L${String(level).padStart(2, '0')}-s${s}-${ts}`;
          await postTask({ type: 'read-state', _id: readId });
          const readResult = await waitResult(readId, 10000);
          if (readResult?.ok && readResult.state) {
            const fps = readResult.state.fpsAvg || readResult.state.fps || 0;
            if (fps > 0) levelResult.fpsSamples.push(fps);
            if (readResult.state.errorHistory?.length) {
              levelResult.errors = Math.max(levelResult.errors, readResult.state.errorHistory.length);
            }
          } else if (!readResult) {
            // Page probably crashed during test
            levelResult.crashed = true;
            break;
          }
          if (s < SAMPLES - 1) await sleep(SAMPLE_GAP);
        }
      }
    } catch (e) {
      if (e.message === 'SESSION_DEAD') {
        // Don't try remaining levels — session can't recover
        levelResult.status = 'CRASH';
      }
    }

    // Compute FPS stats from samples
    if (levelResult.fpsSamples.length > 0) {
      levelResult.fpsAvg = Math.round(levelResult.fpsSamples.reduce((a, b) => a + b, 0) / levelResult.fpsSamples.length);
      levelResult.fpsMin = Math.min(...levelResult.fpsSamples);
      levelResult.fpsMax = Math.max(...levelResult.fpsSamples);
    }

    // Classify
    const cls = classifyFPS(levelResult.fpsAvg, levelResult.crashed || levelResult.timeout, levelResult.errors);
    levelResult.status = cls.status;

    // Overwrite the "testing..." line with actual result
    const bar = progressBar(levelResult.fpsAvg, 60);
    const fpsStr = levelResult.timeout ? '  ??? ' : `${String(levelResult.fpsAvg).padStart(3)} FPS`;
    process.stdout.write(`\r${C.cyan}║${C.reset}  ${C.bold}${lStr}${C.reset}  ${dimStr}  ${vramStr}  ${cls.bar}${bar}${C.reset}  ${cls.color}${fpsStr}  ${cls.icon} ${cls.status}${C.reset}${' '.repeat(10)}\n`);

    results.push(levelResult);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Footer
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
  const crashes = results.filter(r => r.status === 'CRASH' || r.status === 'DEAD' || r.status === 'TIMEOUT').length;
  const fails = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;
  const rough = results.filter(r => r.status === 'ROUGH' || r.status === 'OK').length;
  const good = results.filter(r => r.status === 'GOOD' || r.status === 'SMOOTH').length;
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.red}Crash/Dead: ${crashes}${C.reset}  ${C.yellow}Fail/Rough: ${fails + rough}${C.reset}  ${C.green}Good/Smooth: ${good}${C.reset}  ${C.dim}(${elapsed}s)${C.reset}`);

  // Find sweet spot (highest quality that's still GOOD or SMOOTH)
  const sweetSpot = results.filter(r => r.status === 'GOOD' || r.status === 'SMOOTH').sort((a, b) => a.level - b.level)[0];
  if (sweetSpot) {
    console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.green}${C.bold}★ SWEET SPOT: L${String(sweetSpot.level).padStart(2, '0')} (${sweetSpot.width}×${sweetSpot.height}) @ ${sweetSpot.fpsAvg} FPS${C.reset}`);
  }
  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    device: 'iPhone 12 Mini (Braelynn)',
    crt: CRT_ON,
    settleMs: SETTLE_MS,
    samples: SAMPLES,
    elapsedSeconds: elapsed,
    sweetSpot: sweetSpot ? { level: sweetSpot.level, width: sweetSpot.width, height: sweetSpot.height, fps: sweetSpot.fpsAvg } : null,
    levels: results,
  };

  // Save to telemetry (archive)
  const telDir = join(ROOT, 'telemetry');
  if (!existsSync(telDir)) mkdirSync(telDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(telDir, `anim-stress-${ts}.json`);
  writeFileSync(archivePath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Archive: ${archivePath}${C.reset}`);

  // Save to public/stress for HTML viewer
  const stressDir = join(ROOT, 'public', 'stress');
  if (!existsSync(stressDir)) mkdirSync(stressDir, { recursive: true });
  const latestPath = join(stressDir, 'anim-stress-latest.json');
  writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Viewer:  ${VITE_BASE}/stress/anim-stress.html${C.reset}\n`);
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
