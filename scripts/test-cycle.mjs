/**
 * test-cycle.mjs — Automated build → test → report cycle
 *
 * The full loop:
 *   1. Build (npx vite build)
 *   2. Run chrome-test on specified devices
 *   3. Compare against baseline
 *   4. Generate comparison report
 *   5. Print summary to stdout
 *
 * Usage:
 *   node scripts/test-cycle.mjs                          # default: desktop only
 *   node scripts/test-cycle.mjs --devices desktop,iphone-xs,iphone-12-mini
 *   node scripts/test-cycle.mjs --skip-build             # skip build step
 *   node scripts/test-cycle.mjs --duration 30            # longer gameplay
 *   node scripts/test-cycle.mjs --save-baseline          # save results as new baseline
 *
 * Requires: dev server running on localhost:8081
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REFERENCE_DIR = join(ROOT, 'telemetry', 'reference');
const CHROME_RESULTS = join(ROOT, 'telemetry', 'chrome-results.json');
const CHROME_REPORT = join(ROOT, 'telemetry', 'chrome-report.md');
const CHROME_SCREENSHOTS = join(ROOT, 'telemetry', 'chrome-screenshots');

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const SKIP_BUILD = args.includes('--skip-build');
const SAVE_BASELINE = args.includes('--save-baseline');
const DEVICES = getArg('devices', 'desktop,iphone-xs,iphone-12-mini');
const DURATION = getArg('duration', '15');

function log(msg) { console.log(`[test-cycle] ${msg}`); }

async function main() {
  const cycleStart = Date.now();

  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  DP MOTO — Automated Test Cycle                  ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // ── Step 1: Build ──────────────────────────────────────────
  if (!SKIP_BUILD) {
    log('Step 1/4: Building...');
    try {
      execSync('npx vite build', { cwd: ROOT, stdio: 'pipe' });
      log('Build: OK');
    } catch (e) {
      log('BUILD FAILED:');
      console.error(e.stderr?.toString() || e.message);
      process.exit(1);
    }
  } else {
    log('Step 1/4: Build skipped (--skip-build)');
  }

  // ── Step 2: Check dev server ───────────────────────────────
  log('Step 2/4: Checking dev server...');
  const http = await import('http');
  const serverOk = await new Promise((resolve) => {
    const req = http.default.get('http://127.0.0.1:8081/', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
  if (serverOk) {
    log('Dev server: OK');
  } else {
    log('ERROR: Dev server not running on localhost:8081');
    log('Start it with: npx vite');
    process.exit(1);
  }

  // ── Step 3: Run tests ──────────────────────────────────────
  log(`Step 3/4: Testing devices: ${DEVICES}`);
  try {
    const cmd = `node scripts/chrome-test.mjs --devices ${DEVICES} --duration ${DURATION} --compare`;
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    log('WARNING: Test runner exited with error (results may be partial)');
  }

  // ── Step 4: Report ─────────────────────────────────────────
  log('Step 4/4: Generating summary...');

  let results = [];
  try {
    results = JSON.parse(readFileSync(CHROME_RESULTS, 'utf8'));
  } catch (e) {
    log('ERROR: Could not read test results');
    process.exit(1);
  }

  // Print summary table
  console.log('');
  console.log('┌──────────────────────┬────────┬────────┬─────────┬─────────┬─────────┬──────────┐');
  console.log('│ Device               │ Result │ Boot   │ FPS avg │ FPS min │ FPS max │ Quality  │');
  console.log('├──────────────────────┼────────┼────────┼─────────┼─────────┼─────────┼──────────┤');

  for (const r of results) {
    const name = (r.name || r.device).padEnd(20).slice(0, 20);
    const result = r.result.padEnd(6);
    const boot = ((r.bootTimeMs / 1000).toFixed(1) + 's').padStart(6);
    const fpsA = String(r.fps.avg).padStart(7);
    const fpsMin = String(r.fps.min).padStart(7);
    const fpsMax = String(r.fps.max).padStart(7);
    const qual = (r.quality?.final || '--').padEnd(8);
    console.log(`│ ${name} │ ${result} │ ${boot} │ ${fpsA} │ ${fpsMin} │ ${fpsMax} │ ${qual} │`);
  }

  console.log('└──────────────────────┴────────┴────────┴─────────┴─────────┴─────────┴──────────┘');

  // Save as baseline if requested
  if (SAVE_BASELINE) {
    mkdirSync(REFERENCE_DIR, { recursive: true });

    // Copy results as baseline
    const baselinePath = join(REFERENCE_DIR, 'chrome-baseline.json');
    writeFileSync(baselinePath, JSON.stringify(results, null, 2));

    // Copy screenshots as reference
    if (existsSync(CHROME_SCREENSHOTS)) {
      const files = readdirSync(CHROME_SCREENSHOTS).filter(f => f.endsWith('.png'));
      // Only copy latest per device (files are timestamped)
      for (const f of files) {
        copyFileSync(join(CHROME_SCREENSHOTS, f), join(REFERENCE_DIR, f));
      }
    }

    log(`Baseline saved to ${REFERENCE_DIR}`);
  }

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  const passes = results.filter(r => r.result === 'PASS').length;
  const fails = results.filter(r => r.result !== 'PASS').length;

  console.log('');
  log(`Done in ${elapsed}s — ${passes} pass, ${fails} fail`);
  log(`Report: ${CHROME_REPORT}`);
  log(`Screenshots: ${CHROME_SCREENSHOTS}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
