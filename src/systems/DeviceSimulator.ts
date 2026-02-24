/**
 * DeviceSimulator.ts — Emulates target devices in the browser.
 *
 * Activated by ?simulate=<slug> URL parameter.
 * Overrides DEVICE_PROFILE, constrains canvas to device viewport,
 * caps FPS, and shows a device info bar.
 *
 * Usage:
 *   ?simulate=iphone-xs          — simulate iPhone XS
 *   ?simulate=iphone-xs&fps=25   — with FPS override
 *   ?simulate=gen-mobile          — test GEN_Mobile fallback
 *
 * Feature flag overrides (for stress testing permutations):
 *   ?simulate=iphone-xs&force-crt=1        — enable CRT regardless of tier
 *   ?simulate=iphone-xs&force-crt=0        — disable CRT regardless of tier
 *   ?simulate=iphone-xs&force-reflections=1 — enable reflections
 *   ?simulate=iphone-xs&force-cars=5       — override car count
 */

import { getDeviceBySlug, ALL_DEVICES } from '../config/deviceLibrary';
import type { DeviceSpec } from '../config/deviceLibrary';
import type { DeviceProfile, DeviceTier } from '../util/device';

// ── Simulation state ────────────────────────────────────────────

export interface SimulationConfig {
  device: DeviceSpec;
  fpsOverride: number | null;  // null = use device.targetFps
  landscapeW: number;          // CSS px (device height in portrait → width in landscape)
  landscapeH: number;          // CSS px (device width in portrait → height in landscape)
  featureOverrides: string[];  // List of overridden features for info bar display
}

let activeSimulation: SimulationConfig | null = null;

/** Check if simulation mode is active. */
export function isSimulating(): boolean {
  return activeSimulation !== null;
}

/** Get the active simulation config, if any. */
export function getSimulation(): SimulationConfig | null {
  return activeSimulation;
}

// ── Initialization (called from main.ts before Phaser config) ───

/**
 * Detect ?simulate= param and set up simulation.
 * Returns the simulated DeviceProfile if active, or null for normal mode.
 */
export function initSimulation(): DeviceProfile | null {
  const params = new URLSearchParams(location.search);
  const slug = params.get('simulate');
  if (!slug) return null;

  // Special case: 'gen-mobile' is a tier, not a specific device
  if (slug === 'gen-mobile') {
    const genProfile: DeviceProfile = {
      tier: 'gen-mobile' as DeviceTier,
      label: 'GEN Mobile (simulated)',
      crt: false,
      reflections: false,
      carCount: 2,
      parallaxLayers: 6,
      maxParallelLoads: 2,
    };
    // Create a synthetic device for the info bar
    activeSimulation = {
      device: {
        slug: 'gen-mobile', name: 'GEN Mobile (Fallback)', brand: 'other', year: 2026,
        cssW: 390, cssH: 844, dpr: 3, physicalW: 1170, physicalH: 2532, screenInches: 6.1,
        chip: 'Unknown', ram: 4, gpuCores: 4,
        tier: 'gen-mobile', status: 'simulated', targetFps: 30,
      },
      fpsOverride: params.has('fps') ? parseInt(params.get('fps')!, 10) : null,
      landscapeW: 844,
      landscapeH: 390,
      featureOverrides: [],
    };
    applyFeatureOverrides(params, genProfile, activeSimulation);
    setupInfoBar(activeSimulation);
    setupCanvasConstraints(activeSimulation);
    return genProfile;
  }

  const device = getDeviceBySlug(slug);
  if (!device) {
    console.warn(`[sim] Unknown device slug: "${slug}". Available: ${ALL_DEVICES.map(d => d.slug).join(', ')}`);
    return null;
  }

  // Landscape: swap W/H (game is horizontal)
  const landscapeW = device.cssH;  // portrait height → landscape width
  const landscapeH = device.cssW;  // portrait width → landscape height

  activeSimulation = {
    device,
    fpsOverride: params.has('fps') ? parseInt(params.get('fps')!, 10) : null,
    landscapeW,
    landscapeH,
    featureOverrides: [],
  };

  // Build a DeviceProfile from the device spec
  const profile: DeviceProfile = buildProfileFromSpec(device);

  // Apply force-* URL param overrides for stress testing
  applyFeatureOverrides(params, profile, activeSimulation);

  setupInfoBar(activeSimulation);
  setupCanvasConstraints(activeSimulation);

  console.log(
    `[sim] Simulating ${device.name} | ${landscapeW}×${landscapeH} landscape | ` +
    `FPS cap: ${activeSimulation.fpsOverride ?? device.targetFps} | tier: ${device.tier}`
  );

  return profile;
}

