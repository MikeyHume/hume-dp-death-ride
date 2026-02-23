/**
 * Layered crash-capture telemetry for iPad Safari.
 * Activates ONLY when URL contains ?debug=1
 *
 * Layers:
 *   1. In-memory ring buffer (500 events / 60s)
 *   2. IndexedDB persistence (throttled ≤250ms, forced on errors)
 *   3. Live network flush every 3s (fire-and-forget)
 *   4. sendBeacon + fetch(keepalive) on page hide/unload/freeze
 *   5. Prior-session crash detection + auto-upload on next boot
 *
 * If page crashes, next load reads IndexedDB and uploads the crash bundle.
 */

// ─── Constants ──────────────────────────────────────────
const MAX_EVENTS = 500;
const MAX_AGE_MS = 60_000;
const PERSIST_THROTTLE_MS = 250;
const HEARTBEAT_MS = 5_000;
const LIVE_FLUSH_MS = 3_000;
const DB_NAME = 'dp-moto-telemetry';
const DB_VERSION = 1;
const STORE_BUF = 'buf';
const STORE_META = 'meta';
const LS_BUF = 'tele-buf';
const LS_META = 'tele-meta';
const QA_BRIDGE: string | undefined = import.meta.env.VITE_QA_BRIDGE_URL;
const QA_REPORT_TIMEOUT_MS = 4_000;
const QA_CRASH_MAX_EVENTS = 300;
const QA_MANUAL_MAX_EVENTS = 100;

// ─── Types ──────────────────────────────────────────────
interface Entry {
  type: string;
  ts: number;
  args?: string[];
  message?: string;
  stack?: string;
  url?: string;
  status?: number;
  error?: string;
  tagName?: string;
  duration?: number;
}

interface SessionMeta {
  sid: string;
  start: number;
  hb: number;
  clean: boolean;
  ua: string;
  ver: string;
  standalone: boolean;
}

interface CrashBundle {
  sid: string;
  start: number;
  end: number;
  clean: boolean;
  crash: boolean;
  ua: string;
  ver: string;
  url: string;
  standalone: boolean;
  events: Entry[];
}

// ─── State ──────────────────────────────────────────────
let ring: Entry[] = [];
let live: Entry[] = [];
let sid = '';
let t0 = 0;
let ep = '';
let bep = '';
let db: IDBDatabase | null = null;
let useLs = false;
let pTimer: ReturnType<typeof setTimeout> | null = null;
let pLast = 0;
let shutdownFired = false;
let _log: typeof console.log;
let _warn: typeof console.warn;
let _err: typeof console.error;

// ─── Helpers ────────────────────────────────────────────
const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const ver = () => (window as any).verNum || '?';
const isStandalone = () =>
  (navigator as any).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;

function safe(v: unknown): string {
  try {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return `${v.message}\n${v.stack || ''}`;
    return JSON.stringify(v);
  } catch { return String(v); }
}

// ─── Ring Buffer ────────────────────────────────────────
function push(e: Entry): void {
  ring.push(e);
  live.push(e);
  while (ring.length > MAX_EVENTS) ring.shift();
  const cut = Date.now() - MAX_AGE_MS;
  while (ring.length > 0 && ring[0].ts < cut) ring.shift();
  schedPersist();
}

// ─── IndexedDB ──────────────────────────────────────────
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE_BUF)) d.createObjectStore(STORE_BUF);
      if (!d.objectStoreNames.contains(STORE_META)) d.createObjectStore(STORE_META);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

function idbPut(store: string, key: string, val: unknown): void {
  if (!db) return;
  try {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
  } catch { /* IDB write failed — silently continue */ }
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  if (!db) return Promise.resolve(undefined);
  return new Promise((ok) => {
    try {
      const tx = db!.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => ok(r.result as T | undefined);
      r.onerror = () => ok(undefined);
    } catch { ok(undefined); }
  });
}

function idbDel(store: string, key: string): void {
  if (!db) return;
  try {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
  } catch { /* ignore */ }
}

