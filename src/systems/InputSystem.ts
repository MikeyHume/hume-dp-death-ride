import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';

export class InputSystem {
  private scene: Phaser.Scene;
  private spaceKey: Phaser.Input.Keyboard.Key;
  private upKey: Phaser.Input.Keyboard.Key;
  private downKey: Phaser.Input.Keyboard.Key;
  private xKey: Phaser.Input.Keyboard.Key;
  private slashPressed: boolean = false;
  private rocketPressed: boolean = false;
  private usingArrows: boolean = false;
  private lastMouseY: number = 0;

  // --- Mobile touch state ---
  private mobileMode: boolean;

  // Multi-touch pointer tracking
  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;

  // Left thumb state (steer + boost)
  private touchTargetY: number;
  private touchBoostHeld: boolean = false;
  private touchBoostTap: boolean = false;
  private leftTouchStartTime: number = 0;

  // Green button state (accelerate — tap + hold, like spacebar)
  private btnPointerId: number | null = null;
  private btnBoostHeld: boolean = false;

  // Right side state (katana tap / rocket hold)
  private rightTouchStartTime: number = 0;
  private rightRocketFired: boolean = false;

  // Test injection flag (works on both desktop and mobile)
  private injectedSpeedTap: boolean = false;

  // Visual cursor (green triangle, left edge of screen)
  private cursorGraphic: Phaser.GameObjects.Triangle | null = null;

  // Mobile button group (lower-right corner) — container is the group parent
  private btnGroup: Phaser.GameObjects.Container | null = null;
  private primaryButton: Phaser.GameObjects.Rectangle | null = null;
  private btnSize: number = 0; // computed from GAME_HEIGHT * MOBILE_BTN_SCALE

  // Road Y bounds (stored as fields for external touch API)
  private clampMinY: number = 0;
  private clampMaxY: number = 1080;

  // DOM-level handler refs for cleanup
  private _domPointerDown: ((e: PointerEvent) => void) | null = null;
  private _domPointerMove: ((e: PointerEvent) => void) | null = null;
  private _domPointerUp: ((e: PointerEvent) => void) | null = null;
  private _canvasCapture: ((e: PointerEvent) => void) | null = null;
  // Track which pointers are "external" (started on black bars, not canvas)
  private _externalPointerIds = new Set<number>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.mobileMode = GAME_MODE.mobileMode;

