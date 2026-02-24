import Phaser from 'phaser';
import { TUNING } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { handleCallback } from './systems/SpotifyAuthSystem';
import { GAME_MODE, DEVICE_PROFILE } from './config/gameMode';
import { initTelemetry } from './util/telemetry';
import { initTestMode, TEST_MODE } from './util/testMode';
import { isiOS } from './util/device';

// Expose device profile globally for debugging + WebDriver inspection
(window as any).__deviceProfile = DEVICE_PROFILE;

// Automation: activate test mode when ?test=1 is in URL
// Poll loop is delayed until frameCount > 0 (BootScene complete), so it won't
// compete with iOS Safari's limited HTTP connection pool during asset loading.
initTestMode();

// Vision system: activate debug HUD overlay when ?hud=1 is in URL
// Separate from ?test=1 — safe on iOS Safari (no polling, no command queue)
if (new URLSearchParams(location.search).has('hud')) {
  (window as any).__dpMotoHud = true;
}

// Dev-only: activate Safari telemetry when ?debug=1 is in URL
initTelemetry();

// Handle Spotify OAuth callback before booting Phaser.
// If we're on /callback, exchange the code and redirect to "/".
handleCallback().then((wasCallback) => {
  // In test mode, skip Spotify auth entirely to avoid redirect loops
  if (TEST_MODE.active && TEST_MODE.skipSpotifyAuth) {
    // fall through — don't handle callback, just boot the game
  } else if (wasCallback) {
    return; // page is redirecting, don't start the game
  }

  // ── Loader concurrency control ──────────────────────────
  // ?parallel=N  → set exact value (clamped per platform)
  // ?low=1       → force throttle on (iOS default)
  // ?low=0       → force throttle off (reproduce old failures)
  // default      → iOS=4, desktop=32
  const ios = isiOS();
  const params = new URLSearchParams(location.search);
  const parallelParam = params.get('parallel');
  const lowParam = params.get('low');

  let maxParallel: number;
  let loaderSource: string; // for telemetry

  if (parallelParam !== null) {
    const raw = parseInt(parallelParam, 10);
    const min = 1;
    const max = ios ? 8 : 64;
    maxParallel = Math.max(min, Math.min(isNaN(raw) ? (ios ? 4 : 32) : raw, max));
    loaderSource = `url:parallel=${parallelParam}→${maxParallel}`;
  } else if (lowParam === '0') {
    maxParallel = ios ? 8 : 32;
    loaderSource = ios ? 'url:low=0 (iOS capped 8)' : 'url:low=0 (forced off)';
  } else if (lowParam === '1' || ios) {
    maxParallel = 2;
    loaderSource = lowParam === '1' ? 'url:low=1' : 'auto:iOS';
  } else {
    maxParallel = 32;
    loaderSource = 'default:desktop';
  }

  // Expose for telemetry + BootScene logging
  (window as any).__loaderConfig = { maxParallel, source: loaderSource, ios };

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL,
    width: TUNING.GAME_WIDTH,
    height: TUNING.GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#000000',
    scene: [BootScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    dom: {
      createContainer: true
    },
    render: GAME_MODE.mobileMode ? { powerPreference: 'low-power' } : undefined,
    loader: {
      maxParallelDownloads: maxParallel,
    },
  };

  const game = new Phaser.Game(config);

  // Expose game instance so BIOS overlay can unlock Phaser's audio context
  (window as any).__phaserGame = game;

  // Dynamic imports: GameScene + pipelines loaded in parallel with BootScene assets.
  // This defers ~400KB of JS evaluation that would otherwise crash iOS Safari.
  Promise.all([
    import('./scenes/GameScene'),
    import('./fx/CRTPipeline'),
    import('./fx/WaterDistortionPipeline'),
    import('./fx/DamageFlashPipeline'),
  ]).then(([gsModule, crtModule, waterModule, dmgModule]) => {
    game.scene.add('GameScene', gsModule.GameScene, false);

    const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.pipelines.addPostPipeline('CRTPipeline', crtModule.CRTPipeline);
    renderer.pipelines.addPostPipeline('WaterDistortionPipeline', waterModule.WaterDistortionPipeline);
    renderer.pipelines.addPostPipeline('DamageFlashPipeline', dmgModule.DamageFlashPipeline);

    (window as any).__gameSceneReady = true;
    console.log('[main] GameScene + pipelines loaded and registered');
  }).catch((err) => {
    console.error('[main] Failed to load GameScene:', err);
    (window as any).__gameSceneError = String(err);
    (window as any).__gameSceneReady = true;
  });

  // Handle WebGL context loss gracefully (common on iOS Safari)
  game.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost — preventing page reload');
  });
  game.canvas.addEventListener('webglcontextrestored', () => {
    console.warn('WebGL context restored');
  });
});
console.log('SPOTIFY CLIENT ID:', import.meta.env.VITE_SPOTIFY_CLIENT_ID);