// ─── localStorage Fallback ──────────────────────────────
function lsPut(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } }
function lsGet<T>(k: string): T | undefined { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) as T : undefined; } catch { return undefined; } }
function lsDel(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

// ─── Persist (throttled ≤250ms, forced on errors) ───────
function schedPersist(): void {
  const now = Date.now();
  if (now - pLast >= PERSIST_THROTTLE_MS) {
    persistNow();
  } else if (!pTimer) {
    pTimer = setTimeout(() => { pTimer = null; persistNow(); }, PERSIST_THROTTLE_MS - (now - pLast));
  }
}

function persistNow(): void {
  pLast = Date.now();
  const snapshot = ring.slice();
  const meta: SessionMeta = { sid, start: t0, hb: Date.now(), clean: false, ua: navigator.userAgent, ver: ver(), standalone: isStandalone() };
  if (useLs) {
    lsPut(LS_BUF, snapshot);
    lsPut(LS_META, meta);
  } else {
    idbPut(STORE_BUF, 'ring', snapshot);
    idbPut(STORE_META, 'session', meta);
    // Standalone PWA: dual-write to localStorage as belt-and-suspenders.
    // iOS can hard-kill standalone apps without events; IDB transactions may not commit.
    // localStorage.setItem is synchronous and more likely to survive sudden termination.
    if (isStandalone()) {
      lsPut(LS_BUF, snapshot);
      lsPut(LS_META, meta);
    }
  }
}

function forcePersist(): void {
  if (pTimer) { clearTimeout(pTimer); pTimer = null; }
  persistNow();
}

// ─── Prior Session Recovery ─────────────────────────────
async function getPrior(): Promise<CrashBundle | null> {
  let events: Entry[] | undefined;
  let meta: SessionMeta | undefined;

  if (useLs) {
    events = lsGet<Entry[]>(LS_BUF);
    meta = lsGet<SessionMeta>(LS_META);
  } else {
    // Check both IDB and localStorage — use whichever has more recent/complete data.
    // Standalone PWA dual-writes to both; IDB transactions may not commit on hard-kill
    // but localStorage.setItem (synchronous) may have survived.
    const idbEvents = await idbGet<Entry[]>(STORE_BUF, 'ring');
    const idbMeta = await idbGet<SessionMeta>(STORE_META, 'session');
    const lsEvents = lsGet<Entry[]>(LS_BUF);
    const lsMeta = lsGet<SessionMeta>(LS_META);

    // Pick the source with more events (more recent data survived)
    const idbLen = idbEvents?.length || 0;
    const lsLen = lsEvents?.length || 0;
    if (idbLen >= lsLen && idbMeta) {
      events = idbEvents; meta = idbMeta;
    } else if (lsMeta) {
      events = lsEvents; meta = lsMeta;
    } else {
      events = idbEvents; meta = idbMeta;
    }
  }

  if (!meta || !events || events.length === 0) return null;
  return {
    sid: meta.sid, start: meta.start, end: meta.hb,
    clean: meta.clean, crash: !meta.clean,
    ua: meta.ua, ver: meta.ver, url: location.href,
    standalone: meta.standalone || false, events,
  };
}

function clearPrior(): void {
  // Always clear both stores (dual-write means both may have data)
  lsDel(LS_BUF); lsDel(LS_META);
  if (!useLs) { idbDel(STORE_BUF, 'ring'); idbDel(STORE_META, 'session'); }
}

// ─── Network ────────────────────────────────────────────
async function uploadBundle(bundle: CrashBundle): Promise<boolean> {
  try {
    const r = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'crash-bundle', bundle }),
    });
    return r.ok;
  } catch { return false; }
}

async function flushLive(): Promise<void> {
  if (live.length === 0) return;
  const batch = live.splice(0);
  try {
    const r = await fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'live', sid, ver: ver(), events: batch }),
    });
    if (!r.ok) live.unshift(...batch.slice(-MAX_EVENTS));
  } catch {
    live.unshift(...batch.slice(-MAX_EVENTS));
  }
}

