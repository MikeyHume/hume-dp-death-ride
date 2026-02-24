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

  // Right side state (katana tap / rocket hold)
  private rightTouchStartTime: number = 0;
  private rightRocketFired: boolean = false;

  // Test injection flag (works on both desktop and mobile)
  private injectedSpeedTap: boolean = false;

  // Visual cursor (green triangle, left edge of screen)
  private cursorGraphic: Phaser.GameObjects.Triangle | null = null;

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
    // Green right-pointing triangle cursor on left edge
    const cw = TUNING.MOBILE_CURSOR_WIDTH;
    const ch = cw * 1.2; // slightly taller than wide
    // Triangle points: (0, 0) top-left, (0, ch) bottom-left, (cw, ch/2) right point
    this.cursorGraphic = scene.add.triangle(
      cw / 2, this.touchTargetY,
      0, 0,
      0, ch,
      cw, ch / 2,
      TUNING.MOBILE_CURSOR_COLOR
    ).setDepth(200).setScrollFactor(0).setAlpha(0.8);

    const halfScreen = TUNING.GAME_WIDTH / 2;
    const halfH = TUNING.PLAYER_DISPLAY_HEIGHT / 2;
    this.clampMinY = TUNING.ROAD_TOP_Y - TUNING.PLAYER_TOP_Y_EXTEND;
    this.clampMaxY = TUNING.ROAD_BOTTOM_Y - halfH;
    const minY = this.clampMinY;
    const maxY = this.clampMaxY;

    // ── Phaser-level handlers (touches ON the canvas) ──────────────
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Skip if this pointer is already tracked as external (black-bar touch)
      if (this._externalPointerIds.has(pointer.id)) return;

      if (pointer.x < halfScreen) {
        // Left half — steer + boost
        if (this.leftPointerId === null) {
          this.leftPointerId = pointer.id;
          this.leftTouchStartTime = Date.now();
          this.touchBoostHeld = true;
          const y = Phaser.Math.Clamp(pointer.y, minY, maxY);
          this.touchTargetY = y;
        }
      } else {
        // Right half — attack / rocket
        if (this.rightPointerId === null) {
          this.rightPointerId = pointer.id;
          this.rightTouchStartTime = Date.now();
          this.rightRocketFired = false;
        }
      }
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this._externalPointerIds.has(pointer.id)) return;
      if (pointer.id === this.leftPointerId) {
        const y = Phaser.Math.Clamp(pointer.y, minY, maxY);
        this.touchTargetY = y;
      }
    });

    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this._externalPointerIds.has(pointer.id)) return;
      if (pointer.id === this.leftPointerId) {
        this.touchBoostHeld = false;
        if (Date.now() - this.leftTouchStartTime < TUNING.MOBILE_TAP_THRESHOLD) {
          this.touchBoostTap = true;
        }
        this.leftPointerId = null;
      } else if (pointer.id === this.rightPointerId) {
        if (!this.rightRocketFired) {
          this.slashPressed = true; // katana
        }
        this.rightPointerId = null;
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
        const gameY = ((e.clientY - rect.top) / rect.height) * TUNING.GAME_HEIGHT;
        const clampedY = Phaser.Math.Clamp(gameY, minY, maxY);

        if (e.clientX < screenHalf) {
          // Left half — steer + boost
          if (this.leftPointerId === null) {
            this.leftPointerId = e.pointerId;
            this._externalPointerIds.add(e.pointerId);
            this.leftTouchStartTime = Date.now();
            this.touchBoostHeld = true;
            this.touchTargetY = clampedY;
            // Capture this pointer so move/up events come to the container
            container.setPointerCapture(e.pointerId);
          }
        } else {
          // Right half — attack / rocket
          if (this.rightPointerId === null) {
            this.rightPointerId = e.pointerId;
            this._externalPointerIds.add(e.pointerId);
            this.rightTouchStartTime = Date.now();
            this.rightRocketFired = false;
            container.setPointerCapture(e.pointerId);
          }
        }
      };

      this._domPointerMove = (e: PointerEvent) => {
        if (!this._externalPointerIds.has(e.pointerId)) return;
        if (e.pointerId === this.leftPointerId) {
          const rect = canvas.getBoundingClientRect();
          const gameY = ((e.clientY - rect.top) / rect.height) * TUNING.GAME_HEIGHT;
          this.touchTargetY = Phaser.Math.Clamp(gameY, minY, maxY);
        }
      };

      this._domPointerUp = (e: PointerEvent) => {
        if (!this._externalPointerIds.has(e.pointerId)) return;
        this._externalPointerIds.delete(e.pointerId);
        if (e.pointerId === this.leftPointerId) {
          this.touchBoostHeld = false;
          if (Date.now() - this.leftTouchStartTime < TUNING.MOBILE_TAP_THRESHOLD) {
            this.touchBoostTap = true;
          }
          this.leftPointerId = null;
        } else if (e.pointerId === this.rightPointerId) {
          if (!this.rightRocketFired) {
            this.slashPressed = true; // katana
          }
          this.rightPointerId = null;
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
      TUNING.ROAD_BOTTOM_Y - halfH
    );
  }

  /** Returns raw cursor X position */
  getTargetX(): number {
    return this.scene.input.activePointer.x;
  }

  /** Returns true while boost is held (Space on desktop, left thumb down on mobile) */
  isSpaceHeld(): boolean {
    if (this.mobileMode) return this.touchBoostHeld;
    return this.spaceKey.isDown;
  }

  /** Returns true on tap boost (JustDown Space on desktop, quick tap on mobile, or injected) */
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
