import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { ParallaxSystem } from './ParallaxSystem';
import { ObstacleType } from './ObstacleSystem';

export class ReflectionSystem {
  private scene: Phaser.Scene;
  private mirrorY: number;

  // Flipped copies of parallax layers
  private reflectedLayers: Phaser.GameObjects.TileSprite[] = [];
  private sourceLayers: readonly Phaser.GameObjects.TileSprite[];

  // Flipped copy of sky
  private reflectedSky: Phaser.GameObjects.Image;
  private sourceSky: Phaser.GameObjects.Image;

  // Puddle mask (BitmapMask — uses puddle texture alpha for organic shapes)
  private maskRT: Phaser.GameObjects.RenderTexture;
  private puddleMask: Phaser.Display.Masks.BitmapMask;
  private obstaclePool: readonly Phaser.GameObjects.Sprite[];
  private maskEnabled: boolean = true;

  constructor(
    scene: Phaser.Scene,
    parallaxSystem: ParallaxSystem,
    obstaclePool: readonly Phaser.GameObjects.Sprite[],
  ) {
    this.scene = scene;
    this.obstaclePool = obstaclePool;
    this.sourceLayers = parallaxSystem.getLayers();
    this.sourceSky = parallaxSystem.getSky();
    const sourceTexKeys = parallaxSystem.getTextureKeys();

    // Mirror line = bottom edge of layer 0 (railing, the frontmost parallax layer)
    const railing = this.sourceLayers[0];
    this.mirrorY = railing.y + railing.height / 2;

    const scaleY = TUNING.REFLECTION_SCALE_Y;
    const offsetY = TUNING.REFLECTION_OFFSET_Y;
    const alpha = TUNING.REFLECTION_ALPHA;

    // --- Create reflected sky (behind all reflected layers) ---
    const sky = this.sourceSky;
    const skyDisplayH = sky.displayHeight;
    const skyBaseY = 2 * this.mirrorY - skyDisplayH;
    const skyFinalY = this.mirrorY + (skyBaseY - this.mirrorY) * scaleY + offsetY;

    this.reflectedSky = scene.add.image(sky.x, skyFinalY, sky.texture.key);
    this.reflectedSky.setOrigin(0.5, 0);
    this.reflectedSky.setFlipY(true);
    this.reflectedSky.setScale(sky.scaleX, sky.scaleY * scaleY);
    this.reflectedSky.setAlpha(alpha);
    this.reflectedSky.setBlendMode(Phaser.BlendModes.NORMAL);
    this.reflectedSky.setDepth(1.5);

    // --- Create reflected parallax layers (back to front for correct depth ordering) ---
    for (let i = this.sourceLayers.length - 1; i >= 0; i--) {
      const src = this.sourceLayers[i];
      const texKey = sourceTexKeys[i];
      const reflectedCenterY = 2 * this.mirrorY - src.y;
      const finalY = this.mirrorY + (reflectedCenterY - this.mirrorY) * scaleY + offsetY;

      const ref = scene.add.tileSprite(
        src.x,
        finalY,
        src.width,
        src.height,
        texKey,
      );

      // Match source tile scale exactly (positive values)
      ref.setTileScale(src.tileScaleX, src.tileScaleY);
      // Sync initial tile scroll position
      ref.tilePositionX = src.tilePositionX;

      // Flip vertically using setFlipY — same proven method as the sky Image
      ref.setFlipY(true);
      ref.setScale(1, scaleY);

      ref.setAlpha(alpha);
      ref.setBlendMode(Phaser.BlendModes.NORMAL);
      // Front layers (lower i) render on top — give them higher depth
      ref.setDepth(1.5 + (this.sourceLayers.length - i) * 0.001);

      this.reflectedLayers.push(ref);
    }
    // Reverse so reflectedLayers[i] corresponds to sourceLayers[i]
    this.reflectedLayers.reverse();

    // --- Create puddle mask (BitmapMask with RenderTexture) ---
    // RT must be visible (willRender check), placed behind sky so player never sees it
    this.maskRT = scene.add.renderTexture(0, 0, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT);
    this.maskRT.setOrigin(0, 0);
    this.maskRT.setDepth(-100);
    this.puddleMask = this.maskRT.createBitmapMask();

    // Apply mask to all reflected layers + sky
    for (const ref of this.reflectedLayers) {
      ref.setMask(this.puddleMask);
    }
    this.reflectedSky.setMask(this.puddleMask);

    // Start hidden (shown when entering PLAYING state)
    this.setVisible(false);
  }

  update(_roadSpeed: number, _dt: number): void {
    // Sync tile scroll positions from source layers
    for (let i = 0; i < this.reflectedLayers.length; i++) {
      this.reflectedLayers[i].tilePositionX = this.sourceLayers[i].tilePositionX;
    }

    // Sync sky X position
    this.reflectedSky.x = this.sourceSky.x;

    // Redraw puddle mask: draw each active puddle sprite onto the RT
    // Puddle sprites have alpha=0 (hidden in scene), so temporarily set alpha=1 to draw
    this.maskRT.clear();
    for (let i = 0; i < this.obstaclePool.length; i++) {
      const obs = this.obstaclePool[i];
      if (!obs.active) continue;
      if (obs.getData('type') !== ObstacleType.SLOW) continue;
      obs.setAlpha(1);
      this.maskRT.draw(obs);
      obs.setAlpha(0);
    }
  }

  setVisible(visible: boolean): void {
    for (const ref of this.reflectedLayers) {
      ref.setVisible(visible);
    }
    this.reflectedSky.setVisible(visible);
  }

  toggleMask(): void {
    this.maskEnabled = !this.maskEnabled;
    if (this.maskEnabled) {
      for (const ref of this.reflectedLayers) ref.setMask(this.puddleMask);
      this.reflectedSky.setMask(this.puddleMask);
    } else {
      for (const ref of this.reflectedLayers) ref.clearMask();
      this.reflectedSky.clearMask();
    }
  }

  toggleLayer(index: number): void {
    if (index >= 0 && index < this.reflectedLayers.length) {
      const layer = this.reflectedLayers[index];
      layer.setVisible(!layer.visible);
    }
  }

  toggleSky(): void {
    this.reflectedSky.setVisible(!this.reflectedSky.visible);
  }

  destroy(): void {
    for (const ref of this.reflectedLayers) {
      ref.clearMask();
      ref.destroy();
    }
    this.reflectedLayers.length = 0;
    this.reflectedSky.clearMask();
    this.reflectedSky.destroy();
    this.maskRT.destroy();
  }
}
