import { detectMobileLike, detectDeviceProfile, isPhoneTier } from '../util/device';
import type { DeviceProfile, DeviceTier } from '../util/device';

/** Detected device profile — drives all per-device optimizations. */
export const DEVICE_PROFILE: DeviceProfile = detectDeviceProfile();

/** Global mutable runtime state. Read by systems to branch on mobile/tier. */
export const GAME_MODE = {
  mobileMode: detectMobileLike(),
  /** Active render tier — starts at DEVICE_PROFILE.tier, can be dynamically
   *  downgraded/upgraded by PerfSystem based on measured FPS. */
  renderTier: DEVICE_PROFILE.tier as DeviceTier,
  /** Actual canvas width (adaptive to viewport). Set in main.ts before game creation. */
  canvasWidth: 1920,
  /** X offset to center 1920px content in the wider canvas. = (canvasWidth - 1920) / 2 */
  contentOffsetX: 0,
  /** True on phone tiers (phone-high, gen-mobile, phone-low) — NOT tablet or desktop. */
  isPhoneMode: false as boolean,  // set after DEVICE_PROFILE is finalized in main.ts
  /** True on phone-low tier — skips heavy animation spritesheets to stay within VRAM budget. */
  liteMode: false as boolean,     // set in main.ts after device profile is finalized
  /** Internal render resolution scale (1.0=1920x1080, 0.5=960x540). Set in main.ts. */
  renderScale: 1.0,
};

// Log detected device on boot (visible in Safari console + WebDriver)
console.log(
  `[device] ${DEVICE_PROFILE.label} | tier=${DEVICE_PROFILE.tier} | ` +
  `crt=${DEVICE_PROFILE.crt} refl=${DEVICE_PROFILE.reflections} cars=${DEVICE_PROFILE.carCount} ` +
  `parallel=${DEVICE_PROFILE.maxParallelLoads}`
);