function beacon(data: unknown): void {
  const json = JSON.stringify(data);
  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(bep, new Blob([json], { type: 'application/json' }));
      if (sent) return;
    }
  } catch { /* sendBeacon unavailable or failed */ }
  // Fallback: fetch with keepalive
  try {
    fetch(ep, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: json, keepalive: true,
    }).catch(() => {});
  } catch { /* last resort failed */ }
}

// ─── QA Bridge Report ────────────────────────────────────
async function qaBridgeReport(opts: {
  reason: 'crash' | 'manual';
  bundle?: CrashBundle;
  lastEvents?: Entry[];
}): Promise<boolean> {
  if (!QA_BRIDGE) return false;
  const payload: Record<string, unknown> = {
    kind: 'qa_report',
    reason: opts.reason,
    ts: new Date().toISOString(),
    url: location.href,
    ua: navigator.userAgent,
    sid, ver: ver(), standalone: isStandalone(),
  };
  if (opts.reason === 'crash' && opts.bundle) {
    // Truncate events to keep payload size reasonable
    payload.bundle = {
      ...opts.bundle,
      events: opts.bundle.events.slice(-QA_CRASH_MAX_EVENTS),
    };
  }
  if (opts.reason === 'manual' && opts.lastEvents) {
    payload.lastEvents = opts.lastEvents.slice(-QA_MANUAL_MAX_EVENTS);
  }
  payload.state = runtimeState();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), QA_REPORT_TIMEOUT_MS);
    const r = await fetch(`${QA_BRIDGE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

// ─── Shutdown ───────────────────────────────────────────
function onShutdown(reason: string): void {
  if (shutdownFired) return;
  shutdownFired = true;

  push({ type: 'session-end', ts: Date.now(), message: reason });

  // Mark clean exit in persistence
  const snapshot = ring.slice();
  const meta: SessionMeta = { sid, start: t0, hb: Date.now(), clean: true, ua: navigator.userAgent, ver: ver(), standalone: isStandalone() };
  if (useLs) {
    lsPut(LS_BUF, snapshot);
    lsPut(LS_META, meta);
  } else {
    idbPut(STORE_BUF, 'ring', snapshot);
    idbPut(STORE_META, 'session', meta);
    // Standalone: dual-write to LS (sync) as hard-kill safety net
    if (isStandalone()) { lsPut(LS_BUF, snapshot); lsPut(LS_META, meta); }
  }

  // sendBeacon as network backup (last 50 events — size limit ~64KB)
  beacon({ type: 'shutdown', sid, reason, ver: ver(), events: ring.slice(-50), meta });
}

// ─── Event Capture ──────────────────────────────────────
function patchConsole(): void {
  const origLog = console.log;
  console.log = function (...args: unknown[]) {
    push({ type: 'log', ts: Date.now(), args: args.map(safe) });
    origLog.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args: unknown[]) {
    push({ type: 'warn', ts: Date.now(), args: args.map(safe) });
    origWarn.apply(console, args);
  };

  const origErr = console.error;
  console.error = function (...args: unknown[]) {
    push({ type: 'error', ts: Date.now(), args: args.map(safe) });
    origErr.apply(console, args);
    forcePersist();
    flushLive();
  };
}

function captureWindowErrors(): void {
  // Capture phase (true) catches resource load errors on <img>, <script>, <link>
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window && (e.target as HTMLElement).tagName) {
      const el = e.target as HTMLElement;
      push({
        type: 'resource-error',
        ts: Date.now(),
        tagName: el.tagName,
        url: (el as HTMLImageElement).src || (el as HTMLLinkElement).href || '',
        message: `Failed to load ${el.tagName}`,
      });
    } else {
      push({
        type: 'window.onerror',
        ts: Date.now(),
        message: e.message,
        stack: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`,
      });
    }
    forcePersist();
    flushLive();
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    push({
      type: 'unhandledrejection',
      ts: Date.now(),
      message: reason?.message || safe(reason),
      stack: reason?.stack || '',
    });
    forcePersist();
    flushLive();
  });
}

