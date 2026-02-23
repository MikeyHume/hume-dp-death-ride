#!/usr/bin/env node
/**
 * Repro Runner — autonomous recipe executor for DP Moto robot pilot.
 *
 * Usage:
 *   node scripts/repro-runner.mjs <recipe.json> [options]
 *
 * Options:
 *   --target <url>    Override recipe target URL
 *   --attempts <n>    Override max attempts (default: recipe value or 3)
 *   --timeout <ms>    Per-attempt timeout (default: 60000)
 *   --seed <n>        Override RNG seed for determinism
 *   --insecure        Skip TLS verification for self-signed certs
 *   --verbose         Extra logging
 *   --out <dir>       Report output directory (default: scripts/repro-reports/)
 *
 * Zero dependencies — requires Node 18+.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';

// ── CLI Parsing ──────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
let recipePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    if (key === 'insecure' || key === 'verbose') {
      flags[key] = true;
    } else {
      flags[key] = args[++i];
    }
  } else if (!recipePath) {
    recipePath = args[i];
  }
}

if (!recipePath) {
  console.error('Usage: node scripts/repro-runner.mjs <recipe.json> [--target URL] [--attempts N] [--insecure]');
  process.exit(1);
}

if (flags.insecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const VERBOSE = !!flags.verbose;
const OUT_DIR = resolve(flags.out || 'scripts/repro-reports');
mkdirSync(OUT_DIR, { recursive: true });

// ── Colors ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(msg) { console.log(`${C.dim}[runner]${C.reset} ${msg}`); }
function logStep(i, total, msg) { console.log(`  ${C.cyan}[${i + 1}/${total}]${C.reset} ${msg}`); }
function logOk(msg) { console.log(`  ${C.green}OK${C.reset} ${msg}`); }
function logFail(msg) { console.log(`  ${C.red}FAIL${C.reset} ${msg}`); }
function logWarn(msg) { console.log(`  ${C.yellow}WARN${C.reset} ${msg}`); }

// ── Recipe Loading ──────────────────────────────────────────
const recipe = JSON.parse(readFileSync(resolve(recipePath), 'utf-8'));
const TARGET_RAW = flags.target || recipe.target || 'https://localhost:8081';
// Extract origin (scheme + host + port) for API calls — strip path and query params
const TARGET_URL = new URL(TARGET_RAW);
const TARGET = TARGET_URL.origin;
const MAX_ATTEMPTS = parseInt(flags.attempts) || recipe.maxAttempts || 3;
const ATTEMPT_TIMEOUT = parseInt(flags.timeout) || recipe.attemptTimeout || 60000;
const SEED = flags.seed != null ? parseInt(flags.seed) : (recipe.seed ?? null);

log(`${C.bold}Recipe:${C.reset} ${recipe.name}`);
log(`${C.bold}Target:${C.reset} ${TARGET} (from ${TARGET_RAW})`);
log(`${C.bold}Attempts:${C.reset} ${MAX_ATTEMPTS}`);
log(`${C.bold}Seed:${C.reset} ${SEED ?? 'default (weekly)'}`);
if (recipe.bug) log(`${C.bold}Bug:${C.reset} ${recipe.bug}`);

// ── HTTP Helpers ────────────────────────────────────────────
async function pollState() {
  const res = await fetch(`${TARGET}/test-state`, {
    signal: AbortSignal.timeout(5000),
  });
  return await res.json();
}

async function sendCommands(cmds) {
  const body = { commands: cmds.map(c => typeof c === 'string' ? c : JSON.stringify(c)) };
  const res = await fetch(`${TARGET}/test-command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return await res.json();
}

async function getTelemetryStatus() {
  try {
    const res = await fetch(`${TARGET}/telemetry/status`, {
      signal: AbortSignal.timeout(3000),
    });
    return await res.json();
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// After a hard reload, poll the new page for crash attribution data
// (sessionStorage persists across reloads within the same tab)
async function pollCrashAttribution() {
  // Wait a moment for the new page to boot and populate TestState
  await sleep(2000);
  try {
    const state = await pollState();
    return {
      lastCrashSuspectAction: state.lastCrashSuspectAction || null,
      lastReloadReason: state.lastReloadReason || null,
      lastReloadTs: state.lastReloadTs || null,
    };
  } catch {
    return { lastCrashSuspectAction: null, lastReloadReason: null, lastReloadTs: null };
  }
}

// ── Crash Detection ─────────────────────────────────────────
function detectCrashSignals(prev, curr) {
  const signals = [];

  // Error growth
  if (curr.errorHistory && prev.errorHistory) {
    if (curr.errorHistory.length > prev.errorHistory.length) {
      const newErrors = curr.errorHistory.slice(prev.errorHistory.length);
      signals.push({ type: 'error', errors: newErrors });
    }
  }

  // Frame freeze (same frameCount)
  if (prev.frameCount != null && curr.frameCount != null && curr.frameCount === prev.frameCount) {
    signals.push({ type: 'freeze', frameCount: curr.frameCount, state: curr.stateName });
  }

  // Unloading
  if (curr.unloading) {
    signals.push({ type: 'unload', state: curr.stateName });
  }

  // Heartbeat stale (lastUpdateMs too old)
  // Skip during boot phase (frameCount 0) — syncTestState only runs in GameScene
  if (curr.lastUpdateMs && curr.frameCount > 0 && (Date.now() - curr.lastUpdateMs > 10000)) {
    signals.push({ type: 'heartbeat-stale', lastUpdateMs: curr.lastUpdateMs, state: curr.stateName });
  }

  return signals;
}

function computeSignature(state, errors) {
  if (errors && errors.length > 0) {
    const first = errors[0];
    const match = first.match(/@ (.+?):(\d+)/);
    if (match) return `error:${match[1].split('/').pop()}:${match[2]}`;
    return `error:${first.slice(0, 80)}`;
  }
  return `freeze:${state?.stateName || '?'}:tick=${state?.frameCount || 0}:obs=${state?.obstacleCount || 0}`;
}

// ── Step Executors ──────────────────────────────────────────
const STATE_ORDER = ['INIT', 'TITLE', 'SONG_SELECT', 'TUTORIAL', 'STARTING', 'PLAYING', 'DYING', 'NAME_ENTRY', 'DEAD'];

async function executeWait(target, timeout, strict, prevState, stateTimeline, expectedRunId) {
  const targets = Array.isArray(target) ? target : [target];
  const start = Date.now();
  let lastState = prevState;
  let freezeCount = 0;

  while (Date.now() - start < timeout) {
    let state;
    try { state = await pollState(); } catch { await sleep(500); continue; }

    // Hard reload detection: runId changed unexpectedly
    if (expectedRunId && state.runId && state.runId !== expectedRunId) {
      stateTimeline.push({ ts: Date.now(), state: 'HARD_RELOAD', frameCount: state.frameCount, newRunId: state.runId });
      return { ok: false, reason: 'hard-reload', state, elapsed: Date.now() - start, hardReload: true };
    }

    // Track timeline
    if (state.stateName !== lastState?.stateName) {
      stateTimeline.push({ ts: Date.now(), state: state.stateName, frameCount: state.frameCount });
    }

    // Success: reached target state
    if (targets.includes(state.stateName)) {
      return { ok: true, state, elapsed: Date.now() - start };
    }

    // Strict mode: if we're past the target in the flow, that's unexpected
    if (strict && targets.length === 1) {
      const targetIdx = STATE_ORDER.indexOf(targets[0]);
      const currIdx = STATE_ORDER.indexOf(state.stateName);
      if (targetIdx >= 0 && currIdx > targetIdx) {
        return { ok: false, reason: `overshot: expected ${targets[0]}, got ${state.stateName}`, state, elapsed: Date.now() - start };
      }
    }

    // Crash detection during wait
    const signals = detectCrashSignals(lastState || {}, state);
    if (signals.some(s => s.type === 'unload' || s.type === 'heartbeat-stale')) {
      return { ok: false, reason: 'crash-signal', signals, state, elapsed: Date.now() - start };
    }

    // Frame freeze detection (6 consecutive polls with same frameCount)
    // Skip during boot phase (frameCount 0) — GameScene hasn't started yet
    if (lastState && state.frameCount === lastState.frameCount && state.frameCount > 0) {
      freezeCount++;
      if (freezeCount >= 6) { // 6 polls × 300ms = ~2s frozen
        return { ok: false, reason: 'freeze', state, elapsed: Date.now() - start };
      }
    } else {
      freezeCount = 0;
    }

    lastState = state;
    await sleep(300);
  }

  return { ok: false, reason: 'timeout', state: lastState, elapsed: Date.now() - start };
}

async function executeSurvive(durationMs, prevState, stateTimeline, expectedRunId) {
  const start = Date.now();
  let lastState = prevState;
  let lastFrameCount = prevState?.frameCount ?? 0;
  let freezeCount = 0;

  while (Date.now() - start < durationMs) {
    let state;
    try { state = await pollState(); } catch { await sleep(500); continue; }

    // Hard reload detection
    if (expectedRunId && state.runId && state.runId !== expectedRunId) {
      stateTimeline.push({ ts: Date.now(), state: 'HARD_RELOAD', frameCount: state.frameCount, newRunId: state.runId });
      return { ok: false, reason: 'hard-reload', state, elapsed: Date.now() - start, hardReload: true };
    }

    if (state.stateName !== lastState?.stateName) {
      stateTimeline.push({ ts: Date.now(), state: state.stateName, frameCount: state.frameCount });
    }

    // Check frame advancement
    if (state.frameCount <= lastFrameCount) {
      freezeCount++;
      if (freezeCount >= 6) {
        return { ok: false, reason: 'freeze-during-survive', state, elapsed: Date.now() - start };
      }
    } else {
      freezeCount = 0;
      lastFrameCount = state.frameCount;
    }

    // Check for errors
    const signals = detectCrashSignals(lastState || {}, state);
    const crashSignals = signals.filter(s => s.type !== 'freeze'); // freeze checked above
    if (crashSignals.length > 0) {
      return { ok: false, reason: 'crash-during-survive', signals: crashSignals, state, elapsed: Date.now() - start };
    }

    // Player died unexpectedly
    if (state.stateName === 'DYING' || state.stateName === 'DEAD') {
      return { ok: false, reason: `died-during-survive:${state.stateName}`, state, elapsed: Date.now() - start };
    }

    lastState = state;
    await sleep(500);
  }

  return { ok: true, state: lastState, elapsed: Date.now() - start };
}

// ── Single Attempt ──────────────────────────────────────────
async function runAttempt(attemptNum) {
  log(`\n${C.bold}── Attempt ${attemptNum}/${MAX_ATTEMPTS} ──${C.reset}`);

  const stateTimeline = [];
  const stepResults = [];
  const attemptStart = Date.now();
  let lastState = {};

  // Get initial state
  try {
    lastState = await pollState();
    stateTimeline.push({ ts: Date.now(), state: lastState.stateName, frameCount: lastState.frameCount });
  } catch (e) {
    logFail(`Cannot reach game at ${TARGET}: ${e.message}`);
    return { outcome: 'unreachable', durationMs: 0, stateTimeline, stepResults, finalState: {}, errors: [], crashSignature: null };
  }

  const runId = lastState.runId || '?';
  log(`RunId: ${runId} | State: ${lastState.stateName} | Frame: ${lastState.frameCount}`);

  // Detect stale/dead page — if lastUpdateMs is >60s old and frameCount is 0, page needs reload
  const staleAge = lastState.lastUpdateMs ? Date.now() - lastState.lastUpdateMs : 0;
  if (lastState.frameCount === 0 && staleAge > 60000) {
    log(`Page appears stale (${Math.round(staleAge / 1000)}s old, frameCount=0) — sending reload command`);
    await sendCommands([{ type: 'reload' }]);
    // Wait for page to reload and testMode to reinit (poll for fresh runId)
    const oldRunId = lastState.runId;
    const reloadStart = Date.now();
    let reloaded = false;
    while (Date.now() - reloadStart < 20000) {
      await sleep(2000);
      try {
        const fresh = await pollState();
        if (fresh.runId !== oldRunId || fresh.lastUpdateMs > lastState.lastUpdateMs) {
          lastState = fresh;
          log(`Page reloaded — new runId: ${fresh.runId}, state: ${fresh.stateName}`);
          reloaded = true;
          break;
        }
      } catch {}
    }
    if (!reloaded) {
      logFail(`Page did not reload (runId unchanged after 20s). Manual refresh needed.`);
      return { outcome: 'dead-page', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: lastState, errors: ['Page is dead — browser tab needs manual Cmd+R or WebDriver reload'], crashSignature: null, runId };
    }
  }

  // Freshness gate — require at least one state advancement before proceeding
  // This distinguishes "alive but booting" from "dead page returning cached data"
  if (lastState.frameCount === 0 && lastState.stateName === 'INIT') {
    log(`Waiting for boot to produce first frame...`);
    const bootStart = Date.now();
    const bootTimeout = recipe.baselineTimeout || 30000;
    while (Date.now() - bootStart < bootTimeout) {
      await sleep(1000);
      try {
        const fresh = await pollState();
        if (fresh.frameCount > 0 || fresh.stateName !== 'INIT') {
          lastState = fresh;
          log(`Boot alive — state: ${fresh.stateName}, frame: ${fresh.frameCount}`);
          break;
        }
      } catch {}
    }
    if (lastState.frameCount === 0 && lastState.stateName === 'INIT') {
      logFail(`Boot never advanced past INIT after ${Math.round((Date.now() - bootStart) / 1000)}s`);
      return { outcome: 'boot-stuck', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: lastState, errors: ['Boot stuck in INIT — assets may have failed to load'], crashSignature: null, runId };
    }
  }

  // Reset to known baseline
  if (SEED != null) {
    await sendCommands([{ type: 'reset-run', seed: SEED }]);
    log(`Sent reset-run with seed=${SEED}`);
  } else {
    await sendCommands([{ type: 'return-title' }]);
    log(`Sent return-title`);
  }
  await sleep(500);

  // Wait for TITLE state as baseline (non-strict: game may still be in PLAYING momentarily)
  const baselineMs = recipe.baselineTimeout || 15000;
  const resetResult = await executeWait('TITLE', baselineMs, false, lastState, stateTimeline);
  if (!resetResult.ok) {
    logFail(`Could not reach TITLE baseline: ${resetResult.reason}`);
    return { outcome: 'setup-fail', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: resetResult.state || {}, errors: [], crashSignature: null, runId };
  }
  lastState = resetResult.state;
  // Lock the runId after baseline is established — any change from here = hard reload
  const expectedRunId = lastState.runId || runId;
  logOk(`Baseline: TITLE (${resetResult.elapsed}ms) runId=${expectedRunId}`);

  // Execute recipe steps
  const steps = recipe.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Attempt-level timeout
    if (Date.now() - attemptStart > ATTEMPT_TIMEOUT) {
      logFail(`Attempt timeout (${ATTEMPT_TIMEOUT}ms)`);
      stepResults.push({ step: i, type: 'timeout', ok: false });
      return { outcome: 'timeout', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: lastState, errors: lastState.errorHistory || [], crashSignature: null, stepsCompleted: i, stepsTotal: steps.length, runId };
    }

    // ── wait step ──
    if (step.wait) {
      logStep(i, steps.length, `wait ${step.wait} (${step.timeout || 10000}ms)`);
      const result = await executeWait(step.wait, step.timeout || 10000, true, lastState, stateTimeline, expectedRunId);
      if (!result.ok) {
        if (result.hardReload) {
          logFail(`HARD RELOAD detected during wait for ${step.wait}`);
          const reloadInfo = await pollCrashAttribution();
          stepResults.push({ step: i, type: 'wait', target: step.wait, ok: false, reason: 'hard-reload', elapsed: result.elapsed });
          return { outcome: 'hard-reload', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors: result.state?.errorHistory || [], crashSignature: `reload:${reloadInfo.lastReloadReason || 'unknown'}`, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId, ...reloadInfo };
        }
        logFail(`${result.reason} (wanted ${step.wait}, got ${result.state?.stateName})`);
        const errors = result.state?.errorHistory || [];
        const sig = result.signals ? computeSignature(result.state, result.signals.flatMap(s => s.errors || [])) : computeSignature(result.state, errors);
        stepResults.push({ step: i, type: 'wait', target: step.wait, ok: false, reason: result.reason, elapsed: result.elapsed });
        return { outcome: result.reason === 'freeze' || result.reason === 'crash-signal' ? 'crash' : 'fail', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors, crashSignature: sig, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId };
      }
      logOk(`${step.wait} (${result.elapsed}ms)`);
      lastState = result.state;
      stepResults.push({ step: i, type: 'wait', target: step.wait, ok: true, elapsed: result.elapsed });
    }

    // ── waitAnyOf step ──
    else if (step.waitAnyOf) {
      logStep(i, steps.length, `waitAnyOf [${step.waitAnyOf.join(', ')}] (${step.timeout || 10000}ms)`);
      const result = await executeWait(step.waitAnyOf, step.timeout || 10000, false, lastState, stateTimeline, expectedRunId);
      if (!result.ok) {
        if (result.hardReload) {
          logFail(`HARD RELOAD detected during waitAnyOf`);
          const reloadInfo = await pollCrashAttribution();
          stepResults.push({ step: i, type: 'waitAnyOf', targets: step.waitAnyOf, ok: false, reason: 'hard-reload', elapsed: result.elapsed });
          return { outcome: 'hard-reload', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors: result.state?.errorHistory || [], crashSignature: `reload:${reloadInfo.lastReloadReason || 'unknown'}`, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId, ...reloadInfo };
        }
        logFail(`${result.reason}`);
        stepResults.push({ step: i, type: 'waitAnyOf', targets: step.waitAnyOf, ok: false, reason: result.reason, elapsed: result.elapsed });
        return { outcome: 'fail', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors: result.state?.errorHistory || [], crashSignature: null, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId };
      }
      logOk(`${result.state.stateName} (${result.elapsed}ms)`);
      lastState = result.state;
      stepResults.push({ step: i, type: 'waitAnyOf', got: result.state.stateName, ok: true, elapsed: result.elapsed });
    }

    // ── cmd step ──
    else if (step.cmd) {
      const cmd = typeof step.cmd === 'string' ? { type: step.cmd } : step.cmd;
      // Merge step-level params into cmd (except reserved keys)
      for (const [k, v] of Object.entries(step)) {
        if (k !== 'cmd' && k !== 'delay' && k !== 'repeat' && k !== 'interval') {
          if (typeof cmd[k] === 'undefined') cmd[k] = v;
        }
      }
      const repeat = step.repeat || 1;
      const interval = step.interval || 0;
      const delay = step.delay || 0;
      logStep(i, steps.length, `cmd: ${cmd.type}${repeat > 1 ? ` x${repeat}` : ''}${delay ? ` +${delay}ms` : ''}`);
      for (let r = 0; r < repeat; r++) {
        await sendCommands([cmd]);
        if (interval && r < repeat - 1) await sleep(interval);
      }
      if (delay) await sleep(delay);
      // Check for hard reload after command execution
      try {
        const postCmdState = await pollState();
        if (expectedRunId && postCmdState.runId && postCmdState.runId !== expectedRunId) {
          logFail(`HARD RELOAD detected after cmd ${cmd.type}`);
          const reloadInfo = await pollCrashAttribution();
          stepResults.push({ step: i, type: 'cmd', cmd: cmd.type, repeat, ok: false, reason: 'hard-reload' });
          return { outcome: 'hard-reload', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: postCmdState, errors: postCmdState.errorHistory || [], crashSignature: `reload:${reloadInfo.lastReloadReason || 'unknown'}`, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId, ...reloadInfo };
        }
      } catch {} // game may be unreachable briefly during reload
      stepResults.push({ step: i, type: 'cmd', cmd: cmd.type, repeat, ok: true });
    }

    // ── survive step ──
    else if (step.survive != null) {
      logStep(i, steps.length, `survive ${step.survive}ms`);
      const result = await executeSurvive(step.survive, lastState, stateTimeline, expectedRunId);
      if (!result.ok) {
        if (result.hardReload) {
          logFail(`HARD RELOAD detected during survive`);
          const reloadInfo = await pollCrashAttribution();
          stepResults.push({ step: i, type: 'survive', duration: step.survive, ok: false, reason: 'hard-reload', elapsed: result.elapsed });
          return { outcome: 'hard-reload', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors: result.state?.errorHistory || [], crashSignature: `reload:${reloadInfo.lastReloadReason || 'unknown'}`, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId, ...reloadInfo };
        }
        logFail(`${result.reason}`);
        const errors = result.state?.errorHistory || [];
        const sig = computeSignature(result.state, errors);
        stepResults.push({ step: i, type: 'survive', duration: step.survive, ok: false, reason: result.reason, elapsed: result.elapsed });
        return { outcome: 'crash', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: result.state || {}, errors, crashSignature: sig, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId };
      }
      logOk(`Survived ${result.elapsed}ms`);
      lastState = result.state;
      stepResults.push({ step: i, type: 'survive', duration: step.survive, ok: true, elapsed: result.elapsed });
    }

    // ── assert step ──
    else if (step.assert) {
      logStep(i, steps.length, `assert ${step.assert} == ${step.eq}`);
      try { lastState = await pollState(); } catch {}
      const actual = lastState[step.assert];
      if (actual !== step.eq) {
        logFail(`${step.assert} = ${actual} (expected ${step.eq})`);
        stepResults.push({ step: i, type: 'assert', field: step.assert, expected: step.eq, actual, ok: false });
        return { outcome: 'fail', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: lastState, errors: lastState.errorHistory || [], crashSignature: null, failedStep: step, stepsCompleted: i, stepsTotal: steps.length, runId };
      }
      logOk(`${step.assert} = ${actual}`);
      stepResults.push({ step: i, type: 'assert', field: step.assert, ok: true });
    }

    // ── log step ──
    else if (step.log) {
      logStep(i, steps.length, `log: ${step.log}`);
      stepResults.push({ step: i, type: 'log', ok: true });
    }

    // ── delay step ──
    else if (step.delay && !step.cmd) {
      logStep(i, steps.length, `delay ${step.delay}ms`);
      await sleep(step.delay);
      stepResults.push({ step: i, type: 'delay', ok: true });
    }
  }

  // All steps passed
  try { lastState = await pollState(); } catch {}
  logOk(`${C.green}All ${steps.length} steps passed${C.reset}`);
  return { outcome: 'pass', durationMs: Date.now() - attemptStart, stateTimeline, stepResults, finalState: lastState, errors: lastState.errorHistory || [], crashSignature: null, stepsCompleted: steps.length, stepsTotal: steps.length, runId };
}

// ── Main Run Loop ───────────────────────────────────────────
async function main() {
  const report = {
    recipe: recipe.name,
    bug: recipe.bug || null,
    target: TARGET,
    seed: SEED,
    timestamp: new Date().toISOString(),
    totalAttempts: 0,
    reproduced: 0,
    hardReloads: 0,
    passed: 0,
    failed: 0,
    reproRate: '0%',
    verdict: 'unknown',
    attempts: [],
    crashSignatures: [],
    suspectActions: [],
    bundleStatus: 'not_attempted',
    bundleFilename: null,
  };

  // Check telemetry status before run
  const telBefore = await getTelemetryStatus();
  const crashCountBefore = telBefore?.crashes ?? 0;

  // Check game is reachable
  try {
    const state = await pollState();
    if (state.stateName === 'NOT_READY') {
      logWarn('Game reports NOT_READY — is it loaded with ?test=1?');
    }
  } catch (e) {
    logFail(`Cannot reach game at ${TARGET}: ${e.message}`);
    logWarn('Make sure the game is running and accessible.');
    if (!flags.insecure) logWarn('Try --insecure for self-signed certs.');
    process.exit(1);
  }

  log(`\n${C.bold}${C.magenta}═══ Starting ${MAX_ATTEMPTS} attempt(s) ═══${C.reset}\n`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await runAttempt(attempt);
    report.attempts.push({ attempt, ...result });
    report.totalAttempts = attempt;

    if (result.outcome === 'pass') {
      report.passed++;
    } else if (result.outcome === 'crash' || result.outcome === 'hard-reload') {
      report.reproduced++;
      if (result.outcome === 'hard-reload') report.hardReloads++;
      if (result.crashSignature && !report.crashSignatures.includes(result.crashSignature)) {
        report.crashSignatures.push(result.crashSignature);
      }
      // Track suspect actions for crash attribution
      if (result.lastCrashSuspectAction) {
        const suspect = result.lastCrashSuspectAction;
        const key = `${suspect.type}${suspect.details ? ':' + suspect.details : ''}`;
        if (!report.suspectActions.some(s => s.action === key)) {
          report.suspectActions.push({ action: key, count: 1, reloadReason: result.lastReloadReason });
        } else {
          report.suspectActions.find(s => s.action === key).count++;
        }
      }
    } else {
      report.failed++;
    }

    // If the game crashed (unreachable, crash signal, or hard reload), wait for recovery
    if (result.outcome === 'crash' || result.outcome === 'unreachable' || result.outcome === 'hard-reload') {
      log(`Waiting for game recovery...`);
      const recoveryStart = Date.now();
      let recovered = false;
      while (Date.now() - recoveryStart < 30000) {
        try {
          const state = await pollState();
          // New runId means page reloaded — recovered
          if (state.runId && state.runId !== result.runId) {
            log(`${C.green}Game recovered (new runId: ${state.runId})${C.reset}`);
            recovered = true;
            break;
          }
          // Same runId but game is responding — also OK
          if (state.frameCount > (result.finalState?.frameCount || 0)) {
            recovered = true;
            break;
          }
        } catch {}
        await sleep(2000);
      }
      if (!recovered) {
        logWarn('Game did not recover within 30s — stopping.');
        break;
      }
    }
  }

  // Check telemetry status after run
  const telAfter = await getTelemetryStatus();
  const crashCountAfter = telAfter?.crashes ?? 0;
  if (crashCountAfter > crashCountBefore) {
    report.newCrashFiles = crashCountAfter - crashCountBefore;
  }

  // Compute verdict
  const total = report.totalAttempts;
  report.reproRate = total > 0 ? `${Math.round(report.reproduced / total * 100)}%` : '0%';
  if (report.reproduced === 0) {
    report.verdict = 'not-reproduced';
  } else if (report.reproduced / total >= 0.8) {
    report.verdict = 'consistent';
  } else if (report.reproduced / total >= 0.2) {
    report.verdict = 'intermittent';
  } else {
    report.verdict = 'flaky';
  }

  // Save report
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportName = `${recipe.name}_${ts}.json`;
  const reportPath = resolve(OUT_DIR, reportName);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log(`\n${C.bold}${C.magenta}═══ Results ═══${C.reset}`);
  console.log(`  Recipe:     ${recipe.name}`);
  console.log(`  Verdict:    ${report.verdict === 'not-reproduced' ? C.green : C.red}${report.verdict}${C.reset}`);
  console.log(`  Repro rate: ${report.reproRate} (${report.reproduced}/${total})`);
  console.log(`  Passed:     ${report.passed}  Failed: ${report.failed}  Crashed: ${report.reproduced}${report.hardReloads ? ` (${report.hardReloads} hard reloads)` : ''}`);
  if (report.crashSignatures.length > 0) {
    console.log(`  Signatures: ${report.crashSignatures.join(', ')}`);
  }
  if (report.suspectActions.length > 0) {
    console.log(`  ${C.yellow}Suspect actions:${C.reset}`);
    for (const s of report.suspectActions) {
      console.log(`    ${C.red}${s.action}${C.reset} x${s.count} (reason: ${s.reloadReason || '?'})`);
    }
  }
  if (report.newCrashFiles) {
    console.log(`  ${C.yellow}New crash files: ${report.newCrashFiles}${C.reset}`);
  }
  console.log(`  Report:     ${reportPath}`);
  console.log();
}

main().catch(e => {
  console.error(`${C.red}Fatal: ${e.message}${C.reset}`);
  process.exit(1);
});
