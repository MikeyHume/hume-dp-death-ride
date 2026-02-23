#!/usr/bin/env node
/**
 * Mac Agent Daemon — Safari WebDriver bridge for iPad testing.
 *
 * Runs on the Mac tethered to iPad via USB-C.
 * Uses safaridriver (built into macOS) + WebDriver protocol to:
 *   - Open/reload the game URL on iPad Safari
 *   - Execute JavaScript (inject commands, read state)
 *   - Take device screenshots
 *   - Simulate touch events
 *
 * Polls the PC Vite server for tasks, executes them, and POSTs results back.
 *
 * Prerequisites:
 *   1. iPad connected via USB-C
 *   2. iPad Settings → Safari → Advanced → "Web Inspector" = ON
 *   3. iPad Settings → Safari → Advanced → "Remote Automation" = ON
 *   4. Mac: run `safaridriver --enable` once (requires sudo)
 *   5. Mac: start safaridriver: `safaridriver -p 4723 &`
 *
 * Usage:
 *   node scripts/mac-agent.mjs --pc-host 192.168.1.150 --pc-port 8081
 *
 * Zero external dependencies — uses only Node.js built-ins (http/https).
 */

import http from 'node:http';
import https from 'node:https';
import { parseArgs } from 'node:util';

// ── CLI args ────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    'pc-host':  { type: 'string', default: '192.168.1.150' },
    'pc-port':  { type: 'string', default: '8081' },
    'wd-port':  { type: 'string', default: '4723' },
    'poll-ms':  { type: 'string', default: '2000' },
    'game-url': { type: 'string', default: '' },
  },
});

const PC_HOST   = args['pc-host'];
const PC_PORT   = parseInt(args['pc-port'], 10);
const WD_PORT   = parseInt(args['wd-port'], 10);
const POLL_MS   = parseInt(args['poll-ms'], 10);
const GAME_URL  = args['game-url'] || `https://${PC_HOST}:${PC_PORT}/?test=1`;

// ── Logging ─────────────────────────────────────────────────────
const log = (tag, msg) => console.log(`\x1b[36m[${tag}]\x1b[0m ${msg}`);
const warn = (tag, msg) => console.warn(`\x1b[33m[${tag}]\x1b[0m ${msg}`);
const err = (tag, msg) => console.error(`\x1b[31m[${tag}]\x1b[0m ${msg}`);

// ── HTTP helpers (zero-dep) ─────────────────────────────────────
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const proto = options.protocol === 'https:' ? https : http;
    // For self-signed certs on the Vite dev server
    if (options.protocol === 'https:') {
      options.rejectUnauthorized = false;
    }
    const req = proto.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── WebDriver helpers ───────────────────────────────────────────
let sessionId = null;

async function wdRequest(method, path, body = null) {
  const options = {
    hostname: '127.0.0.1',
    port: WD_PORT,
    path,
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  return httpRequest(options, body);
}

async function createSession() {
  log('wd', 'Creating WebDriver session for iPad Safari...');
  const res = await wdRequest('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'safari',
        'safari:platformName': 'iOS',
        'safari:useSimulator': false,
        'safari:automaticInspection': true,
      },
    },
  });
  if (res.status === 200 && res.body?.value?.sessionId) {
    sessionId = res.body.value.sessionId;
    log('wd', `Session created: ${sessionId}`);
    return true;
  }
  err('wd', `Failed to create session: ${JSON.stringify(res.body)}`);
  return false;
}

async function deleteSession() {
  if (!sessionId) return;
  try {
    await wdRequest('DELETE', `/session/${sessionId}`);
    log('wd', 'Session deleted');
  } catch (e) {
    warn('wd', `Failed to delete session: ${e.message}`);
  }
  sessionId = null;
}

async function navigateTo(url) {
  log('wd', `Navigating to ${url}`);
  const res = await wdRequest('POST', `/session/${sessionId}/url`, { url });
  return res.status === 200;
}

async function executeScript(script, args = []) {
  const res = await wdRequest('POST', `/session/${sessionId}/execute/sync`, {
    script,
    args,
  });
  if (res.status === 200) return res.body?.value;
  throw new Error(`Script exec failed: ${JSON.stringify(res.body)}`);
}

async function executeScriptAsync(script, args = []) {
  const res = await wdRequest('POST', `/session/${sessionId}/execute/async`, {
    script,
    args,
  });
  if (res.status === 200) return res.body?.value;
  throw new Error(`Async script exec failed: ${JSON.stringify(res.body)}`);
}

async function takeScreenshot() {
  const res = await wdRequest('GET', `/session/${sessionId}/screenshot`);
  if (res.status === 200) return res.body?.value; // base64 PNG
  throw new Error(`Screenshot failed: ${JSON.stringify(res.body)}`);
}

async function getPageSource() {
  const res = await wdRequest('GET', `/session/${sessionId}/source`);
  if (res.status === 200) return res.body?.value;
  return null;
}