function patchFetch(): void {
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/telemetry') || url.includes('/beacon') || (QA_BRIDGE && url.startsWith(QA_BRIDGE))) return origFetch(input, init);
    const t = Date.now();
    try {
      const resp = await origFetch(input, init);
      if (!resp.ok) {
        push({ type: 'fetch-error', ts: Date.now(), url, status: resp.status, duration: Date.now() - t });
      }
      return resp;
    } catch (err) {
      push({ type: 'fetch-error', ts: Date.now(), url, error: safe(err), duration: Date.now() - t });
      throw err;
    }
  };
}

function patchXHR(): void {
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any)._telUrl = typeof url === 'string' ? url : url.href;
    return origOpen.apply(this, [method, url, ...rest] as any);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const url: string = (this as any)._telUrl || '';
    if (url.includes('/telemetry') || url.includes('/beacon')) {
      return origSend.call(this, body);
    }
    const t = Date.now();
    this.addEventListener('loadend', () => {
      if (this.status === 0 || this.status >= 400) {
        push({
          type: 'xhr-error', ts: Date.now(), url, status: this.status,
          duration: Date.now() - t, error: this.status === 0 ? 'network-error' : undefined,
        });
      }
    });
    return origSend.call(this, body);
  };
}

function attachShutdown(): void {
  window.addEventListener('pagehide', () => onShutdown('pagehide'));
  window.addEventListener('beforeunload', () => onShutdown('beforeunload'));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      onShutdown('visibilitychange');
    } else {
      // Page became visible again — reset so next hide is captured
      shutdownFired = false;
      forcePersist(); // re-mark session dirty (clean: false)
    }
  });

  // BF cache restoration (standalone PWA uses this aggressively)
  // When app resumes from BF cache, re-mark session dirty and check for stale prior data
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      push({ type: 'log', ts: Date.now(), message: '[telemetry] pageshow: restored from BF cache' });
      shutdownFired = false;
      forcePersist();
    }
  });

  // Page Lifecycle API (if supported — Chrome/WebView)
  if ('onfreeze' in document) {
    (document as any).addEventListener('freeze', () => onShutdown('freeze'));
    (document as any).addEventListener('resume', () => {
      push({ type: 'log', ts: Date.now(), message: '[telemetry] resume from freeze' });
      shutdownFired = false;
      forcePersist();
    });
  }
}

// ─── Runtime State Snapshot ─────────────────────────────
function runtimeState(): Record<string, unknown> {
  try {
    const game = (window as any).__phaserGame;
    const scene = game?.scene?.scenes?.[1];
    const lc = (window as any).__loaderConfig;
    return {
      url: location.href,
      ts: Date.now(),
      ver: ver(),
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      online: navigator.onLine,
      standalone: isStandalone(),
      gameState: scene?.state,
      countdownPhase: scene?.countdownPhase,
      musicSource: scene?.musicPlayer?.currentSource,
      loader: lc ? { maxParallel: lc.maxParallel, source: lc.source, ios: lc.ios } : undefined,
    };
  } catch { return { error: 'failed to collect state' }; }
}

// ─── Debug UI ───────────────────────────────────────────
const QA_PAYLOAD_MAX_BYTES = 400_000; // ~400KB cap on serialized payload

