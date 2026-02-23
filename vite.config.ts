import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
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
  plugins: [basicSsl(), telemetryPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    strictPort: true,
    https: true,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
  }
});
