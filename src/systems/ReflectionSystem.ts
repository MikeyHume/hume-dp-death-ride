import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { DEVICE_PROFILE, GAME_MODE } from '../config/gameMode';
import { ParallaxSystem } from './ParallaxSystem';
import { ObstacleType } from './ObstacleSystem';

// Per-device quality: RT resolution and reflection texture scale from device profile
const RT_SCALE = DEVICE_PROFILE.reflectionRTScale;
const REFL_TEX_SCALE = DEVICE_PROFILE.reflectionTexScale;
const INV_REFL_TEX_SCALE = 1 / REFL_TEX_SCALE;

export class ReflectionSystem {
  private scene: Phaser.Scene;
  private mirrorY: number;

  // Flipped copies of parallax layers
  private reflectedLayers: Phaser.GameObjects.TileSprite[] = [];
  private sourceLayers: readonly Phaser.GameObjects.TileSprite[];

  // Flipped copy of sky
  private reflectedSky: Phaser.GameObjects.Image;
  private sourceSky: Phaser.GameObjects.Image;

  // Puddle mask applied to the ROAD (inverted — cuts holes where puddles are)
  private maskRT: Phaser.GameObjects.RenderTexture;
  private puddleMask: Phaser.Display.Masks.BitmapMask;
  private puddleRoadOverlay: Phaser.GameObjects.TileSprite; // semi-transparent road inside puddles
  private puddleRoadMask: Phaser.Display.Masks.BitmapMask;  // non-inverted (visible inside puddles)
  private puddleScrollAccum: number = 0;  // accumulated road scroll in screen px
  private puddleTileScale: number = 1;    // tileScale of puddleRoadOverlay (for px→texture conversion)
  private obstaclePool: readonly Phaser.GameObjects.Sprite[];
  private roadTile: Phaser.GameObjects.Container;
  private linesTile: Phaser.GameObjects.Container | null = null;
  private maskEnabled: boolean = true;

  // Skip-frame counter for RT redraws (saves CPU draw calls)
  private frameCount = 0;

  // Layer grouping all reflected background objects for water distortion PostFX
  private reflectionBgLayer: Phaser.GameObjects.Layer;

  // Game object reflections (drawn onto a RenderTexture above bg reflections, below road)
  private objectRT: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Sprite;
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private slashSprite: Phaser.GameObjects.Sprite | null = null;
  private pickupPool: readonly Phaser.GameObjects.Sprite[] = [];
  private shieldPool: readonly Phaser.GameObjects.Sprite[] = [];
  private rocketPool: readonly Phaser.GameObjects.Sprite[] = [];

