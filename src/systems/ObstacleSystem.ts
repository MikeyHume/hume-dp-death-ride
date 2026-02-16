import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { SeededRNG } from '../util/rng';
import { GAME_MODE } from '../config/gameMode';

export enum ObstacleType {
  CRASH = 'crash',
  SLOW = 'slow',
  CAR = 'car',
}

export interface CollisionResult {
  crashed: boolean;
  slowOverlapping: boolean;
  hitX: number;
  hitY: number;
}

export interface RageHit {
  x: number;
  y: number;
  type: ObstacleType;
}

export interface LaneWarning {
  type: ObstacleType | 'pickup' | 'shield-pickup';
  textureKey: string;
  timeUntil: number;
}

export class ObstacleSystem {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Sprite[] = [];
  private explosions: Phaser.GameObjects.Sprite[] = [];
  private spawnTimer: number = 0;
  private nextSpawnInterval: number;

  // Lane geometry (computed once)
  private laneHeight: number;
  private laneCenters: number[];

  // Barrier display dimensions (computed from texture aspect ratio)
  private barrierDisplayW: number = 0;
  private barrierDisplayH: number = 0;

  // Reused collision result to avoid per-frame allocation
  private collisionResult: CollisionResult = { crashed: false, slowOverlapping: false, hitX: 0, hitY: 0 };
  private laneWarningResult: LaneWarning[][] = [];

  // Seeded RNG for deterministic obstacle patterns
  private rng: SeededRNG;

  // Optional callback fired when a car-vs-crash explosion occurs
  public onExplosion: (() => void) | null = null;

  // Optional callback fired when a pickup should spawn behind a CRASH obstacle
  public onPickupSpawn: ((x: number, y: number) => void) | null = null;

  // Optional callback fired when a shield pickup should spawn behind a CRASH obstacle
  public onShieldSpawn: ((x: number, y: number) => void) | null = null;

  // Car deck: shuffled list of car skin indices (1–20), dealt one at a time.
  // Shows every car once before reshuffling, never repeats back-to-back.
  private carDeck: number[] = [];
  private carDeckIndex: number = 0;
  private lastCarSkin: number = -1;

  // Debug: suppress explosion visuals (G key clean-screen mode)
  private suppressExplosions: boolean = false;

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.rng = new SeededRNG(seed);
    this.nextSpawnInterval = TUNING.SPAWN_INTERVAL_MAX;

    // Compute lane geometry
    const roadHeight = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    this.laneHeight = roadHeight / TUNING.LANE_COUNT;
    this.laneCenters = [];
    for (let i = 0; i < TUNING.LANE_COUNT; i++) {
      this.laneCenters.push(TUNING.ROAD_TOP_Y + this.laneHeight * i + this.laneHeight / 2);
    }

    // Compute barrier display dimensions from loaded texture
    const barrierTex = scene.textures.get('obstacle-crash').getSourceImage();
    this.barrierDisplayH = this.laneHeight / 0.75; // bottom 3/4 fills lane
    this.barrierDisplayW = this.barrierDisplayH * (barrierTex.width / barrierTex.height);

    // Pre-warm obstacle pool (sprites support both static textures and animations)
    for (let i = 0; i < 30; i++) {
      const obs = scene.add.sprite(0, 0, 'obstacle-crash');
      obs.setActive(false).setVisible(false);
      this.pool.push(obs);
    }

    // Pre-warm explosion pool
    for (let i = 0; i < 10; i++) {
      const expl = scene.add.sprite(0, 0, 'explosion');
      expl.setActive(false).setVisible(false);
      this.explosions.push(expl);
    }

