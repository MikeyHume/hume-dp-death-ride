/** Device detection utilities for mobile mode. */

/** Returns true if the device is likely a phone or tablet with touch input. */
export function detectMobileLike(): boolean {
  // Primary: coarse pointer means finger/stylus as the main input — most reliable
  if (window.matchMedia?.('(pointer: coarse)')?.matches) return true;
  // Small screen + touch support (catches tablets in landscape, etc.)
  // maxTouchPoints alone false-positives on many Windows desktops
  if (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 768) return true;
  return false;
}

/** Returns true if the device is running iOS (iPhone, iPad, iPod).
 *  Handles iPad masquerading as Mac in Safari 13+. */
export function isiOS(): boolean {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPad on iOS 13+ reports as Mac but has touch
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}