// ── Touch simulation via WebDriver Actions ──────────────────────
async function touchTap(x, y) {
  const res = await wdRequest('POST', `/session/${sessionId}/actions`, {
    actions: [{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 50 },
        { type: 'pointerUp', button: 0 },
      ],
    }],
  });
  return res.status === 200;
}

async function touchSwipe(startX, startY, endX, endY, durationMs = 300) {
  const res = await wdRequest('POST', `/session/${sessionId}/actions`, {
    actions: [{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: Math.round(startX), y: Math.round(startY) },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', duration: durationMs, x: Math.round(endX), y: Math.round(endY) },
        { type: 'pointerUp', button: 0 },
      ],
    }],
  });
  return res.status === 200;
}

async function releaseActions() {
  await wdRequest('DELETE', `/session/${sessionId}/actions`);
}

// ── PC Server communication ─────────────────────────────────────
const pcProto = PC_PORT === 443 ? 'https:' : (PC_PORT === 8081 ? 'https:' : 'http:');

async function pcRequest(method, path, body = null) {
  const options = {
    protocol: pcProto,
    hostname: PC_HOST,
    port: PC_PORT,
    path,
    method,
    headers: { 'Content-Type': 'application/json' },
    rejectUnauthorized: false,
  };
  return httpRequest(options, body);
}

async function fetchTask() {
  try {
    const res = await pcRequest('GET', '/agent/task');
    if (res.status === 200 && res.body && res.body._id) return res.body;
    return null;
  } catch (e) {
    warn('poll', `Failed to fetch task: ${e.message}`);
    return null;
  }
}

async function postResult(taskId, result) {
  try {
    await pcRequest('POST', '/agent/result', { taskId, ...result });
    log('result', `Posted result for task ${taskId}`);
  } catch (e) {
    err('result', `Failed to post result: ${e.message}`);
  }
}

// ── Game state reader (via JS injection) ────────────────────────
async function readGameState() {
  try {
    const state = await executeScript(
      'return window.__dpMotoTest ? window.__dpMotoTest.state : null;'
    );
    return state;
  } catch (e) {
    warn('state', `Failed to read game state: ${e.message}`);
    return null;
  }
}

async function pushGameCommand(cmd) {
  try {
    await executeScript(
      `if (window.__dpMotoTest) window.__dpMotoTest.pushCommand(arguments[0]);`,
      [typeof cmd === 'string' ? cmd : JSON.stringify(cmd)]
    );
    return true;
  } catch (e) {
    warn('cmd', `Failed to push command: ${e.message}`);
    return false;
  }
}

// ── Wait helpers ────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForState(targetState, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readGameState();
    if (state?.stateName === targetState) return { ok: true, state };
    if (state === null) return { ok: false, reason: 'no-state', state: null };
    await sleep(500);
  }
  const finalState = await readGameState();
  return { ok: false, reason: 'timeout', state: finalState };
}

async function waitForFrameAdvance(timeoutMs = 10000) {
  const state0 = await readGameState();
  if (!state0) return { ok: false, reason: 'no-state' };
  const fc0 = state0.frameCount;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(500);
    const state = await readGameState();
    if (!state) return { ok: false, reason: 'state-lost' };
    if (state.frameCount > fc0) return { ok: true, elapsed: Date.now() - start };
  }
  return { ok: false, reason: 'freeze' };
}