    // Initial car deck shuffle
    this.shuffleCarDeck();
  }

  /** Shuffle all 20 car skins into a new deck, ensuring no back-to-back repeat. */
  private shuffleCarDeck(): void {
    this.carDeck = [];
    for (let i = 1; i <= TUNING.CAR_COUNT; i++) this.carDeck.push(i);
    // Fisher-Yates shuffle
    for (let i = this.carDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.carDeck[i];
      this.carDeck[i] = this.carDeck[j];
      this.carDeck[j] = tmp;
    }
    // If the first card matches the last card from the previous deck, swap it
    if (this.carDeck[0] === this.lastCarSkin && this.carDeck.length > 1) {
      const swapIdx = 1 + Math.floor(Math.random() * (this.carDeck.length - 1));
      const tmp = this.carDeck[0];
      this.carDeck[0] = this.carDeck[swapIdx];
      this.carDeck[swapIdx] = tmp;
    }
    this.carDeckIndex = 0;
  }

  /** Get the next car skin index from the deck. Reshuffles when exhausted. */
  private nextCarSkin(): number {
    if (this.carDeckIndex >= this.carDeck.length) {
      this.shuffleCarDeck();
    }
    const skin = this.carDeck[this.carDeckIndex++];
    this.lastCarSkin = skin;
    return skin;
  }

  update(dt: number, roadSpeed: number, difficultyFactor: number, rageFactor: number = 0): void {
    // Scroll all active obstacles left (speed depends on type)
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;

      const type = obs.getData('type') as ObstacleType;
      let scrollSpeed: number;
      if (type === ObstacleType.CAR) {
        scrollSpeed = roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR);
      } else {
        scrollSpeed = roadSpeed;
      }

      obs.x -= scrollSpeed * dt;

      // Slow zones sit just above road; everything else Y-sorts (lower = in front)
      if (type !== ObstacleType.SLOW) obs.setDepth(obs.y + 0.1);

      // Recycle if off-screen left
      const w = obs.getData('w') as number;
      if (obs.x < -w) {
        obs.setActive(false).setVisible(false);
        continue;
      }

      // Tick dying car linger timer
      if (obs.getData('dying')) {
        const timer = (obs.getData('deathTimer') as number) - dt;
        obs.setData('deathTimer', timer);
        if (timer <= 0) {
          obs.setActive(false).setVisible(false);
        }
      }
    }

    // Check car-vs-crash collisions
    this.checkCarCrashCollisions();

    // Update explosions (scroll at road speed, slower during rage so they're visible)
    const explosionSpeed = rageFactor > 0
      ? roadSpeed * TUNING.RAGE_EXPLOSION_SPEED_FACTOR
      : roadSpeed;
    for (let i = 0; i < this.explosions.length; i++) {
      const expl = this.explosions[i];
      if (!expl.active) continue;

      expl.x -= explosionSpeed * dt;
      expl.setDepth(expl.y + this.laneHeight / 2);
      const age = (expl.getData('age') as number) + dt;
      expl.setData('age', age);

      if (age >= TUNING.EXPLOSION_DURATION) {
        expl.setActive(false).setVisible(false);
        expl.stop();
      }
    }

    // Spawn timer (rage mode speeds up spawning, ramped smoothly)
    const spawnMultiplier = 1 + (TUNING.RAGE_SPAWN_RATE_MULTIPLIER - 1) * rageFactor;
    const spawnDt = dt * spawnMultiplier;
    this.spawnTimer += spawnDt;
    if (this.spawnTimer >= this.nextSpawnInterval) {
      this.spawnTimer = 0;
      this.spawnWave(difficultyFactor, rageFactor > 0, roadSpeed);
      let interval = Phaser.Math.Linear(
        TUNING.SPAWN_INTERVAL_MAX,
        TUNING.SPAWN_INTERVAL_MIN,
        difficultyFactor
      );
      // Wider spacing on lower quality tiers for more reaction time
      if (GAME_MODE.quality !== 'high') {
        interval *= 1.15;
      }
      this.nextSpawnInterval = interval;
    }
  }

  private checkCarCrashCollisions(): void {
    for (let c = 0; c < this.pool.length; c++) {
      const car = this.pool[c];
      if (!car.active || car.getData('type') !== ObstacleType.CAR || car.getData('dying')) continue;

      const carW = car.getData('w') as number;
      const carH = car.getData('h') as number;

      for (let s = 0; s < this.pool.length; s++) {
        const stat = this.pool[s];
        if (!stat.active || stat.getData('type') !== ObstacleType.CRASH) continue;

        const statW = stat.getData('w') as number;
        const statH = stat.getData('h') as number;

        // Use car's collision ellipse dimensions for Y overlap (prevents cross-lane triggers)
        const carCollH = carH * TUNING.CAR_COLLISION_HEIGHT_RATIO;
        const carCollCenterY = car.y + (carH - carCollH) / 2;
        const overlapX = Math.abs(car.x - stat.x) < (carW + statW) / 2;
        const overlapY = Math.abs(carCollCenterY - stat.y) < (carCollH + statH) / 2;

        if (overlapX && overlapY) {
          const ex = (car.x + stat.x) / 2;
          const ey = (car.y + stat.y) / 2;

          this.startCarDeath(car);
          stat.setActive(false).setVisible(false);

          this.spawnExplosion(ex, ey, TUNING.CAR_EXPLOSION_SCALE);
          if (this.onExplosion) this.onExplosion();
          break;
        }
      }
    }
  }

  private startCarDeath(car: Phaser.GameObjects.Sprite): void {
    car.setData('dying', true);
    car.setData('deathTimer', TUNING.CAR_DEATH_LINGER);
  }

  setSuppressExplosions(suppress: boolean): void {
    this.suppressExplosions = suppress;
  }

  spawnExplosion(x: number, y: number, scale: number = 1): void {
    if (this.suppressExplosions) return;
    let expl: Phaser.GameObjects.Sprite | null = null;
    for (let i = 0; i < this.explosions.length; i++) {
      if (!this.explosions[i].active) {
        expl = this.explosions[i];
        break;
      }
    }
    if (!expl) {
      expl = this.scene.add.sprite(0, 0, 'explosion');
      this.explosions.push(expl);
    }

    expl.setPosition(x, y);
    expl.setActive(true).setVisible(true);
    expl.setAlpha(1);
    const explSize = Math.round(TUNING.EXPLOSION_FRAME_SIZE * 2 / 3 * scale);
    expl.setDisplaySize(explSize, explSize);
    expl.setDepth(y + this.laneHeight / 2);
    expl.setData('age', 0);
    expl.play('explosion-play');
  }

  private spawnWave(difficultyFactor: number, rageActive: boolean = false, roadSpeed: number = 0): void {
    const count = 1 + Math.floor(difficultyFactor * (TUNING.MAX_OBSTACLES_PER_WAVE - 1));

    // Pick unique random lanes
    const availableLanes = [];
    for (let i = 0; i < TUNING.LANE_COUNT; i++) availableLanes.push(i);
    // Shuffle
    for (let i = availableLanes.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp: number = availableLanes[i];
      availableLanes[i] = availableLanes[j];
      availableLanes[j] = tmp;
    }

    const lanesToUse = availableLanes.slice(0, Math.min(count, TUNING.LANE_COUNT));

    for (let i = 0; i < lanesToUse.length; i++) {
      const laneIndex = lanesToUse[i];
      const y = this.laneCenters[laneIndex];

      // Three-way type selection (rage mode uses its own chances)
      const crashChance = rageActive
        ? TUNING.RAGE_CRASH_CHANCE
        : Phaser.Math.Linear(TUNING.CRASH_CHANCE_BASE, TUNING.CRASH_CHANCE_MAX, difficultyFactor);
      const carChance = rageActive
        ? TUNING.RAGE_CAR_CHANCE
        : Phaser.Math.Linear(TUNING.CAR_CHANCE_BASE, TUNING.CAR_CHANCE_MAX, difficultyFactor);
      const roll = this.rng.next();
      let type: ObstacleType;
      if (roll < crashChance) {
        type = ObstacleType.CRASH;
      } else if (roll < crashChance + carChance) {
        type = ObstacleType.CAR;
      } else {
        type = ObstacleType.SLOW;
      }

      // Spawn far enough off-screen for the longest warning window (cars get extra lead time and scroll slower)
      const carWarningDist = roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR) * (TUNING.LANE_WARNING_DURATION + TUNING.LANE_WARNING_CAR_EXTRA);
      const defaultWarningDist = roadSpeed * TUNING.LANE_WARNING_DURATION;
      const spawnMargin = Math.max(TUNING.OBSTACLE_SPAWN_MARGIN, defaultWarningDist, carWarningDist);
      this.spawn(TUNING.GAME_WIDTH + spawnMargin, y, type, laneIndex);
    }
  }

  private spawn(x: number, y: number, type: ObstacleType, laneIndex: number = 0): void {
    let obs: Phaser.GameObjects.Sprite | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        obs = this.pool[i];
        break;
      }
    }
    if (!obs) {
      obs = this.scene.add.sprite(0, 0, 'obstacle-crash');
      this.pool.push(obs);
    }

    let textureKey: string;
    let w: number;
    let h: number;

    switch (type) {
      case ObstacleType.CRASH:
        textureKey = 'obstacle-crash';
        w = this.barrierDisplayW;
        h = this.laneHeight; // collision stays in-lane
        obs.stop();
        break;
      case ObstacleType.CAR: {
        const skin = this.nextCarSkin();
        textureKey = `car-${String(skin).padStart(3, '0')}`;
        // Scale so collision ellipse height fills exactly one lane
        h = this.laneHeight / TUNING.CAR_COLLISION_HEIGHT_RATIO;
        w = h * (TUNING.CAR_FRAME_WIDTH / TUNING.CAR_FRAME_HEIGHT);
        break;
      }
      case ObstacleType.SLOW: {
        textureKey = 'obstacle-slow';
        const tiles = TUNING.SLOW_MIN_TILES + Math.floor(this.rng.next() * (TUNING.SLOW_MAX_TILES - TUNING.SLOW_MIN_TILES + 1));
        w = TUNING.SLOW_TILE_SIZE * tiles;
        h = this.laneHeight;
        obs.stop();
        break;
      }
    }

    obs.setTexture(textureKey);
    const obsScale = TUNING.OBSTACLE_DISPLAY_SCALE;
    const laneScale = TUNING.LANE_SCALES[laneIndex] ?? 1;
    if (type === ObstacleType.CRASH) {
      // Bottom 3/4 fills the lane, top 1/4 extends above — origin at center of bottom 3/4
      obs.setOrigin(0.5, 0.625);
      obs.setDisplaySize(w * obsScale * laneScale, this.barrierDisplayH * obsScale * laneScale);
    } else if (type === ObstacleType.CAR) {
      obs.setOrigin(0.5, 0.5);
      obs.setDisplaySize(w * TUNING.CAR_DISPLAY_SCALE * laneScale, h * TUNING.CAR_DISPLAY_SCALE * laneScale);
    } else {
      obs.setOrigin(0.5, 0.5);
      obs.setDisplaySize(w * obsScale * laneScale, h * obsScale * laneScale);
    }
    obs.setPosition(x, y);

    // Shift car sprite up so collision ellipse center aligns with lane center
    if (type === ObstacleType.CAR) {
      const collisionOffsetY = (h - h * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
      obs.y -= collisionOffsetY;
    }

    obs.setDepth(type === ObstacleType.SLOW ? 1 : obs.y + 0.1);
    obs.setActive(true).setVisible(true);
    obs.setData('type', type);
    obs.setData('w', w);
    obs.setData('h', h);
    obs.setData('dying', false);

    // Start animation for cars
    if (type === ObstacleType.CAR) {
      obs.play(`${textureKey}-drive`);
    }

    // Roll for pickup spawn behind CRASH obstacles
    if (type === ObstacleType.CRASH && this.onPickupSpawn) {
      if (this.rng.next() < TUNING.PICKUP_SPAWN_CHANCE) {
        const pickupX = x + w / 2 + TUNING.PICKUP_GAP + TUNING.PICKUP_DIAMETER / 2;
        this.onPickupSpawn(pickupX, y);
      }
    }

    // Roll for shield spawn behind CRASH obstacles (separate from rocket)
    if (type === ObstacleType.CRASH && this.onShieldSpawn) {
      if (this.rng.next() < TUNING.SHIELD_SPAWN_CHANCE) {
        const shieldX = x + w / 2 + TUNING.PICKUP_GAP * 2 + TUNING.SHIELD_DIAMETER;
        this.onShieldSpawn(shieldX, y);
      }
    }
  }

  /** Check collisions against player. Circle-vs-AABB for crash/slow, circle-vs-ellipse for cars. */
  checkCollision(playerX: number, playerY: number, playerRadius: number): CollisionResult {
    this.collisionResult.crashed = false;
    this.collisionResult.slowOverlapping = false;
    this.collisionResult.hitX = 0;
    this.collisionResult.hitY = 0;

    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;

      const type = obs.getData('type') as ObstacleType;
      if (obs.getData('dying')) continue;
      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;

      if (type === ObstacleType.CAR) {
        // Ellipse collision (2/3 height bottom-aligned, 8/10 width centered)
        const a = (obsW * TUNING.CAR_COLLISION_WIDTH_RATIO) / 2;  // semi-axis X
        const b = (obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2; // semi-axis Y
        const coy = (obsH - obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2; // bottom-align Y offset

        const dx = playerX - obs.x;
        const dy = playerY - (obs.y + coy);

        // Transform to unit-circle space (ellipse → circle of radius 1)
        const nx = dx / a;
        const ny = dy / b;
        const normDistSq = nx * nx + ny * ny;

        let colliding: boolean;
        if (normDistSq < 0.001) {
          colliding = true; // player center at/inside ellipse center
        } else {
          const normDist = Math.sqrt(normDistSq);
          // Player radius in normalized space along direction to player
          const dirX = nx / normDist;
          const dirY = ny / normDist;
          const normR = Math.sqrt(
            (playerRadius * dirX / a) * (playerRadius * dirX / a) +
            (playerRadius * dirY / b) * (playerRadius * dirY / b)
          );
          colliding = normDist < 1 + normR;
        }

        if (colliding) {
          this.collisionResult.crashed = true;
          this.collisionResult.hitX = obs.x;
          this.collisionResult.hitY = obs.y;
          this.startCarDeath(obs);
          this.spawnExplosion(obs.x, obs.y, TUNING.CAR_EXPLOSION_SCALE);
          if (this.onExplosion) this.onExplosion();
          return this.collisionResult;
        }
      } else {
        // Circle-vs-AABB collision for crash and slow obstacles
        const halfW = obsW / 2;
        const halfH = obsH / 2;
        const closestX = Math.max(obs.x - halfW, Math.min(playerX, obs.x + halfW));
        const closestY = Math.max(obs.y - halfH, Math.min(playerY, obs.y + halfH));

        const dx = playerX - closestX;
        const dy = playerY - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < playerRadius * playerRadius) {
          if (type === ObstacleType.CRASH) {
            this.collisionResult.crashed = true;
            this.collisionResult.hitX = obs.x;
            this.collisionResult.hitY = obs.y;
            obs.setActive(false).setVisible(false);
            return this.collisionResult;
          } else if (type === ObstacleType.SLOW) {
            this.collisionResult.slowOverlapping = true;
          }
        }
      }
    }

    return this.collisionResult;
  }

  /** Check if a slash hitbox overlaps any CRASH obstacle. Despawns + explodes on hit.
   *  Y overlap uses the player's collision circle so you can only slash obstacles in your lane.
   *  Returns the obstacle's X position on hit, or -1 if no hit. */
  checkSlashCollision(slashX: number, slashW: number, playerCollY: number, playerRadius: number): number {
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;
      if (obs.getData('type') !== ObstacleType.CRASH) continue;

      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;

      const overlapX = Math.abs(obs.x - slashX) < (obsW + slashW) / 2;
      const overlapY = Math.abs(obs.y - playerCollY) < (obsH / 2 + playerRadius);

      if (overlapX && overlapY) {
        const ex = obs.x;
        const ey = obs.y;
        obs.setActive(false).setVisible(false);
        this.spawnExplosion(ex, ey);
        if (this.onExplosion) this.onExplosion();
        return ex;
      }
    }
    return -1;
  }

  /** Check if a projectile circle overlaps any obstacle. Destroys the obstacle on hit.
   *  Works on all obstacle types (CRASH, SLOW, CAR).
   *  Returns { x, y } of hit obstacle, or null if no hit. */
  checkProjectileCollision(projX: number, projY: number, projRadius: number): { x: number; y: number } | null {
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;

      const type = obs.getData('type') as ObstacleType;
      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;
      let hit = false;

      if (type === ObstacleType.CAR) {
        const a = (obsW * TUNING.CAR_COLLISION_WIDTH_RATIO) / 2;
        const b = (obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        const coy = (obsH - obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        const dx = projX - obs.x;
        const dy = projY - (obs.y + coy);
        const nx = dx / a;
        const ny = dy / b;
        const normDistSq = nx * nx + ny * ny;
        if (normDistSq < 0.001) {
          hit = true;
        } else {
          const normDist = Math.sqrt(normDistSq);
          const dirX = nx / normDist;
          const dirY = ny / normDist;
          const normR = Math.sqrt(
            (projRadius * dirX / a) * (projRadius * dirX / a) +
            (projRadius * dirY / b) * (projRadius * dirY / b)
          );
          hit = normDist < 1 + normR;
        }
      } else {
        const halfW = obsW / 2;
        const halfH = obsH / 2;
        const closestX = Math.max(obs.x - halfW, Math.min(projX, obs.x + halfW));
        const closestY = Math.max(obs.y - halfH, Math.min(projY, obs.y + halfH));
        const dx = projX - closestX;
        const dy = projY - closestY;
        hit = dx * dx + dy * dy < projRadius * projRadius;
      }

      if (hit) {
        const ex = obs.x;
        const ey = obs.y;
        if (type === ObstacleType.CAR) {
          this.startCarDeath(obs);
        } else {
          obs.setActive(false).setVisible(false);
        }
        this.spawnExplosion(ex, ey, TUNING.ROCKET_EXPLOSION_SCALE);
        if (this.onExplosion) this.onExplosion();
        return { x: ex, y: ey };
      }
    }
    return null;
  }

  /** Rage mode collision: destroys any CRASH or CAR obstacle the player touches.
   *  Returns an array of hits with position and type info. */
  private rageHits: RageHit[] = [];
  checkRageCollision(playerX: number, playerY: number, playerRadius: number): RageHit[] {
    this.rageHits.length = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;

      const type = obs.getData('type') as ObstacleType;
      if (type === ObstacleType.SLOW) continue;
      if (obs.getData('dying')) continue;

      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;
      let colliding = false;

      if (type === ObstacleType.CAR) {
        const a = (obsW * TUNING.CAR_COLLISION_WIDTH_RATIO) / 2;
        const b = (obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        const coy = (obsH - obsH * TUNING.CAR_COLLISION_HEIGHT_RATIO) / 2;
        const dx = playerX - obs.x;
        const dy = playerY - (obs.y + coy);
        const nx = dx / a;
        const ny = dy / b;
        const normDistSq = nx * nx + ny * ny;
        if (normDistSq < 0.001) {
          colliding = true;
        } else {
          const normDist = Math.sqrt(normDistSq);
          const dirX = nx / normDist;
          const dirY = ny / normDist;
          const normR = Math.sqrt(
            (playerRadius * dirX / a) * (playerRadius * dirX / a) +
            (playerRadius * dirY / b) * (playerRadius * dirY / b)
          );
          colliding = normDist < 1 + normR;
        }
      } else {
        const halfW = obsW / 2;
        const halfH = obsH / 2;
        const closestX = Math.max(obs.x - halfW, Math.min(playerX, obs.x + halfW));
        const closestY = Math.max(obs.y - halfH, Math.min(playerY, obs.y + halfH));
        const dx = playerX - closestX;
        const dy = playerY - closestY;
        colliding = dx * dx + dy * dy < playerRadius * playerRadius;
      }

      if (colliding) {
        const ex = obs.x;
        const ey = obs.y;
        if (type === ObstacleType.CAR) {
          this.startCarDeath(obs);
          this.spawnExplosion(ex, ey, TUNING.CAR_EXPLOSION_SCALE);
        } else {
          obs.setActive(false).setVisible(false);
          this.spawnExplosion(ex, ey);
        }
        if (this.onExplosion) this.onExplosion();
        this.rageHits.push({ x: ex, y: ey, type });
      }
    }
    return this.rageHits;
  }

  /** Destroy all active obstacles on screen, spawning explosions for each. Returns hit count. */
  destroyAllOnScreen(scale: number = 1): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      const type = obs.getData('type') as ObstacleType;
      if (type === ObstacleType.SLOW) {
        obs.setActive(false).setVisible(false);
        count++;
        continue;
      }
      if (type === ObstacleType.CAR) {
        this.startCarDeath(obs);
        this.spawnExplosion(obs.x, obs.y, TUNING.CAR_EXPLOSION_SCALE);
      } else {
        this.spawnExplosion(obs.x, obs.y, scale);
        obs.setActive(false).setVisible(false);
      }
      if (this.onExplosion) this.onExplosion();
      count++;
    }
    return count;
  }

  /** Get all upcoming (off-screen right) obstacles per lane for warning indicators, sorted by arrival time. */
  getUpcomingByLane(roadSpeed: number): LaneWarning[][] {
    // Ensure result array is sized correctly
    while (this.laneWarningResult.length < TUNING.LANE_COUNT) this.laneWarningResult.push([]);
    for (let l = 0; l < TUNING.LANE_COUNT; l++) this.laneWarningResult[l].length = 0;

    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      if (obs.x <= TUNING.GAME_WIDTH) continue; // already on screen

      const type = obs.getData('type') as ObstacleType;
      const scrollSpeed = type === ObstacleType.CAR
        ? roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR)
        : roadSpeed;
      if (scrollSpeed <= 0) continue;

      const timeUntil = (obs.x - TUNING.GAME_WIDTH) / scrollSpeed;
      const maxDuration = type === ObstacleType.CAR
        ? TUNING.LANE_WARNING_DURATION + TUNING.LANE_WARNING_CAR_EXTRA
        : TUNING.LANE_WARNING_DURATION;
      if (timeUntil > maxDuration) continue;

      // Find closest lane
      let closestLane = 0;
      let closestDist = Infinity;
      for (let l = 0; l < TUNING.LANE_COUNT; l++) {
        const dist = Math.abs(obs.y - this.laneCenters[l]);
        if (dist < closestDist) {
          closestDist = dist;
          closestLane = l;
        }
      }

      this.laneWarningResult[closestLane].push({
        type,
        textureKey: obs.texture.key,
        timeUntil,
      });
    }

    // Sort each lane by arrival time (soonest first = rightmost bubble)
    for (let l = 0; l < TUNING.LANE_COUNT; l++) {
      this.laneWarningResult[l].sort((a, b) => a.timeUntil - b.timeUntil);
    }
    return this.laneWarningResult;
  }

  hideAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setVisible(false);
    }
    for (let i = 0; i < this.explosions.length; i++) {
      this.explosions[i].setVisible(false);
    }
  }

  setVisible(visible: boolean): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setVisible(visible && this.pool[i].active);
    }
    for (let i = 0; i < this.explosions.length; i++) {
      this.explosions[i].setVisible(visible && this.explosions[i].active);
    }
  }

  reset(seed?: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
      this.pool[i].stop();
    }
    for (let i = 0; i < this.explosions.length; i++) {
      this.explosions[i].setActive(false).setVisible(false);
      this.explosions[i].stop();
    }
    this.spawnTimer = 0;
    this.nextSpawnInterval = TUNING.SPAWN_INTERVAL_MAX;
    if (seed !== undefined) {
      this.rng.reset(seed);
    }
    // Reshuffle car deck for fresh playthrough
    this.shuffleCarDeck();
  }

  destroy(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].destroy();
    }
    this.pool.length = 0;
    for (let i = 0; i < this.explosions.length; i++) {
      this.explosions[i].destroy();
    }
    this.explosions.length = 0;
  }
}
