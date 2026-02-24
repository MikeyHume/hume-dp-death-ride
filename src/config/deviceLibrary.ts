/**
 * deviceLibrary.ts — Comprehensive device catalog with full hardware specs.
 *
 * Used by the simulation system and dashboard, NOT by runtime fingerprinting.
 * Runtime detection lives in device.ts (KNOWN_DEVICES + detectDeviceProfile).
 * This is the reference database for every device we want to simulate.
 */

import type { DeviceTier } from '../util/device';

export type DeviceStatus = 'verified' | 'simulated' | 'unverified';
export type DeviceBrand = 'apple' | 'samsung' | 'google' | 'other';

export interface DeviceSpec {
  slug: string;            // URL-safe identifier: 'iphone-16-pro-max'
  name: string;            // 'iPhone 16 Pro Max'
  brand: DeviceBrand;
  year: number;            // Release year
  // Screen
  cssW: number;            // CSS viewport width (portrait)
  cssH: number;            // CSS viewport height (portrait)
  dpr: number;             // Device pixel ratio
  physicalW: number;       // Physical pixels width
  physicalH: number;       // Physical pixels height
  screenInches: number;    // Diagonal screen size
  // Hardware
  chip: string;            // 'A18 Pro', 'Snapdragon 8 Gen 3', etc.
  ram: number;             // GB
  gpuCores: number;        // GPU core count
  // Profile
  tier: DeviceTier;
  status: DeviceStatus;
  // Simulation
  targetFps: number;       // Expected FPS cap for simulation
  notes?: string;
}

// ── iPhone Library (newest → oldest) ────────────────────────────

