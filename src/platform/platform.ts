/**
 * Platform detection for iOS WebView and mobile environments.
 * Re-exports from device.ts and adds WebView-specific helpers.
 */

export { detectMobileLike, isiOS } from '../util/device';

/** Returns true if the device is running Android. */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Returns true if touch is available (does NOT mean mobile — some laptops have touch). */
export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

/**
 * Returns true if we're likely running inside a native WebView wrapper
 * (WKWebView on iOS, WebView on Android) rather than a regular browser tab.
 */
export function isWebView(): boolean {
  const ua = navigator.userAgent;
  // iOS: WKWebView doesn't include "Safari" in UA but does include "AppleWebKit"
  if (/AppleWebKit/.test(ua) && !/Safari/.test(ua)) return true;
  // Android WebView: contains "wv" or "Version/X.X" without "Chrome"
  if (/Android/.test(ua) && /wv/.test(ua)) return true;
  // Custom scheme or injected interface from native wrapper
  if ((window as any).webkit?.messageHandlers) return true;
  return false;
}

/** Returns true if the browser is Safari (including iOS Safari and WKWebView). */
export function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome/.test(ua);
}

/** Convenience: true when running in an iOS WebView specifically. */
export function isiOSWebView(): boolean {
  return isiOS() && isWebView();
}

// Re-import for local use in isiOSWebView
import { isiOS } from '../util/device';
