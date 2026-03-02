/**
 * perfTelemetry — Lightweight FPS telemetry to local Vite dev server.
 * POSTs to /perf-tele every 2s. Read via: curl http://localhost:8081/perf-tele
 */

import { GAME_MODE, DEVICE_PROFILE } from '../config/gameMode';

const INTERVAL_MS = 2000;
const STATE_NAMES = ['TITLE', 'SONG_SELECT', 'TUTORIAL', 'STARTING', 'PLAYING', 'DYING', 'NAME_ENTRY', 'DEAD'];

let intervalId: number | null = null;

export function initPerfTelemetry(): void {
  if (intervalId != null) return;
  console.log('[perfTelemetry] active — sending every 2s to /perf-tele');
  sendSnapshot();
  intervalId = window.setInterval(sendSnapshot, INTERVAL_MS);
}

async function sendSnapshot(): Promise<void> {
  try {
    const game = (window as any).__phaserGame;
    if (!game) return;

    const scene = game.scene?.scenes?.[1];
    const fps = game.loop?.actualFps ?? 0;
    const fpsAvg = scene?.perfSystem?.getFps?.() ?? fps;
    const stateIdx = scene?.state ?? -1;
    const gameState = STATE_NAMES[stateIdx] ?? `UNKNOWN(${stateIdx})`;
    const score = scene?.scoreSystem?.getScore?.() ?? 0;
    const speed = scene?.playerSystem?.getPlayerSpeed?.() ?? 0;

    await fetch('/perf-tele', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts: Date.now(),
        version: (window as any).__dpMotoVersion || '?',
        device: DEVICE_PROFILE.label,
        tier: GAME_MODE.renderTier,
        crt_level: DEVICE_PROFILE.crt ? 'on' : 'off',
        reflection_skip: DEVICE_PROFILE.reflectionSkip,
        reflections_on: DEVICE_PROFILE.reflections,
        parallax_layers: DEVICE_PROFILE.parallaxLayers,
        render_scale: GAME_MODE.renderScale,
        sprite_tier: DEVICE_PROFILE.spriteTier,
        game_state: gameState,
        fps: Math.round(fps * 10) / 10,
        fps_avg: Math.round(fpsAvg * 10) / 10,
        score,
        speed: Math.round(speed * 10) / 10,
      }),
    });
  } catch {
    // Fire-and-forget — don't let telemetry errors affect gameplay
  }
}

export function stopPerfTelemetry(): void {
  if (intervalId != null) { clearInterval(intervalId); intervalId = null; }
}