  constructor(
    scene: Phaser.Scene,
    parallaxSystem: ParallaxSystem,
    obstaclePool: readonly Phaser.GameObjects.Sprite[],
    roadTile: Phaser.GameObjects.Container,
  ) {
    this.scene = scene;
    this.obstaclePool = obstaclePool;
    this.roadTile = roadTile;
    this.sourceLayers = parallaxSystem.getLayers();
    this.sourceSky = parallaxSystem.getSky();
    const sourceTexKeys = parallaxSystem.getTextureKeys();

    // Mirror line = bottom edge of layer 0 (railing, the frontmost parallax layer)
    const railing = this.sourceLayers[0];
    this.mirrorY = railing.y + railing.height / 2;

    // Auto-scale reflection to fill from mirrorY to bottom of screen
    // REFLECTION_SCALE_Y acts as a multiplier on top of the auto-computed base
    const baseScaleY = (TUNING.GAME_HEIGHT - this.mirrorY) / this.mirrorY;
    const scaleY = baseScaleY * TUNING.REFLECTION_SCALE_Y;
    const offsetY = TUNING.REFLECTION_OFFSET_Y;
    const alpha = TUNING.REFLECTION_ALPHA;

    // --- Create reflected sky (behind all reflected layers) ---
    const sky = this.sourceSky;
    const skyDisplayH = sky.displayHeight;
    const skyBaseY = 2 * this.mirrorY - skyDisplayH;
    const skyFinalY = this.mirrorY + (skyBaseY - this.mirrorY) * scaleY + offsetY;

    // Use 20% nearest-neighbor texture for reflection (saves VRAM)
    const skyRefKey = `${sky.texture.key}-ref`;
    this.createDownscaledTexture(scene, sky.texture.key, skyRefKey);

    this.reflectedSky = scene.add.image(sky.x, skyFinalY, skyRefKey);
    this.reflectedSky.setOrigin(0.5, 0);
    this.reflectedSky.setFlipY(true);
    this.reflectedSky.setScale(sky.scaleX * INV_REFL_TEX_SCALE, sky.scaleY * scaleY * INV_REFL_TEX_SCALE);
    this.reflectedSky.setAlpha(alpha);
    this.reflectedSky.setBlendMode(Phaser.BlendModes.NORMAL);
    this.reflectedSky.setDepth(-0.5);

    // --- Create reflected parallax layers (back to front for correct depth ordering) ---
    for (let i = this.sourceLayers.length - 1; i >= 0; i--) {
      const src = this.sourceLayers[i];
      const texKey = sourceTexKeys[i];
      const reflectedCenterY = 2 * this.mirrorY - src.y;
      const finalY = this.mirrorY + (reflectedCenterY - this.mirrorY) * scaleY + offsetY;

      // Use 20% nearest-neighbor texture for reflection (saves VRAM + fill rate)
      const refTexKey = `${texKey}-ref`;
      if (!scene.textures.exists(refTexKey)) {
        this.createDownscaledTexture(scene, texKey, refTexKey);
      }

      const ref = scene.add.tileSprite(
        src.x,
        finalY,
        src.width,
        src.height,
        refTexKey,
      );

      // Match source tile scale × 5 (compensates for 20% texture size)
      ref.setTileScale(src.tileScaleX * INV_REFL_TEX_SCALE, src.tileScaleY * INV_REFL_TEX_SCALE);
      // Sync initial tile scroll position (scaled to match 20% texture coords)
      ref.tilePositionX = src.tilePositionX * REFL_TEX_SCALE;

      // Flip vertically using setFlipY — same proven method as the sky Image
      ref.setFlipY(true);
      ref.setScale(1, scaleY);

      ref.setAlpha(alpha);
      ref.setBlendMode(Phaser.BlendModes.NORMAL);
      // Reflected layers below road (depth 0). Front layers (lower i) get higher depth.
      ref.setDepth(-0.5 + (this.sourceLayers.length - i) * 0.001);

      this.reflectedLayers.push(ref);
    }
    // Reverse so reflectedLayers[i] corresponds to sourceLayers[i]
    this.reflectedLayers.reverse();

    // --- Group reflected bg into a Layer for water distortion PostFX ---
    this.reflectionBgLayer = scene.add.layer();
    this.reflectionBgLayer.setDepth(-0.5);
    this.reflectionBgLayer.add(this.reflectedSky);
    for (const ref of this.reflectedLayers) {
      this.reflectionBgLayer.add(ref);
    }
    this.reflectionBgLayer.setPostPipeline('WaterDistortionPipeline');

    // --- Create puddle mask (BitmapMask with RenderTexture, applied to ROAD) ---
    // Half-res RT scaled to 2x display — saves 75% fill rate
    const rtW = Math.round(GAME_MODE.canvasWidth * RT_SCALE);
    const rtH = Math.round(TUNING.GAME_HEIGHT * RT_SCALE);
    this.maskRT = scene.add.renderTexture(0, 0, rtW, rtH);
    this.maskRT.setOrigin(0, 0);
    this.maskRT.setScale(1 / RT_SCALE); // Display at full game size
    this.maskRT.setDepth(-100);
    this.puddleMask = this.maskRT.createBitmapMask();
    this.puddleMask.invertAlpha = true; // road visible where NO puddles, hidden where puddles are

    // Apply inverted mask to each road sprite — puddle holes reveal reflections underneath
    // Note: BitmapMask on Container doesn't reliably mask children in Phaser;
    // applying to individual sprites works correctly.
    this.applyMaskToChildren(this.roadTile, this.puddleMask);
    // Lines tile gets same mask (set later via setLinesTile)

    // --- Puddle road overlay (semi-transparent road visible inside puddle holes) ---
    // Non-inverted mask from the same RT = visible only WHERE puddles are
    this.puddleRoadMask = this.maskRT.createBitmapMask();
    this.puddleRoadMask.invertAlpha = false;

    // Clone of the road tile — scrolls independently via accumulated offset
    // 'road-img' is now a spritesheet; extract frame 0 into its own texture for tiling
    const roadH = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    const roadCY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;
    const roadFrame = scene.textures.getFrame('road-img', 0);
    if (!scene.textures.exists('road-puddle-overlay')) {
      const srcImg = roadFrame.source.image as HTMLImageElement;
      const fCanvas = document.createElement('canvas');
      fCanvas.width = roadFrame.cutWidth;
      fCanvas.height = roadFrame.cutHeight;
      const fCtx = fCanvas.getContext('2d')!;
      fCtx.drawImage(srcImg, roadFrame.cutX, roadFrame.cutY, roadFrame.cutWidth, roadFrame.cutHeight, 0, 0, roadFrame.cutWidth, roadFrame.cutHeight);
      scene.textures.addCanvas('road-puddle-overlay', fCanvas);
    }
    this.puddleTileScale = roadH / roadFrame.cutHeight;
    this.puddleRoadOverlay = scene.add.tileSprite(
      TUNING.GAME_WIDTH / 2, roadCY, GAME_MODE.canvasWidth, roadH, 'road-puddle-overlay'
    );
    this.puddleRoadOverlay.setTileScale(this.puddleTileScale, this.puddleTileScale);
    this.puddleRoadOverlay.setDepth(0.01); // just above road (depth 0)
    this.puddleRoadOverlay.setAlpha(TUNING.PUDDLE_ROAD_OPACITY);
    this.puddleRoadOverlay.setMask(this.puddleRoadMask);

    // --- Game object reflection RT (above bg reflections, below road) ---
    // Half-res RT scaled to 2x display — saves 75% fill rate
    this.objectRT = scene.add.renderTexture(0, 0, rtW, rtH);
    this.objectRT.setOrigin(0, 0);
    this.objectRT.setScale(1 / RT_SCALE); // Display at full game size
    this.objectRT.setDepth(-0.49);
    this.objectRT.setAlpha(alpha);

    // Add objectRT to the same layer so it gets the water distortion PostFX
    this.reflectionBgLayer.add(this.objectRT);

    // Stamp sprite: drawing proxy for flipping game objects onto the RT
    this.stamp = scene.add.sprite(0, 0, 'obstacle-crash');
    this.stamp.setDepth(-200);
    this.stamp.setAlpha(0);

    // Start hidden (shown when entering PLAYING state)
    this.setVisible(false);
  }

