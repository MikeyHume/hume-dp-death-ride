/**
 * webkit-test.mjs — Run DP Moto in Playwright's WebKit (Safari engine)
 *
 * Usage:
 *   node scripts/webkit-test.mjs                    # default: boot + play 30s
 *   node scripts/webkit-test.mjs --duration 15      # play for 15s
 *   node scripts/webkit-test.mjs --simulate iphone-xs  # simulate device
 *   node scripts/webkit-test.mjs --headed           # show browser window
 *   node scripts/webkit-test.mjs --all-iphones      # test all 31 iPhones sequentially
 *
 * Screenshots saved to: telemetry/webkit-screenshots/
 * Results saved to:     telemetry/webkit-results.json
 */

import { webkit } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCREENSHOT_DIR = join(ROOT, 'telemetry', 'webkit-screenshots');
const RESULTS_FILE = join(ROOT, 'telemetry', 'webkit-results.json');

// ── Config ────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const DURATION = parseInt(getArg('duration', '30'), 10);
const SIMULATE = getArg('simulate', null);
const HEADED = args.includes('--headed');
const ALL_IPHONES = args.includes('--all-iphones');
const BASE_URL = getArg('url', 'http://127.0.0.1:8081');

// iPhone library for --all-iphones mode
const IPHONES = [
  { slug: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', cssW: 440, cssH: 956 },
  { slug: 'iphone-16-pro', name: 'iPhone 16 Pro', cssW: 402, cssH: 874 },
  { slug: 'iphone-16-plus', name: 'iPhone 16 Plus', cssW: 430, cssH: 932 },
  { slug: 'iphone-16', name: 'iPhone 16', cssW: 393, cssH: 852 },
  { slug: 'iphone-16e', name: 'iPhone 16e', cssW: 390, cssH: 844 },
  { slug: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', cssW: 430, cssH: 932 },
  { slug: 'iphone-15-pro', name: 'iPhone 15 Pro', cssW: 393, cssH: 852 },
  { slug: 'iphone-15-plus', name: 'iPhone 15 Plus', cssW: 430, cssH: 932 },
  { slug: 'iphone-15', name: 'iPhone 15', cssW: 393, cssH: 852 },
  { slug: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', cssW: 430, cssH: 932 },
  { slug: 'iphone-14-pro', name: 'iPhone 14 Pro', cssW: 393, cssH: 852 },
  { slug: 'iphone-14-plus', name: 'iPhone 14 Plus', cssW: 428, cssH: 926 },
  { slug: 'iphone-14', name: 'iPhone 14', cssW: 390, cssH: 844 },
  { slug: 'iphone-se-3', name: 'iPhone SE 3rd Gen', cssW: 375, cssH: 667 },
  { slug: 'iphone-13-pro-max', name: 'iPhone 13 Pro Max', cssW: 428, cssH: 926 },
  { slug: 'iphone-13-pro', name: 'iPhone 13 Pro', cssW: 390, cssH: 844 },
  { slug: 'iphone-13', name: 'iPhone 13', cssW: 390, cssH: 844 },
  { slug: 'iphone-13-mini', name: 'iPhone 13 Mini', cssW: 360, cssH: 780 },
  { slug: 'iphone-12-pro-max', name: 'iPhone 12 Pro Max', cssW: 428, cssH: 926 },
  { slug: 'iphone-12-pro', name: 'iPhone 12 Pro', cssW: 390, cssH: 844 },
  { slug: 'iphone-12', name: 'iPhone 12', cssW: 390, cssH: 844 },
  { slug: 'iphone-12-mini', name: 'iPhone 12 Mini', cssW: 360, cssH: 780 },
  { slug: 'iphone-11-pro-max', name: 'iPhone 11 Pro Max', cssW: 414, cssH: 896 },
  { slug: 'iphone-11-pro', name: 'iPhone 11 Pro', cssW: 375, cssH: 812 },
  { slug: 'iphone-11', name: 'iPhone 11', cssW: 414, cssH: 896 },
  { slug: 'iphone-xs-max', name: 'iPhone XS Max', cssW: 414, cssH: 896 },
  { slug: 'iphone-xs', name: 'iPhone XS', cssW: 375, cssH: 812 },
  { slug: 'iphone-xr', name: 'iPhone XR', cssW: 414, cssH: 896 },
  { slug: 'iphone-x', name: 'iPhone X', cssW: 375, cssH: 812 },
  { slug: 'iphone-se-2', name: 'iPhone SE 2nd Gen', cssW: 375, cssH: 667 },
  { slug: 'iphone-8-plus', name: 'iPhone 8 Plus', cssW: 414, cssH: 736 },
  { slug: 'iphone-8', name: 'iPhone 8', cssW: 375, cssH: 667 },
];

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── Single device test ───────────────────────────────────────

async function testDevice(browser, deviceSlug, deviceName, viewportW, viewportH) {
  const tag = deviceSlug || 'desktop';
  const landscapeW = viewportH || 960;  // portrait H → landscape W
  const landscapeH = viewportW || 540;  // portrait W → landscape H
  console.log(`\n── ${deviceName || 'Desktop'} (${tag}) ── ${landscapeW}×${landscapeH} ──`);

  const context = await browser.newContext({
    viewport: { width: landscapeW, height: landscapeH + 48 }, // +48 for sim info bar
    deviceScaleFactor: 2,
    isMobile: !!deviceSlug,
    hasTouch: !!deviceSlug,
    userAgent: deviceSlug
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });

  const page = await context.newPage();

  // Inject preserveDrawingBuffer before any WebGL context is created
  // This patches getContext so canvas.toDataURL() returns actual pixels
  await page.addInitScript(() => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
      }
      return origGetContext.call(this, type, attrs);
    };
  });

  // Capture console logs and errors (filter WebGL warnings — not real crashes)
  const consoleLogs = [];
  const errors = [];
  const WEBGL_WARN_RE = /WebGL:|INVALID_VALUE|INVALID_ENUM|INVALID_OPERATION|glTex/;
  const AUDIO_WARN_RE = /AudioContext|audio/i;

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      // Skip WebGL and audio warnings — expected in headless WebKit
      if (!WEBGL_WARN_RE.test(msg.text()) && !AUDIO_WARN_RE.test(msg.text())) {
        errors.push(msg.text());
      }
    }
  });
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
    console.log(`  !! PAGE ERROR: ${err.message}`);
  });

  // Build URL
  let url = `${BASE_URL}/?test=1`;
  if (deviceSlug) url += `&simulate=${deviceSlug}`;
  url += '&hud=1';

  const startTime = Date.now();
  console.log(`  Loading ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Canvas-based screenshot (WebGL needs toDataURL, page.screenshot shows black)
  const ssPrefix = join(SCREENSHOT_DIR, `${tag}_${timestamp()}`);
  let screenshotIdx = 1;

  async function takeScreenshot(label) {
    const ssNum = String(screenshotIdx++).padStart(2, '0');
    const filename = `${ssPrefix}_${ssNum}_${label}.png`;
    try {
      // Try canvas capture first (works for WebGL)
      const dataUrl = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c ? c.toDataURL('image/png') : null;
      });
      if (dataUrl) {
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        writeFileSync(filename, Buffer.from(base64, 'base64'));
      } else {
        // Fallback to page screenshot (captures HTML overlay like BIOS)
        await page.screenshot({ path: filename });
      }
    } catch (e) {
      // Fallback
      await page.screenshot({ path: filename });
    }
    console.log(`  Screenshot: ${ssNum}_${label}`);
    return filename;
  }

  await takeScreenshot('loaded');

  // Wait for BIOS auto-dismiss + boot, click through TITLE
  console.log(`  Waiting for PLAYING state (timeout: 45s)...`);
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

        // Screenshot on state change
        if (stateName !== lastScreenshotState) {
          await takeScreenshot(stateName.toLowerCase());
          console.log(`    state → ${stateName} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
          lastScreenshotState = stateName;
        }

        // Auto-click through TITLE screen to start game
        if (stateName === 'TITLE' && !clickedTitle) {
          await sleep(500); // Brief pause for title to render
          await page.click('canvas', { position: { x: 480, y: 270 } });
          clickedTitle = true;
          console.log(`    Clicked canvas to start from TITLE`);
        }

        // Auto-click through COUNTDOWN (skip it)
        if (stateName === 'STARTING') {
          await page.keyboard.press('Space');
          console.log(`    Pressed Space to skip countdown`);
        }

        if (stateName === 'PLAYING') break;
      }
    } catch (e) {
      // Page not ready yet
    }
  }

  const bootTimeMs = Date.now() - startTime;
  const booted = stateName === 'PLAYING';
  console.log(`  Boot: ${booted ? 'OK' : 'FAILED'} — ${(bootTimeMs / 1000).toFixed(1)}s — state: ${stateName}`);

  if (!booted) {
    await takeScreenshot(`FAIL_${stateName.toLowerCase()}`);
    await context.close();
    return {
      slug: deviceSlug || 'desktop', name: deviceName || 'Desktop',
      result: 'TIMEOUT', bootTimeMs, finalState: stateName,
      fps: { samples: [], avg: 0, min: 999, max: 0 },
      quality: { initial: '--', final: '--', changes: [] },
      features: {}, errors, consoleLogs: consoleLogs.slice(-20),
    };
  }

  // ── Play phase: collect FPS samples ──────────────────────
  // Hold Space to make the player move (desktop) or simulate touch (mobile)
  await page.keyboard.down('Space');
  console.log(`  Playing for ${DURATION}s — holding Space — sampling FPS every 500ms...`);
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

      // Track quality changes
      if (testState.qualityTier !== lastQuality) {
        const elapsed = ((Date.now() - playStart) / 1000).toFixed(1);
        qualityChanges.push(`${lastQuality}→${testState.qualityTier} @ ${elapsed}s`);
        console.log(`  Quality: ${lastQuality} → ${testState.qualityTier} @ ${elapsed}s`);
        lastQuality = testState.qualityTier;
      }

      // Screenshot every 10s during play
      if (playScreenshots < 3 && (Date.now() - playStart) >= (playScreenshots + 1) * 10000) {
        const elapsed = Math.round((Date.now() - playStart) / 1000);
        await takeScreenshot(`playing_${elapsed}s`);
        console.log(`    FPS: ${testState.fps} — quality: ${testState.qualityTier}`);
        playScreenshots++;
      }
    } catch (e) {
      errors.push(`Poll error: ${e.message}`);
    }
  }

  // Release Space
  await page.keyboard.up('Space');

  // Final state
  let finalState = null;
  try {
    finalState = await page.evaluate(() => (window).__dpMotoTest?.state);
  } catch (e) {}

  // Final screenshot
  await takeScreenshot('final');

  await context.close();

  // Compute stats
  const fpsAvg = fpsSamples.length > 0 ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0;
  const fpsMin = fpsSamples.length > 0 ? Math.min(...fpsSamples) : 0;
  const fpsMax = fpsSamples.length > 0 ? Math.max(...fpsSamples) : 0;

  const result = {
    slug: deviceSlug || 'desktop',
    name: deviceName || 'Desktop',
    result: errors.length > 0 ? 'ERROR' : fpsSamples.length > 0 ? 'PASS' : 'FAIL',
    bootTimeMs,
    duration: DURATION,
    finalState: finalState?.stateName || stateName,
    fps: {
      samples: fpsSamples,
      avg: Math.round(fpsAvg * 10) / 10,
      min: fpsMin,
      max: fpsMax,
      count: fpsSamples.length,
    },
    quality: {
      initial: initialQuality,
      final: finalState?.qualityTier || lastQuality,
      changes: qualityChanges,
    },
    features: finalState?.features || {},
    score: finalState?.score || 0,
    errors,
    screenshotPrefix: ssPrefix.replace(ROOT, '.'),
    consoleLogs: consoleLogs.slice(-30),
  };

  const passRate = fpsSamples.length > 0
    ? `FPS avg:${fpsAvg.toFixed(0)} min:${fpsMin} max:${fpsMax}`
    : 'no FPS samples';

  const verdict = result.result === 'PASS' ? '\x1b[32mPASS\x1b[0m' :
                  result.result === 'ERROR' ? '\x1b[31mERROR\x1b[0m' : '\x1b[33mFAIL\x1b[0m';

  console.log(`  Result: ${verdict} — ${passRate} — quality: ${result.quality.final} — errors: ${errors.length}`);

  return result;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  // Ensure screenshot dir exists
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  DP MOTO — WebKit (Safari Engine) Test Runner');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Engine: Playwright WebKit (Safari ${HEADED ? 'HEADED' : 'HEADLESS'})`);
  console.log(`  Duration: ${DURATION}s per device`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`  Target: ${BASE_URL}`);

  let browser = await webkit.launch({
    headless: !HEADED,
  });

  const allResults = [];

  if (ALL_IPHONES) {
    console.log(`\n  Mode: ALL IPHONES (${IPHONES.length} devices)`);
    console.log('═══════════════════════════════════════════════════');

    for (let i = 0; i < IPHONES.length; i++) {
      const d = IPHONES[i];
      console.log(`\n[${i + 1}/${IPHONES.length}]`);
      try {
        const result = await testDevice(browser, d.slug, d.name, d.cssW, d.cssH);
        allResults.push(result);
      } catch (err) {
        console.log(`  !! CRASH: ${err.message}`);
        allResults.push({
          slug: d.slug, name: d.name, result: 'CRASH', bootTimeMs: 0,
          duration: DURATION, finalState: 'CRASH',
          fps: { samples: [], avg: 0, min: 0, max: 0, count: 0 },
          quality: { initial: '--', final: '--', changes: [] },
          features: {}, score: 0, errors: [err.message], consoleLogs: [],
        });
        // Restart browser to clear crashed state
        console.log(`  Restarting browser...`);
        try { await browser.close(); } catch (e) {}
        browser = await webkit.launch({ headless: !HEADED });
        console.log(`  Browser restarted`);
      }
    }
  } else if (SIMULATE) {
    const device = IPHONES.find(d => d.slug === SIMULATE);
    if (device) {
      const result = await testDevice(browser, device.slug, device.name, device.cssW, device.cssH);
      allResults.push(result);
    } else {
      console.log(`  Unknown device: ${SIMULATE}`);
      console.log(`  Available: ${IPHONES.map(d => d.slug).join(', ')}`);
    }
  } else {
    // Default: desktop test (no simulation)
    const result = await testDevice(browser, null, null, null, null);
    allResults.push(result);
  }

  await browser.close();

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Results saved: ${RESULTS_FILE}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);

  // Summary
  const passes = allResults.filter(r => r.result === 'PASS').length;
  const fails = allResults.filter(r => r.result !== 'PASS').length;
  console.log(`  Total: ${allResults.length} | Pass: ${passes} | Fail: ${fails}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
