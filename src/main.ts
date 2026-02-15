import Phaser from 'phaser';
import { TUNING } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { CRTPipeline } from './fx/CRTPipeline';
import { handleCallback } from './systems/SpotifyAuthSystem';
import { GAME_MODE } from './config/gameMode';
import { setupAudioUnlock } from './audio/AudioUnlock';
import { createMobileDebugOverlay } from './ui/MobileDebugOverlay';

const stage = (l: string) => (window as any).__crashLog?.stage(l);

// Handle Spotify OAuth callback before booting Phaser.
// If we're on /callback, exchange the code and redirect to "/".
handleCallback().then((wasCallback) => {
  if (wasCallback) return; // page is redirecting, don't start the game

  stage('main-creating-game');

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
  };

  const game = new Phaser.Game(config);
  stage('main-game-created');

  // Register CRT as a post-processing pipeline (can fail on iOS GPU)
  try {
    const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.pipelines.addPostPipeline('CRTPipeline', CRTPipeline);
    stage('main-crt-registered');
  } catch (err) {
    console.warn('main: CRT pipeline registration failed', err);
    stage('main-crt-failed');
  }

  // Handle WebGL context loss gracefully (common on iOS Safari)
  game.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stage('webgl-context-lost');
    console.warn('WebGL context lost — preventing page reload');
  });
  game.canvas.addEventListener('webglcontextrestored', () => {
    stage('webgl-context-restored');
    console.warn('WebGL context restored');
  });

  // iOS/Safari: unlock audio on first user gesture (belt-and-suspenders)
  setupAudioUnlock(game);

  // Mobile debug overlay (?mobileDebug=1 URL param)
  createMobileDebugOverlay();
}).catch((err) => {
  stage('main-top-level-error');
  console.error('main: top-level error', err);
});
console.log('SPOTIFY CLIENT ID:', import.meta.env.VITE_SPOTIFY_CLIENT_ID);
