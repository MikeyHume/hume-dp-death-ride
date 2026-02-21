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

  // Puddle mask applied to the ROAD (inverted — cuts holes where puddles are)
  private maskRT: Phaser.GameObjects.RenderTexture;
  private puddleMask: Phaser.Display.Masks.BitmapMask;
  private puddleRoadOverlay: Phaser.GameObjects.TileSprite; // semi-transparent road inside puddles
  private puddleRoadMask: Phaser.Display.Masks.BitmapMask;  // non-inverted (visible inside puddles)
  private obstaclePool: readonly Phaser.GameObjects.Sprite[];
  private roadTile: Phaser.GameObjects.TileSprite;
  private linesTile: Phaser.GameObjects.TileSprite | null = null;
  private maskEnabled: boolean = true;

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
    roadTile: Phaser.GameObjects.TileSprite,
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

    this.reflectedSky = scene.add.image(sky.x, skyFinalY, sky.texture.key);
    this.reflectedSky.setOrigin(0.5, 0);
    this.reflectedSky.setFlipY(true);
    this.reflectedSky.setScale(sky.scaleX, sky.scaleY * scaleY);
    this.reflectedSky.setAlpha(alpha);
    this.reflectedSky.setBlendMode(Phaser.BlendModes.NORMAL);
    this.reflectedSky.setDepth(-0.5);

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
    // RT must be visible (willRender check), placed behind sky so player never sees it
    this.maskRT = scene.add.renderTexture(0, 0, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT);
    this.maskRT.setOrigin(0, 0);
    this.maskRT.setDepth(-100);
    this.puddleMask = this.maskRT.createBitmapMask();
    this.puddleMask.invertAlpha = true; // road visible where NO puddles, hidden where puddles are

    // Apply inverted mask to road — puddle holes reveal reflections underneath
    this.roadTile.setMask(this.puddleMask);
    // Lines tile gets same mask (set later via setLinesTile)

    // --- Puddle road overlay (semi-transparent road visible inside puddle holes) ---
    // Non-inverted mask from the same RT = visible only WHERE puddles are
    this.puddleRoadMask = this.maskRT.createBitmapMask();
    this.puddleRoadMask.invertAlpha = false;

    // Clone of the road tile — syncs tilePositionX each frame
    const roadH = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    const roadCY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;
    const tex = scene.textures.get('road-img').getSourceImage();
    const tileScale = roadH / tex.height;
    this.puddleRoadOverlay = scene.add.tileSprite(
      TUNING.GAME_WIDTH / 2, roadCY, TUNING.GAME_WIDTH, roadH, 'road-img'
    );
    this.puddleRoadOverlay.setTileScale(tileScale, tileScale);
    this.puddleRoadOverlay.setDepth(0.01); // just above road (depth 0)
    this.puddleRoadOverlay.setAlpha(TUNING.PUDDLE_ROAD_OPACITY);
    this.puddleRoadOverlay.setMask(this.puddleRoadMask);

    // --- Game object reflection RT (above bg reflections, below road) ---
    this.objectRT = scene.add.renderTexture(0, 0, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT);
    this.objectRT.setOrigin(0, 0);
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
  setLinesTile(linesTile: Phaser.GameObjects.TileSprite): void {
    this.linesTile = linesTile;
    if (this.maskEnabled) {
      this.linesTile.setMask(this.puddleMask);
    }
  }

  update(_roadSpeed: number, _dt: number): void {
    // Sync tile scroll positions from source layers
    for (let i = 0; i < this.reflectedLayers.length; i++) {
      this.reflectedLayers[i].tilePositionX = this.sourceLayers[i].tilePositionX;
    }

    // Sync sky X position
    this.reflectedSky.x = this.sourceSky.x;

    // Sync puddle road overlay scroll with main road
    this.puddleRoadOverlay.tilePositionX = this.roadTile.tilePositionX;
    this.puddleRoadOverlay.setAlpha(TUNING.PUDDLE_ROAD_OPACITY);

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

    // --- Draw reflected game objects onto objectRT ---
    this.objectRT.clear();

    // Obstacles — Y-mirror around sprite bottom edge + per-type tunable offset
    const barrierPivot = TUNING.REFLECTION_OBJ_PIVOT_Y;
    const carPivot = TUNING.REFLECTION_CAR_PIVOT_Y;
    for (let i = 0; i < this.obstaclePool.length; i++) {
      const src = this.obstaclePool[i];
      if (!src.active || !src.visible) continue;
      const type = src.getData('type') as ObstacleType;
      if (type !== ObstacleType.CRASH && type !== ObstacleType.CAR) continue;

      // Bottom edge of sprite accounts for origin and displayHeight (scales with lane)
      const bottomY = src.y + src.displayHeight * (1 - src.originY);
      const anchor = bottomY + (type === ObstacleType.CAR ? carPivot : barrierPivot);
      const reflectedY = 2 * anchor - src.y;

      const texKey = type === ObstacleType.CRASH ? 'obstacle-reflection-alt' : src.texture.key;
      this.stamp.setTexture(texKey, src.frame.name);
      this.stamp.setDisplaySize(src.displayWidth, src.displayHeight);
      this.stamp.setFlipX(src.flipX);
      this.stamp.setFlipY(!src.flipY);
      this.stamp.setOrigin(src.originX, src.originY);
      this.stamp.setPosition(src.x, reflectedY);
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
      this.stamp.setDisplaySize(p.displayWidth, p.displayHeight);
      this.stamp.setFlipX(p.flipX);
      this.stamp.setFlipY(!p.flipY);
      this.stamp.setOrigin(p.originX, p.originY);
      this.stamp.setPosition(p.x, reflectedY);
      this.stamp.setAlpha(1);
      this.objectRT.draw(this.stamp);
      this.stamp.setAlpha(0);
    }

    // Slash VFX reflection — mirrors rotation (negate angle) for natural reflection
    if (this.slashSprite && this.slashSprite.visible) {
      const s = this.slashSprite;
      const slashPivot = TUNING.REFLECTION_SLASH_PIVOT_Y;
      const bottomY = s.y + s.displayHeight * (1 - s.originY);
      const anchor = bottomY + slashPivot;
      const reflectedY = 2 * anchor - s.y;

      this.stamp.setTexture(s.texture.key, s.frame.name);
      this.stamp.setDisplaySize(s.displayWidth, s.displayHeight);
      this.stamp.setFlipX(s.flipX);
      this.stamp.setFlipY(!s.flipY);
      this.stamp.setOrigin(s.originX, s.originY);
      this.stamp.setPosition(s.x, reflectedY);
      this.stamp.setAngle(-s.angle);
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

        // Use baseY (rest position) for the anchor so hover motion mirrors naturally
        const baseY = (src.getData('baseY') as number) ?? src.y;
        const bottomY = baseY + src.displayHeight * (1 - src.originY);
        const anchor = bottomY + pickupPivot;
        const reflectedY = 2 * anchor - src.y;

        this.stamp.setTexture(src.texture.key, src.frame.name);
        this.stamp.setDisplaySize(src.displayWidth, src.displayHeight);
        this.stamp.setFlipX(src.flipX);
        this.stamp.setFlipY(!src.flipY);
        this.stamp.setOrigin(src.originX, src.originY);
        this.stamp.setPosition(src.x, reflectedY);
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
      this.stamp.setDisplaySize(src.displayWidth, src.displayHeight);
      this.stamp.setFlipX(src.flipX);
      this.stamp.setFlipY(!src.flipY);
      this.stamp.setOrigin(src.originX, src.originY);
      this.stamp.setPosition(src.x, reflectedY);
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
      this.roadTile.setMask(this.puddleMask);
      this.linesTile?.setMask(this.puddleMask);
      this.puddleRoadOverlay.setMask(this.puddleRoadMask);
    } else {
      this.roadTile.clearMask();
      this.linesTile?.clearMask();
      this.puddleRoadOverlay.clearMask();
    }
  }

  toggleMask(): void {
    this.maskEnabled = !this.maskEnabled;
    if (this.maskEnabled) {
      this.roadTile.setMask(this.puddleMask);
      this.linesTile?.setMask(this.puddleMask);
    } else {
      this.roadTile.clearMask();
      this.linesTile?.clearMask();
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
    this.roadTile.clearMask();
    this.linesTile?.clearMask();
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
