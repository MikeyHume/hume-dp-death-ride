import Phaser from 'phaser';
import { TUNING } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { CRTPipeline } from './fx/CRTPipeline';
import { WaterDistortionPipeline } from './fx/WaterDistortionPipeline';
import { DamageFlashPipeline } from './fx/DamageFlashPipeline';
import { handleCallback } from './systems/SpotifyAuthSystem';
import { GAME_MODE } from './config/gameMode';
import { initTelemetry } from './util/telemetry';
import { initTestMode, TEST_MODE } from './util/testMode';
import { isiOS } from './util/device';

// Automation: activate test mode when ?test=1 is in URL
initTestMode();

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
    maxParallel = 4;
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
    scene: [BootScene, GameScene],
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

  // Register CRT as a post-processing pipeline
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  renderer.pipelines.addPostPipeline('CRTPipeline', CRTPipeline);
  renderer.pipelines.addPostPipeline('WaterDistortionPipeline', WaterDistortionPipeline);
  renderer.pipelines.addPostPipeline('DamageFlashPipeline', DamageFlashPipeline);

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