    // Default touch target Y to road center
    const halfH = TUNING.PLAYER_DISPLAY_HEIGHT / 2;
    this.touchTargetY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y - halfH) / 2;

    const kb = scene.input.keyboard;
    this.spaceKey = kb ? kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) : {} as Phaser.Input.Keyboard.Key;
    this.upKey = kb ? kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP) : {} as Phaser.Input.Keyboard.Key;
    this.downKey = kb ? kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN) : {} as Phaser.Input.Keyboard.Key;
    this.xKey = kb ? kb.addKey(Phaser.Input.Keyboard.KeyCodes.X) : {} as Phaser.Input.Keyboard.Key;
    this.lastMouseY = scene.input.activePointer.y;

    if (this.mobileMode) {
      this.setupMobileInput(scene);
    } else {
      this.setupDesktopInput(scene);
    }
  }

  private setupDesktopInput(scene: Phaser.Scene): void {
    // Disable browser right-click context menu
    scene.input.mouse?.disableContextMenu();

    // Left click = katana slash, Right click = rocket fire
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.slashPressed = true;
      } else if (pointer.button === 2) {
        this.rocketPressed = true;
      }
    });
  }

  private setupMobileInput(scene: Phaser.Scene): void {
    // Enable extra pointer slots for multi-touch (default is 2 — need more so
    // left-thumb steering + right-thumb button taps both register reliably)
    scene.input.addPointer(2); // now 4 total pointer slots

    // Green right-pointing triangle cursor — centered horizontally for now (debugging position)
    const cw = TUNING.MOBILE_CURSOR_WIDTH;
    const ch = cw * 1.2; // slightly taller than wide
    // Triangle points: (0, 0) top-left, (0, ch) bottom-left, (cw, ch/2) right point
    this.cursorGraphic = scene.add.triangle(
      GAME_MODE.canvasWidth / 2, this.touchTargetY,
      0, 0,
      0, ch,
      cw, ch / 2,
      TUNING.MOBILE_CURSOR_COLOR
    ).setDepth(200).setScrollFactor(0).setAlpha(0.8).setVisible(false);

    // Accelerate zone = entire right half of screen (invisible — no visible button)
    // The "button group" still exists as a logical container for future visible UI,
    // but the hit zone is simply: worldX >= halfScreen (right half of screen).
    this.btnSize = 1; // non-zero so hit-test guard passes, but size unused for zone check
    this.btnGroup = scene.add.container(0, 0)
      .setDepth(TUNING.MOBILE_BTN_DEPTH).setScrollFactor(0).setAlpha(0).setVisible(false);

    const halfScreen = TUNING.GAME_WIDTH / 2;
    const halfHeight = TUNING.GAME_HEIGHT / 2;
    // Touch Y accepted anywhere within the road texture area (marker = finger 1:1)
    // Player smoothing + sprite-based clamping handled by PlayerSystem
    this.clampMinY = TUNING.ROAD_TOP_Y - TUNING.PLAYER_TOP_Y_EXTEND;
    this.clampMaxY = TUNING.ROAD_BOTTOM_Y - TUNING.PLAYER_DISPLAY_HEIGHT / 2 - TUNING.PLAYER_BOTTOM_Y_INSET;
    const minY = this.clampMinY;
    const maxY = this.clampMaxY;

    // ── Phaser-level handlers (touches ON the canvas) ──────────────
    // IMPORTANT: pointer.x/y are in render-resolution space (e.g. 1170×540).
    // pointer.worldX/worldY are in world space (1920×1080 game coordinates).
    // All comparisons use world coords so they match tuning values.
    // For scrollFactor(0) objects (buttons), use worldX - cam.scrollX / worldY - cam.scrollY
    // to get screen-game-space coordinates.
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Skip if this pointer is already tracked as external (black-bar touch)
      if (this._externalPointerIds.has(pointer.id)) return;

      const wx = pointer.worldX;
      const wy = pointer.worldY;

      if (wx >= halfScreen && wy >= halfHeight) {
        // Bottom-right quadrant — accelerate (acts like spacebar: hold + tap)
        if (this.btnPointerId === null) {
          this.btnPointerId = pointer.id;
          this.btnBoostHeld = true;   // held state (like spacebar isDown)
          this.touchBoostTap = true;  // tap impulse (like JustDown)
        }
      } else {
        // Everywhere else — steer + hold-boost (like holding spacebar)
        if (this.leftPointerId === null) {
          this.leftPointerId = pointer.id;
          this.leftTouchStartTime = Date.now();
          this.touchBoostHeld = true;
          // Only update Y if finger is within road bounds; otherwise keep last valid Y
          if (wy >= minY && wy <= maxY) {
            this.touchTargetY = wy;
          }
        }
      }
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this._externalPointerIds.has(pointer.id)) return;
      if (pointer.id === this.leftPointerId) {
        const wy = pointer.worldY;
        // Only update Y while finger is within road bounds; stays at last valid Y otherwise
        if (wy >= minY && wy <= maxY) {
          this.touchTargetY = wy;
        }
      }
    });

    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this._externalPointerIds.has(pointer.id)) return;
      if (pointer.id === this.btnPointerId) {
        // Green button released
        this.btnBoostHeld = false;
        this.btnPointerId = null;
      } else if (pointer.id === this.leftPointerId) {
        this.touchBoostHeld = false;
        this.touchBoostTap = true;  // tap impulse on lift (like spacebar JustDown)
        this.leftPointerId = null;
      }
    });

    // ── setPointerCapture — extend canvas touches into black bars ──
    // When a touch starts on the canvas and the finger slides off into the
    // black bar area, the browser normally fires pointerup. setPointerCapture
    // forces ALL subsequent pointer events for that finger to the canvas,
    // so Phaser keeps receiving pointermove even in the black bars.
    const canvas = scene.game.canvas;
    this._canvasCapture = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerdown', this._canvasCapture, true);

    // ── DOM-level handlers — touches that START on black bars ──────
    // When a finger goes down directly on a black bar (#game-container
    // background, not the canvas), Phaser never sees it. These handlers
    // catch those touches, map screen coords to game coords, and inject
    // them into the same leftPointerId / rightPointerId tracking.
    const container = document.getElementById('game-container');
    if (container) {
      this._domPointerDown = (e: PointerEvent) => {
        // Only handle touches on the container itself (black bars), not the canvas
        if (e.target === canvas) return;
        const rect = canvas.getBoundingClientRect();
        const screenHalf = window.innerWidth / 2;
        const gameX = ((e.clientX - rect.left) / rect.width) * GAME_MODE.canvasWidth;
        const gameY = ((e.clientY - rect.top) / rect.height) * TUNING.GAME_HEIGHT;

        if (e.clientX < screenHalf) {
          // Left half — steer + hold-boost
          if (this.leftPointerId === null) {
            this.leftPointerId = e.pointerId;
            this._externalPointerIds.add(e.pointerId);
            this.leftTouchStartTime = Date.now();
            this.touchBoostHeld = true;
            if (gameY >= minY && gameY <= maxY) {
              this.touchTargetY = gameY;
            }
            container.setPointerCapture(e.pointerId);
          }
        } else {
          // Right half — accelerate (acts like spacebar: hold + tap)
          if (this.btnPointerId === null) {
            this.btnPointerId = e.pointerId;
            this._externalPointerIds.add(e.pointerId);
            this.btnBoostHeld = true;
            this.touchBoostTap = true;
            container.setPointerCapture(e.pointerId);
          }
        }
      };

      this._domPointerMove = (e: PointerEvent) => {
        if (!this._externalPointerIds.has(e.pointerId)) return;
        if (e.pointerId === this.leftPointerId) {
          const rect = canvas.getBoundingClientRect();
          const gameY = ((e.clientY - rect.top) / rect.height) * TUNING.GAME_HEIGHT;
          if (gameY >= minY && gameY <= maxY) {
            this.touchTargetY = gameY;
          }
        }
      };

      this._domPointerUp = (e: PointerEvent) => {
        if (!this._externalPointerIds.has(e.pointerId)) return;
        this._externalPointerIds.delete(e.pointerId);
        if (e.pointerId === this.btnPointerId) {
          // Green button released
          this.btnBoostHeld = false;
          this.btnPointerId = null;
        } else if (e.pointerId === this.leftPointerId) {
          this.touchBoostHeld = false;
          this.touchBoostTap = true;  // tap impulse on lift
          this.leftPointerId = null;
        }
      };

      container.addEventListener('pointerdown', this._domPointerDown);
      container.addEventListener('pointermove', this._domPointerMove);
      container.addEventListener('pointerup', this._domPointerUp);
    }
  }

  /** Called each frame from GameScene.update(). Handles mobile hold timer + cursor. */
  update(_dt: number): void {
    if (!this.mobileMode) return;

    // Right-side hold → rocket
    if (this.rightPointerId !== null && !this.rightRocketFired) {
      if (Date.now() - this.rightTouchStartTime >= TUNING.MOBILE_ROCKET_HOLD) {
        this.rocketPressed = true;
        this.rightRocketFired = true;
      }
    }

    // Update cursor graphic Y
    if (this.cursorGraphic) {
      this.cursorGraphic.setY(this.touchTargetY);
    }
  }

  /** Returns target Y clamped to road bounds (accounting for sprite height) */
  getTargetY(): number {
    if (this.mobileMode) {
      return this.touchTargetY;
    }
    const halfH = TUNING.PLAYER_DISPLAY_HEIGHT / 2;
    return Phaser.Math.Clamp(
      this.scene.input.activePointer.y,
      TUNING.ROAD_TOP_Y - TUNING.PLAYER_TOP_Y_EXTEND,
      TUNING.ROAD_BOTTOM_Y - halfH - TUNING.PLAYER_BOTTOM_Y_INSET
    );
  }

  /** Returns raw cursor X position */
  getTargetX(): number {
    return this.scene.input.activePointer.x;
  }

  /** Returns true while boost is held (Space on desktop, left thumb OR green button on mobile) */
  isSpaceHeld(): boolean {
    if (this.mobileMode) return this.touchBoostHeld || this.btnBoostHeld;
    return this.spaceKey.isDown;
  }

  /** Returns true on tap boost (JustDown Space on desktop, quick tap on mobile, or injected) */
  /** Show/hide the green triangle cursor (mobile only). Currently disabled. */
  setCursorVisible(_visible: boolean): void {
    // Green triangle cursor disabled — slider knob replaced it
    if (this.cursorGraphic) this.cursorGraphic.setVisible(false);
  }

  getSpeedTap(): boolean {
    // Injected speed tap (works on both desktop and mobile)
    if (this.injectedSpeedTap) {
      this.injectedSpeedTap = false;
      return true;
    }
    if (this.mobileMode) {
      if (this.touchBoostTap) {
        this.touchBoostTap = false;
        return true;
      }
      return false;
    }
    return Phaser.Input.Keyboard.JustDown(this.spaceKey);
  }

  /** Returns -1 (up), +1 (down), or 0 (neither) for arrow key Y direction */
  getArrowYDirection(): number {
    const up = this.upKey.isDown ? -1 : 0;
    const down = this.downKey.isDown ? 1 : 0;
    return up + down;
  }

  /** Returns true if arrow keys are the active Y-input source.
   *  Mobile always returns false (touch controls Y directly). */
  isUsingArrows(): boolean {
    if (this.mobileMode) return false;

    // Arrow press → switch to arrow mode
    if (this.upKey.isDown || this.downKey.isDown) {
      this.usingArrows = true;
      this.lastMouseY = this.scene.input.activePointer.y;
    }

    // Mouse moved → switch back to mouse mode
    if (this.usingArrows) {
      const currentMouseY = this.scene.input.activePointer.y;
      if (Math.abs(currentMouseY - this.lastMouseY) > 2) {
        this.usingArrows = false;
      }
    }

    return this.usingArrows;
  }

  /** Returns true once per attack input, then resets */
  getAttackPressed(): boolean {
    const xPressed = Phaser.Input.Keyboard.JustDown(this.xKey);
    if (this.slashPressed || xPressed) {
      this.slashPressed = false;
      return true;
    }
    return false;
  }

  /** Returns true once per rocket input, then resets */
  getRocketPressed(): boolean {
    if (this.rocketPressed) {
      this.rocketPressed = false;
      return true;
    }
    return false;
  }

  /** Brief alpha flash on button tap for visual feedback */
  // ── Button group visibility (called from GameScene) ──
  // Accelerate zone is invisible — these are no-ops kept for API compatibility.
  setPrimaryButtonVisible(_visible: boolean): void {}
  private flashPrimaryButton(): void {}

  fadeInPrimaryButton(_duration: number): void {
    // Accelerate zone is invisible (entire right half) — no visual fade needed.
    // Method kept for API compatibility with GameScene calls.
  }

  // ── Test injection (programmatic input for robot pilot) ──
  injectSpeedTap(): void { this.injectedSpeedTap = true; }
  injectAttack(): void { this.slashPressed = true; }
  injectRocket(): void { this.rocketPressed = true; }
  injectTargetY(y: number): void { this.touchTargetY = y; }

  destroy(): void {
    this.scene.input.keyboard?.removeKey(this.spaceKey);
    this.scene.input.keyboard?.removeKey(this.upKey);
    this.scene.input.keyboard?.removeKey(this.downKey);
    this.scene.input.keyboard?.removeKey(this.xKey);
    if (this.cursorGraphic) {
      this.cursorGraphic.destroy();
      this.cursorGraphic = null;
    }
    if (this.btnGroup) {
      this.btnGroup.destroy(true); // destroys children (primaryButton) too
      this.btnGroup = null;
      this.primaryButton = null;
    }
    // Clean up DOM-level handlers
    const canvas = this.scene.game.canvas;
    if (this._canvasCapture) {
      canvas.removeEventListener('pointerdown', this._canvasCapture, true);
    }
    const container = document.getElementById('game-container');
    if (container) {
      if (this._domPointerDown) container.removeEventListener('pointerdown', this._domPointerDown);
      if (this._domPointerMove) container.removeEventListener('pointermove', this._domPointerMove);
      if (this._domPointerUp) container.removeEventListener('pointerup', this._domPointerUp);
    }
    this._externalPointerIds.clear();
  }
}