// ── Feature flag overrides (stress testing) ─────────────────────

function applyFeatureOverrides(
  params: URLSearchParams,
  profile: DeviceProfile,
  sim: SimulationConfig,
): void {
  const forceCrt = params.get('force-crt');
  if (forceCrt !== null) {
    profile.crt = forceCrt === '1';
    sim.featureOverrides.push(`crt=${forceCrt}`);
  }

  const forceReflections = params.get('force-reflections');
  if (forceReflections !== null) {
    profile.reflections = forceReflections === '1';
    sim.featureOverrides.push(`reflections=${forceReflections}`);
  }

  const forceCars = params.get('force-cars');
  if (forceCars !== null) {
    profile.carCount = parseInt(forceCars, 10) || 0;
    sim.featureOverrides.push(`cars=${forceCars}`);
  }

  const forceParallax = params.get('force-parallax');
  if (forceParallax !== null) {
    profile.parallaxLayers = parseInt(forceParallax, 10) || 0;
    sim.featureOverrides.push(`parallax=${forceParallax}`);
  }

  if (sim.featureOverrides.length > 0) {
    console.log(`[sim] Feature overrides: ${sim.featureOverrides.join(', ')}`);
  }
}

// ── Profile builder ─────────────────────────────────────────────

function buildProfileFromSpec(spec: DeviceSpec): DeviceProfile {
  // Map tier to feature flags
  switch (spec.tier) {
    case 'phone-high':
      return {
        tier: 'phone-high', label: `${spec.name} (sim)`,
        crt: true, reflections: true, carCount: 3,
        parallaxLayers: 8, maxParallelLoads: 2,
      };
    case 'gen-mobile':
      return {
        tier: 'gen-mobile', label: `${spec.name} (sim)`,
        crt: false, reflections: false, carCount: 2,
        parallaxLayers: 6, maxParallelLoads: 2,
      };
    case 'phone-low':
      return {
        tier: 'phone-low', label: `${spec.name} (sim)`,
        crt: false, reflections: false, carCount: 0,
        parallaxLayers: 8, maxParallelLoads: 2,
      };
    case 'tablet':
      return {
        tier: 'tablet', label: `${spec.name} (sim)`,
        crt: true, reflections: true, carCount: 5,
        parallaxLayers: 8, maxParallelLoads: 4,
      };
    default:
      return {
        tier: 'desktop', label: `${spec.name} (sim)`,
        crt: true, reflections: true, carCount: 5,
        parallaxLayers: 8, maxParallelLoads: 32,
      };
  }
}

// ── Canvas constraints ──────────────────────────────────────────

function setupCanvasConstraints(sim: SimulationConfig): void {
  // Constrain the game-container div to match device viewport (landscape)
  const container = document.getElementById('game-container');
  if (!container) return;

  const { landscapeW, landscapeH } = sim;

  // Calculate scale to fit within current browser window (minus info bar)
  const infoBarHeight = 48;
  const availW = window.innerWidth;
  const availH = window.innerHeight - infoBarHeight;
  const scale = Math.min(availW / landscapeW, availH / landscapeH, 1);

  const displayW = Math.round(landscapeW * scale);
  const displayH = Math.round(landscapeH * scale);

  container.style.width = `${displayW}px`;
  container.style.height = `${displayH}px`;
  container.style.margin = `${infoBarHeight}px auto 0`;
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  // Set a dark background so the letterboxing is visible
  document.body.style.backgroundColor = '#1a1a2e';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
}

// ── Info bar ────────────────────────────────────────────────────