function createDebugUI(): void {
  const ctr = document.createElement('div');
  ctr.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:999999;display:flex;flex-direction:column;gap:6px;align-items:flex-end;';

  let sending = false; // double-send guard

  // ── Send Debug Bundle ──
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Loading...';
  sendBtn.style.cssText = btnStyle('#555', '#999', 14); // greyed out initially
  sendBtn.disabled = true;

  // Poll for boot completion (check every 500ms)
  const bootPoll = setInterval(() => {
    if ((window as any).__bootComplete) {
      clearInterval(bootPoll);
      sendBtn.textContent = 'Send Debug Bundle';
      sendBtn.style.cssText = btnStyle('#c00', '#fff', 14);
      sendBtn.disabled = false;
    }
  }, 500);

  sendBtn.addEventListener('pointerdown', async (e) => {
    e.stopPropagation();
    // Guard: boot not complete
    if (!(window as any).__bootComplete) {
      sendBtn.textContent = 'Wait for boot...';
      setTimeout(() => { sendBtn.textContent = 'Loading...'; }, 1500);
      return;
    }
    // Guard: already sending
    if (sending) return;
    sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    sendBtn.style.cssText = btnStyle('#555', '#999', 14);

    const priorBundle = await getPrior();
    const currentBundle: CrashBundle = {
      sid, start: t0, end: Date.now(), clean: false, crash: false,
      ua: navigator.userAgent, ver: ver(), url: location.href, standalone: isStandalone(), events: ring.slice(),
    };

    // Build payload with size cap
    let payload: Record<string, unknown> = {
      type: 'debug-bundle', current: currentBundle, prior: priorBundle, state: runtimeState(),
    };
    let json = JSON.stringify(payload);

    // If over size cap, truncate events progressively
    if (json.length > QA_PAYLOAD_MAX_BYTES) {
      const half = Math.floor(currentBundle.events.length / 2);
      currentBundle.events = currentBundle.events.slice(-half);
      if (priorBundle) priorBundle.events = priorBundle.events.slice(-half);
      payload = { type: 'debug-bundle', current: currentBundle, prior: priorBundle, state: runtimeState(), truncated: true };
      json = JSON.stringify(payload);
    }
    // Still over? Aggressive truncation
    if (json.length > QA_PAYLOAD_MAX_BYTES) {
      currentBundle.events = currentBundle.events.slice(-50);
      if (priorBundle) priorBundle.events = priorBundle.events.slice(-50);
      payload = { type: 'debug-bundle', current: currentBundle, prior: priorBundle, state: runtimeState(), truncated: true };
      json = JSON.stringify(payload);
    }

    let uploadOk = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), QA_REPORT_TIMEOUT_MS);
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      uploadOk = r.ok;
    } catch { uploadOk = false; }

    if (uploadOk) {
      // QA Bridge: manual report with ring buffer tail
      const qaOk = await qaBridgeReport({ reason: 'manual', lastEvents: ring.slice(-QA_MANUAL_MAX_EVENTS) });
      sendBtn.textContent = qaOk ? 'Sent! (QA too)' : 'Sent!';
      if (priorBundle) clearPrior();
    } else {
      // Upload failed — offer download fallback
      sendBtn.textContent = 'Upload failed';
      offerDownload(json);
    }

    setTimeout(() => {
      sendBtn.textContent = 'Send Debug Bundle';
      sendBtn.style.cssText = btnStyle('#c00', '#fff', 14);
      sendBtn.disabled = false;
      sending = false;
    }, 2000);
  });

  // ── Simulate Crash ──
  const crashBtn = document.createElement('button');
  crashBtn.textContent = 'Simulate Crash';
  crashBtn.style.cssText = btnStyle('#660', '#ff0', 12);
  crashBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    // Throw uncaught error, then force reload after IDB has time to persist
    setTimeout(() => {
      throw new Error('[TELEMETRY TEST] Simulated uncaught crash');
    }, 0);
    setTimeout(() => { location.reload(); }, 300);
  });

  // ── Stress Test ──
  const stressBtn = document.createElement('button');
  stressBtn.textContent = 'Stress Test';
  stressBtn.style.cssText = btnStyle('#006', '#0ff', 12);
  stressBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    stressBtn.textContent = 'Blocking 1s...';
    // Block main thread for 1s, then throw
    const s = Date.now();
    while (Date.now() - s < 1000) { /* busy loop */ }
    // After blocking: persist whatever we have, then crash
    forcePersist();
    setTimeout(() => {
      throw new Error('[TELEMETRY TEST] Stress test crash after 1s block');
    }, 0);
    setTimeout(() => { location.reload(); }, 300);
  });

  ctr.appendChild(sendBtn);
  ctr.appendChild(crashBtn);
  ctr.appendChild(stressBtn);
  document.body.appendChild(ctr);
}

