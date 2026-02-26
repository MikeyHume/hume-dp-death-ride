#!/usr/bin/env node
/**
 * crt-stress-test.mjs — CRT shader optimization stress test
 *
 * Tests 7 CRT shader configurations on a real iPhone, measuring FPS for each.
 * Runs each variant multiple times for statistical reliability.
 *
 * Prerequisites:
 *   - Vite dev server running on PC (npm run dev)
 *   - mac-agent running on Mac (scripts/start-mac-agent.sh)
 *   - iPhone connected to Mac via USB with Safari Web Inspector enabled
 *
 * Usage:
 *   node scripts/crt-stress-test.mjs                    # Full test (7 variants × 3 runs)
 *   node scripts/crt-stress-test.mjs --runs 5           # 5 runs per variant
 *   node scripts/crt-stress-test.mjs --settle 15        # 15s settle time
 *   node scripts/crt-stress-test.mjs --only lean        # Test single variant
 *   node scripts/crt-stress-test.mjs --dry-run          # Preview only
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

const RUNS_PER_VARIANT = parseInt(getArg('runs', '3'), 10);
const SETTLE_MS = parseInt(getArg('settle', '12'), 10) * 1000;
const COOLDOWN_MS = 8000;
const SAMPLES_PER_RUN = 5;
const SAMPLE_GAP = 1500;
const DRY_RUN = hasFlag('dry-run');
const ONLY = getArg('only', null);

// ── CRT Variants ────────────────────────────────────────────────
// Each variant tests a different CRT configuration.
// texLookups = approximate texture reads per fragment in the shader.
//
// Desktop shader cost breakdown:
//   3 lookups: RGB channel separation (chroma + convergence)
//   4 lookups: beam focus (horizontal blur, 4 extra samples)
//   9 lookups: bloom (3×3 grid)
//   = 16 total per-pixel texture reads

const VARIANTS = [
  {
    name: 'desktop',
    desc: 'Full CRT — bloom + beam + mask + chroma + noise',
    texLookups: 16,
    features: { bloom: true, beam: true, mask: true, chroma: true, scanlines: true, noise: true },
    crtProfile: null, // use default CRT_TUNING
  },
  {
    name: 'no-bloom',
    desc: 'Bloom disabled — biggest single GPU win (-9 lookups)',
    texLookups: 7,
    features: { bloom: false, beam: true, mask: true, chroma: true, scanlines: true, noise: true },
    crtProfile: 'no-bloom',
  },
  {
    name: 'no-beam',
    desc: 'Beam focus disabled (-4 lookups)',
    texLookups: 12,
    features: { bloom: true, beam: false, mask: true, chroma: true, scanlines: true, noise: true },
    crtProfile: 'no-beam',
  },
  {
    name: 'lean',
    desc: 'No bloom + no beam — major GPU reduction (-13 lookups)',
    texLookups: 3,
    features: { bloom: false, beam: false, mask: true, chroma: true, scanlines: true, noise: true },
    crtProfile: 'lean',
  },
  {
    name: 'essential',
    desc: 'lean + no chroma/convergence — 1 texture lookup',
    texLookups: 1,
    features: { bloom: false, beam: false, mask: true, chroma: false, scanlines: true, noise: true },
    crtProfile: 'essential',
  },
  {
    name: 'scan-mask',
    desc: 'Only scanlines + mask + brightness (no noise/jitter)',
    texLookups: 1,
    features: { bloom: false, beam: false, mask: true, chroma: false, scanlines: true, noise: false },
    crtProfile: 'scan-mask',
  },
  {
    name: 'passthrough',
    desc: 'All CRT effects off — shader overhead baseline',
    texLookups: 1,
    features: { bloom: false, beam: false, mask: false, chroma: false, scanlines: false, noise: false },
    crtProfile: 'passthrough',
  },
];

// Filter to single variant if --only specified
const activeVariants = ONLY ? VARIANTS.filter(v => v.name === ONLY) : VARIANTS;
if (ONLY && activeVariants.length === 0) {
  console.error(`Unknown variant "${ONLY}". Available: ${VARIANTS.map(v => v.name).join(', ')}`);
  process.exit(1);
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

function classifyFPS(avg, crashed) {
  if (crashed || avg === 0) return { status: 'CRASH', color: C.red, icon: '☠', bar: C.red };
  if (avg < 15) return { status: 'FAIL', color: C.red, icon: '✗', bar: C.red };
  if (avg < 20) return { status: 'ROUGH', color: C.yellow, icon: '~', bar: C.yellow };
  if (avg < 25) return { status: 'OK', color: C.yellow, icon: '○', bar: C.yellow };
  if (avg < 30) return { status: 'GOOD', color: C.green, icon: '●', bar: C.green };
  return { status: 'SMOOTH', color: C.green, icon: '★', bar: C.green };
}

function progressBar(fps, maxFps = 60, width = 30) {
  const filled = Math.min(width, Math.round((fps / maxFps) * width));
  return '█'.repeat(filled) + '░'.repeat(empty(width, filled));
}
function empty(w, f) { return w - f; }

function featureStr(features) {
  const on = [];
  if (features.bloom) on.push('BLM');
  if (features.beam) on.push('BEM');
  if (features.mask) on.push('MSK');
  if (features.chroma) on.push('CHR');
  if (features.scanlines) on.push('SCN');
  if (features.noise) on.push('NOS');
  return on.length ? on.join('+') : 'NONE';
}

// ── Dry run ─────────────────────────────────────────────────────
function dryRun() {
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  CRT STRESS TEST · DRY RUN · ${activeVariants.length} variants × ${RUNS_PER_VARIANT} runs${' '.repeat(35)}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  for (const v of activeVariants) {
    console.log(`${C.cyan}║${C.reset}  ${C.bold}${v.name.padEnd(12)}${C.reset}  ${C.dim}${String(v.texLookups).padStart(2)} tex${C.reset}  ${featureStr(v.features).padEnd(23)}  ${C.dim}${v.desc}${C.reset}`);
  }

  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
  const totalRuns = activeVariants.length * RUNS_PER_VARIANT;
  const perRun = (COOLDOWN_MS + SETTLE_MS + SAMPLES_PER_RUN * SAMPLE_GAP) / 1000;
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.dim}Total runs: ${totalRuns} · ~${Math.round(perRun)}s each · Est: ~${Math.round(totalRuns * perRun / 60)} minutes${C.reset}`);
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
  const pingId = `crt-ping-${Date.now()}`;
  await postTask({ type: 'health-check', _id: pingId });
  const pingResult = await waitResult(pingId, 30000);
  if (!pingResult?.ok) {
    console.log(`${C.red}  ✗ Mac agent not responding${C.reset}`);
    process.exit(1);
  }
  console.log(`${C.green}  ✓ Mac agent alive, iPhone connected${C.reset}`);

  // Warmup
  console.log(`${C.cyan}  Warming up (flushing GPU)...${C.reset}`);
  const warmId = `crt-warmup-${Date.now()}`;
  await postTask({ type: 'navigate', _id: warmId, url: `${GAME_BASE}/stress/cooldown.html` });
  await waitResult(warmId, 15000);
  await sleep(5000);
  console.log(`${C.green}  ✓ Warmup complete${C.reset}`);

  // Header
  const totalRuns = activeVariants.length * RUNS_PER_VARIANT;
  console.log(`\n${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║  CRT STRESS TEST · ${activeVariants.length} variants × ${RUNS_PER_VARIANT} runs · iPhone 12 Mini${' '.repeat(27)}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  const allResults = [];
  const startTime = Date.now();
  let runNum = 0;

  for (const variant of activeVariants) {
    const variantRuns = [];

    for (let run = 0; run < RUNS_PER_VARIANT; run++) {
      runNum++;
      const ts = Date.now();
      const tag = `${variant.name}-r${run}`;
      const progress = `[${runNum}/${totalRuns}]`;

      process.stdout.write(`${C.cyan}║${C.reset}  ${C.bold}${variant.name.padEnd(12)}${C.reset}  run ${run + 1}/${RUNS_PER_VARIANT}  ${C.dim}testing...${C.reset}  ${C.dim}${progress}${C.reset}`);

      let runResult = {
        variant: variant.name,
        run,
        fpsSamples: [],
        fpsAvg: 0,
        fpsMin: 0,
        fpsMax: 0,
        crashed: false,
        gameState: 'unknown',
      };

      try {
        // 1. Cooldown — flush GPU memory from previous test
        const cdId = `crt-cd-${tag}-${ts}`;
        await postTask({ type: 'navigate', _id: cdId, url: `${GAME_BASE}/stress/cooldown.html` });
        const cdResult = await waitResult(cdId, 15000);
        if (!cdResult?.ok) {
          // Session might be dead, try health-check recovery
          const hcId = `crt-hc-${tag}-${ts}`;
          await postTask({ type: 'health-check', _id: hcId });
          const hcResult = await waitResult(hcId, 25000);
          if (!hcResult?.ok) {
            runResult.crashed = true;
            throw new Error('SESSION_DEAD');
          }
          // Retry cooldown
          const cd2Id = `crt-cd2-${tag}-${ts}`;
          await postTask({ type: 'navigate', _id: cd2Id, url: `${GAME_BASE}/stress/cooldown.html` });
          await waitResult(cd2Id, 15000);
        }
        await sleep(COOLDOWN_MS);

        // 2. Health-check before test
        const hcId = `crt-hc2-${tag}-${ts}`;
        await postTask({ type: 'health-check', _id: hcId });
        const hcResult = await waitResult(hcId, 25000);
        if (!hcResult?.ok) {
          runResult.crashed = true;
          throw new Error('SESSION_DEAD');
        }

        // 3. Navigate to game with CRT variant
        const params = new URLSearchParams({ test: '1' });
        if (variant.crtProfile) params.set('crt_profile', variant.crtProfile);
        const testUrl = `${GAME_BASE}/?${params}`;

        const navId = `crt-nav-${tag}-${ts}`;
        await postTask({ type: 'navigate', _id: navId, url: testUrl });
        const navResult = await waitResult(navId, 20000);
        if (!navResult?.ok) {
          runResult.crashed = true;
        }

        if (!runResult.crashed) {
          // 4. Wait for game to boot and reach gameplay
          await sleep(SETTLE_MS);

          // 5. Sample FPS
          for (let s = 0; s < SAMPLES_PER_RUN; s++) {
            const readId = `crt-fps-${tag}-s${s}-${ts}`;
            await postTask({ type: 'read-state', _id: readId });
            const readResult = await waitResult(readId, 10000);
            if (readResult?.ok && readResult.state) {
              const fps = readResult.state.fpsAvg || readResult.state.fps || 0;
              if (fps > 0) runResult.fpsSamples.push(fps);
              if (readResult.state.gameState) runResult.gameState = readResult.state.gameState;
            } else if (!readResult) {
              runResult.crashed = true;
              break;
            }
            if (s < SAMPLES_PER_RUN - 1) await sleep(SAMPLE_GAP);
          }
        }
      } catch (e) {
        if (e.message === 'SESSION_DEAD') {
          runResult.crashed = true;
        }
      }

      // Compute FPS stats
      if (runResult.fpsSamples.length > 0) {
        runResult.fpsAvg = Math.round(runResult.fpsSamples.reduce((a, b) => a + b, 0) / runResult.fpsSamples.length);
        runResult.fpsMin = Math.min(...runResult.fpsSamples);
        runResult.fpsMax = Math.max(...runResult.fpsSamples);
      }

      const cls = classifyFPS(runResult.fpsAvg, runResult.crashed);
      const bar = progressBar(runResult.fpsAvg, 60);
      const fpsStr = runResult.crashed ? '  CRASH' : `${String(runResult.fpsAvg).padStart(3)} FPS`;
      process.stdout.write(`\r${C.cyan}║${C.reset}  ${C.bold}${variant.name.padEnd(12)}${C.reset}  run ${run + 1}/${RUNS_PER_VARIANT}  ${cls.bar}${bar}${C.reset}  ${cls.color}${fpsStr}  ${cls.icon} ${cls.status}${C.reset}  ${C.dim}${runResult.gameState}${C.reset}${' '.repeat(10)}\n`);

      variantRuns.push(runResult);
    }

    // Aggregate variant stats
    const validRuns = variantRuns.filter(r => !r.crashed && r.fpsAvg > 0);
    const crashCount = variantRuns.filter(r => r.crashed).length;
    const allFps = validRuns.map(r => r.fpsAvg).sort((a, b) => a - b);
    const medianFps = allFps.length > 0 ? allFps[Math.floor(allFps.length / 2)] : 0;
    const bestFps = allFps.length > 0 ? Math.max(...allFps) : 0;
    const worstFps = allFps.length > 0 ? Math.min(...allFps) : 0;

    const aggCls = classifyFPS(medianFps, crashCount === RUNS_PER_VARIANT);
    const aggBar = progressBar(medianFps, 60);

    console.log(`${C.cyan}║${C.reset}  ${C.bold}${C.white}  → ${variant.name.padEnd(10)}${C.reset}  ${C.dim}${String(variant.texLookups).padStart(2)} tex${C.reset}  ${aggCls.bar}${aggBar}${C.reset}  ${aggCls.color}${C.bold}median ${String(medianFps).padStart(2)} FPS${C.reset}  ${C.dim}best:${bestFps} worst:${worstFps} crash:${crashCount}/${RUNS_PER_VARIANT}${C.reset}`);
    console.log(`${C.cyan}║${C.reset}  ${C.dim}${'─'.repeat(80)}${C.reset}`);

    allResults.push({
      name: variant.name,
      description: variant.desc,
      texLookups: variant.texLookups,
      features: variant.features,
      crtProfile: variant.crtProfile,
      runs: variantRuns,
      medianFps,
      bestFps,
      worstFps,
      crashCount,
      status: aggCls.status,
    });
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Footer — summary sorted by median FPS
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.bold}${C.white}SUMMARY — sorted by performance${C.reset}  ${C.dim}(${elapsed}s elapsed)${C.reset}`);
  console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

  const sorted = [...allResults].sort((a, b) => b.medianFps - a.medianFps);
  for (const r of sorted) {
    const cls = classifyFPS(r.medianFps, r.crashCount === RUNS_PER_VARIANT);
    const bar = progressBar(r.medianFps, 60, 25);
    const delta = r.medianFps - (sorted[sorted.length - 1]?.medianFps || 0);
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    console.log(`${C.cyan}║${C.reset}  ${cls.color}${cls.icon}${C.reset} ${C.bold}${r.name.padEnd(12)}${C.reset}  ${C.dim}${String(r.texLookups).padStart(2)} tex${C.reset}  ${cls.bar}${bar}${C.reset}  ${cls.color}${C.bold}${String(r.medianFps).padStart(2)} FPS${C.reset}  ${C.dim}(${deltaStr} vs worst)${C.reset}  ${r.crashCount > 0 ? C.red + r.crashCount + ' crash' + C.reset : C.green + 'stable' + C.reset}`);
  }

  // Recommendation
  const best = sorted[0];
  const desktop = allResults.find(r => r.name === 'desktop');
  if (best && desktop) {
    const fpsGain = best.medianFps - desktop.medianFps;
    console.log(`${C.cyan}${C.bold}╠══════════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
    if (fpsGain > 2) {
      console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.yellow}${C.bold}★ RECOMMENDATION: "${best.name}" — ${best.medianFps} FPS (+${fpsGain} vs desktop)${C.reset}`);
      console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.dim}  Features kept: ${featureStr(best.features) || 'NONE'}${C.reset}`);
    } else {
      console.log(`${C.cyan}${C.bold}║${C.reset}  ${C.green}${C.bold}★ Desktop CRT runs fine at ${desktop.medianFps} FPS — no optimization needed${C.reset}`);
    }
  }

  console.log(`${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    device: 'iPhone 12 Mini (Braelynn)',
    runsPerVariant: RUNS_PER_VARIANT,
    settleMs: SETTLE_MS,
    samplesPerRun: SAMPLES_PER_RUN,
    elapsedSeconds: elapsed,
    variants: allResults,
  };

  const telDir = join(ROOT, 'telemetry');
  if (!existsSync(telDir)) mkdirSync(telDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(telDir, `crt-stress-${ts}.json`);
  writeFileSync(archivePath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Archive: ${archivePath}${C.reset}`);

  const stressDir = join(ROOT, 'public', 'stress');
  if (!existsSync(stressDir)) mkdirSync(stressDir, { recursive: true });
  const latestPath = join(stressDir, 'crt-stress-latest.json');
  writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`  ${C.dim}Viewer:  ${VITE_BASE}/stress/crt-stress.html${C.reset}\n`);
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
