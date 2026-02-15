/**
 * Mobile debug overlay — activated by ?mobileDebug=1 URL param.
 * Shows FPS, quality tier, device flags, platform info, and crash log
 * since there's no dev console on mobile devices.
 *
 * Call `createMobileDebugOverlay()` once after the game canvas exists.
 * Call `updateMobileDebugOverlay(fps, quality)` each frame.
 */

import { GAME_MODE, QualityTier } from '../config/gameMode';
import { detectMobileLike, isiOS, isAndroid, isWebView, isTouchDevice } from '../platform/platform';

const ENABLED = new URLSearchParams(window.location.search).has('mobileDebug');

let el: HTMLDivElement | null = null;
let fpsVal = 60;
let qualityVal = GAME_MODE.quality;
let frameCount = 0;

/** Create the overlay DOM element. No-op if ?mobileDebug is absent. */
export function createMobileDebugOverlay(): void {
  if (!ENABLED) return;

  el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    top: '4px',
    left: '4px',
    zIndex: '99998',
    background: 'rgba(0,0,0,0.75)',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.4',
    padding: '6px 8px',
    borderRadius: '4px',
    pointerEvents: 'none',
    maxWidth: '320px',
    whiteSpace: 'pre',
    overflow: 'hidden',
  });
  document.body.appendChild(el);

  // Show static platform info + crash log immediately
  refreshContent();
}

/** Update dynamic values. Call each frame. No-op if overlay is disabled. */
export function updateMobileDebugOverlay(fps: number, quality: QualityTier): void {
  if (!el) return;
  fpsVal = fps;
  qualityVal = quality;
  frameCount++;
  // Refresh DOM only every 30 frames (~0.5s) to avoid layout thrash
  if (frameCount % 30 === 0) refreshContent();
}

function refreshContent(): void {
  if (!el) return;
  const lines = [
    `FPS: ${fpsVal.toFixed(1)}  Q: ${qualityVal}`,
    `mobile: ${detectMobileLike()}  touch: ${isTouchDevice()}`,
    `iOS: ${isiOS()}  android: ${isAndroid()}`,
    `webview: ${isWebView()}`,
    `screen: ${screen.width}x${screen.height}  dpr: ${devicePixelRatio.toFixed(1)}`,
    `canvas: ${window.innerWidth}x${window.innerHeight}`,
  ];

  // Append crash log if it exists (persisted from previous load)
  const crashLog = (window as any).__crashLog?.dump?.() as { t: number; s: string }[] | undefined;
  if (crashLog && crashLog.length > 0) {
    lines.push('--- crash log ---');
    // Show last 8 entries to keep overlay compact
    const recent = crashLog.slice(-8);
    for (const entry of recent) {
      const ago = ((Date.now() - entry.t) / 1000).toFixed(1);
      lines.push(`${ago}s ago: ${entry.s}`);
    }
  }

  el.textContent = lines.join('\n');
}

/** Remove the overlay from DOM. */
export function destroyMobileDebugOverlay(): void {
  if (el) {
    el.remove();
    el = null;
  }
}
