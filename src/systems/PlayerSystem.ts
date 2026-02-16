import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { InputSystem } from './InputSystem';

type SpeedupState = 'idle' | 'intro' | 'loop' | 'outro';

export class PlayerSystem {
  private scene: Phaser.Scene;
  private input: InputSystem;
  private sprite: Phaser.GameObjects.Sprite;

  private playerSpeed: number = 0;  // the bike's forward speed
  private alive: boolean = true;
  private attacking: boolean = false;
  private rocketLaunching: boolean = false;
  private rocketFireCallback: (() => void) | null = null;
  private poweredUp: boolean = false;
  private renderOffsetX: number = 0; // visual-only X shift (attack sprite alignment)
  private renderOffsetY: number = 0; // visual-only Y shift (powered-up alignment)
  private invincible: boolean = false;
  private spectator: boolean = false;
  private baseSpriteScaleX: number = 1; // base scale from setDisplaySize (before perspective)
  private baseSpriteScaleY: number = 1;

  // Smooth speed model state
  private speedMultiplier: number = 0;  // current smooth multiplier (0 to MAX)
  private tapPressure: number = 0;      // accumulated tap intensity (decays over time)
  private graceTimer: number = 0;       // countdown before decel after releasing space

  // Attack cooldown (blocks all attacks while > 0)
  private attackCooldown: number = 0;

  // Speed-up animation state
  private speedupState: SpeedupState = 'idle';
  private noTapTimer: number = 0;       // time since last space tap

