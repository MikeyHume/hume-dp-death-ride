import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { InputSystem } from './InputSystem';

export class PlayerSystem {
  private scene: Phaser.Scene;
  private input: InputSystem;
  private sprite: Phaser.GameObjects.Sprite;

  private playerSpeed: number = 0;  // the bike's forward speed
  private alive: boolean = true;
  private attacking: boolean = false;
  private poweredUp: boolean = false;
  private renderOffsetX: number = 0; // visual-only X shift (attack sprite alignment)
  private renderOffsetY: number = 0; // visual-only Y shift (powered-up alignment)
  private invincible: boolean = false;

  // Smooth speed model state
  private speedMultiplier: number = 0;  // current smooth multiplier (0 to MAX)
  private tapPressure: number = 0;      // accumulated tap intensity (decays over time)
  private graceTimer: number = 0;       // countdown before decel after releasing space

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
    this.sprite.setDisplaySize(displayW, displayH);

    this.sprite.play('player-ride');
  }

  update(dt: number, roadSpeed: number, baseRoadSpeed?: number): void {
    if (!this.alive) return;

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
          TUNING.ROAD_TOP_Y,
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

    // --- Horizontal drift ---
    // At multiplier 1.0: stays put. Below 1.0: drifts left. Above 1.0: moves right.
    const speedDiff = this.playerSpeed - controlSpeed;
    this.sprite.x += speedDiff * dt;

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
    this.renderOffsetX = this.attacking ? TUNING.PLAYER_ATTACK_OFFSET_X : (this.poweredUp ? TUNING.POWERED_OFFSET_X : 0);
    this.renderOffsetY = this.poweredUp && !this.attacking ? TUNING.POWERED_OFFSET_Y : 0;
    this.sprite.x += this.renderOffsetX;
    this.sprite.y += this.renderOffsetY;
  }

  setInvincible(value: boolean): void {
    this.invincible = value;
  }

  /** Push the bike leftward (called by slow zone overlap each frame) */
  applyLeftwardPush(amount: number): void {
    // Directly reduce multiplier so the smooth model incorporates the push
    this.speedMultiplier = Math.max(0, this.speedMultiplier - amount / Math.max(1, this.playerSpeed + amount));
  }

  playAttack(): void {
    if (this.attacking) return;
    this.attacking = true;

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.play('player-attack');
    const attackW = displayH * (TUNING.PLAYER_ATTACK_FRAME_WIDTH / TUNING.PLAYER_ATTACK_FRAME_HEIGHT);
    this.sprite.setDisplaySize(attackW, displayH);

    this.sprite.once('animationcomplete', () => {
      this.attacking = false;
      if (this.poweredUp) {
        this.sprite.play('player-powered-loop');
        const s = TUNING.POWERED_SCALE;
        const poweredW = displayH * s * (TUNING.POWERED_FRAME_WIDTH / TUNING.POWERED_FRAME_HEIGHT);
        this.sprite.setDisplaySize(poweredW, displayH * s);
      } else {
        this.sprite.play('player-ride');
        const rideW = displayH * (TUNING.PLAYER_FRAME_WIDTH / TUNING.PLAYER_FRAME_HEIGHT);
        this.sprite.setDisplaySize(rideW, displayH);
      }
    });
  }

  playPoweredUp(): void {
    this.poweredUp = true;
    if (this.attacking) return; // attack completion will switch to powered-up loop

    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const s = TUNING.POWERED_SCALE;
    const poweredW = displayH * s * (TUNING.POWERED_FRAME_WIDTH / TUNING.POWERED_FRAME_HEIGHT);
    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.play('player-powered-intro');
    this.sprite.setDisplaySize(poweredW, displayH * s);

    this.sprite.once('animationcomplete', () => {
      if (this.poweredUp && !this.attacking) {
        this.sprite.play('player-powered-loop');
      }
    });
  }

  stopPoweredUp(): void {
    this.poweredUp = false;
    if (this.attacking) return; // attack completion will switch to ride

    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.play('player-ride');
    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const rideW = displayH * (TUNING.PLAYER_FRAME_WIDTH / TUNING.PLAYER_FRAME_HEIGHT);
    this.sprite.setDisplaySize(rideW, displayH);
  }

  kill(): void {
    this.alive = false;
    this.attacking = false;
    this.poweredUp = false;
    console.log(`DEATH at X=${Math.round(this.sprite.x)}`);
  }

  reset(): void {
    this.sprite.x = TUNING.PLAYER_START_X;
    this.sprite.y = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;
    this.playerSpeed = 0;
    this.speedMultiplier = 0;
    this.tapPressure = 0;
    this.graceTimer = 0;
    this.alive = true;
    this.attacking = false;
    this.poweredUp = false;
    this.invincible = false;
    this.renderOffsetX = 0;
    this.renderOffsetY = 0;
    this.sprite.removeAllListeners('animationcomplete');
    this.sprite.play('player-ride');
    const displayH = TUNING.PLAYER_DISPLAY_HEIGHT;
    const rideW = displayH * (TUNING.PLAYER_FRAME_WIDTH / TUNING.PLAYER_FRAME_HEIGHT);
    this.sprite.setDisplaySize(rideW, displayH);
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

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
