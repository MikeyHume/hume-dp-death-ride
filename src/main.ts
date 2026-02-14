import Phaser from 'phaser';
import { TUNING } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { CRTPipeline } from './fx/CRTPipeline';
import { handleCallback } from './systems/SpotifyAuthSystem';

// Handle Spotify OAuth callback before booting Phaser.
// If we're on /callback, exchange the code and redirect to "/".
handleCallback().then((wasCallback) => {
  if (wasCallback) return; // page is redirecting, don't start the game

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
  };

  const game = new Phaser.Game(config);

  // Register CRT as a post-processing pipeline
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  renderer.pipelines.addPostPipeline('CRTPipeline', CRTPipeline);
});
console.log('SPOTIFY CLIENT ID:', import.meta.env.VITE_SPOTIFY_CLIENT_ID);