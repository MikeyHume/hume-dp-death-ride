import { detectMobileLike, detectDeviceProfile, isPhoneTier } from '../util/device';
import type { DeviceProfile } from '../util/device';

export type QualityTier = 'high' | 'medium' | 'low';

/** Detected device profile — drives all per-device optimizations. */
export const DEVICE_PROFILE: DeviceProfile = detectDeviceProfile();

/** Global mutable runtime state. Read by systems to branch on mobile/quality. */
export const GAME_MODE = {
  mobileMode: detectMobileLike(),
  quality: (DEVICE_PROFILE.tier === 'desktop' ? 'high'
    : DEVICE_PROFILE.tier === 'tablet' ? 'medium'
    : 'low') as QualityTier, // phone-high/gen-mobile/phone-low → low (disables bloom + noise)
  /** Actual canvas width (adaptive to viewport). Set in main.ts before game creation. */
  canvasWidth: 1920,
  /** X offset to center 1920px content in the wider canvas. = (canvasWidth - 1920) / 2 */
  contentOffsetX: 0,
  /** True on phone tiers (phone-high, gen-mobile, phone-low) — NOT tablet or desktop. */
  isPhoneMode: false as boolean,  // set after DEVICE_PROFILE is finalized in main.ts
  /** True on phone-low tier — skips heavy animation spritesheets to stay within VRAM budget. */
  liteMode: false as boolean,     // set in main.ts after device profile is finalized
};

// Log detected device on boot (visible in Safari console + WebDriver)
console.log(
  `[device] ${DEVICE_PROFILE.label} | tier=${DEVICE_PROFILE.tier} | ` +
  `crt=${DEVICE_PROFILE.crt} refl=${DEVICE_PROFILE.reflections} cars=${DEVICE_PROFILE.carCount} ` +
  `parallel=${DEVICE_PROFILE.maxParallelLoads}`
);