function setupInfoBar(sim: SimulationConfig): void {
  const d = sim.device;
  const fps = sim.fpsOverride ?? d.targetFps;

  // Tier color coding
  const tierColors: Record<string, string> = {
    'phone-high': '#22c55e',
    'gen-mobile': '#eab308',
    'phone-low': '#ef4444',
    'tablet': '#3b82f6',
    'desktop': '#a855f7',
  };
  const tierColor = tierColors[d.tier] || '#888';

  const bar = document.createElement('div');
  bar.id = 'sim-info-bar';
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: 48px;
    background: #0f0f23; border-bottom: 2px solid ${tierColor};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; font-family: 'Courier New', monospace;
    color: #e0e0e0; font-size: 13px; z-index: 99999;
  `;

  // Left: device name + year
  const left = document.createElement('div');
  left.innerHTML = `
    <span style="color:${tierColor};font-weight:bold;font-size:15px">${d.name}</span>
    <span style="color:#666;margin-left:8px">(${d.year})</span>
    <span style="color:#888;margin-left:8px">${d.chip} · ${d.ram}GB · ${d.gpuCores}-core GPU</span>
  `;

  // Center: viewport + resolution
  const center = document.createElement('div');
  center.style.textAlign = 'center';
  center.innerHTML = `
    <span style="color:#aaa">${sim.landscapeW}×${sim.landscapeH}</span>
    <span style="color:#555;margin:0 6px">CSS</span>
    <span style="color:#666">${d.physicalH}×${d.physicalW}</span>
    <span style="color:#555;margin:0 6px">px</span>
    <span style="color:#666">@${d.dpr}x</span>
    <span style="color:#555;margin:0 6px">·</span>
    <span style="color:#aaa">${d.screenInches}"</span>
  `;

  // Right: tier badge + FPS + status
  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.alignItems = 'center';
  right.style.gap = '12px';

  const tierBadge = document.createElement('span');
  tierBadge.style.cssText = `
    background:${tierColor}22; color:${tierColor}; border:1px solid ${tierColor};
    padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold;
  `;
  tierBadge.textContent = d.tier.toUpperCase();

  const fpsLabel = document.createElement('span');
  fpsLabel.style.color = fps >= 50 ? '#22c55e' : fps >= 30 ? '#eab308' : '#ef4444';
  fpsLabel.textContent = `${fps} FPS cap`;

  const statusBadge = document.createElement('span');
  const statusColors = { verified: '#22c55e', simulated: '#eab308', unverified: '#ef4444' };
  statusBadge.style.cssText = `
    color:${statusColors[d.status]}; font-size:11px;
  `;
  statusBadge.textContent = d.status.toUpperCase();

  right.appendChild(tierBadge);
  right.appendChild(fpsLabel);
  right.appendChild(statusBadge);

  // Show feature overrides if any
  if (sim.featureOverrides.length > 0) {
    const overrideBadge = document.createElement('span');
    overrideBadge.style.cssText = `
      background:#eab30822; color:#eab308; border:1px solid #eab308;
      padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;
    `;
    overrideBadge.textContent = `OVERRIDE: ${sim.featureOverrides.join(', ')}`;
    right.appendChild(overrideBadge);
  }

  bar.appendChild(left);
  bar.appendChild(center);
  bar.appendChild(right);

  // Insert before game-container
  document.body.insertBefore(bar, document.body.firstChild);
}

// ── FPS Throttling ──────────────────────────────────────────────

/**
 * Wraps a Phaser game instance with FPS throttling.
 * Call this after `new Phaser.Game(config)`.
 */
export function applyFpsThrottle(game: Phaser.Game): void {
  if (!activeSimulation) return;

  const targetFps = activeSimulation.fpsOverride ?? activeSimulation.device.targetFps;
  if (targetFps >= 60) return; // No throttle needed

  const frameBudget = 1000 / targetFps;
  let lastFrameTime = 0;
  let actualFps = 0;
  let frameCount = 0;
  let lastFpsUpdate = 0;

  // Override the game step to throttle
  const originalStep = game.step.bind(game);
  let skipping = false;

  // Use a pre-step hook to skip frames
  game.events.on('prestep', (_time: number) => {
    const now = performance.now();
    if (now - lastFrameTime < frameBudget) {
      skipping = true;
    } else {
      skipping = false;
      lastFrameTime = now;
      frameCount++;
    }

    // Update FPS display every second
    if (now - lastFpsUpdate >= 1000) {
      actualFps = frameCount;
      frameCount = 0;
      lastFpsUpdate = now;
      updateFpsDisplay(actualFps, targetFps);
    }
  });

  // Intercept the game loop to skip rendering on throttled frames
  game.events.on('poststep', () => {
    if (skipping) {
      // We could pause rendering here but Phaser's loop is tightly coupled.
      // For now, the prestep skip flag is informational — actual throttling
      // happens via the targetFps property on the game loop.
    }
  });

  // Phaser 3 has a built-in fps.target — use that instead of manual throttle
  if (game.loop) {
    game.loop.targetFps = targetFps;
  }
}

function updateFpsDisplay(actual: number, target: number): void {
  const bar = document.getElementById('sim-info-bar');
  if (!bar) return;

  // Find or create the live FPS indicator
  let liveFps = document.getElementById('sim-live-fps');
  if (!liveFps) {
    liveFps = document.createElement('span');
    liveFps.id = 'sim-live-fps';
    liveFps.style.cssText = 'font-weight:bold;margin-left:8px;';
    bar.lastElementChild?.appendChild(liveFps);
  }

  const color = actual >= target * 0.9 ? '#22c55e' : actual >= target * 0.6 ? '#eab308' : '#ef4444';
  liveFps.style.color = color;
  liveFps.textContent = `(${actual} actual)`;
}