  /** Apply the same puddle mask to the road lines overlay so lines clip inside puddle holes. */
  setLinesTile(linesTile: Phaser.GameObjects.Container): void {
    this.linesTile = linesTile;
    if (this.maskEnabled) {
      this.applyMaskToChildren(this.linesTile, this.puddleMask);
    }
  }

  update(_roadSpeed: number, _dt: number): void {
    // Sync tile scroll positions from source layers (scaled for 20% textures)
    for (let i = 0; i < this.reflectedLayers.length; i++) {
      this.reflectedLayers[i].tilePositionX = this.sourceLayers[i].tilePositionX * REFL_TEX_SCALE;
    }

    // Sync sky X position
    this.reflectedSky.x = this.sourceSky.x;

    // Sync puddle road overlay scroll — accumulate road speed into texture-space offset
    this.puddleScrollAccum += _roadSpeed * _dt;
    this.puddleRoadOverlay.tilePositionX = this.puddleScrollAccum / this.puddleTileScale;
    this.puddleRoadOverlay.setAlpha(TUNING.PUDDLE_ROAD_OPACITY);

    // --- Draw reflected game objects onto half-res objectRT every frame ---
    // Objects (obstacles, cars) move fast so their reflections must update every frame.
    // All positions/sizes scaled by s (RT_SCALE) since RT is half-res (displayed at 2x)
    const s = RT_SCALE;
    this.objectRT.clear();

    // --- Skip-frame maskRT rendering (puddle shapes) ---
    // Puddles scroll slowly and are water-distorted, so Nth-frame redraws are imperceptible.
    this.frameCount++;
    const skip = DEVICE_PROFILE.reflectionSkip;
    const redrawMask = skip <= 1 || this.frameCount % skip === 0;
    if (redrawMask) {
      // Redraw puddle mask: draw each active puddle sprite onto the half-res RT
      // Puddle sprites have alpha=0 (hidden in scene), so temporarily set alpha=1 to draw
      // Coordinates scaled by RT_SCALE since RT is half-res (displayed at 2x)
      this.maskRT.clear();
      for (let i = 0; i < this.obstaclePool.length; i++) {
        const obs = this.obstaclePool[i];
        if (!obs.active) continue;
        if (obs.getData('type') !== ObstacleType.SLOW) continue;
        const ox = obs.x, oy = obs.y, osx = obs.scaleX, osy = obs.scaleY;
        obs.setPosition(ox * s, oy * s);
        obs.setScale(osx * s, osy * s);
        obs.setAlpha(1);
        this.maskRT.draw(obs);
        obs.setAlpha(0);
        obs.setPosition(ox, oy);
        obs.setScale(osx, osy);
      }
    }

    // Obstacles — Y-mirror around sprite bottom edge + per-type tunable offset
    const barrierPivot = TUNING.REFLECTION_OBJ_PIVOT_Y;
    const carPivot = TUNING.REFLECTION_CAR_PIVOT_Y;
    for (let i = 0; i < this.obstaclePool.length; i++) {
      const src = this.obstaclePool[i];
      if (!src.active || !src.visible) continue;
      const type = src.getData('type') as ObstacleType;
      if (type !== ObstacleType.CRASH && type !== ObstacleType.CAR) continue;

      const bottomY = src.y + src.displayHeight * (1 - src.originY);
      const anchor = bottomY + (type === ObstacleType.CAR ? carPivot : barrierPivot);
      const reflectedY = 2 * anchor - src.y;

      const texKey = type === ObstacleType.CRASH ? 'obstacle-reflection-alt' : src.texture.key;
      this.stamp.setTexture(texKey, src.frame.name);
      this.stamp.setDisplaySize(src.displayWidth * s, src.displayHeight * s);
      this.stamp.setFlipX(src.flipX);
      this.stamp.setFlipY(!src.flipY);
      this.stamp.setOrigin(src.originX, src.originY);
      this.stamp.setPosition(src.x * s, reflectedY * s);
      this.stamp.setAlpha(1);
      this.objectRT.draw(this.stamp);
      this.stamp.setAlpha(0);
    }

    // Player reflection
    if (this.playerSprite && this.playerSprite.visible) {
      const p = this.playerSprite;
      const playerPivot = TUNING.REFLECTION_PLAYER_PIVOT_Y;
      const bottomY = p.y + p.displayHeight * (1 - p.originY);
      const anchor = bottomY + playerPivot;
      const reflectedY = 2 * anchor - p.y;

      this.stamp.setTexture(p.texture.key, p.frame.name);
      this.stamp.setDisplaySize(p.displayWidth * s, p.displayHeight * s);
      this.stamp.setFlipX(p.flipX);
      this.stamp.setFlipY(!p.flipY);
      this.stamp.setOrigin(p.originX, p.originY);
      this.stamp.setPosition(p.x * s, reflectedY * s);
      this.stamp.setAlpha(1);
      this.objectRT.draw(this.stamp);
      this.stamp.setAlpha(0);
    }

    // Slash VFX reflection — mirrors rotation (negate angle) for natural reflection
    if (this.slashSprite && this.slashSprite.visible) {
      const sl = this.slashSprite;
      const slashPivot = TUNING.REFLECTION_SLASH_PIVOT_Y;
      const bottomY = sl.y + sl.displayHeight * (1 - sl.originY);
      const anchor = bottomY + slashPivot;
      const reflectedY = 2 * anchor - sl.y;

      this.stamp.setTexture(sl.texture.key, sl.frame.name);
      this.stamp.setDisplaySize(sl.displayWidth * s, sl.displayHeight * s);
      this.stamp.setFlipX(sl.flipX);
      this.stamp.setFlipY(!sl.flipY);
      this.stamp.setOrigin(sl.originX, sl.originY);
      this.stamp.setPosition(sl.x * s, reflectedY * s);
      this.stamp.setAngle(-sl.angle);
      this.stamp.setAlpha(1);
      this.objectRT.draw(this.stamp);
      this.stamp.setAlpha(0);
      this.stamp.setAngle(0);
    }

    // Pickup reflections (rockets + shields) — pivot around baseY (resting position),
    // so hover up = reflection moves down, hover down = reflection moves up
    const pickupPivot = TUNING.REFLECTION_PICKUP_PIVOT_Y;
    const pools = [this.pickupPool, this.shieldPool];
    for (let p = 0; p < pools.length; p++) {
      const pool = pools[p];
      for (let i = 0; i < pool.length; i++) {
        const src = pool[i];
        if (!src.active || !src.visible) continue;

        const baseY = (src.getData('baseY') as number) ?? src.y;
        const bottomY = baseY + src.displayHeight * (1 - src.originY);
        const anchor = bottomY + pickupPivot;
        const reflectedY = 2 * anchor - src.y;

        this.stamp.setTexture(src.texture.key, src.frame.name);
        this.stamp.setDisplaySize(src.displayWidth * s, src.displayHeight * s);
        this.stamp.setFlipX(src.flipX);
        this.stamp.setFlipY(!src.flipY);
        this.stamp.setOrigin(src.originX, src.originY);
        this.stamp.setPosition(src.x * s, reflectedY * s);
        this.stamp.setAlpha(1);
        this.objectRT.draw(this.stamp);
        this.stamp.setAlpha(0);
      }
    }

    // Rocket projectile reflections
    const rocketPivot = TUNING.REFLECTION_ROCKET_PIVOT_Y;
    for (let i = 0; i < this.rocketPool.length; i++) {
      const src = this.rocketPool[i];
      if (!src.active || !src.visible) continue;

      const bottomY = src.y + src.displayHeight * (1 - src.originY);
      const anchor = bottomY + rocketPivot;
      const reflectedY = 2 * anchor - src.y;

      this.stamp.setTexture(src.texture.key, src.frame.name);
      this.stamp.setDisplaySize(src.displayWidth * s, src.displayHeight * s);
      this.stamp.setFlipX(src.flipX);
      this.stamp.setFlipY(!src.flipY);
      this.stamp.setOrigin(src.originX, src.originY);
      this.stamp.setPosition(src.x * s, reflectedY * s);
      this.stamp.setAlpha(1);
      this.objectRT.draw(this.stamp);
      this.stamp.setAlpha(0);
    }
  }