  constructor(scene: Phaser.Scene, input: InputSystem) {
    this.scene = scene;
    this.input = input;

    this.sprite = scene.add.sprite(
      TUNING.PLAYER_START_X,
      (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2,
      'player-ride'
    );

    // Scale sprite to PLAYER_DISPLAY_HEIGHT, preserving frame aspect ratio
    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const displayW = displayH * (TUNING.PLAYER_FRAME_WIDTH / TUNING.PLAYER_FRAME_HEIGHT);
    this.setBaseDisplaySize(displayW, displayH);

    this.sprite.play('player-ride');
  }

  update(dt: number, roadSpeed: number, baseRoadSpeed?: number): void {
    if (!this.alive) return;

    // Tick attack cooldown
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Strip last frame's render offsets so all logic uses the clean position
    this.sprite.x -= this.renderOffsetX;
    this.sprite.y -= this.renderOffsetY;

    // Vertical: arrow keys (incremental) or mouse Y (absolute)
    // Arrow keys take over; mouse reclaims when moved
    if (this.input.isUsingArrows()) {
      const arrowDir = this.input.getArrowYDirection();
      if (arrowDir !== 0) {
        const halfH = TUNING.PLAYER_DISPLAY_HEIGHT / 2;
        this.sprite.y = Phaser.Math.Clamp(
          this.sprite.y + arrowDir * TUNING.PLAYER_ARROW_SPEED * dt,
          TUNING.ROAD_TOP_Y - TUNING.PLAYER_TOP_Y_EXTEND,
          TUNING.ROAD_BOTTOM_Y - halfH
        );
      }
    } else {
      // Smooth exponential approach to mouse Y (no snapping)
      const targetY = this.input.getTargetY();
      const yDiff = targetY - this.sprite.y;
      if (Math.abs(yDiff) < 0.5) {
        this.sprite.y = targetY;
      } else {
        this.sprite.y += yDiff * (1 - Math.exp(-TUNING.PLAYER_MOUSE_FOLLOW_RATE * dt));
      }
    }

    // Use base road speed for speed model when provided (rage mode).
    const controlSpeed = baseRoadSpeed ?? roadSpeed;

    // --- Smooth multiplier-based speed model ---
    // speedMultiplier: 0 = stopped, 1 = matching road, MAX = fastest
    const spaceHeld = this.input.isSpaceHeld();
    const tapped = this.input.getSpeedTap();

    // Tap pressure: each tap adds pressure, decays over time
    if (tapped) {
      this.tapPressure = Math.min(this.tapPressure + TUNING.TAP_PRESSURE_PER_TAP, TUNING.TAP_PRESSURE_MAX);
    }
    this.tapPressure = Math.max(0, this.tapPressure - TUNING.TAP_PRESSURE_DECAY * dt);

    // Determine target multiplier
    let targetMultiplier = 0;
    if (spaceHeld || tapped) {
      // Reset grace timer whenever space is active
      this.graceTimer = TUNING.RELEASE_GRACE;
      if (this.tapPressure > 0.01) {
        // Tapping: target scales from HOLD up to MAX based on pressure
        const tapBoost = this.tapPressure / TUNING.TAP_PRESSURE_MAX;
        targetMultiplier = TUNING.HOLD_MULTIPLIER + tapBoost * (TUNING.MAX_SPEED_MULTIPLIER - TUNING.HOLD_MULTIPLIER);
      } else {
        // Pure hold: match road speed
        targetMultiplier = TUNING.HOLD_MULTIPLIER;
      }
    } else {
      // Space released
      if (this.graceTimer > 0) {
        // Grace period: maintain current multiplier
        this.graceTimer -= dt;
        targetMultiplier = this.speedMultiplier;
      } else {
        // Decelerate to 0
        targetMultiplier = 0;
      }
    }

    // Smooth exponential approach toward target
    const diff = targetMultiplier - this.speedMultiplier;
    if (Math.abs(diff) < 0.001) {
      this.speedMultiplier = targetMultiplier;
    } else if (diff > 0) {
      // Accelerating
      this.speedMultiplier += diff * (1 - Math.exp(-TUNING.ACCEL_RATE * dt));
    } else if (targetMultiplier === 0) {
      // Decelerating to stop
      this.speedMultiplier += diff * (1 - Math.exp(-TUNING.DECEL_RATE * dt));
    } else {
      // Slowing down from tap boost back to hold speed
      this.speedMultiplier += diff * (1 - Math.exp(-TUNING.ACCEL_DOWN_RATE * dt));
    }

    // Clamp
    this.speedMultiplier = Phaser.Math.Clamp(this.speedMultiplier, 0, TUNING.MAX_SPEED_MULTIPLIER);

    // Convert multiplier to actual player speed
    this.playerSpeed = controlSpeed * this.speedMultiplier;

    // --- Speed-up animation state machine ---
    this.updateSpeedupAnimation(dt, tapped);

    // --- Horizontal drift ---
    if (this.spectator) {
      // Spectator: lock X to road center, force speed to match road
      this.sprite.x = TUNING.PLAYER_START_X;
      this.speedMultiplier = TUNING.HOLD_MULTIPLIER;
      this.playerSpeed = controlSpeed * this.speedMultiplier;
    } else {
      // At multiplier 1.0: stays put. Below 1.0: drifts left. Above 1.0: moves right.
      const speedDiff = this.playerSpeed - controlSpeed;
      this.sprite.x += speedDiff * dt;
    }

    // Y-based depth: lower on screen = closer to camera = renders in front
    this.sprite.setDepth(this.sprite.y + 0.2);

    // Death check at boundaries (clamp always, kill only if not invincible)
    if (this.sprite.x <= TUNING.PLAYER_MIN_X) {
      this.sprite.x = TUNING.PLAYER_MIN_X;
      if (!this.invincible) this.kill();
    } else if (this.sprite.x >= TUNING.PLAYER_MAX_X) {
      this.sprite.x = TUNING.PLAYER_MAX_X;
      if (!this.invincible) this.kill();
    }

    // Reapply render offsets for display (visual only, stripped next frame)
    const inSpeedup = this.speedupState !== 'idle';
    this.renderOffsetX = this.rocketLaunching ? TUNING.ROCKET_LAUNCHER_OFFSET_X : (this.attacking ? TUNING.PLAYER_ATTACK_OFFSET_X : (this.poweredUp ? TUNING.POWERED_OFFSET_X : (inSpeedup ? TUNING.SPEEDUP_OFFSET_X : 0)));
    this.renderOffsetY = this.rocketLaunching ? TUNING.ROCKET_LAUNCHER_OFFSET_Y : (this.attacking ? 0 : (this.poweredUp ? TUNING.POWERED_OFFSET_Y : (inSpeedup ? TUNING.SPEEDUP_OFFSET_Y : 0)));
    this.sprite.x += this.renderOffsetX;
    this.sprite.y += this.renderOffsetY;

    // Apply perspective scale based on Y position
    const perspScale = this.getPerspectiveScale();
    this.sprite.setScale(this.baseSpriteScaleX * perspScale, this.baseSpriteScaleY * perspScale);
  }

  /** Manage speed-up animation transitions based on input and speed state */
  private updateSpeedupAnimation(dt: number, tapped: boolean): void {
    // Speed-up animation is suppressed during attack or powered-up (rage)
    if (this.attacking || this.poweredUp) return;

    // Only actual taps keep the speed-up alive (holding space does not)
    if (tapped) {
      this.noTapTimer = 0;
    } else {
      this.noTapTimer += dt;
    }

    const timedOut = this.noTapTimer >= TUNING.SPEEDUP_NO_TAP_TIMEOUT;

    switch (this.speedupState) {
      case 'idle': {
        // Start speed-up intro on first tap
        if (tapped) {
          this.speedupState = 'intro';
          this.sprite.removeAllListeners('animationcomplete');
          this.sprite.play('player-speedup-intro');
          this.applySpeedupDisplaySize();

          this.sprite.once('animationcomplete', () => {
            if (this.speedupState === 'intro') {
              this.speedupState = 'loop';
              this.sprite.play('player-speedup-loop');
            }
          });
        }
        break;
      }
      case 'intro': {
        // Stop tapping → play outro
        if (timedOut) {
          this.transitionToOutro();
        }
        break;
      }
      case 'loop': {
        // Stop tapping → play outro
        if (timedOut) {
          this.transitionToOutro();
        }
        break;
      }
      case 'outro': {
        // Outro plays to completion via animationcomplete listener
        // If player taps again during outro, restart speed-up
        if (tapped) {
          this.speedupState = 'intro';
          this.sprite.removeAllListeners('animationcomplete');
          this.sprite.play('player-speedup-intro');
          this.applySpeedupDisplaySize();

          this.sprite.once('animationcomplete', () => {
            if (this.speedupState === 'intro') {
              this.speedupState = 'loop';
              this.sprite.play('player-speedup-loop');
            }
          });
        }
        break;
      }
    }
  }

  /** Transition from intro/loop to outro, then back to ride */
  private transitionToOutro(): void {
    this.speedupState = 'outro';
    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.play('player-speedup-outro');

    this.sprite.once('animationcomplete', () => {
      if (this.speedupState === 'outro') {
        this.speedupState = 'idle';
        this.sprite.play('player-ride');
        this.applyRideDisplaySize();
      }
    });
  }

  /** Apply display size for speed-up spritesheet frames */
  private applySpeedupDisplaySize(): void {
    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const s = TUNING.SPEEDUP_SCALE;
    const speedupW = displayH * s * (TUNING.SPEEDUP_FRAME_WIDTH / TUNING.SPEEDUP_FRAME_HEIGHT);
    this.setBaseDisplaySize(speedupW, displayH * s);
  }

  /** Apply display size for normal ride spritesheet frames */
  private applyRideDisplaySize(): void {
    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const rideW = displayH * (TUNING.PLAYER_FRAME_WIDTH / TUNING.PLAYER_FRAME_HEIGHT);
    this.setBaseDisplaySize(rideW, displayH);
  }

  /** Cancel whatever animation is currently playing and clean up all state/listeners */
  private cancelCurrentAnimation(): void {
    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.removeAllListeners('animationupdate');
    this.attacking = false;
    this.rocketLaunching = false;
    this.rocketFireCallback = null;
  }

  /** Return to the correct default animation based on current game state */
  private restoreDefaultAnimation(): void {
    this.cancelCurrentAnimation();

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    if (this.poweredUp) {
      this.sprite.play('player-powered-loop');
      const s = TUNING.POWERED_SCALE;
      const poweredW = displayH * s * (TUNING.POWERED_FRAME_WIDTH / TUNING.POWERED_FRAME_HEIGHT);
      this.setBaseDisplaySize(poweredW, displayH * s);
    } else if (this.speedupState === 'intro' || this.speedupState === 'loop') {
      this.speedupState = 'loop';
      this.sprite.play('player-speedup-loop');
      this.applySpeedupDisplaySize();
    } else if (this.speedupState === 'outro') {
      this.sprite.play('player-speedup-outro');
      this.applySpeedupDisplaySize();
      this.sprite.once('animationcomplete', () => {
        if (this.speedupState === 'outro') {
          this.speedupState = 'idle';
          this.sprite.play('player-ride');
          this.applyRideDisplaySize();
        }
      });
    } else {
      this.sprite.play('player-ride');
      this.applyRideDisplaySize();
    }
  }

  setInvincible(value: boolean): void {
    this.invincible = value;
  }

  setSpectator(value: boolean): void {
    this.spectator = value;
    this.invincible = value;
  }

  /** Push the bike leftward (called by slow zone overlap each frame) */
  applyLeftwardPush(amount: number): void {
    // Directly reduce multiplier so the smooth model incorporates the push
    this.speedMultiplier = Math.max(0, this.speedMultiplier - amount / Math.max(1, this.playerSpeed + amount));
  }

  playAttack(): boolean {
    if (this.attackCooldown > 0) return false;
    // Cancel any in-progress animation (rocket, previous slash, etc.)
    this.cancelCurrentAnimation();
    this.attacking = true;
    this.attackCooldown = TUNING.ATTACK_COOLDOWN_SLASH;

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    this.sprite.play('player-attack');
    const attackW = displayH * (TUNING.PLAYER_ATTACK_FRAME_WIDTH / TUNING.PLAYER_ATTACK_FRAME_HEIGHT);
    this.setBaseDisplaySize(attackW, displayH);

    this.sprite.once('animationcomplete', () => {
      this.restoreDefaultAnimation();
    });
    return true;
  }

  /** Play rocket launcher animation. Cancels any current animation. Fires callback on frame ROCKET_LAUNCHER_FIRE_FRAME. */
  playRocketLaunch(onFire: () => void): boolean {
    if (this.attackCooldown > 0) return false;
    // Cancel any in-progress animation (slash, previous rocket, etc.)
    this.cancelCurrentAnimation();
    this.attacking = true;
    this.rocketLaunching = true;
    this.rocketFireCallback = onFire;

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const s = TUNING.ROCKET_LAUNCHER_SCALE;
    const launchW = displayH * s * (TUNING.ROCKET_LAUNCHER_FRAME_WIDTH / TUNING.ROCKET_LAUNCHER_FRAME_HEIGHT);
    this.sprite.play('player-rocket-launch');
    this.setBaseDisplaySize(launchW, displayH * s);

    // Fire the rocket when the target frame plays
    this.sprite.on('animationupdate', (_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (this.rocketLaunching && frame.index === TUNING.ROCKET_LAUNCHER_FIRE_FRAME && this.rocketFireCallback) {
        this.rocketFireCallback();
        this.rocketFireCallback = null;
      }
    });

    this.sprite.once('animationcomplete', () => {
      this.restoreDefaultAnimation();
    });
    this.attackCooldown = TUNING.ATTACK_COOLDOWN_ROCKET;
    return true;
  }

  playPoweredUp(): void {
    this.poweredUp = true;
    // Cancel any speed-up state — rage takes priority
    this.speedupState = 'idle';
    this.noTapTimer = 0;

    // Cancel current animation and start powered intro
    this.cancelCurrentAnimation();

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const s = TUNING.POWERED_SCALE;
    const poweredW = displayH * s * (TUNING.POWERED_FRAME_WIDTH / TUNING.POWERED_FRAME_HEIGHT);
    this.sprite.play('player-powered-intro');
    this.setBaseDisplaySize(poweredW, displayH * s);

    this.sprite.once('animationcomplete', () => {
      if (this.poweredUp && !this.attacking) {
        this.sprite.play('player-powered-loop');
      }
    });
  }

  stopPoweredUp(): void {
    this.poweredUp = false;
    if (this.attacking) return; // attack completion will call restoreDefaultAnimation

    this.cancelCurrentAnimation();
    this.sprite.play('player-ride');
    this.applyRideDisplaySize();
  }

  kill(): void {
    this.alive = false;
    this.cancelCurrentAnimation();
    this.poweredUp = false;
    this.speedupState = 'idle';
    this.noTapTimer = 0;
    console.log(`DEATH at X=${Math.round(this.sprite.x)}`);
  }

  reset(): void {
    this.cancelCurrentAnimation();
    this.sprite.x = TUNING.PLAYER_START_X;
    this.sprite.y = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;
    this.playerSpeed = 0;
    this.speedMultiplier = 0;
    this.tapPressure = 0;
    this.graceTimer = 0;
    this.alive = true;
    this.attackCooldown = 0;
    this.poweredUp = false;
    this.invincible = false;
    this.speedupState = 'idle';
    this.noTapTimer = 0;
    // Don't reset spectator — it persists across restarts (toggled by debug key)
    this.renderOffsetX = 0;
    this.renderOffsetY = 0;
    this.sprite.play('player-ride');
    this.applyRideDisplaySize();
  }

  isAlive(): boolean {
    return this.alive;
  }

  getX(): number {
    return this.sprite.x - this.renderOffsetX;
  }

  getY(): number {
    return this.sprite.y;
  }

  getPlayerSpeed(): number {
    return this.playerSpeed;
  }

  /** Set display size and store base scales (before perspective multiplier) */
  private setBaseDisplaySize(w: number, h: number): void {
    this.sprite.setDisplaySize(w, h);
    this.baseSpriteScaleX = this.sprite.scaleX;
    this.baseSpriteScaleY = this.sprite.scaleY;
    // Apply perspective immediately to prevent a 1-frame scale pop
    const perspScale = this.getPerspectiveScale();
    this.sprite.setScale(this.baseSpriteScaleX * perspScale, this.baseSpriteScaleY * perspScale);
  }

  /** Compute perspective scale from Y position (top of road = SCALE_TOP, bottom = SCALE_BOTTOM) */
  private getPerspectiveScale(): number {
    const t = Phaser.Math.Clamp(
      (this.sprite.y - TUNING.ROAD_TOP_Y) / (TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y),
      0, 1
    );
    return TUNING.PLAYER_SCALE_TOP + t * (TUNING.PLAYER_SCALE_BOTTOM - TUNING.PLAYER_SCALE_TOP);
  }

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
