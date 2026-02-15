/**
 * iOS / Safari audio unlock.
 *
 * WebKit requires a user gesture (touchstart/click) before AudioContext
 * can leave the "suspended" state and before <audio>/<video> elements can play.
 * Phaser 3 has its own unlock mechanism, but it occasionally misses the
 * WKWebView case. This module provides a belt-and-suspenders approach:
 *
 *   1. On the very first touchstart/click, resume every AudioContext we know about.
 *   2. Play + immediately pause a silent Phaser sound to ungate the Web Audio graph.
 *   3. Remove the listeners once unlock succeeds (one-shot).
 *
 * Call `setupAudioUnlock(game)` once after `new Phaser.Game(...)`.
 */

import Phaser from 'phaser';

let unlocked = false;

/**
 * Wire up the one-shot audio unlock listeners on the game canvas.
 * Safe to call on all platforms — it's a no-op if audio is already running.
 */
export function setupAudioUnlock(game: Phaser.Game): void {
  if (unlocked) return;

  const canvas = game.canvas;
  const handler = () => tryUnlock(game);

  canvas.addEventListener('touchstart', handler, { once: true, passive: true });
  canvas.addEventListener('touchend', handler, { once: true, passive: true });
  canvas.addEventListener('click', handler, { once: true });

  // Also listen on document for cases where the overlay intercepts first touch
  document.addEventListener('touchstart', handler, { once: true, passive: true });
  document.addEventListener('click', handler, { once: true });
}

function tryUnlock(game: Phaser.Game): void {
  if (unlocked) return;
  unlocked = true;

  // 1. Resume Phaser's internal Web Audio context if it exists and is suspended
  const ctx = (game.sound as any).context as AudioContext | undefined;
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  // 2. Resume any standalone AudioContext instances (our AudioSystem creates one)
  //    The AudioSystem.start() call is gated behind a user gesture anyway,
  //    but if it was created before the gesture completed, resume it.
  if (typeof (window as any).__gameAudioCtx !== 'undefined') {
    const extCtx = (window as any).__gameAudioCtx as AudioContext;
    if (extCtx.state === 'suspended') {
      extCtx.resume().catch(() => {});
    }
  }

  // 3. Play a silent buffer through Phaser to fully unlock its decoder
  try {
    if (ctx && ctx.state === 'running') {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    // Not critical — Phaser should handle this on its own
  }
}

/** Returns true once audio has been unlocked by a user gesture. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}