  setPlayerSprite(sprite: Phaser.GameObjects.Sprite): void {
    this.playerSprite = sprite;
  }

  setSlashSprite(sprite: Phaser.GameObjects.Sprite): void {
    this.slashSprite = sprite;
  }

  setPickupPool(pool: readonly Phaser.GameObjects.Sprite[]): void {
    this.pickupPool = pool;
  }

  setShieldPool(pool: readonly Phaser.GameObjects.Sprite[]): void {
    this.shieldPool = pool;
  }

  setRocketPool(pool: readonly Phaser.GameObjects.Sprite[]): void {
    this.rocketPool = pool;
  }

  setVisible(visible: boolean): void {
    this.reflectionBgLayer.setVisible(visible);
    this.objectRT.setVisible(visible);
    this.puddleRoadOverlay.setVisible(visible);
    // Toggle road mask — when reflections are hidden, road should be solid
    if (visible) {
      this.applyMaskToChildren(this.roadTile, this.puddleMask);
      if (this.linesTile) this.applyMaskToChildren(this.linesTile, this.puddleMask);
      this.puddleRoadOverlay.setMask(this.puddleRoadMask);
    } else {
      this.clearMaskFromChildren(this.roadTile);
      if (this.linesTile) this.clearMaskFromChildren(this.linesTile);
      this.puddleRoadOverlay.clearMask();
    }
  }

