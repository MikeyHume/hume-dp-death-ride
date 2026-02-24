import { detectMobileLike, detectDeviceProfile } from '../util/device';
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
};

// Log detected device on boot (visible in Safari console + WebDriver)
console.log(
  `[device] ${DEVICE_PROFILE.label} | tier=${DEVICE_PROFILE.tier} | ` +
  `crt=${DEVICE_PROFILE.crt} refl=${DEVICE_PROFILE.reflections} cars=${DEVICE_PROFILE.carCount} ` +
  `parallel=${DEVICE_PROFILE.maxParallelLoads}`
);
