/**
 * Test mode — activated by ?test=1 URL parameter.
 * Designed for autonomous play testing (robot pilot):
 *   - Exposes game state on window.__dpMotoTest
 *   - Syncs state to Vite dev server via POST /test-state (seq/ack)
 *   - Receives commands piggybacked on the response
 *   - Self-recovery watchdog reloads on hard freeze
 */

// ── Crash attribution action ─────────────────────────────────
export interface TestAction {
  type: string;
  ts: number;
  details?: string;
}

// ── State snapshot that gets synced every frame ──────────────
export interface TestState {
  /** Current GameState enum value (numeric) */
  state: number;
  /** Human-readable state name */
  stateName: string;
  /** Current tutorial phase index (or -1) */
  tutorialPhase: number;
  /** Countdown phase (or -1) */
  countdownPhase: number;
  /** Elapsed game time in seconds */
  elapsed: number;
  /** Current score */
  score: number;
  /** Is player alive */
  alive: boolean;
  /** BIOS overlay visible */
  biosVisible: boolean;
  /** Music source ('youtube' | 'spotify' | 'hume' | 'none') */
  musicSource: string;
  /** Frame count since scene create (increments every update()) */
  frameCount: number;
  /** Last error message (if any) */
  lastError: string | null;
  /** Timestamp of last state change */
  lastStateChangeTs: number;
  /** Player Y position */
  playerY: number;
  /** Road speed */
  roadSpeed: number;
  /** Difficulty 0-1 */
  difficulty: number;
  /** Error history (last 10 errors) */
  errorHistory: string[];
  /** Whether page is about to unload (crash indicator) */
  unloading: boolean;
  /** Active obstacle count on screen */
  obstacleCount: number;
  /** Unique run ID per page load (for crash correlation) */
  runId: string;
  /** Date.now() timestamp of last syncTestState() call */
  lastUpdateMs: number;
  /** Monotonic counter — increments on every GameState change */
  stateVersion: number;
  /** Current RNG seed used for obstacle spawning */
  seed: number;
  /** Last test command that was executed (crash attribution) */
  lastAction: TestAction | null;
  /** Crash suspect: lastAction from PREVIOUS page load (survives reload) */
  lastCrashSuspectAction: TestAction | null;
  /** Reload reason from previous page load ('watchdog_stall' | 'js_error' | 'unhandled_rejection' | 'browser_unload' | 'unknown') */
  lastReloadReason: string | null;
  /** Timestamp of last reload (from previous page load) */
  lastReloadTs: number | null;

  // ── Phase 3B: Sensors ─────────────────────────────────────
  /** Player state snapshot */
  player: {
    x: number;
    y: number;
    speed: number;
    alive: boolean;
    shieldCount: number;
    rockets: number;
  };
  /** Cumulative gameplay metrics (reset per run) */
  metrics: {
    collisions: number;
    pickups: number;
    rocketsFired: number;
    obstaclesDestroyed: number;
  };
  /** Nearest threat relative to player (null if none nearby) */
  threat: { dx: number; dy: number; type: string } | null;

  // ── Phase 3A: UI Snapshot ─────────────────────────────────
  /** Which UI layers are currently visible */
  ui: {
    biosVisible: boolean;
    titleVisible: boolean;
    tutorialVisible: boolean;
    hudVisible: boolean;
    wmpOpen: boolean;
    profileOpen: boolean;
    deathScreenVisible: boolean;
    countdownVisible: boolean;
    trackTitle: string | null;
    sceneName: string;
  };
}

// ── Config flags ─────────────────────────────────────────────
export const TEST_MODE = {
  active: false,
  /** Skip all music loading (YouTube iframe, Spotify SDK, hume audio) */
  skipMusic: true,
  /** Reduce countdown to 1 second */
  fastCountdown: true,
  /** Skip tutorial entirely (TITLE → STARTING) */
  skipTutorial: true,
  /** Auto-dismiss BIOS after 500ms (no user input needed) */
  autoDismissBios: true,
  /** Disable Spotify auth redirect handling */
  skipSpotifyAuth: true,
};