  toggleMask(): void {
    this.maskEnabled = !this.maskEnabled;
    if (this.maskEnabled) {
      this.applyMaskToChildren(this.roadTile, this.puddleMask);
      if (this.linesTile) this.applyMaskToChildren(this.linesTile, this.puddleMask);
    } else {
      this.clearMaskFromChildren(this.roadTile);
      if (this.linesTile) this.clearMaskFromChildren(this.linesTile);
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

  /** Apply a BitmapMask to each child sprite in a Container (Container-level masks don't work reliably). */
  private applyMaskToChildren(container: Phaser.GameObjects.Container, mask: Phaser.Display.Masks.BitmapMask): void {
    for (const child of container.list) {
      (child as Phaser.GameObjects.Sprite).setMask(mask);
    }
  }

  /** Clear mask from each child sprite in a Container. */
  private clearMaskFromChildren(container: Phaser.GameObjects.Container): void {
    for (const child of container.list) {
      (child as Phaser.GameObjects.Sprite).clearMask();
    }
  }

  /** Create a nearest-neighbor downscaled copy of a texture for reflections. */
  private createDownscaledTexture(scene: Phaser.Scene, sourceKey: string, destKey: string): void {
    const srcTex = scene.textures.get(sourceKey);
    const srcImg = srcTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const srcW = (srcImg as HTMLImageElement).naturalWidth || (srcImg as HTMLCanvasElement).width;
    const srcH = (srcImg as HTMLImageElement).naturalHeight || (srcImg as HTMLCanvasElement).height;
    const w = Math.max(1, Math.round(srcW * REFL_TEX_SCALE));
    const h = Math.max(1, Math.round(srcH * REFL_TEX_SCALE));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // nearest neighbor
    ctx.drawImage(srcImg, 0, 0, w, h);
    scene.textures.addCanvas(destKey, canvas);
  }

  destroy(): void {
    this.clearMaskFromChildren(this.roadTile);
    if (this.linesTile) this.clearMaskFromChildren(this.linesTile);
    this.puddleRoadOverlay.clearMask();
    this.puddleRoadOverlay.destroy();
    this.reflectionBgLayer.destroy();
    for (const ref of this.reflectedLayers) {
      ref.destroy();
    }
    this.reflectedLayers.length = 0;
    this.reflectedSky.destroy();
    this.maskRT.destroy();
    this.objectRT.destroy();
    this.stamp.destroy();
  }
}