// ── Task executors ──────────────────────────────────────────────
const TASK_HANDLERS = {
  /** Ping — just verify connectivity */
  'ping': async () => ({ ok: true, ts: Date.now() }),

  /** Navigate to game URL and wait for it to load */
  'navigate': async (task) => {
    const url = task.url || GAME_URL;
    const ok = await navigateTo(url);
    if (!ok) return { ok: false, reason: 'navigate-failed' };
    await sleep(2000);
    const state = await readGameState();
    return { ok: !!state, state, url };
  },

  /** Reload page */
  'reload': async () => {
    await executeScript('location.reload();');
    await sleep(3000);
    const state = await readGameState();
    return { ok: !!state, state };
  },

  /** Read current game state */
  'read-state': async () => {
    const state = await readGameState();
    return { ok: !!state, state };
  },

  /** Take a screenshot and return base64 */
  'screenshot': async () => {
    const b64 = await takeScreenshot();
    return { ok: true, image: b64 ? `data:image/png;base64,${b64}` : null };
  },

  /** Push a game command (type, params) */
  'game-cmd': async (task) => {
    const cmd = task.cmd || task.command;
    if (!cmd) return { ok: false, reason: 'missing cmd' };
    const ok = await pushGameCommand(cmd);
    await sleep(100);
    const state = await readGameState();
    return { ok, state };
  },

  /** Touch tap at x,y */
  'touch-tap': async (task) => {
    const ok = await touchTap(task.x ?? 960, task.y ?? 540);
    await releaseActions();
    await sleep(100);
    const state = await readGameState();
    return { ok, state };
  },

  /** Touch swipe */
  'touch-swipe': async (task) => {
    const ok = await touchSwipe(
      task.startX ?? 960, task.startY ?? 540,
      task.endX ?? 960, task.endY ?? 200,
      task.duration ?? 300
    );
    await releaseActions();
    await sleep(100);
    const state = await readGameState();
    return { ok, state };
  },

  /** Wait for a specific game state */
  'wait-state': async (task) => {
    const result = await waitForState(task.target || 'PLAYING', task.timeout || 15000);
    return result;
  },

  /** Wait for frames to advance (alive check) */
  'wait-alive': async (task) => {
    return waitForFrameAdvance(task.timeout || 10000);
  },

  /** Run a recipe: sequence of steps */
  'run-recipe': async (task) => {
    const steps = task.steps || [];
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      log('recipe', `Step ${i + 1}/${steps.length}: ${step.type} ${step.target || step.cmd || ''}`);

      // Optional delay before step
      if (step.delay) await sleep(step.delay);

      const handler = TASK_HANDLERS[step.type];
      if (!handler) {
        results.push({ step: i, ok: false, reason: `unknown type: ${step.type}` });
        if (step.required !== false) break; // stop on required step failure
        continue;
      }

      try {
        const result = await handler(step);
        results.push({ step: i, ...result });
        if (!result.ok && step.required !== false) {
          log('recipe', `Step ${i + 1} failed — stopping recipe`);
          break;
        }
      } catch (e) {
        results.push({ step: i, ok: false, error: e.message });
        if (step.required !== false) break;
      }

      // Optional post-step delay
      if (step.postDelay) await sleep(step.postDelay);
    }
    return { ok: results.every(r => r.ok), steps: results };
  },

  /** Full health check: navigate, wait for boot, check state */
  'health-check': async () => {
    // Navigate
    const navOk = await navigateTo(GAME_URL);
    if (!navOk) return { ok: false, phase: 'navigate' };

    // Wait for test mode init (up to 20s for boot)
    await sleep(3000);
    const bootResult = await waitForFrameAdvance(20000);
    if (!bootResult.ok) return { ok: false, phase: 'boot', ...bootResult };

    // Wait for TITLE state
    const titleResult = await waitForState('TITLE', 15000);
    if (!titleResult.ok) return { ok: false, phase: 'title', ...titleResult };

    // Read full state
    const state = await readGameState();
    return {
      ok: true,
      phase: 'healthy',
      state,
      url: GAME_URL,
    };
  },

  /** Execute arbitrary JS and return result */
  'exec-js': async (task) => {
    if (!task.script) return { ok: false, reason: 'missing script' };
    try {
      const result = await executeScript(task.script, task.args || []);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

// ── Main loop ───────────────────────────────────────────────────
async function main() {
  log('init', `Mac Agent starting`);
  log('init', `PC server: ${pcProto}//${PC_HOST}:${PC_PORT}`);
  log('init', `WebDriver: http://127.0.0.1:${WD_PORT}`);
  log('init', `Game URL: ${GAME_URL}`);
  log('init', `Poll interval: ${POLL_MS}ms`);

  // Create WebDriver session
  const sessionOk = await createSession();
  if (!sessionOk) {
    err('init', 'Failed to create WebDriver session. Check:');
    err('init', '  1. safaridriver running: safaridriver -p 4723 &');
    err('init', '  2. iPad connected via USB-C');
    err('init', '  3. iPad → Settings → Safari → Advanced → Remote Automation = ON');
    err('init', '  4. iPad → Settings → Safari → Advanced → Web Inspector = ON');
    process.exit(1);
  }

  // Navigate to game URL
  log('init', 'Navigating to game...');
  await navigateTo(GAME_URL);
  await sleep(3000);

  // Verify game loaded
  const initState = await readGameState();
  if (initState) {
    log('init', `Game loaded — state: ${initState.stateName}, frame: ${initState.frameCount}`);
  } else {
    warn('init', 'Game state not available yet — will retry during polling');
  }

  // Post initial status
  await postResult('init', {
    ok: true,
    type: 'agent-online',
    sessionId,
    gameUrl: GAME_URL,
    initialState: initState,
    ts: Date.now(),
  });

  log('poll', 'Starting task polling loop...');

  // Graceful shutdown
  const shutdown = async () => {
    log('shutdown', 'Shutting down...');
    await deleteSession();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Poll loop
  while (true) {
    try {
      const task = await fetchTask();
      if (task) {
        log('task', `Received: ${task.type} (${task._id})`);

        const handler = TASK_HANDLERS[task.type];
        if (!handler) {
          await postResult(task._id, { ok: false, reason: `unknown task type: ${task.type}` });
          continue;
        }

        try {
          const result = await handler(task);
          await postResult(task._id, { type: task.type, ...result });
        } catch (e) {
          err('task', `Error executing ${task.type}: ${e.message}`);
          await postResult(task._id, { ok: false, type: task.type, error: e.message });
        }
      }
    } catch (e) {
      // Network error polling — just retry
      if (!e.message.includes('timeout')) {
        warn('poll', `Poll error: ${e.message}`);
      }
    }

    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  err('fatal', e.message);
  process.exit(1);
});