export const IPHONE_LIBRARY: DeviceSpec[] = [
  // ── iPhone 16 series (2024) ──
  {
    slug: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', brand: 'apple', year: 2024,
    cssW: 440, cssH: 956, dpr: 3, physicalW: 1320, physicalH: 2868, screenInches: 6.9,
    chip: 'A18 Pro', ram: 8, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-16-pro', name: 'iPhone 16 Pro', brand: 'apple', year: 2024,
    cssW: 402, cssH: 874, dpr: 3, physicalW: 1206, physicalH: 2622, screenInches: 6.3,
    chip: 'A18 Pro', ram: 8, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-16-plus', name: 'iPhone 16 Plus', brand: 'apple', year: 2024,
    cssW: 430, cssH: 932, dpr: 3, physicalW: 1290, physicalH: 2796, screenInches: 6.7,
    chip: 'A18', ram: 8, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-16', name: 'iPhone 16', brand: 'apple', year: 2024,
    cssW: 393, cssH: 852, dpr: 3, physicalW: 1179, physicalH: 2556, screenInches: 6.1,
    chip: 'A18', ram: 8, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-16e', name: 'iPhone 16e', brand: 'apple', year: 2025,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A16', ram: 8, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
  },

  // ── iPhone 15 series (2023) ──
  {
    slug: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', brand: 'apple', year: 2023,
    cssW: 430, cssH: 932, dpr: 3, physicalW: 1290, physicalH: 2796, screenInches: 6.7,
    chip: 'A17 Pro', ram: 8, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-15-pro', name: 'iPhone 15 Pro', brand: 'apple', year: 2023,
    cssW: 393, cssH: 852, dpr: 3, physicalW: 1179, physicalH: 2556, screenInches: 6.1,
    chip: 'A17 Pro', ram: 8, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'iphone-15-plus', name: 'iPhone 15 Plus', brand: 'apple', year: 2023,
    cssW: 430, cssH: 932, dpr: 3, physicalW: 1290, physicalH: 2796, screenInches: 6.7,
    chip: 'A16', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
  },
  {
    slug: 'iphone-15', name: 'iPhone 15', brand: 'apple', year: 2023,
    cssW: 393, cssH: 852, dpr: 3, physicalW: 1179, physicalH: 2556, screenInches: 6.1,
    chip: 'A16', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
  },

  // ── iPhone 14 series (2022) ──
  {
    slug: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', brand: 'apple', year: 2022,
    cssW: 430, cssH: 932, dpr: 3, physicalW: 1290, physicalH: 2796, screenInches: 6.7,
    chip: 'A16', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
  },
  {
    slug: 'iphone-14-pro', name: 'iPhone 14 Pro', brand: 'apple', year: 2022,
    cssW: 393, cssH: 852, dpr: 3, physicalW: 1179, physicalH: 2556, screenInches: 6.1,
    chip: 'A16', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
  },
  {
    slug: 'iphone-14-plus', name: 'iPhone 14 Plus', brand: 'apple', year: 2022,
    cssW: 428, cssH: 926, dpr: 3, physicalW: 1284, physicalH: 2778, screenInches: 6.7,
    chip: 'A15', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 50,
  },
  {
    slug: 'iphone-14', name: 'iPhone 14', brand: 'apple', year: 2022,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A15', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 50,
  },

  // ── iPhone SE 3 (2022) ──
  {
    slug: 'iphone-se-3', name: 'iPhone SE 3rd Gen', brand: 'apple', year: 2022,
    cssW: 375, cssH: 667, dpr: 2, physicalW: 750, physicalH: 1334, screenInches: 4.7,
    chip: 'A15', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 40,
    notes: 'LCD @2x, small screen, limited RAM despite A15 chip',
  },

  // ── iPhone 13 series (2021) ──
  {
    slug: 'iphone-13-pro-max', name: 'iPhone 13 Pro Max', brand: 'apple', year: 2021,
    cssW: 428, cssH: 926, dpr: 3, physicalW: 1284, physicalH: 2778, screenInches: 6.7,
    chip: 'A15', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 50,
  },
  {
    slug: 'iphone-13-pro', name: 'iPhone 13 Pro', brand: 'apple', year: 2021,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A15', ram: 6, gpuCores: 5,
    tier: 'phone-high', status: 'simulated', targetFps: 50,
  },
  {
    slug: 'iphone-13', name: 'iPhone 13', brand: 'apple', year: 2021,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A15', ram: 4, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 45,
  },
  {
    slug: 'iphone-13-mini', name: 'iPhone 13 Mini', brand: 'apple', year: 2021,
    cssW: 360, cssH: 780, dpr: 3, physicalW: 1080, physicalH: 2340, screenInches: 5.4,
    chip: 'A15', ram: 4, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 45,
  },

  // ── iPhone 12 series (2020) ──
  {
    slug: 'iphone-12-pro-max', name: 'iPhone 12 Pro Max', brand: 'apple', year: 2020,
    cssW: 428, cssH: 926, dpr: 3, physicalW: 1284, physicalH: 2778, screenInches: 6.7,
    chip: 'A14', ram: 6, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 45,
  },
  {
    slug: 'iphone-12-pro', name: 'iPhone 12 Pro', brand: 'apple', year: 2020,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A14', ram: 6, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 45,
  },
  {
    slug: 'iphone-12', name: 'iPhone 12', brand: 'apple', year: 2020,
    cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
    chip: 'A14', ram: 4, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 40,
    notes: 'A14 4GB — borderline phone-high, confirmed by real-world similarity to 12 Mini behavior',
  },
  {
    slug: 'iphone-12-mini', name: 'iPhone 12 Mini', brand: 'apple', year: 2020,
    cssW: 360, cssH: 780, dpr: 3, physicalW: 1080, physicalH: 2340, screenInches: 5.4,
    chip: 'A14', ram: 4, gpuCores: 4,
    tier: 'phone-high', status: 'simulated', targetFps: 40,
    notes: 'CRASHES DURING BIOS on real device — high priority debug target (Mikey\'s phone)',
  },

  // ── iPhone 11 series (2019) ──
  {
    slug: 'iphone-11-pro-max', name: 'iPhone 11 Pro Max', brand: 'apple', year: 2019,
    cssW: 414, cssH: 896, dpr: 3, physicalW: 1242, physicalH: 2688, screenInches: 6.5,
    chip: 'A13', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 30,
  },
  {
    slug: 'iphone-11-pro', name: 'iPhone 11 Pro', brand: 'apple', year: 2019,
    cssW: 375, cssH: 812, dpr: 3, physicalW: 1125, physicalH: 2436, screenInches: 5.8,
    chip: 'A13', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 30,
  },
  {
    slug: 'iphone-11', name: 'iPhone 11', brand: 'apple', year: 2019,
    cssW: 414, cssH: 896, dpr: 2, physicalW: 828, physicalH: 1792, screenInches: 6.1,
    chip: 'A13', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 30,
    notes: 'LCD @2x — lower pixel fill than OLED @3x models',
  },

  // ── iPhone XS / XR / X (2017-2018) ──
  {
    slug: 'iphone-xs-max', name: 'iPhone XS Max', brand: 'apple', year: 2018,
    cssW: 414, cssH: 896, dpr: 3, physicalW: 1242, physicalH: 2688, screenInches: 6.5,
    chip: 'A12', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 25,
  },
  {
    slug: 'iphone-xs', name: 'iPhone XS', brand: 'apple', year: 2018,
    cssW: 375, cssH: 812, dpr: 3, physicalW: 1125, physicalH: 2436, screenInches: 5.8,
    chip: 'A12', ram: 4, gpuCores: 4,
    tier: 'phone-low', status: 'verified', targetFps: 25,
    notes: 'Real-device tested: CRT ON, reflections OFF, 22-28 FPS stable',
  },
  {
    slug: 'iphone-xr', name: 'iPhone XR', brand: 'apple', year: 2018,
    cssW: 414, cssH: 896, dpr: 2, physicalW: 828, physicalH: 1792, screenInches: 6.1,
    chip: 'A12', ram: 3, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 25,
    notes: 'LCD @2x, only 3GB RAM',
  },
  {
    slug: 'iphone-x', name: 'iPhone X', brand: 'apple', year: 2017,
    cssW: 375, cssH: 812, dpr: 3, physicalW: 1125, physicalH: 2436, screenInches: 5.8,
    chip: 'A11', ram: 3, gpuCores: 3,
    tier: 'phone-low', status: 'simulated', targetFps: 20,
    notes: 'A11 3-core GPU, 3GB RAM — oldest supported model',
  },

  // ── iPhone SE 2 (2020) ──
  {
    slug: 'iphone-se-2', name: 'iPhone SE 2nd Gen', brand: 'apple', year: 2020,
    cssW: 375, cssH: 667, dpr: 2, physicalW: 750, physicalH: 1334, screenInches: 4.7,
    chip: 'A13', ram: 3, gpuCores: 4,
    tier: 'phone-low', status: 'simulated', targetFps: 30,
    notes: 'LCD @2x, only 3GB RAM, tiny 4.7" screen',
  },

  // ── iPhone 8 series (2017) ──
  {
    slug: 'iphone-8-plus', name: 'iPhone 8 Plus', brand: 'apple', year: 2017,
    cssW: 414, cssH: 736, dpr: 3, physicalW: 1242, physicalH: 2208, screenInches: 5.5,
    chip: 'A11', ram: 3, gpuCores: 3,
    tier: 'phone-low', status: 'simulated', targetFps: 20,
  },
  {
    slug: 'iphone-8', name: 'iPhone 8', brand: 'apple', year: 2017,
    cssW: 375, cssH: 667, dpr: 2, physicalW: 750, physicalH: 1334, screenInches: 4.7,
    chip: 'A11', ram: 2, gpuCores: 3,
    tier: 'phone-low', status: 'simulated', targetFps: 18,
    notes: 'Only 2GB RAM — may struggle with asset loading',
  },
];

