import { defineConfig, type Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, 'telemetry', 'logs');
const CRASHES_DIR = path.join(LOGS_DIR, 'crashes');
const NDJSON_PATH = path.join(LOGS_DIR, 'events.ndjson');
const LATEST_PATH = path.join(LOGS_DIR, 'latest.json');

// QA Bridge data dirs (shared with qa_bridge Express server)
const QA_DATA_DIR = path.join(__dirname, '..', 'qa_bridge', 'data');
const QA_HISTORY_DIR = path.join(QA_DATA_DIR, 'history');

// ─── Telemetry Vite Plugin ─────────────────────────────
// Serves /telemetry, /beacon, /telemetry/status on the SAME origin as the game.
// No separate server, no cert issues, works in standalone PWA mode.

function telemetryPlugin(): Plugin {
  // Ensure dirs exist
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(CRASHES_DIR, { recursive: true });
  fs.mkdirSync(QA_DATA_DIR, { recursive: true });
  fs.mkdirSync(QA_HISTORY_DIR, { recursive: true });

  // Latest test state snapshot (updated by game via POST /test-state)
  let latestTestState: any = null;

  // ── Agent relay state ──────────────────────────────────────
  const agentTasks: any[] = [];
  const agentResults: any[] = [];
  let latestScreenshot: any = null;

  // ── Seq/ack command system ─────────────────────────────────
  // Runner POSTs commands → server assigns seq → game polls via POST /test-state
  // Game sends ackSeq → server only returns commands with seq > ackSeq
  let nextSeq = 1;
  const commandLog: Array<{ seq: number; cmd: string }> = [];
  const MAX_CMD_LOG = 200;
  let lastKnownRunId: string | null = null;

  // ── Scenario Runner ─────────────────────────────────────────
  // Executes multi-step test scenarios by reading game state and pushing commands.
  // Runs as an async loop inside the Vite server — zero network latency.

  interface ScenarioStep {
    action: string;
    state?: string;
    field?: string;
    value?: any;
    y?: number;
    delay?: number;
    timeout?: number;
    duration?: number;
    repeat?: number;
    interval?: number;
    seed?: number;
  }

  interface Scenario {
    name: string;
    description?: string;
    setup?: { skipBios?: boolean; skipMusic?: boolean; skipTutorial?: boolean; fastCountdown?: boolean };
    steps: ScenarioStep[];
    success?: { field: string; value: any };
    failure?: string[];
  }

  interface StepResult {
    step: number;
    action: string;
    outcome: 'pass' | 'fail' | 'skip';
    duration: number;
    detail?: string;
  }

  interface RunResult {
    runId: string;
    scenario: string;
    startTime: number;
    endTime: number;
    outcome: 'pass' | 'fail' | 'crash' | 'timeout';
    crashSignature: string | null;
    stateHistory: Array<{ time: number; state: string }>;
    errorHistory: string[];
    stepResults: StepResult[];
  }

  let activeScenario: Scenario | null = null;
  let scenarioStatus: {
    running: boolean;
    stepIndex: number;
    totalSteps: number;
    scenarioName: string;
    currentAction: string;
    outcome: string | null;
    stepResults: StepResult[];
    startTime: number;
    error: string | null;
  } = {
    running: false, stepIndex: 0, totalSteps: 0, scenarioName: '',
    currentAction: '', outcome: null, stepResults: [], startTime: 0, error: null,
  };
  const runHistory: RunResult[] = [];
  const MAX_RUN_HISTORY = 50;

  /** Push a command into the command log (same as /test-command POST) */
  function pushCmd(cmd: any): number {
    const cmdStr = typeof cmd === 'string' ? cmd : JSON.stringify(cmd);
    const seq = nextSeq++;
    commandLog.push({ seq, cmd: cmdStr });
    while (commandLog.length > MAX_CMD_LOG) commandLog.shift();
    return seq;
  }

  /** Read a field from the latest test state using dot notation */
  function readStateField(field: string): any {
    if (!latestTestState) return undefined;
    const parts = field.split('.');
    let obj: any = latestTestState;
    for (const p of parts) {
      if (obj == null) return undefined;
      obj = obj[p];
    }
    return obj;
  }

  /** Generate a crash signature hash from current state */
  function generateCrashSignature(): string | null {
    if (!latestTestState) return 'hard-crash:no-state';
    const errors = latestTestState.errorHistory || [];
    if (errors.length > 0) {
      // Simple hash of latest error
      const lastErr = errors[errors.length - 1];
      const hash = lastErr.slice(0, 80).replace(/[^a-zA-Z0-9]/g, '_');
      return `js-error:${hash}`;
    }
    if (latestTestState.unloading) return `unload:${latestTestState.stateName}`;
    return null;
  }

  /** Execute a single scenario step. Returns a StepResult. */
  async function executeStep(step: ScenarioStep, stepIdx: number): Promise<StepResult> {
    const startMs = Date.now();

    // Apply delay before action (if specified)
    if (step.delay && step.delay > 0) {
      await new Promise(r => setTimeout(r, step.delay));
    }

    switch (step.action) {
      case 'wait-state': {
        const timeout = step.timeout || 15000;
        const target = step.state;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const current = latestTestState?.stateName;
          if (current === target) {
            return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `reached ${target}` };
          }
          await new Promise(r => setTimeout(r, 250));
        }
        return { step: stepIdx, action: step.action, outcome: 'fail', duration: Date.now() - startMs, detail: `timeout waiting for ${target}, stuck at ${latestTestState?.stateName}` };
      }

      case 'tap': {
        const repeat = step.repeat || 1;
        const interval = step.interval || 0;
        for (let i = 0; i < repeat; i++) {
          pushCmd({ type: 'tap' });
          if (interval > 0 && i < repeat - 1) await new Promise(r => setTimeout(r, interval));
        }
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `${repeat}x` };
      }

      case 'speed-tap': {
        const repeat = step.repeat || 1;
        const interval = step.interval || 200;
        for (let i = 0; i < repeat; i++) {
          pushCmd({ type: 'speed-tap' });
          if (i < repeat - 1) await new Promise(r => setTimeout(r, interval));
        }
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `${repeat}x @${interval}ms` };
      }

      case 'attack': {
        pushCmd({ type: 'attack' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'rocket': {
        pushCmd({ type: 'rocket' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'move-y': {
        pushCmd({ type: 'move-y', y: step.y ?? 540 });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `y=${step.y}` };
      }

      case 'skip-to-play': {
        pushCmd({ type: 'skip-to-play' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'set-seed': {
        pushCmd({ type: 'set-seed', seed: step.seed ?? 42 });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `seed=${step.seed}` };
      }

      case 'die': {
        pushCmd({ type: 'die' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'return-title': {
        pushCmd({ type: 'return-title' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'submit-name': {
        pushCmd({ type: 'submit-name', name: (step as any).name || 'ROBOT' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'open-profile': {
        pushCmd({ type: 'open-profile' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'close-profile': {
        pushCmd({ type: 'close-profile' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'toggle-music-menu': {
        pushCmd({ type: 'toggle-music-menu' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'reload': {
        pushCmd({ type: 'reload' });
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      case 'assert': {
        const timeout = step.timeout || 5000;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const actual = readStateField(step.field!);
          if (actual === step.value) {
            return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `${step.field}=${actual}` };
          }
          await new Promise(r => setTimeout(r, 250));
        }
        const finalVal = readStateField(step.field!);
        return { step: stepIdx, action: step.action, outcome: 'fail', duration: Date.now() - startMs, detail: `${step.field}: expected=${step.value}, got=${finalVal}` };
      }

      case 'survive': {
        const duration = step.duration || 10000;
        const deadline = Date.now() + duration;
        const startFrame = latestTestState?.frameCount ?? 0;
        let lastFrame = startFrame;
        let lastCheckMs = Date.now();
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 500));
          const currentFrame = latestTestState?.frameCount ?? 0;
          const currentState = latestTestState?.stateName;
          // Check for crash: frames stopped advancing
          if (currentFrame === lastFrame && Date.now() - lastCheckMs > 3000) {
            return { step: stepIdx, action: step.action, outcome: 'fail', duration: Date.now() - startMs, detail: `freeze at frame ${currentFrame}, state=${currentState}` };
          }
          // Check for death
          if (currentState === 'DEAD' || currentState === 'DYING') {
            return { step: stepIdx, action: step.action, outcome: 'fail', duration: Date.now() - startMs, detail: `died at frame ${currentFrame}` };
          }
          if (currentFrame !== lastFrame) {
            lastFrame = currentFrame;
            lastCheckMs = Date.now();
          }
        }
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `survived ${duration}ms, ${(latestTestState?.frameCount ?? 0) - startFrame} frames` };
      }

      case 'delay': {
        const ms = step.duration || step.delay || 1000;
        await new Promise(r => setTimeout(r, ms));
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs, detail: `${ms}ms` };
      }

      case 'screenshot': {
        // Request the game to capture a screenshot
        // The game-side captureScreenshot() is called via the test object
        pushCmd({ type: 'screenshot' });
        await new Promise(r => setTimeout(r, 1000)); // Give time for capture
        return { step: stepIdx, action: step.action, outcome: 'pass', duration: Date.now() - startMs };
      }

      default:
        return { step: stepIdx, action: step.action, outcome: 'skip', duration: 0, detail: `unknown action: ${step.action}` };
    }
  }

  /** Run a full scenario from start to finish */
  async function runScenario(scenario: Scenario): Promise<void> {
    console.log(`\x1b[46m\x1b[30m ▶ SCENARIO START: ${scenario.name} (${scenario.steps.length} steps) \x1b[0m`);
    const stateHistory: Array<{ time: number; state: string }> = [];
    let lastSeenState = '';

    scenarioStatus = {
      running: true,
      stepIndex: 0,
      totalSteps: scenario.steps.length,
      scenarioName: scenario.name,
      currentAction: 'initializing',
      outcome: null,
      stepResults: [],
      startTime: Date.now(),
      error: null,
    };

    // Track state changes during scenario
    const stateTracker = setInterval(() => {
      const currentState = latestTestState?.stateName || 'UNKNOWN';
      if (currentState !== lastSeenState) {
        stateHistory.push({ time: Date.now(), state: currentState });
        lastSeenState = currentState;
      }
    }, 250);

    // Heartbeat monitor: detect hard crashes (no state update for 8s)
    let lastUpdateMs = Date.now();
    const heartbeatChecker = setInterval(() => {
      const gameLastUpdate = latestTestState?.lastUpdateMs ?? 0;
      if (gameLastUpdate > lastUpdateMs) {
        lastUpdateMs = gameLastUpdate;
      }
    }, 1000);

    try {
      // Execute each step
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        scenarioStatus.stepIndex = i;
        scenarioStatus.currentAction = step.action;

        console.log(`\x1b[36m  [step ${i}/${scenario.steps.length - 1}] ${step.action}${step.state ? ` → ${step.state}` : ''}${step.y != null ? ` y=${step.y}` : ''}${step.duration ? ` ${step.duration}ms` : ''}\x1b[0m`);

        const result = await executeStep(step, i);
        scenarioStatus.stepResults.push(result);

        if (result.outcome === 'fail') {
          console.log(`\x1b[31m  ✗ Step ${i} FAILED: ${result.detail}\x1b[0m`);
          // Check for hard crash
          const timeSinceUpdate = Date.now() - lastUpdateMs;
          const isCrash = timeSinceUpdate > 8000;

          scenarioStatus.outcome = isCrash ? 'crash' : 'fail';
          scenarioStatus.error = result.detail || null;

          const runResult: RunResult = {
            runId: latestTestState?.runId || `unknown-${Date.now()}`,
            scenario: scenario.name,
            startTime: scenarioStatus.startTime,
            endTime: Date.now(),
            outcome: isCrash ? 'crash' : 'fail',
            crashSignature: isCrash ? generateCrashSignature() : null,
            stateHistory,
            errorHistory: latestTestState?.errorHistory || [],
            stepResults: scenarioStatus.stepResults,
          };
          runHistory.push(runResult);
          if (runHistory.length > MAX_RUN_HISTORY) runHistory.shift();

          console.log(`\x1b[41m\x1b[37m ■ SCENARIO ${isCrash ? 'CRASH' : 'FAIL'}: ${scenario.name} at step ${i} (${result.action}) \x1b[0m`);
          break;
        }

        console.log(`\x1b[32m  ✓ Step ${i} OK (${result.duration}ms)${result.detail ? ` — ${result.detail}` : ''}\x1b[0m`);
      }

      // All steps passed
      if (!scenarioStatus.outcome) {
        scenarioStatus.outcome = 'pass';
        const runResult: RunResult = {
          runId: latestTestState?.runId || `unknown-${Date.now()}`,
          scenario: scenario.name,
          startTime: scenarioStatus.startTime,
          endTime: Date.now(),
          outcome: 'pass',
          crashSignature: null,
          stateHistory,
          errorHistory: latestTestState?.errorHistory || [],
          stepResults: scenarioStatus.stepResults,
        };
        runHistory.push(runResult);
        if (runHistory.length > MAX_RUN_HISTORY) runHistory.shift();
        console.log(`\x1b[42m\x1b[30m ■ SCENARIO PASS: ${scenario.name} (${Date.now() - scenarioStatus.startTime}ms) \x1b[0m`);
      }
    } catch (err: any) {
      scenarioStatus.outcome = 'crash';
      scenarioStatus.error = err.message || String(err);
      console.log(`\x1b[41m\x1b[37m ■ SCENARIO ERROR: ${scenario.name} — ${err.message} \x1b[0m`);
    } finally {
      clearInterval(stateTracker);
      clearInterval(heartbeatChecker);
      scenarioStatus.running = false;
      activeScenario = null;
    }
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => resolve(body));
    });
  }

  function tsStr(ts: number) { return ts ? new Date(ts).toLocaleTimeString() : '??'; }

  function writeNdjson(entries: any[], sessionId?: string, version?: string) {
    if (!entries || entries.length === 0) return;
    const now = Date.now();
    const lines = entries.map((e: any) =>
      JSON.stringify({ ...e, _sid: sessionId || e.sid || '?', _ver: version || '?', _rx: now })
    ).join('\n') + '\n';
    fs.appendFileSync(NDJSON_PATH, lines);
  }

  function printEntry(e: any) {
    const ts = tsStr(e.ts);
    if (e.type === 'error' || e.type === 'window.onerror' || e.type === 'unhandledrejection') {
      console.log(`\x1b[31m[${ts}] ${e.type}: ${e.message || e.args?.[0] || '?'}\x1b[0m`);
      if (e.stack) console.log(`  ${e.stack.split('\n').slice(0, 4).join('\n  ')}`);
    } else if (e.type === 'warn') {
      console.log(`\x1b[33m[${ts}] warn: ${e.args?.[0] || '?'}\x1b[0m`);
    } else if (e.type === 'fetch-error' || e.type === 'xhr-error') {
      console.log(`\x1b[35m[${ts}] ${e.type}: ${e.url} ${e.status || e.error || '?'}\x1b[0m`);
    } else if (e.type === 'resource-error') {
      console.log(`\x1b[35m[${ts}] resource-error: <${e.tagName}> ${e.url}\x1b[0m`);
    } else if (e.type === 'session-start') {
      console.log(`\x1b[36m[${ts}] ── SESSION START ── ${e.message}\x1b[0m`);
    } else if (e.type === 'session-end') {
      console.log(`\x1b[36m[${ts}] ── SESSION END ── ${e.message}\x1b[0m`);
    }
  }

  function saveCrashBundle(bundle: any, prefix: string) {
    const filename = `${prefix}_${bundle.sid}_${Date.now()}.json`;
    const filepath = path.join(CRASHES_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(bundle, null, 2));
    return filepath;
  }

  function json(res: ServerResponse, data: any) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function handleTelemetry(body: any, res: ServerResponse) {
    if (!body) return json(res, { ok: true, count: 0 });

    if (body.type === 'live') {
      const events = body.events || [];
      writeNdjson(events, body.sid, body.ver);
      try { fs.writeFileSync(LATEST_PATH, JSON.stringify(events.slice(-20), null, 2)); } catch {}
      for (const e of events) printEntry(e);
      return json(res, { ok: true, count: events.length });
    }

    if (body.type === 'crash-bundle') {
      const bundle = body.bundle;
      if (!bundle) return json(res, { ok: true });
      const fp = saveCrashBundle(bundle, 'crash');
      writeNdjson(bundle.events, bundle.sid, bundle.ver);
      console.log(`\x1b[41m\x1b[37m ★ CRASH BUNDLE RECEIVED ★ \x1b[0m`);
      console.log(`  Session: ${bundle.sid} | Standalone: ${bundle.standalone}`);
      console.log(`  Time: ${new Date(bundle.start).toLocaleString()} → ${new Date(bundle.end).toLocaleString()}`);
      console.log(`  Events: ${bundle.events.length} | Clean: ${bundle.clean} | Crash: ${bundle.crash}`);
      console.log(`  Saved: ${fp}`);
      const errors = bundle.events.filter((e: any) =>
        e.type === 'error' || e.type === 'window.onerror' || e.type === 'unhandledrejection'
      );
      if (errors.length > 0) {
        console.log(`  \x1b[31m── Errors (${errors.length}): ──\x1b[0m`);
        for (const e of errors) printEntry(e);
      }
      return json(res, { ok: true });
    }

    if (body.type === 'debug-bundle') {
      const { current, prior, state } = body;
      if (current) {
        const fp = saveCrashBundle(current, 'debug_current');
        writeNdjson(current.events, current.sid, current.ver);
        console.log(`\x1b[44m\x1b[37m ★ DEBUG BUNDLE (current) ★ \x1b[0m`);
        console.log(`  Session: ${current.sid} | Events: ${current.events.length} | Standalone: ${current.standalone}`);
        console.log(`  Saved: ${fp}`);
      }
      if (prior) {
        const fp = saveCrashBundle(prior, 'debug_prior');
        writeNdjson(prior.events, prior.sid, prior.ver);
        console.log(`\x1b[44m\x1b[37m ★ DEBUG BUNDLE (prior) ★ \x1b[0m`);
        console.log(`  Session: ${prior.sid} | Events: ${prior.events.length} | Crash: ${prior.crash}`);
        console.log(`  Saved: ${fp}`);
      }
      if (state) console.log(`  State:`, JSON.stringify(state));
      return json(res, { ok: true });
    }

    if (body.type === 'shutdown') {
      const events = body.events || [];
      writeNdjson(events, body.sid, body.ver);
      console.log(`\x1b[33m[beacon] shutdown (${body.reason}) sid=${body.sid} events=${events.length}\x1b[0m`);
      return json(res, { ok: true });
    }

    // Legacy: plain array
    if (Array.isArray(body)) {
      writeNdjson(body, '?', '?');
      for (const e of body) printEntry(e);
      return json(res, { ok: true, count: body.length });
    }

    json(res, { ok: true });
  }

  return {
    name: 'telemetry',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // CORS preflight
        if (req.method === 'OPTIONS' && (req.url === '/telemetry' || req.url === '/beacon')) {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          return res.end();
        }

        if (req.url === '/telemetry' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try { handleTelemetry(JSON.parse(raw), res); }
            catch { json(res, { ok: false, error: 'invalid json' }); }
          });
          return;
        }

        if (req.url === '/beacon' && req.method === 'POST') {
          readBody(req).then((raw) => {
            let data: any;
            try { data = JSON.parse(raw); } catch { data = { raw }; }
            if (data.type === 'shutdown') {
              writeNdjson(data.events || [], data.sid, data.ver);
              console.log(`\x1b[33m[beacon] shutdown (${data.reason}) sid=${data.sid}\x1b[0m`);
            } else if (data.events) {
              writeNdjson(data.events, data.sid, data.ver);
            } else {
              fs.appendFileSync(NDJSON_PATH, JSON.stringify({ _type: 'beacon-raw', _rx: Date.now(), ...data }) + '\n');
            }
            res.writeHead(200);
            res.end();
          });
          return;
        }

        if (req.url === '/telemetry/status' && req.method === 'GET') {
          const crashes = fs.existsSync(CRASHES_DIR) ? fs.readdirSync(CRASHES_DIR) : [];
          const ndjsonSize = fs.existsSync(NDJSON_PATH) ? fs.statSync(NDJSON_PATH).size : 0;
          return json(res, { ok: true, crashes: crashes.length, ndjsonBytes: ndjsonSize, crashFiles: crashes.slice(-10) });
        }

        // ─── Test Mode State Relay (seq/ack) ────────────────
        // Game pushes {state, ackSeq} via POST → server returns unacked commands.
        // Runner reads state via GET.
        if (req.url === '/test-state' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const envelope = JSON.parse(raw);
              // Envelope format: { state: {...}, ackSeq: N }
              if (envelope.state) {
                latestTestState = envelope.state;
              } else {
                // Legacy: raw state object (no envelope)
                latestTestState = envelope;
              }

              // ── Flush stale commands on new runId (page reload) ──
              const incomingRunId = latestTestState?.runId || null;
              if (incomingRunId && incomingRunId !== lastKnownRunId) {
                if (lastKnownRunId !== null && commandLog.length > 0) {
                  console.log(`\x1b[33m[test-state] New runId detected (${incomingRunId}), flushing ${commandLog.length} stale commands\x1b[0m`);
                  commandLog.length = 0;
                }
                lastKnownRunId = incomingRunId;
              }

              const clientAck = typeof envelope.ackSeq === 'number' ? envelope.ackSeq : 0;
              // Return only unacked commands
              const unacked = commandLog.filter(c => c.seq > clientAck);
              // Prune fully-acked entries (keep small safety buffer)
              while (commandLog.length > 0 && commandLog[0].seq <= clientAck && commandLog.length > 10) {
                commandLog.shift();
              }
              json(res, { commands: unacked });
            } catch {
              json(res, { commands: [] });
            }
          });
          return;
        }

        if (req.url === '/test-state' && req.method === 'GET') {
          return json(res, latestTestState || { state: -1, stateName: 'NOT_READY' });
        }

        // ─── Robot Pilot: Command Injection (seq/ack) ────────
        // Runner POSTs commands → server assigns seq numbers.
        // Game receives them via POST /test-state response piggyback.
        if (req.url === '/test-command' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const data = JSON.parse(raw);
              const cmds: string[] = Array.isArray(data.commands) ? data.commands : [raw];
              const assigned: number[] = [];
              for (const cmd of cmds) {
                const seq = nextSeq++;
                commandLog.push({ seq, cmd });
                assigned.push(seq);
              }
              // Prune old entries if log is too large
              while (commandLog.length > MAX_CMD_LOG) commandLog.shift();
              console.log(`\x1b[36m[test-cmd] Queued ${cmds.length} cmd(s), seq=${assigned.join(',')}, log=${commandLog.length}\x1b[0m`);
              json(res, { ok: true, queued: cmds.length, seqs: assigned, logSize: commandLog.length });
            } catch {
              json(res, { ok: false, error: 'invalid json' });
            }
          });
          return;
        }

        // ─── QA Bridge Endpoints ──────────────────────────────
        // Same-origin HTTPS — no mixed content issues from iPad Safari.
        if (req.url === '/qa/status' && req.method === 'GET') {
          return json(res, { status: 'online' });
        }

        if (req.url === '/qa/report' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const report = JSON.parse(raw);
              // Save as latest (overwritten each time)
              fs.writeFileSync(
                path.join(QA_DATA_DIR, 'report_latest.json'),
                JSON.stringify(report, null, 2)
              );
              // Save timestamped copy in history
              const ts = new Date().toISOString().replace(/[:.]/g, '-');
              const reason = report.reason || 'unknown';
              const histFile = `${reason}_${ts}.json`;
              fs.writeFileSync(
                path.join(QA_HISTORY_DIR, histFile),
                JSON.stringify(report, null, 2)
              );
              console.log(`\x1b[45m\x1b[37m ★ QA REPORT (${reason}) ★ \x1b[0m`);
              console.log(`  SID: ${report.sid || '?'} | Ver: ${report.ver || '?'}`);
              console.log(`  Saved: report_latest.json + history/${histFile}`);
              if (report.bundle?.events?.length) {
                console.log(`  Crash events: ${report.bundle.events.length}`);
              }
              if (report.lastEvents?.length) {
                console.log(`  Manual events: ${report.lastEvents.length}`);
              }
              json(res, { ok: true, file: histFile });
            } catch {
              json(res, { ok: false, error: 'invalid json' });
            }
          });
          return;
        }

        // ─── Agent Relay (PC Claude ↔ Mac Claude) ──────────────
        // Task queue for dual-agent coordination.
        if (req.url === '/agent/task' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const task = JSON.parse(raw);
              task._id = task._id || `task-${Date.now()}`;
              task._ts = Date.now();
              task._status = 'pending';
              agentTasks.push(task);
              console.log(`\x1b[36m[agent] Task queued: ${task._id} (${task.type || '?'})\x1b[0m`);
              json(res, { ok: true, taskId: task._id });
            } catch { json(res, { ok: false, error: 'invalid json' }); }
          });
          return;
        }
        if (req.url === '/agent/task' && req.method === 'GET') {
          const pending = agentTasks.find((t: any) => t._status === 'pending');
          if (pending) {
            pending._status = 'claimed';
            pending._claimedTs = Date.now();
          }
          return json(res, pending || null);
        }
        if (req.url === '/agent/result' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const result = JSON.parse(raw);
              result._ts = Date.now();
              agentResults.push(result);
              // Mark task complete
              const task = agentTasks.find((t: any) => t._id === result.taskId);
              if (task) task._status = 'done';
              console.log(`\x1b[32m[agent] Result received for: ${result.taskId}\x1b[0m`);
              json(res, { ok: true });
            } catch { json(res, { ok: false, error: 'invalid json' }); }
          });
          return;
        }
        if (req.url === '/agent/result' && req.method === 'GET') {
          const latest = agentResults[agentResults.length - 1] || null;
          return json(res, latest);
        }
        if (req.url === '/agent/results' && req.method === 'GET') {
          return json(res, agentResults);
        }
        if (req.url === '/agent/status' && req.method === 'GET') {
          return json(res, {
            tasks: agentTasks.length,
            pending: agentTasks.filter((t: any) => t._status === 'pending').length,
            claimed: agentTasks.filter((t: any) => t._status === 'claimed').length,
            done: agentTasks.filter((t: any) => t._status === 'done').length,
            results: agentResults.length,
          });
        }

        // ─── Scenario Runner Endpoints ──────────────────────────
        // POST /test-scenario — start a scenario
        // GET  /test-scenario/status — check progress
        // GET  /test-runs — view run history
        if (req.url === '/test-scenario' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const scenario: Scenario = JSON.parse(raw);
              if (!scenario.name || !scenario.steps?.length) {
                return json(res, { ok: false, error: 'scenario must have name and steps[]' });
              }
              if (scenarioStatus.running) {
                return json(res, { ok: false, error: 'scenario already running', current: scenarioStatus.scenarioName });
              }
              activeScenario = scenario;
              // Fire and forget — runs async in background
              runScenario(scenario);
              json(res, { ok: true, name: scenario.name, steps: scenario.steps.length });
            } catch { json(res, { ok: false, error: 'invalid json' }); }
          });
          return;
        }
        if (req.url === '/test-scenario/status' && req.method === 'GET') {
          return json(res, scenarioStatus);
        }
        if (req.url === '/test-runs' && req.method === 'GET') {
          return json(res, runHistory);
        }

        // ─── Screenshot Storage ─────────────────────────────────
        // Game POSTs canvas screenshot → server stores for runner to GET.
        if (req.url === '/test-screenshot' && req.method === 'POST') {
          readBody(req).then((raw) => {
            try {
              const data = JSON.parse(raw);
              latestScreenshot = { ...data, _ts: Date.now() };
              json(res, { ok: true });
            } catch { json(res, { ok: false, error: 'invalid json' }); }
          });
          return;
        }
        if (req.url === '/test-screenshot' && req.method === 'GET') {
          return json(res, latestScreenshot || { error: 'no_screenshot' });
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [telemetryPlugin()],
  resolve: {
    alias: {
      // Phaser is loaded via CDN <script> tag in index.html.
      // This alias redirects all `import Phaser from 'phaser'` to a shim
      // that re-exports window.Phaser. Avoids Vite pre-bundling crash on iOS Safari.
      'phaser': path.resolve(__dirname, 'src/phaserShim.ts'),
    }
  },
  optimizeDeps: {
    exclude: ['phaser'], // Don't pre-bundle Phaser — it's loaded via CDN
  },
  build: {
    // No external/globals needed — the resolve.alias above redirects 'phaser'
    // imports to phaserShim.ts, which re-exports window.Phaser (loaded via CDN).
    // Rollup follows the alias and inlines the tiny shim code.
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    strictPort: true,
    origin: 'http://192.168.1.150:8081',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
  }
});