// ── Initialization ───────────────────────────────────────────
export function initTestMode(): void {
  if (!location.search.includes('test=1')) return;
  TEST_MODE.active = true;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ── Restore crash suspect from previous page load ─────────
  let crashSuspect: TestAction | null = null;
  let reloadReason: string | null = null;
  let reloadTs: number | null = null;
  try {
    const prevType = sessionStorage.getItem('dp_test_lastActionType');
    const prevTs = sessionStorage.getItem('dp_test_lastActionTs');
    const prevDetails = sessionStorage.getItem('dp_test_lastActionDetails');
    if (prevType) {
      crashSuspect = { type: prevType, ts: parseInt(prevTs || '0', 10), details: prevDetails || undefined };
    }
    reloadReason = sessionStorage.getItem('dp_test_reloadReason');
    const rts = sessionStorage.getItem('dp_test_reloadTs');
    reloadTs = rts ? parseInt(rts, 10) : null;
    // Clear after reading — only relevant for the first load after crash
    sessionStorage.removeItem('dp_test_reloadReason');
    sessionStorage.removeItem('dp_test_reloadTs');
  } catch {} // sessionStorage may be unavailable

  const state: TestState = {
    state: -1,
    stateName: 'INIT',
    tutorialPhase: -1,
    countdownPhase: -1,
    elapsed: 0,
    score: 0,
    alive: false,
    biosVisible: true,
    musicSource: 'none',
    frameCount: 0,
    lastError: null,
    lastStateChangeTs: Date.now(),
    playerY: 0,
    roadSpeed: 0,
    difficulty: 0,
    errorHistory: [],
    unloading: false,
    obstacleCount: 0,
    runId,
    lastUpdateMs: Date.now(),
    stateVersion: 0,
    seed: 0,
    lastAction: null,
    lastCrashSuspectAction: crashSuspect,
    lastReloadReason: reloadReason,
    lastReloadTs: reloadTs,
    player: { x: 0, y: 0, speed: 0, alive: false, shieldCount: 0, rockets: 0 },
    metrics: { collisions: 0, pickups: 0, rocketsFired: 0, obstaclesDestroyed: 0 },
    threat: null,
    ui: {
      biosVisible: true, titleVisible: false, tutorialVisible: false,
      hudVisible: false, wmpOpen: false, profileOpen: false,
      deathScreenVisible: false, countdownVisible: false,
      trackTitle: null, sceneName: 'Boot',
    },
  };

  (window as any).__dpMotoTest = {
    state,
    /** Command queue — server pushes {seq, cmd}, game reads + clears */
    commands: [] as string[],
    /** Push a command string into the queue */
    pushCommand(cmd: string) { this.commands.push(cmd); },
    /** Read and clear all pending commands */
    popCommands(): string[] {
      const cmds = [...this.commands];
      this.commands.length = 0;
      return cmds;
    },
    /** Convenience: check if game has reached a specific state */
    isState(name: string): boolean { return state.stateName === name; },
    /** Test mode config (read-only view) */
    config: { ...TEST_MODE },
    /** Set last action for crash attribution (called by GameScene on command exec) */
    setLastAction(type: string, details?: string) {
      const action: TestAction = { type, ts: Date.now(), details };
      state.lastAction = action;
      try {
        sessionStorage.setItem('dp_test_lastActionType', type);
        sessionStorage.setItem('dp_test_lastActionTs', String(action.ts));
        sessionStorage.setItem('dp_test_lastActionDetails', details || '');
      } catch {}
    },
    /** Clear crash suspect (called when game reaches PLAYING successfully) */
    clearCrashSuspect() {
      state.lastCrashSuspectAction = null;
      state.lastReloadReason = null;
      state.lastReloadTs = null;
    },
    /** Capture canvas screenshot and POST to server (on-demand, called by runner) */
    async captureScreenshot(): Promise<boolean> {
      try {
        const canvas = document.querySelector('canvas');
        if (!canvas) return false;
        const dataUrl = canvas.toDataURL('image/png');
        await fetch('/test-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            runId: state.runId,
            stateName: state.stateName,
            frameCount: state.frameCount,
            ts: Date.now(),
          }),
        });
        return true;
      } catch { return false; }
    },
  };

  // ── Error capture ──────────────────────────────────────────
  const MAX_ERROR_HISTORY = 10;
  function captureError(msg: string) {
    state.lastError = msg;
    state.errorHistory.push(msg);
    if (state.errorHistory.length > MAX_ERROR_HISTORY) {
      state.errorHistory.shift();
    }
  }

  function setReloadReason(reason: string) {
    try {
      sessionStorage.setItem('dp_test_reloadReason', reason);
      sessionStorage.setItem('dp_test_reloadTs', String(Date.now()));
    } catch {}
  }

  window.addEventListener('error', (e) => {
    captureError(`${e.message} @ ${e.filename}:${e.lineno}`);
    setReloadReason('js_error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    captureError(`UnhandledRejection: ${e.reason}`);
    setReloadReason('unhandled_rejection');
  });
  window.addEventListener('beforeunload', () => {
    state.unloading = true;
    // Only set if no more specific reason already stored
    try {
      if (!sessionStorage.getItem('dp_test_reloadReason')) {
        setReloadReason('browser_unload');
      }
    } catch {}
  });

  // ── Serial polling loop (seq/ack) ─────────────────────────
  // Self-scheduling: only one fetch in flight at a time.
  // Sends {state, ackSeq} → receives {commands: [{seq, cmd}, ...]}
  let ackSeq = 0;

  async function pollLoop() {
    const t = (window as any).__dpMotoTest;
    if (t) {
      try {
        const res = await fetch('/test-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: t.state, ackSeq }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.commands?.length) {
            for (const entry of data.commands) {
              // entry is { seq: N, cmd: "..." }
              const seq = entry.seq ?? 0;
              const cmd = entry.cmd ?? entry;
              if (seq > ackSeq) {
                // Handle reload directly (doesn't need GameScene)
                try {
                  const parsed = typeof cmd === 'string' ? JSON.parse(cmd) : cmd;
                  if (parsed.type === 'reload') {
                    console.log('[test-mode] Reload command received — reloading page');
                    setReloadReason('command_reload');
                    location.reload();
                    return;
                  }
                } catch {}
                t.pushCommand(cmd);
                ackSeq = seq;
              }
              // seq <= ackSeq → already processed, skip (dedup)
            }
          }
        }
      } catch {} // silent — dev server may not be running
    }
    setTimeout(pollLoop, 500);
  }
  setTimeout(pollLoop, 500);

  // ── Self-recovery watchdog ────────────────────────────────
  // If frameCount stalls for STALL_SOFT_MS → push return-title command.
  // If still stalled after STALL_HARD_MS → location.reload().
  const STALL_SOFT_MS = 10_000;
  const STALL_HARD_MS = 15_000;
  let watchdogLastFrame = 0;
  let watchdogLastChangeTs = Date.now();
  let watchdogSoftFired = false;

  setInterval(() => {
    const currentFrame = state.frameCount;
    // Don't start watching until GameScene has produced at least 1 frame.
    // During boot (BootScene loading assets), frameCount stays 0 for 5-15s.
    if (currentFrame === 0) {
      watchdogLastChangeTs = Date.now();
      return;
    }
    if (currentFrame !== watchdogLastFrame) {
      // Frames are advancing — reset watchdog
      watchdogLastFrame = currentFrame;
      watchdogLastChangeTs = Date.now();
      watchdogSoftFired = false;
      return;
    }
    // Frames stalled
    const stalledMs = Date.now() - watchdogLastChangeTs;
    if (stalledMs >= STALL_HARD_MS) {
      console.warn(`[test-watchdog] Hard stall ${stalledMs}ms — reloading page`);
      setReloadReason('watchdog_stall');
      location.reload();
    } else if (stalledMs >= STALL_SOFT_MS && !watchdogSoftFired) {
      console.warn(`[test-watchdog] Soft stall ${stalledMs}ms — pushing return-title`);
      const t = (window as any).__dpMotoTest;
      if (t) t.pushCommand(JSON.stringify({ type: 'return-title' }));
      watchdogSoftFired = true;
    }
  }, 2000);

  console.log(`[test-mode] Active — runId=${runId}, state exposed on window.__dpMotoTest`);
}
