import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { SeededRNG } from '../util/rng';
import { GAME_MODE, DEVICE_PROFILE } from '../config/gameMode';

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
  hitType: ObstacleType | null;
  isEnemy: boolean;
}

export interface DestroyAllResult {
  obstacles: number;
  cars: number;
}

export interface RageHit {
  x: number;
  y: number;
  type: ObstacleType;
}

export interface KillZoneHit {
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
  private collisionResult: CollisionResult = { crashed: false, slowOverlapping: false, hitX: 0, hitY: 0, hitType: null, isEnemy: false };
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

  // Puddle orientation deck: 8 combos (flipX × flipY × rot180), must use 3 others before repeating
  private puddleOrientDeck: number[] = [];
  private puddleOrientIdx: number = 0;
  // Puddle size deck: 12 sizes, must use 6 others before repeating
  private puddleSizeDeck: number[] = [];
  private puddleSizeIdx: number = 0;

  // Debug: suppress explosion visuals (G key clean-screen mode)
  private suppressExplosions: boolean = false;

  // Course-driven mode: pause timer-based spawning when CourseRunner is active
  private timerPaused: boolean = false;

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
    // Initial puddle deck shuffles
    this.shufflePuddleOrientDeck();
    this.shufflePuddleSizeDeck();
  }

  /** Shuffle car skins into a new deck, ensuring no back-to-back repeat. */
  private shuffleCarDeck(): void {
    this.carDeck = [];
    const count = GAME_MODE.mobileMode ? DEVICE_PROFILE.carCount : TUNING.CAR_COUNT;
    for (let i = 1; i <= count; i++) this.carDeck.push(i);
    // Fisher-Yates shuffle
    for (let i = this.carDeck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp = this.carDeck[i];
      this.carDeck[i] = this.carDeck[j];
      this.carDeck[j] = tmp;
    }
    // If the first card matches the last card from the previous deck, swap it
    if (this.carDeck[0] === this.lastCarSkin && this.carDeck.length > 1) {
      const swapIdx = 1 + Math.floor(this.rng.next() * (this.carDeck.length - 1));
      const tmp = this.carDeck[0];
      this.carDeck[0] = this.carDeck[swapIdx];
      this.carDeck[swapIdx] = tmp;
    }
    this.carDeckIndex = 0;
  }

  /** Check if a lane has an active car that's still off-screen right. */
  private laneHasOffscreenCar(laneIndex: number): boolean {
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      if (obs.getData('type') !== ObstacleType.CAR) continue;
      if (obs.getData('lane') !== laneIndex) continue;
      if (obs.x > TUNING.GAME_WIDTH) return true;
    }
    return false;
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

  /** Shuffle puddle orientation deck: 8 combos, dealt in groups so 3 others appear before a repeat. */
  private shufflePuddleOrientDeck(): void {
    // 8 combos: bits 0=flipX, 1=flipY, 2=rot180
    this.puddleOrientDeck = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = this.puddleOrientDeck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp = this.puddleOrientDeck[i];
      this.puddleOrientDeck[i] = this.puddleOrientDeck[j];
      this.puddleOrientDeck[j] = tmp;
    }
    this.puddleOrientIdx = 0;
  }

  /** Get the next puddle orientation combo. Returns { flipX, flipY, angle }. */
  private nextPuddleOrientation(): { flipX: boolean; flipY: boolean; angle: number } {
    if (this.puddleOrientIdx >= this.puddleOrientDeck.length) {
      this.shufflePuddleOrientDeck();
    }
    const combo = this.puddleOrientDeck[this.puddleOrientIdx++];
    return {
      flipX: (combo & 1) !== 0,
      flipY: (combo & 2) !== 0,
      angle: (combo & 4) !== 0 ? 180 : 0,
    };
  }

  /** Shuffle puddle size deck: 12 sizes, dealt in groups so 6 others appear before a repeat. */
  private shufflePuddleSizeDeck(): void {
    this.puddleSizeDeck = [];
    for (let i = 1; i <= TUNING.SLOW_SIZE_COUNT; i++) this.puddleSizeDeck.push(i);
    for (let i = this.puddleSizeDeck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      const tmp = this.puddleSizeDeck[i];
      this.puddleSizeDeck[i] = this.puddleSizeDeck[j];
      this.puddleSizeDeck[j] = tmp;
    }
    this.puddleSizeIdx = 0;
  }

  /** Get the next puddle size (1–12). Reshuffles after dealing half the deck (6 unique before repeat). */
  private nextPuddleSize(): number {
    if (this.puddleSizeIdx >= Math.floor(this.puddleSizeDeck.length / 2)) {
      this.shufflePuddleSizeDeck();
    }
    return this.puddleSizeDeck[this.puddleSizeIdx++];
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
    // Skipped when timerPaused (course-driven rhythm mode uses CourseRunner instead)
    if (!this.timerPaused) {
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
        // Wider spacing on lower tiers for more reaction time
        if (GAME_MODE.renderTier !== 'desktop' && GAME_MODE.renderTier !== 'tablet') {
          interval *= 1.15;
        }
        this.nextSpawnInterval = interval;
      }
    }
  }

  private checkCarCrashCollisions(): void {
    const windowLeft = TUNING.RHYTHM_SWEET_SPOT_X - TUNING.RHYTHM_BONUS_ZONE_WIDTH / 2;
    for (let c = 0; c < this.pool.length; c++) {
      const car = this.pool[c];
      if (!car.active || car.getData('type') !== ObstacleType.CAR || car.getData('dying')) continue;

      // Enemy cars are protected from barriers until they've passed through the center timing window
      if (car.getData('enemy') && car.x >= windowLeft) continue;

      const carW = car.getData('w') as number;
      const carH = car.getData('h') as number;

      for (let s = 0; s < this.pool.length; s++) {
        const stat = this.pool[s];
        if (!stat.active || stat.getData('type') !== ObstacleType.CRASH) continue;

        // Never collide when both objects are off-screen (invisible deaths feel broken)
        if (car.x > TUNING.GAME_WIDTH && stat.x > TUNING.GAME_WIDTH) continue;

        const statW = stat.getData('w') as number;
        const statH = stat.getData('h') as number;

        // Use car's collision rect for Y overlap (prevents cross-lane triggers)
        const carCollW = carW * TUNING.CAR_COLLISION_W;
        const carCollH = carH * TUNING.CAR_COLLISION_H;
        const overlapX = Math.abs((car.x + TUNING.CAR_COLLISION_OFFSET_X) - stat.x) < (carCollW + statW) / 2;
        const overlapY = Math.abs((car.y + TUNING.CAR_COLLISION_OFFSET_Y) - stat.y) < (carCollH + statH) / 2;

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

      // Avoid spawning CRASH in a lane with an off-screen car (would collide before reaching player)
      if (type === ObstacleType.CRASH && this.laneHasOffscreenCar(laneIndex)) {
        type = ObstacleType.SLOW;
      }

      // Spawn far enough off-screen for the longest warning window (cars get extra lead time and scroll slower)
      const carWarningDist = roadSpeed * (1 - TUNING.CAR_SPEED_FACTOR) * (TUNING.LANE_WARNING_DURATION + TUNING.LANE_WARNING_CAR_EXTRA);
      const defaultWarningDist = roadSpeed * TUNING.LANE_WARNING_DURATION;
      const spawnMargin = Math.max(TUNING.OBSTACLE_SPAWN_MARGIN, defaultWarningDist, carWarningDist);
      this.spawn(TUNING.GAME_WIDTH + spawnMargin, y, type, laneIndex);
    }
  }

  private spawn(x: number, y: number, type: ObstacleType, laneIndex: number = 0): Phaser.GameObjects.Sprite | null {
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
        h = this.laneHeight / TUNING.CAR_COLLISION_H;
        w = h * (TUNING.CAR_FRAME_WIDTH / TUNING.CAR_FRAME_HEIGHT);
        break;
      }
      case ObstacleType.SLOW: {
        const sizeIdx = this.nextPuddleSize();
        textureKey = 'puddle-tex';
        w = TUNING.SLOW_BASE_WIDTH * sizeIdx;
        h = this.laneHeight;
        obs.stop();
        break;
      }
    }

    obs.setTexture(textureKey);
    // Tint puddles blue; randomize flip/rotation for visual variety
    if (type === ObstacleType.SLOW) {
      obs.setTint(TUNING.SLOW_COLOR);
      obs.setAlpha(0); // hidden — reflection system handles puddle visuals
      const orient = this.nextPuddleOrientation();
      obs.setFlipX(orient.flipX);
      obs.setFlipY(orient.flipY);
      obs.setAngle(orient.angle);
    } else {
      obs.clearTint();
      obs.setAlpha(1);
      obs.setFlipX(false);
      obs.setFlipY(false);
      obs.setAngle(0);
    }
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

    // Shift car sprite up so collision rect center aligns with lane center
    if (type === ObstacleType.CAR) {
      const spriteShift = (h - h * TUNING.CAR_COLLISION_H) / 2;
      obs.y -= spriteShift;
    }

    obs.setDepth(type === ObstacleType.SLOW ? 1 : obs.y + 0.1);
    obs.setActive(true).setVisible(true);
    obs.setData('type', type);
    obs.setData('w', w);
    obs.setData('h', h);
    obs.setData('lane', laneIndex);
    obs.setData('dying', false);
    obs.setData('guardian', false);
    obs.setData('enemy', false);
    // Clear any leftover FX from previous pooled use (e.g. enemy car glow)
    if (obs.preFX) obs.preFX.clear();

    // Start animation for cars (if spritesheet anim exists)
    if (type === ObstacleType.CAR && this.scene.anims.exists(`${textureKey}-drive`)) {
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
    return obs;
  }

  /** Pause/resume timer-based spawning (used by rhythm mode CourseRunner). */
  public setTimerPaused(paused: boolean): void {
    this.timerPaused = paused;
  }

  /**
   * Spawn a single obstacle or pickup from course data.
   * Maps course type strings to ObstacleType / pickup callbacks.
   * Called by CourseRunner for each event.
   */
  public spawnFromCourse(type: string, laneIndex: number, roadSpeed: number): void {
    const y = this.laneCenters[laneIndex];
    // Compute spawn X far enough off-screen for travel time
    const defaultWarningDist = roadSpeed * TUNING.LANE_WARNING_DURATION;
    const spawnX = TUNING.GAME_WIDTH + Math.max(TUNING.OBSTACLE_SPAWN_MARGIN, defaultWarningDist);

    switch (type) {
      case 'crash':
        this.spawn(spawnX, y, ObstacleType.CRASH, laneIndex);
        break;
      case 'car':
        this.spawn(spawnX, y, ObstacleType.CAR, laneIndex);
        break;
      case 'slow':
        this.spawn(spawnX, y, ObstacleType.SLOW, laneIndex);
        break;
      case 'pickup_ammo':
        if (this.onPickupSpawn) this.onPickupSpawn(spawnX, y);
        break;
      case 'pickup_shield':
        if (this.onShieldSpawn) this.onShieldSpawn(spawnX, y);
        break;
      case 'car_crash_beat':
        // Spawn a CRASH that will catch up to a car in the same lane
        this.spawn(spawnX, y, ObstacleType.CRASH, laneIndex);
        break;
      case 'guardian': {
        // Guardian: tinted CRASH that protects a pickup — proximity scoring on slash
        const g = this.spawn(spawnX, y, ObstacleType.CRASH, laneIndex);
        if (g) {
          g.setData('guardian', true);
          g.setTint(TUNING.RHYTHM_GUARDIAN_TINT);
        }
        break;
      }
      case 'enemy_car': {
        // Enemy car: timed to reach center on-beat, player should rocket/shield it
        const ec = this.spawn(spawnX, y, ObstacleType.CAR, laneIndex);
        if (ec) {
          ec.setData('enemy', true);
          if (ec.preFX) {
            ec.preFX.addGlow(
              TUNING.RHYTHM_ENEMY_CAR_GLOW_COLOR,
              TUNING.RHYTHM_ENEMY_CAR_GLOW_OUTER,
              TUNING.RHYTHM_ENEMY_CAR_GLOW_INNER,
              false,
              0.5,
              16
            );
          }
        }
        break;
      }
    }
  }

  /** Check collisions against player. Circle-vs-AABB for crash/slow, circle-vs-ellipse for cars. */
  checkCollision(playerX: number, playerY: number, playerHalfW: number, playerHalfH: number): CollisionResult {
    this.collisionResult.crashed = false;
    this.collisionResult.slowOverlapping = false;
    this.collisionResult.hitX = 0;
    this.collisionResult.hitY = 0;
    this.collisionResult.hitType = null;
    this.collisionResult.isEnemy = false;

    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;

      const type = obs.getData('type') as ObstacleType;
      if (obs.getData('dying')) continue;
      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;

      if (type === ObstacleType.CAR) {
        // Player rect vs car rect (AABB)
        const halfW = (obsW * TUNING.CAR_COLLISION_W) / 2;
        const halfH = (obsH * TUNING.CAR_COLLISION_H) / 2;

        const overlapX = Math.abs(playerX - (obs.x + TUNING.CAR_COLLISION_OFFSET_X)) < (halfW + playerHalfW);
        const overlapY = Math.abs(playerY - (obs.y + TUNING.CAR_COLLISION_OFFSET_Y)) < (halfH + playerHalfH);

        if (overlapX && overlapY) {
          this.collisionResult.crashed = true;
          this.collisionResult.hitX = obs.x;
          this.collisionResult.hitY = obs.y;
          this.collisionResult.hitType = ObstacleType.CAR;
          this.collisionResult.isEnemy = !!obs.getData('enemy');
          this.startCarDeath(obs);
          this.spawnExplosion(obs.x, obs.y, TUNING.CAR_EXPLOSION_SCALE);
          if (this.onExplosion) this.onExplosion();
          return this.collisionResult;
        }
      } else if (type === ObstacleType.SLOW) {
        // Player rect vs puddle rect (AABB)
        const overlapX = Math.abs(playerX - obs.x) < (obsW / 2 + playerHalfW);
        const overlapY = Math.abs(playerY - obs.y) < (obsH / 2 + playerHalfH);
        if (overlapX && overlapY) {
          this.collisionResult.slowOverlapping = true;
        }
      } else {
        // AABB-vs-AABB collision for crash obstacles
        const overlapX = Math.abs(playerX - obs.x) < (obsW / 2 + playerHalfW);
        const overlapY = Math.abs(playerY - obs.y) < (obsH / 2 + playerHalfH);

        if (overlapX && overlapY) {
          this.collisionResult.crashed = true;
          this.collisionResult.hitX = obs.x;
          this.collisionResult.hitY = obs.y;
          this.collisionResult.hitType = ObstacleType.CRASH;
          obs.setActive(false).setVisible(false);
          return this.collisionResult;
        }
      }
    }

    return this.collisionResult;
  }

  /** Check if a slash hitbox overlaps any CRASH obstacle. Despawns + explodes on hit.
   *  Y overlap uses the player's collision circle so you can only slash obstacles in your lane.
   *  Returns the obstacle's X position on hit, or -1 if no hit. */
  private lastSlashWasGuardian = false;
  checkSlashCollision(slashX: number, slashW: number, playerCollY: number, playerHalfH: number): number {
    this.lastSlashWasGuardian = false;
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;
      if (obs.getData('type') !== ObstacleType.CRASH) continue;

      const obsW = obs.getData('w') as number;
      const obsH = obs.getData('h') as number;

      const overlapX = Math.abs(obs.x - slashX) < (obsW + slashW) / 2;
      const overlapY = Math.abs(obs.y - playerCollY) < (obsH / 2 + playerHalfH);

      if (overlapX && overlapY) {
        const ex = obs.x;
        const ey = obs.y;
        this.lastSlashWasGuardian = !!obs.getData('guardian');
        obs.setActive(false).setVisible(false);
        this.spawnExplosion(ex, ey);
        if (this.onExplosion) this.onExplosion();
        return ex;
      }
    }
    return -1;
  }

  /** True if the last obstacle destroyed by checkSlashCollision was a guardian */
  wasLastSlashGuardian(): boolean {
    return this.lastSlashWasGuardian;
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

      if (type === ObstacleType.CAR || type === ObstacleType.SLOW) {
        // Projectile circle vs car/puddle rect (AABB)
        const halfW = type === ObstacleType.CAR ? (obsW * TUNING.CAR_COLLISION_W) / 2 : obsW / 2;
        const halfH = type === ObstacleType.CAR ? (obsH * TUNING.CAR_COLLISION_H) / 2 : obsH / 2;
        const cx = obs.x + (type === ObstacleType.CAR ? TUNING.CAR_COLLISION_OFFSET_X : 0);
        const cy = obs.y + (type === ObstacleType.CAR ? TUNING.CAR_COLLISION_OFFSET_Y : 0);
        const closestX = Math.max(cx - halfW, Math.min(projX, cx + halfW));
        const closestY = Math.max(cy - halfH, Math.min(projY, cy + halfH));
        const dx = projX - closestX;
        const dy = projY - closestY;
        hit = dx * dx + dy * dy < projRadius * projRadius;
      } else {
        // AABB for crash obstacles
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
  checkRageCollision(playerX: number, playerY: number, playerHalfW: number, playerHalfH: number): RageHit[] {
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
        // Rage player rect vs car rect (AABB)
        const halfW = (obsW * TUNING.CAR_COLLISION_W) / 2;
        const halfH = (obsH * TUNING.CAR_COLLISION_H) / 2;
        const overlapX = Math.abs(playerX - (obs.x + TUNING.CAR_COLLISION_OFFSET_X)) < (halfW + playerHalfW);
        const overlapY = Math.abs(playerY - (obs.y + TUNING.CAR_COLLISION_OFFSET_Y)) < (halfH + playerHalfH);
        colliding = overlapX && overlapY;
      } else {
        const overlapX = Math.abs(playerX - obs.x) < (obsW / 2 + playerHalfW);
        const overlapY = Math.abs(playerY - obs.y) < (obsH / 2 + playerHalfH);
        colliding = overlapX && overlapY;
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

  /** Kill zone: destroy obstacles whose left edge crosses the kill zone X.
   *  Skips SLOW (puddles) and dying obstacles. Returns hits for FX. */
  private killZoneHits: KillZoneHit[] = [];
  checkKillZone(killZoneX: number): KillZoneHit[] {
    this.killZoneHits.length = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active) continue;

      const type = obs.getData('type') as ObstacleType;
      if (type === ObstacleType.SLOW) continue; // puddles scroll off normally
      if (obs.getData('dying')) continue;

      const w = obs.getData('w') as number;
      // Check if obstacle's left edge has crossed the kill zone line
      if (obs.x - w / 2 <= killZoneX) {
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
        this.killZoneHits.push({ x: ex, y: ey, type });
      }
    }
    return this.killZoneHits;
  }

  /** Destroy all active obstacles on screen, spawning explosions for each. Returns hit count. */
  destroyAllOnScreen(scale: number = 1): DestroyAllResult {
    const result: DestroyAllResult = { obstacles: 0, cars: 0 };
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      const type = obs.getData('type') as ObstacleType;
      if (type === ObstacleType.SLOW) continue;
      if (type === ObstacleType.CAR) {
        this.startCarDeath(obs);
        this.spawnExplosion(obs.x, obs.y, TUNING.CAR_EXPLOSION_SCALE);
        result.cars++;
      } else {
        this.spawnExplosion(obs.x, obs.y, scale);
        obs.setActive(false).setVisible(false);
        result.obstacles++;
      }
      if (this.onExplosion) this.onExplosion();
    }
    return result;
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
    // Reshuffle decks for fresh playthrough
    this.shuffleCarDeck();
    this.shufflePuddleOrientDeck();
    this.shufflePuddleSizeDeck();
  }

  /** Return the lane index (0-based) closest to the given Y position */
  getClosestLane(y: number): number {
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < this.laneCenters.length; i++) {
      const dist = Math.abs(y - this.laneCenters[i]);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  /** Lane-based projectile collision: hits the nearest obstacle in the given lane
   *  whose center X the rocket has reached. Destroys the obstacle on hit. */
  checkLaneProjectileCollision(rocketX: number, laneIndex: number): { x: number; y: number; type: ObstacleType; isEnemy: boolean } | null {
    let bestObs: Phaser.GameObjects.Sprite | null = null;
    let bestDist = Infinity;

    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      if (obs.getData('type') === ObstacleType.SLOW) continue;

      // Use the lane stored at spawn time (not Y, which may be shifted for cars)
      const obsLane = obs.getData('lane') as number;
      if (obsLane !== laneIndex) continue;

      // Rocket must have reached the obstacle's center X
      if (rocketX < obs.x) continue;

      // Pick the closest one the rocket just passed (smallest overshoot)
      const dist = rocketX - obs.x;
      if (dist < bestDist) {
        bestDist = dist;
        bestObs = obs;
      }
    }

    if (bestObs) {
      const ex = bestObs.x;
      const ey = bestObs.y;
      const type = bestObs.getData('type') as ObstacleType;
      const isEnemy = !!bestObs.getData('enemy');
      if (type === ObstacleType.CAR) {
        this.startCarDeath(bestObs);
      } else {
        bestObs.setActive(false).setVisible(false);
      }
      this.spawnExplosion(ex, ey, TUNING.ROCKET_EXPLOSION_SCALE);
      if (this.onExplosion) this.onExplosion();
      return { x: ex, y: ey, type, isEnemy };
    }
    return null;
  }

  /** Expose pool for debug collision rendering */
  getPool(): readonly Phaser.GameObjects.Sprite[] {
    return this.pool;
  }

  /** Return nearest active obstacle relative to player position (for test sensors) */
  getNearestThreat(playerX: number, playerY: number): { dx: number; dy: number; type: string } | null {
    let best: { dx: number; dy: number; type: string } | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.pool.length; i++) {
      const obs = this.pool[i];
      if (!obs.active || obs.getData('dying')) continue;
      const dx = obs.x - playerX;
      const dy = obs.y - playerY;
      // Only consider obstacles ahead of or near the player
      if (dx < -100) continue;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { dx, dy, type: (obs.getData('type') as string) || 'unknown' };
      }
    }
    return best;
  }

  getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) count++;
    }
    return count;
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