// ── Top Global Phones (placeholder — Mikey to provide specs) ────

export const ANDROID_LIBRARY: DeviceSpec[] = [
  // Top 5 non-iOS phones (2025/2026) — for stress testing
  {
    slug: 'galaxy-s25-ultra', name: 'Samsung Galaxy S25 Ultra', brand: 'samsung', year: 2025,
    cssW: 412, cssH: 891, dpr: 3.5, physicalW: 1440, physicalH: 3120, screenInches: 6.9,
    chip: 'Snapdragon 8 Elite', ram: 12, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'galaxy-s25-plus', name: 'Samsung Galaxy S25+', brand: 'samsung', year: 2025,
    cssW: 412, cssH: 891, dpr: 3.5, physicalW: 1440, physicalH: 3120, screenInches: 6.7,
    chip: 'Snapdragon 8 Elite', ram: 12, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'galaxy-s25', name: 'Samsung Galaxy S25', brand: 'samsung', year: 2025,
    cssW: 360, cssH: 780, dpr: 3, physicalW: 1080, physicalH: 2340, screenInches: 6.2,
    chip: 'Snapdragon 8 Elite', ram: 12, gpuCores: 6,
    tier: 'phone-high', status: 'simulated', targetFps: 60,
  },
  {
    slug: 'pixel-9-pro', name: 'Google Pixel 9 Pro', brand: 'google', year: 2024,
    cssW: 410, cssH: 914, dpr: 3.125, physicalW: 1280, physicalH: 2856, screenInches: 6.3,
    chip: 'Tensor G4', ram: 16, gpuCores: 7,
    tier: 'phone-high', status: 'simulated', targetFps: 55,
    notes: 'Tensor G4 GPU slightly weaker than Snapdragon 8 Elite for games',
  },
  {
    slug: 'galaxy-a55', name: 'Samsung Galaxy A55', brand: 'samsung', year: 2024,
    cssW: 360, cssH: 780, dpr: 3, physicalW: 1080, physicalH: 2340, screenInches: 6.6,
    chip: 'Exynos 1480', ram: 8, gpuCores: 6,
    tier: 'gen-mobile', status: 'simulated', targetFps: 35,
    notes: 'Mid-range — represents majority of Android market. Good stress test target.',
  },
];

// ── Lookup helpers ──────────────────────────────────────────────

/** All devices in one flat list. */
export const ALL_DEVICES: DeviceSpec[] = [...IPHONE_LIBRARY, ...ANDROID_LIBRARY];

/** Find a device by its URL slug. */
export function getDeviceBySlug(slug: string): DeviceSpec | undefined {
  return ALL_DEVICES.find(d => d.slug === slug);
}

/** Get all devices for a specific tier. */
export function getDevicesByTier(tier: DeviceTier): DeviceSpec[] {
  return ALL_DEVICES.filter(d => d.tier === tier);
}

/** Get all devices for a specific brand. */
export function getDevicesByBrand(brand: DeviceBrand): DeviceSpec[] {
  return ALL_DEVICES.filter(d => d.brand === brand);
}
