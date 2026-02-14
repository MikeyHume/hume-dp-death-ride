import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

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

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.xKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.lastMouseY = scene.input.activePointer.y;

    // Disable browser right-click context menu
    scene.input.mouse!.disableContextMenu();

    // Left click = katana slash, Right click = rocket fire
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.slashPressed = true;
      } else if (pointer.button === 2) {
        this.rocketPressed = true;
      }
    });
  }

  /** Returns mouse Y clamped to road bounds (accounting for sprite height) */
  getTargetY(): number {
    const halfH = TUNING.PLAYER_DISPLAY_HEIGHT / 2;
    return Phaser.Math.Clamp(
      this.scene.input.activePointer.y,
      TUNING.ROAD_TOP_Y,
      TUNING.ROAD_BOTTOM_Y - halfH
    );
  }

  /** Returns true while Space is held down */
  isSpaceHeld(): boolean {
    return this.spaceKey.isDown;
  }

  /** Returns true on the frame Space was first pressed */
  getSpeedTap(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.spaceKey);
  }

  /** Returns -1 (up), +1 (down), or 0 (neither) for arrow key Y direction */
  getArrowYDirection(): number {
    const up = this.upKey.isDown ? -1 : 0;
    const down = this.downKey.isDown ? 1 : 0;
    return up + down;
  }

  /** Returns true if arrow keys are the active Y-input source.
   *  Switches to arrows when pressed, back to mouse when mouse moves. */
  isUsingArrows(): boolean {
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

  /** Returns true once per click or X key press, then resets */
  getAttackPressed(): boolean {
    const xPressed = Phaser.Input.Keyboard.JustDown(this.xKey);
    if (this.slashPressed || xPressed) {
      this.slashPressed = false;
      return true;
    }
    return false;
  }

  /** Returns true once per right-click, then resets */
  getRocketPressed(): boolean {
    if (this.rocketPressed) {
      this.rocketPressed = false;
      return true;
    }
    return false;
  }

  destroy(): void {
    this.scene.input.keyboard!.removeKey(this.spaceKey);
    this.scene.input.keyboard!.removeKey(this.upKey);
    this.scene.input.keyboard!.removeKey(this.downKey);
    this.scene.input.keyboard!.removeKey(this.xKey);
  }
}
