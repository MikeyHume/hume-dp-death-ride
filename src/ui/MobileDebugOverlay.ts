/**
 * Mobile debug overlay — activated by ?mobileDebug=1 URL param.
 * Shows FPS, quality tier, device flags, and platform info on-screen
 * since there's no dev console on mobile devices.
 *
 * Call `MobileDebugOverlay.create()` once after the game canvas exists.
 * Call `MobileDebugOverlay.update(fps, quality)` each frame.
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
    maxWidth: '280px',
    whiteSpace: 'pre',
  });
  document.body.appendChild(el);

  // Show static platform info immediately
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
  el.textContent = lines.join('\n');
}

/** Remove the overlay from DOM. */
export function destroyMobileDebugOverlay(): void {
  if (el) {
    el.remove();
    el = null;
  }
}