/** Download debug bundle as a local file when upload fails */
function offerDownload(json: string): void {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-bundle-${Date.now()}.json`;
    a.style.cssText = 'position:fixed;bottom:80px;right:10px;z-index:999999;padding:8px 14px;background:#060;color:#0f0;border:none;border-radius:6px;font-size:13px;font-family:monospace;text-decoration:none;';
    a.textContent = 'Download Bundle';
    document.body.appendChild(a);
    // Auto-remove after 10s
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {} }, 10_000);
  } catch { /* download fallback failed — nothing more we can do */ }
}

function btnStyle(bg: string, fg: string, size: number): string {
  return `padding:8px 14px;background:${bg};color:${fg};border:none;border-radius:6px;font-size:${size}px;font-family:monospace;opacity:0.85;touch-action:manipulation;-webkit-touch-callout:none;`;
}

// ─── Main Init ──────────────────────────────────────────
export async function initTelemetry(): Promise<void> {
  if (!location.search.includes('debug=1')) return;

  // Save originals FIRST (before any patching)
  _log = console.log.bind(console);
  _warn = console.warn.bind(console);
  _err = console.error.bind(console);

  sid = uid();
  t0 = Date.now();

  // Same-origin endpoints (served by Vite middleware — no cert/CORS issues)
  ep = `${location.origin}/telemetry`;
  bep = `${location.origin}/beacon`;

  // Patch everything SYNCHRONOUSLY before any await
  patchConsole();
  captureWindowErrors();
  patchFetch();
  patchXHR();
  attachShutdown();

  // ── Async: open IDB, recover prior session ──
  try {
    db = await idbOpen();
  } catch {
    useLs = true;
  }

  // Check for prior session crash bundle
  try {
    const prior = await getPrior();
    if (prior) {
      _log('[telemetry] Prior session found:', prior.crash ? 'CRASH SUSPECTED' : 'clean exit',
        `(${prior.events.length} events, sid=${prior.sid})`);

      if (prior.crash || prior.events.some(e => e.type === 'error' || e.type === 'window.onerror' || e.type === 'unhandledrejection')) {
        const ok = await uploadBundle(prior);
        if (ok) {
          _log('[telemetry] Prior crash bundle uploaded — clearing');
          // QA Bridge: auto-report recovered crash (fires exactly once per crash)
          const qaOk = await qaBridgeReport({ reason: 'crash', bundle: prior });
          _log(`[telemetry] QA Bridge crash report: ${qaOk ? 'sent' : 'skipped/failed'}`);
          clearPrior();
        } else {
          _log('[telemetry] Upload failed — bundle kept for next boot');
        }
      } else {
        // Clean exit with no errors — just clear
        clearPrior();
      }
    }
  } catch (err) {
    _err('[telemetry] Prior session recovery failed:', err);
  }

  // Start new session
  const standalone = isStandalone();
  push({ type: 'session-start', ts: Date.now(), message: `sid=${sid} ver=${ver()} standalone=${standalone} ua=${navigator.userAgent}` });

  // Heartbeat (updates IDB periodically so we know session was alive)
  setInterval(() => {
    push({ type: 'heartbeat', ts: Date.now() });
  }, HEARTBEAT_MS);

  // Live network flush (secondary — for real-time monitoring)
  setInterval(flushLive, LIVE_FLUSH_MS);

  // Debug UI
  if (document.body) {
    createDebugUI();
  } else {
    document.addEventListener('DOMContentLoaded', createDebugUI);
  }

  _log(`[telemetry] active → ${ep}`);
  _log(`[telemetry] sid=${sid} persistence=${useLs ? 'localStorage' : 'IndexedDB'} standalone=${standalone}`);
}
