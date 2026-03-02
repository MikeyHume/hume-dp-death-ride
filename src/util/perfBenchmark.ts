/**
 * perfBenchmark.ts — Lightweight frame-time recorder with event tagging.
 *
 * Activated by ?perf=1 URL parameter.
 * Auto-runs a scripted gameplay sequence (idle → slash → rocket → accelerate → idle)
 * and captures per-frame timing data for before/after performance comparisons.
 *
 * Results exposed on window.__dpMotoPerf after the benchmark completes.
 */

interface PerfFrame {
  t: number;     // ms since benchmark start
  dt: number;    // frame delta in ms
  fps: number;   // instantaneous FPS (1000/dt)
  tag: string;   // event tag: 'idle' | 'slash' | 'rocket' | 'accelerate'
}

interface EventSummary {
  fpsAvg: number;
  fpsMin: number;
  fpsMax: number;
  frameCount: number;
}

interface PerfResult {
  version: string;
  device: string;
  tier: string;
  renderScale: number;
  spriteTier: string;
  timestamp: string;
  frames: PerfFrame[];
  summary: {
    totalFrames: number;
    durationMs: number;
    fpsMin: number;
    fpsMax: number;
    fpsAvg: number;
    fpsP1: number;
    fpsP5: number;
    fpsP95: number;
    fpsP99: number;
    frameBudgetMiss16: number;  // % frames > 16.67ms
    frameBudgetMiss20: number;  // % frames > 20ms
    frameBudgetMiss33: number;  // % frames > 33.33ms
    events: Record<string, EventSummary>;
  };
}

// Benchmark phases — each step is a tagged time window
interface BenchPhase {
  tag: string;
  durationMs: number;
  action?: string;  // test command to inject at phase start
}

const BENCH_PHASES: BenchPhase[] = [
  { tag: 'idle',       durationMs: 3000 },                      // 3s warmup
  { tag: 'slash',      durationMs: 1500, action: 'attack' },    // slash + 1.5s capture
  { tag: 'idle',       durationMs: 1000 },                      // 1s between
  { tag: 'rocket',     durationMs: 1500, action: 'rocket' },    // rocket + 1.5s capture
  { tag: 'idle',       durationMs: 1000 },                      // 1s between
  { tag: 'accelerate', durationMs: 2000, action: 'speed-tap' }, // speed boost + 2s capture
  { tag: 'idle',       durationMs: 3000 },                      // 3s cooldown
];

export class PerfBenchmark {
  private active = false;
  private recording = false;
  private frames: PerfFrame[] = [];
  private startTime = 0;
  private phaseIndex = 0;
  private phaseStartTime = 0;
  private currentTag = 'idle';
  private done = false;
  private waitingForPlay = false;
  private skipInjected = false;
  private initTime = 0;

  /** Call once at scene create. Activates if ?perf=1 in URL. */
  init(): boolean {
    if (!new URLSearchParams(location.search).has('perf')) return false;
    this.active = true;
    this.waitingForPlay = true;
    this.initTime = performance.now();
    console.log('[perf] Benchmark armed — will auto-advance to PLAYING');
    return true;
  }

  isActive(): boolean { return this.active; }
  isDone(): boolean { return this.done; }

  /** Called every frame from GameScene.update(). */
  recordFrame(deltaMs: number, isPlaying: boolean): void {
    if (!this.active || this.done) return;

    // Auto-advance: inject skip-to-play after 1.5s if not yet playing
    if (this.waitingForPlay) {
      if (!isPlaying) {
        if (!this.skipInjected && performance.now() - this.initTime > 1500) {
          const t = (window as any).__dpMotoTest;
          if (t?.pushCommand) {
            t.pushCommand(JSON.stringify({ type: 'skip-to-play' }));
            console.log('[perf] Auto-injected skip-to-play');
          }
          this.skipInjected = true;
        }
        return;
      }
      this.waitingForPlay = false;
      this.recording = true;
      this.startTime = performance.now();
      this.phaseIndex = 0;
      this.phaseStartTime = this.startTime;
      this.currentTag = BENCH_PHASES[0].tag;
      console.log('[perf] Recording started');

      // Enable spectator mode for infinite ammo/invincibility
      const t = (window as any).__dpMotoTest;
      if (t?.pushCommand) t.pushCommand(JSON.stringify({ type: 'spectator-on' }));
    }

    if (!this.recording) return;

    const now = performance.now();
    const elapsed = now - this.startTime;

    // Record this frame
    const fps = deltaMs > 0 ? 1000 / deltaMs : 0;
    this.frames.push({
      t: Math.round(elapsed),
      dt: Math.round(deltaMs * 100) / 100,
      fps: Math.round(fps * 10) / 10,
      tag: this.currentTag,
    });

    // Check phase transitions
    const phaseElapsed = now - this.phaseStartTime;
    const phase = BENCH_PHASES[this.phaseIndex];
    if (phase && phaseElapsed >= phase.durationMs) {
      this.phaseIndex++;
      if (this.phaseIndex >= BENCH_PHASES.length) {
        this.finishBenchmark();
        return;
      }
      const nextPhase = BENCH_PHASES[this.phaseIndex];
      this.phaseStartTime = now;
      this.currentTag = nextPhase.tag;

      // Inject action command if this phase has one
      if (nextPhase.action) {
        this.injectAction(nextPhase.action);
      }
    }
  }

