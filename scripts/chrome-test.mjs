/**
 * chrome-test.mjs — Run DP Moto in Playwright Chromium with CDP integration
 *
 * Desktop-focused test runner for PClaude vision analysis.
 * Captures: screenshots, console logs, performance metrics, DOM layout, WebGL state.
 *
 * Usage:
 *   node scripts/chrome-test.mjs                         # default: boot + play 15s
 *   node scripts/chrome-test.mjs --duration 30           # play for 30s
 *   node scripts/chrome-test.mjs --simulate iphone-xs    # simulate device
 *   node scripts/chrome-test.mjs --headed                # show browser window
 *   node scripts/chrome-test.mjs --full-cycle            # build → serve → test → report
 *   node scripts/chrome-test.mjs --compare               # compare against reference baseline
 *   node scripts/chrome-test.mjs --devices desktop,iphone-xs,iphone-12-mini  # test multiple
 *
 * Screenshots saved to: telemetry/chrome-screenshots/
 * Results saved to:     telemetry/chrome-results.json
 * Reports saved to:     telemetry/chrome-report.md
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCREENSHOT_DIR = join(ROOT, 'telemetry', 'chrome-screenshots');
const RESULTS_FILE = join(ROOT, 'telemetry', 'chrome-results.json');
const REPORT_FILE = join(ROOT, 'telemetry', 'chrome-report.md');
const REFERENCE_DIR = join(ROOT, 'telemetry', 'reference');

// ── Config ────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const DURATION = parseInt(getArg('duration', '15'), 10);
const SIMULATE = getArg('simulate', null);
const HEADED = args.includes('--headed');
const FULL_CYCLE = args.includes('--full-cycle');
const SAVE_BASELINE = args.includes('--save-baseline');
const COMPARE = args.includes('--compare');
const DEVICES_ARG = getArg('devices', null);
const BASE_URL = getArg('url', 'http://127.0.0.1:8081');

// Device library (landscape dimensions)
const DEVICE_LIB = {
  'desktop':           { name: 'Desktop',           cssW: 1920, cssH: 1080, dpr: 1, mobile: false },
  'iphone-xs':         { name: 'iPhone XS',         cssW: 812,  cssH: 375,  dpr: 3, mobile: true },
  'iphone-12-mini':    { name: 'iPhone 12 Mini',    cssW: 780,  cssH: 360,  dpr: 3, mobile: true },
  'iphone-16-pro-max': { name: 'iPhone 16 Pro Max', cssW: 956,  cssH: 440,  dpr: 3, mobile: true },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

// ── CDP Metrics Collector ────────────────────────────────────

async function collectCDPMetrics(page) {
  const cdp = await page.context().newCDPSession(page);
  const metrics = {};

  try {
    // JS heap + DOM metrics
    const { metrics: perfMetrics } = await cdp.send('Performance.getMetrics');
    for (const m of perfMetrics) {
      metrics[m.name] = m.value;
    }
  } catch (e) {
    metrics._cdpError = e.message;
  }

  try {
    // JS heap breakdown
    const heap = await page.evaluate(() => {
      if (performance.memory) {
        return {
          jsHeapUsed: performance.memory.usedJSHeapSize,
          jsHeapTotal: performance.memory.totalJSHeapSize,
          jsHeapLimit: performance.memory.jsHeapSizeLimit,
        };
      }
      return null;
    });
    if (heap) Object.assign(metrics, heap);
  } catch (e) {}

  try {
    // Viewport + layout info
    const layout = await page.evaluate(() => ({
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      outerW: window.outerWidth,
      outerH: window.outerHeight,
      dpr: window.devicePixelRatio,
      scrollY: window.scrollY,
      bodyH: document.body.scrollHeight,
      canvasW: document.querySelector('canvas')?.width || 0,
      canvasH: document.querySelector('canvas')?.height || 0,
    }));
    metrics.layout = layout;
  } catch (e) {}

  await cdp.detach();
  return metrics;
}

// ── Single device test ───────────────────────────────────────

async function testDevice(browser, deviceKey) {
  const dev = DEVICE_LIB[deviceKey] || DEVICE_LIB['desktop'];
  const isDesktop = !dev.mobile;
  const tag = deviceKey;

  console.log(`\n── ${dev.name} (${tag}) ── ${dev.cssW}×${dev.cssH} @${dev.dpr}x ──`);

  const context = await browser.newContext({
    viewport: { width: dev.cssW, height: dev.cssH + (dev.mobile ? 48 : 0) },
    deviceScaleFactor: dev.dpr,
    isMobile: dev.mobile,
    hasTouch: dev.mobile,
    userAgent: dev.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });

  const page = await context.newPage();

  // Inject preserveDrawingBuffer before any WebGL context is created
  await page.addInitScript(() => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
      }
      return origGetContext.call(this, type, attrs);
    };
  });

  // Enable CDP Performance domain
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.detach();

  // Console + error capture
  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
    console.log(`  !! PAGE ERROR: ${err.message}`);
  });

  // Build URL
  let url = `${BASE_URL}/?test=1`;
  if (dev.mobile) url += `&simulate=${deviceKey}`;
  url += '&hud=1';

  const startTime = Date.now();
  console.log(`  Loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Screenshot helper — Chrome supports full page screenshots natively
  const ssPrefix = join(SCREENSHOT_DIR, `${tag}_${timestamp()}`);
  let screenshotIdx = 1;
  const screenshots = [];

  async function takeScreenshot(label) {
    const ssNum = String(screenshotIdx++).padStart(2, '0');
    const filename = `${ssPrefix}_${ssNum}_${label}.png`;
    // Chromium page.screenshot() captures WebGL content correctly (unlike WebKit)
    // Use page screenshot as primary method
    await page.screenshot({ path: filename, fullPage: false });
    screenshots.push({ idx: ssNum, label, filename });
    console.log(`  Screenshot: ${ssNum}_${label}`);
    return filename;
  }

  await takeScreenshot('loaded');

  // ── Boot phase: wait for PLAYING state ──────────────────
  let testState = null;
  let stateName = 'INIT';
  let lastScreenshotState = '';
  const bootTimeout = 45000;
  let clickedTitle = false;

  while ((Date.now() - startTime) < bootTimeout) {
    await sleep(500);

    try {
      testState = await page.evaluate(() => (window).__dpMotoTest?.state);
      if (testState) {
        stateName = testState.stateName;

        if (stateName !== lastScreenshotState) {
          await takeScreenshot(stateName.toLowerCase());
          console.log(`    state → ${stateName} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
          lastScreenshotState = stateName;
        }

        if (stateName === 'TITLE' && !clickedTitle) {
          await sleep(500);
          await page.click('canvas', { position: { x: dev.cssW / 2, y: dev.cssH / 2 } });
          clickedTitle = true;
          console.log(`    Clicked canvas to start from TITLE`);
        }

        if (stateName === 'STARTING') {
          await page.keyboard.press('Space');
          console.log(`    Pressed Space to skip countdown`);
        }

        if (stateName === 'PLAYING') break;
      }
    } catch (e) {}
  }

  const bootTimeMs = Date.now() - startTime;
  const booted = stateName === 'PLAYING';
  console.log(`  Boot: ${booted ? 'OK' : 'FAILED'} — ${(bootTimeMs / 1000).toFixed(1)}s — state: ${stateName}`);

  if (!booted) {
    const metrics = await collectCDPMetrics(page);
    await takeScreenshot(`FAIL_${stateName.toLowerCase()}`);
    await context.close();
    return {
      device: deviceKey, name: dev.name, result: 'TIMEOUT',
      bootTimeMs, finalState: stateName,
      fps: { samples: [], avg: 0, min: 999, max: 0, count: 0 },
      quality: { initial: '--', final: '--', changes: [] },
      features: {}, errors, metrics,
      consoleLogs: consoleLogs.slice(-30),
      screenshots,
    };
  }

  // ── Play phase: collect FPS + metrics ──────────────────
  await page.keyboard.down('Space');
  console.log(`  Playing for ${DURATION}s — sampling FPS every 500ms...`);

  const fpsSamples = [];
  const qualityChanges = [];
  let lastQuality = testState?.qualityTier || 'high';
  const initialQuality = lastQuality;
  const playStart = Date.now();
  let playScreenshots = 0;

  while ((Date.now() - playStart) < DURATION * 1000) {
    await sleep(500);

    try {
      testState = await page.evaluate(() => (window).__dpMotoTest?.state);
      if (!testState) continue;

      if (testState.fps > 0) fpsSamples.push(testState.fps);

      if (testState.qualityTier !== lastQuality) {
        const elapsed = ((Date.now() - playStart) / 1000).toFixed(1);
        qualityChanges.push(`${lastQuality}→${testState.qualityTier} @ ${elapsed}s`);
        console.log(`  Quality: ${lastQuality} → ${testState.qualityTier} @ ${elapsed}s`);
        lastQuality = testState.qualityTier;
      }

      if (playScreenshots < 3 && (Date.now() - playStart) >= (playScreenshots + 1) * 5000) {
        const elapsed = Math.round((Date.now() - playStart) / 1000);
        await takeScreenshot(`playing_${elapsed}s`);
        console.log(`    FPS: ${testState.fps} — quality: ${testState.qualityTier}`);
        playScreenshots++;
      }
    } catch (e) {
      errors.push(`Poll error: ${e.message}`);
    }
  }

  await page.keyboard.up('Space');

  // Final metrics via CDP
  const metrics = await collectCDPMetrics(page);

  // Final state + screenshot
  let finalState = null;
  try { finalState = await page.evaluate(() => (window).__dpMotoTest?.state); } catch (e) {}
  await takeScreenshot('final');

  await context.close();

  // Compute stats
  const fpsAvg = fpsSamples.length > 0 ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
  const fpsMin = fpsSamples.length > 0 ? Math.min(...fpsSamples) : 0;
  const fpsMax = fpsSamples.length > 0 ? Math.max(...fpsSamples) : 0;

  const result = {
    device: deviceKey,
    name: dev.name,
    result: errors.some(e => e.startsWith('PAGE ERROR')) ? 'ERROR' : fpsSamples.length > 0 ? 'PASS' : 'FAIL',
    bootTimeMs,
    duration: DURATION,
    finalState: finalState?.stateName || stateName,
    fps: { samples: fpsSamples, avg: Math.round(fpsAvg * 10) / 10, min: fpsMin, max: fpsMax, count: fpsSamples.length },
    quality: { initial: initialQuality, final: finalState?.qualityTier || lastQuality, changes: qualityChanges },
    features: finalState?.features || {},
    score: finalState?.score || 0,
    errors,
    metrics,
    consoleLogs: consoleLogs.slice(-50),
    screenshots,
  };

  const passRate = fpsSamples.length > 0
    ? `FPS avg:${fpsAvg.toFixed(0)} min:${fpsMin} max:${fpsMax}`
    : 'no FPS samples';
  const heapMB = metrics.jsHeapUsed ? `heap:${(metrics.jsHeapUsed / 1024 / 1024).toFixed(0)}MB` : '';
  const verdict = result.result === 'PASS' ? '\x1b[32mPASS\x1b[0m' :
                  result.result === 'ERROR' ? '\x1b[31mERROR\x1b[0m' : '\x1b[33mFAIL\x1b[0m';

  console.log(`  Result: ${verdict} — ${passRate} — quality: ${result.quality.final} — ${heapMB} — errors: ${errors.length}`);

  return result;
}

// ── Comparison against baseline ──────────────────────────────

function compareResults(current, baseline) {
  const diffs = [];
  for (const curr of current) {
    const base = baseline.find(b => (b.slug || b.device) === curr.device);
    if (!base) {
      diffs.push({ device: curr.device, note: 'NEW — no baseline to compare' });
      continue;
    }

    const baseFps = base.fps?.avg || 0;
    const currFps = curr.fps?.avg || 0;
    const fpsDelta = currFps - baseFps;
    const fpsPct = baseFps > 0 ? ((fpsDelta / baseFps) * 100).toFixed(0) : 'N/A';

    const baseBoot = base.bootTimeMs || 0;
    const currBoot = curr.bootTimeMs || 0;
    const bootDelta = currBoot - baseBoot;

    let verdict = 'SAME';
    if (Math.abs(fpsDelta) > 3) verdict = fpsDelta > 0 ? 'IMPROVED' : 'WORSE';
    if (curr.result !== 'PASS' && (base.result === 'PASS' || base.result === undefined)) verdict = 'REGRESSION';

    diffs.push({
      device: curr.device,
      name: curr.name,
      verdict,
      fps: { base: baseFps, curr: currFps, delta: fpsDelta, pct: fpsPct },
      boot: { base: baseBoot, curr: currBoot, delta: bootDelta },
      quality: { base: base.quality?.final, curr: curr.quality?.final },
      errors: { base: (base.errors || []).length, curr: curr.errors.length },
    });
  }
  return diffs;
}

// ── Report generation ────────────────────────────────────────

function generateReport(results, diffs) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let md = `# Chrome Test Report — ${ts}\n\n`;
  md += `Engine: Playwright Chromium | Duration: ${DURATION}s per device\n\n`;

  // Results table
  md += `## Results\n\n`;
  md += `| Device | Result | Boot (s) | FPS avg | FPS min | FPS max | Quality | Heap (MB) | Errors |\n`;
  md += `|--------|--------|----------|---------|---------|---------|---------|-----------|--------|\n`;
  for (const r of results) {
    const heapMB = r.metrics?.jsHeapUsed ? (r.metrics.jsHeapUsed / 1024 / 1024).toFixed(0) : '--';
    md += `| ${r.name} | ${r.result} | ${(r.bootTimeMs / 1000).toFixed(1)} | ${r.fps.avg} | ${r.fps.min} | ${r.fps.max} | ${r.quality.final} | ${heapMB} | ${r.errors.length} |\n`;
  }

  // Comparison if available
  if (diffs && diffs.length > 0) {
    md += `\n## Comparison vs Baseline\n\n`;
    md += `| Device | Verdict | FPS (base→curr) | Delta | Boot delta | Errors delta |\n`;
    md += `|--------|---------|-----------------|-------|------------|-------------|\n`;
    for (const d of diffs) {
      if (d.note) {
        md += `| ${d.device} | ${d.note} | -- | -- | -- | -- |\n`;
      } else {
        md += `| ${d.name} | **${d.verdict}** | ${d.fps.base}→${d.fps.curr} | ${d.fps.delta > 0 ? '+' : ''}${d.fps.delta.toFixed(1)} (${d.fps.pct}%) | ${d.boot.delta > 0 ? '+' : ''}${d.boot.delta}ms | ${d.errors.curr - d.errors.base} |\n`;
      }
    }
  }

  // Console errors
  const allErrors = results.flatMap(r => r.errors.map(e => `[${r.device}] ${e}`));
  if (allErrors.length > 0) {
    md += `\n## Errors\n\n`;
    for (const e of allErrors) md += `- ${e}\n`;
  }

  return md;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  DP MOTO — Chromium Test Runner (CDP)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Engine: Playwright Chromium (${HEADED ? 'HEADED' : 'HEADLESS'})`);
  console.log(`  Duration: ${DURATION}s per device`);
  console.log(`  Target: ${BASE_URL}`);

  // Determine device list
  let deviceKeys;
  if (DEVICES_ARG) {
    deviceKeys = DEVICES_ARG.split(',').map(d => d.trim());
  } else if (SIMULATE) {
    deviceKeys = [SIMULATE];
  } else {
    deviceKeys = ['desktop'];
  }

  console.log(`  Devices: ${deviceKeys.join(', ')}`);

  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--enable-precise-memory-info',   // Enables performance.memory
      '--disable-gpu-sandbox',
    ],
  });

  const allResults = [];

  for (let i = 0; i < deviceKeys.length; i++) {
    const key = deviceKeys[i];
    console.log(`\n[${i + 1}/${deviceKeys.length}]`);
    try {
      const result = await testDevice(browser, key);
      allResults.push(result);
    } catch (err) {
      console.log(`  !! CRASH: ${err.message}`);
      allResults.push({
        device: key, name: DEVICE_LIB[key]?.name || key, result: 'CRASH',
        bootTimeMs: 0, duration: DURATION, finalState: 'CRASH',
        fps: { samples: [], avg: 0, min: 0, max: 0, count: 0 },
        quality: { initial: '--', final: '--', changes: [] },
        features: {}, score: 0, errors: [err.message], metrics: {},
        consoleLogs: [], screenshots: [],
      });
    }
  }

  await browser.close();

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  // Compare against baseline if requested or if reference exists
  let diffs = null;
  const refResultsPath = join(REFERENCE_DIR, 'BASELINE.md');
  const webkitBaseline = join(ROOT, 'telemetry', 'webkit-results.json');

  // Compare against Chrome baseline first, fall back to WebKit baseline
  const chromeBaseline = join(REFERENCE_DIR, 'chrome-baseline.json');
  if (COMPARE) {
    const baselineFile = existsSync(chromeBaseline) ? chromeBaseline : webkitBaseline;
    if (existsSync(baselineFile)) {
      try {
        const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
        diffs = compareResults(allResults, baseline);
        const engine = baselineFile === chromeBaseline ? 'Chrome' : 'WebKit (cross-engine)';
        console.log(`  Comparing against ${engine} baseline`);
      } catch (e) {
        console.log(`  Warning: could not load baseline for comparison: ${e.message}`);
      }
    } else {
      console.log(`  No baseline found for comparison. Run with --save-baseline first.`);
    }
  }

  // Generate report
  const report = generateReport(allResults, diffs);
  writeFileSync(REPORT_FILE, report);

  // Save as Chrome baseline if requested
  if (SAVE_BASELINE) {
    mkdirSync(REFERENCE_DIR, { recursive: true });
    writeFileSync(join(REFERENCE_DIR, 'chrome-baseline.json'), JSON.stringify(allResults, null, 2));
    console.log(`\n  Baseline saved to ${join(REFERENCE_DIR, 'chrome-baseline.json')}`);
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Results: ${RESULTS_FILE}`);
  console.log(`  Report:  ${REPORT_FILE}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);

  // Summary
  const passes = allResults.filter(r => r.result === 'PASS').length;
  const fails = allResults.filter(r => r.result !== 'PASS').length;
  console.log(`  Total: ${allResults.length} | Pass: ${passes} | Fail: ${fails}`);

  if (diffs) {
    const improved = diffs.filter(d => d.verdict === 'IMPROVED').length;
    const worse = diffs.filter(d => d.verdict === 'WORSE' || d.verdict === 'REGRESSION').length;
    const same = diffs.filter(d => d.verdict === 'SAME').length;
    console.log(`  vs Baseline: ${improved} improved | ${same} same | ${worse} worse`);
  }

  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
