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

/** Returns true if the active device profile is a phone tier (not tablet/desktop). */
export function isPhoneTier(tier: string): boolean {
  return tier === 'phone-high' || tier === 'gen-mobile' || tier === 'phone-low';
}

/** Auto-compute musicUIScale for unknown devices based on screen dimensions.
 *  Smaller screens get higher scale so the popup content is readable. */
function autoMusicUIScale(): number {
  const shortest = Math.min(screen.width, screen.height);
  // ~360px (iPhone Mini) → 1.5, ~414px (iPhone Plus) → 1.3, ~430px → 1.26
  return Math.max(1.0, Math.min(2.0, 540 / shortest));
}

// ── Device Profiles ─────────────────────────────────────────────

export type DeviceTier = 'desktop' | 'tablet' | 'phone-high' | 'gen-mobile' | 'phone-low';

export interface DeviceProfile {
  tier: DeviceTier;
  label: string;              // Human-readable name shown in debug
  crt: boolean;               // Enable CRT post-processing pipeline
  reflections: boolean;       // Enable puddle reflection system
  carCount: number;           // Oncoming traffic count (0 = disabled)
  parallaxLayers: number;     // Number of parallax background layers
  maxParallelLoads: number;   // Loader concurrency
  musicUIScale: number;       // Music player popup scale on phones (1.0 = no extra scaling)
  titleAnimLevel: number | null; // Title animation resolution level (0=full, 25=half, null=static)
  renderScale: number;        // Internal render resolution multiplier (1.0=1920x1080, 0.5=960x540)
  reflectionRTScale: number;  // Reflection RenderTexture resolution (0.5=960×540, 0.25=480×270)
  reflectionTexScale: number; // Parallax reflection texture downscale (0.2=20%, 0.1=10%)
  reflectionSkip: number;     // RT redraw interval (1=every frame, 2=half, 3=third, 4=quarter)
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
    musicUIScale: 1.0,
    titleAnimLevel: 0,    // full-res originals
    renderScale: 1.0,
    reflectionRTScale: 0.5,
    reflectionTexScale: 0.2,
    reflectionSkip: 1,
  },
  'tablet': {
    tier: 'tablet',
    label: 'Tablet (iPad)',
    crt: true,
    reflections: true,
    carCount: 5,
    parallaxLayers: 8,
    maxParallelLoads: 4,
    musicUIScale: 1.0,
    titleAnimLevel: 0,    // full-res originals
    renderScale: 1.0,
    reflectionRTScale: 0.5,
    reflectionTexScale: 0.2,
    reflectionSkip: 1,
  },
  'phone-high': {
    tier: 'phone-high',
    label: 'Phone High (A14+)',
    crt: true,
    reflections: true,
    carCount: 2,
    parallaxLayers: 6,
    maxParallelLoads: 2,
    musicUIScale: 1.4,
    titleAnimLevel: 25,   // 960x540 — tested smooth on 12 Mini with CRT
    renderScale: 0.75,    // 1440x810 — A14+ can handle 75%
    reflectionRTScale: 0.5,
    reflectionTexScale: 0.2,
    reflectionSkip: 2,
  },
  'gen-mobile': {
    tier: 'gen-mobile',
    label: 'GEN Mobile (unknown)',
    crt: true,
    reflections: true,    // ON — quality scaled via reflectionRTScale/Skip
    carCount: 2,
    parallaxLayers: 6,
    maxParallelLoads: 2,
    musicUIScale: 1.3,
    titleAnimLevel: 35,   // 576x324 — conservative for unknowns
    renderScale: 0.5,     // 960x540 — safe default for unknowns
    reflectionRTScale: 0.35,
    reflectionTexScale: 0.15,
    reflectionSkip: 3,
  },
  'phone-low': {
    tier: 'phone-low',
    label: 'Phone Low (A12/A13)',
    crt: true,
    reflections: true,    // ON — quality scaled via reflectionRTScale/Skip
    carCount: 1,          // Bring back 1 car (was 0) — tiny 20% sprites
    parallaxLayers: 8,
    maxParallelLoads: 2,
    musicUIScale: 1.2,
    titleAnimLevel: 35,  // 576x324 — tested 31 FPS on 12 Mini (no CRT)
    renderScale: 0.5,    // 960x540 — 4x fewer pixels, targeting 30+ FPS
    reflectionRTScale: 0.5,   // Same as desktop — start safe, reduce after testing
    reflectionTexScale: 0.2,  // Same as desktop — start safe, reduce after testing
    reflectionSkip: 3,        // Redraw every 3rd frame
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
  // ── iPads ──────────────────────────────────────────────────────
  { w: 810, h: 1080, dpr: 2, tier: 'tablet', label: 'iPad 10th Gen' },
  { w: 820, h: 1180, dpr: 2, tier: 'tablet', label: 'iPad Air 4/5' },
  { w: 834, h: 1194, dpr: 2, tier: 'tablet', label: 'iPad Pro 11"' },
  { w: 1024, h: 1366, dpr: 2, tier: 'tablet', label: 'iPad Pro 12.9"' },
  { w: 768, h: 1024, dpr: 2, tier: 'tablet', label: 'iPad 9th Gen / Mini' },

  // ── iPhones (deduplicated by fingerprint, newest→oldest) ──────
  // One entry per unique CSS viewport + DPR combo. Tier assigned to
  // the weakest device sharing that fingerprint.

  // 440×956 @3x — iPhone 16 Pro Max (A18 Pro, 8GB)
  { w: 440, h: 956, dpr: 3, tier: 'phone-high', label: 'iPhone 16 Pro Max' },
  // 402×874 @3x — iPhone 16 Pro (A18 Pro, 8GB)
  { w: 402, h: 874, dpr: 3, tier: 'phone-high', label: 'iPhone 16 Pro' },
  // 430×932 @3x — 16+/15+/15 Pro Max/14 Pro Max (weakest: A15 6GB)
  { w: 430, h: 932, dpr: 3, tier: 'phone-high', label: 'iPhone 16+/15+/15PM/14PM' },
  // 428×926 @3x — 14+/13 Pro Max/12 Pro Max (weakest: A14 6GB)
  { w: 428, h: 926, dpr: 3, tier: 'phone-high', label: 'iPhone 14+/13PM/12PM' },
  // 393×852 @3x — 16/15/15 Pro/14 Pro (weakest: A16 6GB)
  { w: 393, h: 852, dpr: 3, tier: 'phone-high', label: 'iPhone 16/15/15P/14P' },
  // 390×844 @3x — 16e/14/13/13 Pro/12/12 Pro (weakest: A14 4GB)
  { w: 390, h: 844, dpr: 3, tier: 'phone-high', label: 'iPhone 16e/14/13/13P/12/12P' },
  // 360×780 @3x — 13 Mini/12 Mini (weakest: A14 4GB, small screen but capable)
  { w: 360, h: 780, dpr: 3, tier: 'phone-high', label: 'iPhone 13 Mini/12 Mini' },
  // 375×812 @3x — X/XS/11 Pro (A11-A13, 3-4GB)
  { w: 375, h: 812, dpr: 3, tier: 'phone-low', label: 'iPhone X/XS/11 Pro' },
  // 414×896 @3x — XS Max/11 Pro Max (A12/A13, 4GB)
  { w: 414, h: 896, dpr: 3, tier: 'phone-low', label: 'iPhone XS Max/11 Pro Max' },
  // 414×896 @2x — XR/11 (A12/A13, LCD @2x)
  { w: 414, h: 896, dpr: 2, tier: 'phone-low', label: 'iPhone XR/11' },
  // 375×667 @2x — 8/SE 2/SE 3 (A11-A15, LCD @2x, 2-4GB)
  { w: 375, h: 667, dpr: 2, tier: 'phone-low', label: 'iPhone SE 2/SE 3/8' },
  // 414×736 @3x — 8 Plus (A11, 3GB)
  { w: 414, h: 736, dpr: 3, tier: 'phone-low', label: 'iPhone 8 Plus' },
  // 320×568 @2x — SE 1st Gen (A9, 2GB)
  { w: 320, h: 568, dpr: 2, tier: 'phone-low', label: 'iPhone SE 1st Gen' },
];

/** Detect device and return the appropriate profile.
 *  Priority: ?profile= URL param > fingerprint match > heuristic fallback. */
export function detectDeviceProfile(): DeviceProfile {
  // 1. Manual override via URL param: ?profile=desktop|tablet|phone-high|gen-mobile|phone-low
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
      // Phone-sized — default to gen-mobile (safe but not crippled)
      const p = { ...PROFILES['gen-mobile'] };
      p.label = `Unknown iPhone (${w}×${h} @${dpr}x)`;
      p.musicUIScale = autoMusicUIScale();
      return p;
    }
  }

  // 4. Non-iOS mobile — gen-mobile fallback (was phone-high, too generous)
  if (detectMobileLike()) {
    const w = Math.min(screen.width, screen.height);
    if (w >= 700) {
      const p = { ...PROFILES['tablet'] };
      p.label = `Android Tablet (${w}×${screen.height})`;
      return p;
    }
    const p = { ...PROFILES['gen-mobile'] };
    p.label = `Android Phone (${w}×${screen.height})`;
    p.musicUIScale = autoMusicUIScale();
    return p;
  }

  // 5. Desktop
  return { ...PROFILES['desktop'] };
}