  private injectAction(action: string): void {
    const t = (window as any).__dpMotoTest;
    if (t?.pushCommand) {
      t.pushCommand(JSON.stringify({ type: action }));
      console.log(`[perf] Injected action: ${action}`);
    } else {
      // Fallback: inject via InputSystem directly if test mode isn't active
      console.log(`[perf] Test mode not available — action ${action} skipped`);
    }
  }

  private finishBenchmark(): void {
    this.recording = false;
    this.done = true;

    const result = this.computeResult();
    (window as any).__dpMotoPerf = result;

    console.log('[perf] Benchmark complete!');
    console.log(`[perf] ${result.summary.totalFrames} frames over ${(result.summary.durationMs / 1000).toFixed(1)}s`);
    console.log(`[perf] FPS: min=${result.summary.fpsMin} avg=${result.summary.fpsAvg} max=${result.summary.fpsMax}`);
    console.log(`[perf] P1=${result.summary.fpsP1} P5=${result.summary.fpsP5} P95=${result.summary.fpsP95} P99=${result.summary.fpsP99}`);
    console.log(`[perf] Budget miss: >16.7ms=${result.summary.frameBudgetMiss16}% >20ms=${result.summary.frameBudgetMiss20}% >33ms=${result.summary.frameBudgetMiss33}%`);
    for (const [tag, ev] of Object.entries(result.summary.events)) {
      console.log(`[perf]   ${tag}: avg=${ev.fpsAvg} min=${ev.fpsMin} max=${ev.fpsMax} (${ev.frameCount} frames)`);
    }
    console.log('[perf] Full results on window.__dpMotoPerf');

    // Auto-POST results back to dev server for collection
    this.postResults(result);
  }

  private async postResults(result: PerfResult): Promise<void> {
    try {
      const res = await fetch('/perf-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (res.ok) {
        console.log('[perf] Results posted to server successfully');
      }
    } catch {
      console.log('[perf] Could not POST results to server (offline?)');
    }
  }

  private computeResult(): PerfResult {
    const fpsValues = this.frames.map(f => f.fps).sort((a, b) => a - b);
    const n = fpsValues.length;
    const durationMs = n > 0 ? this.frames[n - 1].t - this.frames[0].t : 0;

    // Percentile helper
    const pct = (p: number): number => {
      if (n === 0) return 0;
      const idx = Math.floor(p / 100 * (n - 1));
      return Math.round(fpsValues[idx] * 10) / 10;
    };

    // Frame budget misses
    const miss16 = this.frames.filter(f => f.dt > 16.67).length;
    const miss20 = this.frames.filter(f => f.dt > 20).length;
    const miss33 = this.frames.filter(f => f.dt > 33.33).length;

    // Per-event summaries
    const events: Record<string, EventSummary> = {};
    const tagGroups = new Map<string, number[]>();
    for (const f of this.frames) {
      if (!tagGroups.has(f.tag)) tagGroups.set(f.tag, []);
      tagGroups.get(f.tag)!.push(f.fps);
    }
    for (const [tag, fps] of tagGroups) {
      const sorted = [...fps].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      events[tag] = {
        fpsAvg: Math.round(sum / sorted.length * 10) / 10,
        fpsMin: Math.round(sorted[0] * 10) / 10,
        fpsMax: Math.round(sorted[sorted.length - 1] * 10) / 10,
        frameCount: sorted.length,
      };
    }

    // Device info from globals
    const dp = (window as any).__deviceProfile || {};
    const verEl = document.querySelector('#boot-overlay .bios-version');
    const version = verEl?.textContent?.trim() || (window as any).__dpMotoVersion || 'unknown';

    return {
      version,
      device: dp.name || 'unknown',
      tier: dp.tier || 'unknown',
      renderScale: dp.renderScale || 0,
      spriteTier: dp.spriteTier || 'unknown',
      timestamp: new Date().toISOString(),
      frames: this.frames,
      summary: {
        totalFrames: n,
        durationMs: Math.round(durationMs),
        fpsMin: Math.round(fpsValues[0] * 10) / 10,
        fpsMax: Math.round(fpsValues[n - 1] * 10) / 10,
        fpsAvg: Math.round(fpsValues.reduce((a, b) => a + b, 0) / n * 10) / 10,
        fpsP1: pct(1),
        fpsP5: pct(5),
        fpsP95: pct(95),
        fpsP99: pct(99),
        frameBudgetMiss16: Math.round(miss16 / n * 1000) / 10,
        frameBudgetMiss20: Math.round(miss20 / n * 1000) / 10,
        frameBudgetMiss33: Math.round(miss33 / n * 1000) / 10,
        events,
      },
    };
  }
}
