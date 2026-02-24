/** Device detection utilities for mobile mode and device-specific optimization. */

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

// ── Device Profiles ─────────────────────────────────────────────

export type DeviceTier = 'desktop' | 'tablet' | 'phone-high' | 'phone-low';

export interface DeviceProfile {
  tier: DeviceTier;
  label: string;              // Human-readable name shown in debug
  crt: boolean;               // Enable CRT post-processing pipeline
  reflections: boolean;       // Enable puddle reflection system
  carCount: number;           // Oncoming traffic count (0 = disabled)
  parallaxLayers: number;     // Number of parallax background layers
  maxParallelLoads: number;   // Loader concurrency
}

/** Default profiles per tier. */
const PROFILES: Record<DeviceTier, DeviceProfile> = {
  'desktop': {
    tier: 'desktop',
    label: 'Desktop',
    crt: true,
    reflections: true,
    carCount: 5,
    parallaxLayers: 8,
    maxParallelLoads: 32,
  },
  'tablet': {
    tier: 'tablet',
    label: 'Tablet (iPad)',
    crt: true,
    reflections: true,
    carCount: 5,
    parallaxLayers: 8,
    maxParallelLoads: 4,
  },
  'phone-high': {
    tier: 'phone-high',
    label: 'Phone High (A14+)',
    crt: true,
    reflections: true,
    carCount: 3,
    parallaxLayers: 8,
    maxParallelLoads: 2,
  },
  'phone-low': {
    tier: 'phone-low',
    label: 'Phone Low (A12/A13)',
    crt: false,       // CRT shader is too heavy for A12 — 15+ texture lookups per fragment
    reflections: false,
    carCount: 0,
    parallaxLayers: 8,
    maxParallelLoads: 2,
  },
};

/** Known iOS device fingerprints based on screen dimensions + DPR.
 *  iOS Safari doesn't expose model names, so we use screen geometry. */
interface DeviceFingerprint {
  w: number;  // screen.width (CSS px, portrait)
  h: number;  // screen.height (CSS px, portrait)
  dpr: number;
  tier: DeviceTier;
  label: string;
}

const KNOWN_DEVICES: DeviceFingerprint[] = [
  // iPads — all tablets get full features
  { w: 810, h: 1080, dpr: 2, tier: 'tablet', label: 'iPad 10th Gen' },
  { w: 820, h: 1180, dpr: 2, tier: 'tablet', label: 'iPad Air 4/5' },
  { w: 834, h: 1194, dpr: 2, tier: 'tablet', label: 'iPad Pro 11"' },
  { w: 1024, h: 1366, dpr: 2, tier: 'tablet', label: 'iPad Pro 12.9"' },
  { w: 768, h: 1024, dpr: 2, tier: 'tablet', label: 'iPad 9th Gen / Mini' },
  // iPhones — grouped by generation capability
  // A15+ (iPhone 13+) — phone-high
  { w: 390, h: 844, dpr: 3, tier: 'phone-high', label: 'iPhone 13/14' },
  { w: 393, h: 852, dpr: 3, tier: 'phone-high', label: 'iPhone 14/15 Pro' },
  { w: 430, h: 932, dpr: 3, tier: 'phone-high', label: 'iPhone 14/15 Pro Max' },
  { w: 402, h: 874, dpr: 3, tier: 'phone-high', label: 'iPhone 16 Pro' },
  { w: 440, h: 956, dpr: 3, tier: 'phone-high', label: 'iPhone 16 Pro Max' },
  // A14 (iPhone 12 series) — phone-high
  { w: 390, h: 844, dpr: 3, tier: 'phone-high', label: 'iPhone 12/12 Pro' },
  { w: 428, h: 926, dpr: 3, tier: 'phone-high', label: 'iPhone 12 Pro Max' },
  { w: 360, h: 780, dpr: 3, tier: 'phone-high', label: 'iPhone 12 Mini' },
  // A12/A13 (iPhone Xs/XR/11 series) — phone-low
  { w: 375, h: 812, dpr: 3, tier: 'phone-low', label: 'iPhone Xs / X / 11 Pro' },
  { w: 414, h: 896, dpr: 3, tier: 'phone-low', label: 'iPhone Xs Max / XR / 11' },
  { w: 414, h: 896, dpr: 2, tier: 'phone-low', label: 'iPhone XR / 11' },
  // Older (iPhone 8 and below) — phone-low
  { w: 375, h: 667, dpr: 2, tier: 'phone-low', label: 'iPhone 8 / SE 2/3' },
  { w: 414, h: 736, dpr: 3, tier: 'phone-low', label: 'iPhone 8 Plus' },
  { w: 320, h: 568, dpr: 2, tier: 'phone-low', label: 'iPhone SE 1st Gen' },
];

/** Detect device and return the appropriate profile.
 *  Priority: ?profile= URL param > fingerprint match > heuristic fallback. */
export function detectDeviceProfile(): DeviceProfile {
  // 1. Manual override via URL param: ?profile=desktop|tablet|phone-high|phone-low
  const params = new URLSearchParams(location.search);
  const override = params.get('profile') as DeviceTier | null;
  if (override && PROFILES[override]) {
    const p = { ...PROFILES[override] };
    p.label = `${p.label} (override)`;
    return p;
  }

  // 2. Try fingerprint match (iOS devices)
  if (isiOS()) {
    const w = Math.min(screen.width, screen.height);  // portrait width
    const h = Math.max(screen.width, screen.height);  // portrait height
    const dpr = window.devicePixelRatio;

    for (const fp of KNOWN_DEVICES) {
      if (fp.w === w && fp.h === h && Math.abs(fp.dpr - dpr) < 0.5) {
        const p = { ...PROFILES[fp.tier] };
        p.label = fp.label;
        return p;
      }
    }

    // 3. iOS but no fingerprint match — guess by screen size
    if (w >= 700) {
      // Tablet-sized
      const p = { ...PROFILES['tablet'] };
      p.label = `Unknown iPad (${w}×${h} @${dpr}x)`;
      return p;
    } else {
      // Phone-sized — default to phone-low (safe)
      const p = { ...PROFILES['phone-low'] };
      p.label = `Unknown iPhone (${w}×${h} @${dpr}x)`;
      return p;
    }
  }

  // 4. Non-iOS mobile
  if (detectMobileLike()) {
    const w = Math.min(screen.width, screen.height);
    if (w >= 700) {
      const p = { ...PROFILES['tablet'] };
      p.label = `Android Tablet (${w}×${screen.height})`;
      return p;
    }
    const p = { ...PROFILES['phone-high'] };
    p.label = `Android Phone (${w}×${screen.height})`;
    return p;
  }

  // 5. Desktop
  return { ...PROFILES['desktop'] };
}
