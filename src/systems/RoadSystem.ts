import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

const ROAD_FRAMES = 6;   // number of segments in road spritesheet
const FRAME_W = 2048;     // each frame's pixel width
const FRAME_H = 534;      // each frame's pixel height

export class RoadSystem {
  private roadContainer: Phaser.GameObjects.Container;
  private linesContainer: Phaser.GameObjects.Container;
  private roadSprites: Phaser.GameObjects.Sprite[] = [];
  private linesSprites: Phaser.GameObjects.Sprite[] = [];
  private spriteW: number;   // on-screen width of one sprite (after scale)
  private scaleVal: number;  // uniform scale applied to each sprite
  private nextFrame: number = 0; // next frame index to assign when wrapping

  constructor(scene: Phaser.Scene) {
    const roadHeight = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    const roadCenterY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;

    // Uniform scale so each segment fills road height at native aspect ratio
    this.scaleVal = roadHeight / FRAME_H;
    this.spriteW = FRAME_W * this.scaleVal;

    // How many sprites needed to cover the screen + 1 buffer
    const count = Math.ceil(TUNING.GAME_WIDTH / this.spriteW) + 2;

    // Road container — left-edge aligned (origin 0,0.5) for precise tiling
    this.roadContainer = scene.add.container(0, 0);
    for (let i = 0; i < count; i++) {
      const s = scene.add.sprite(i * this.spriteW, roadCenterY, 'road-img', i % ROAD_FRAMES);
      s.setScale(this.scaleVal);
      s.setOrigin(0, 0.5);
      this.roadSprites.push(s);
      this.roadContainer.add(s);
    }
    this.nextFrame = count % ROAD_FRAMES;

    // Lines container (same positioning, slightly higher depth)
    this.linesContainer = scene.add.container(0, 0);
    for (let i = 0; i < count; i++) {
      const s = scene.add.sprite(i * this.spriteW, roadCenterY, 'road-lines', i % ROAD_FRAMES);
      s.setScale(this.scaleVal);
      s.setOrigin(0, 0.5);
      this.linesSprites.push(s);
      this.linesContainer.add(s);
    }
    this.linesContainer.setDepth(0.005);
  }

  resetScroll(_offsetX: number = 0): void {
    // Reset sprite positions to initial layout
    for (let i = 0; i < this.roadSprites.length; i++) {
      const x = i * this.spriteW;
      this.roadSprites[i].x = x;
      this.roadSprites[i].setFrame(i % ROAD_FRAMES);
      this.linesSprites[i].x = x;
      this.linesSprites[i].setFrame(i % ROAD_FRAMES);
    }
    this.nextFrame = this.roadSprites.length % ROAD_FRAMES;
  }

  update(currentSpeed: number, dt: number): void {
    const scrollPx = currentSpeed * dt;

    // Shift all sprites left
    for (let i = 0; i < this.roadSprites.length; i++) {
      this.roadSprites[i].x -= scrollPx;
      this.linesSprites[i].x -= scrollPx;
    }

    // Wrap: if leftmost sprite's right edge is fully off-screen left, move to right end
    while (this.roadSprites[0].x + this.spriteW < 0) {
      const rs = this.roadSprites.shift()!;
      const ls = this.linesSprites.shift()!;
      const lastR = this.roadSprites[this.roadSprites.length - 1];

      rs.x = lastR.x + this.spriteW;
      rs.setFrame(this.nextFrame);
      ls.x = rs.x;
      ls.setFrame(this.nextFrame);

      this.nextFrame = (this.nextFrame + 1) % ROAD_FRAMES;
      this.roadSprites.push(rs);
      this.linesSprites.push(ls);
    }
  }

  setVisible(visible: boolean): void {
    this.roadContainer.setVisible(visible);
    this.linesContainer.setVisible(visible);
  }

  /** Return road container for BitmapMask usage in ReflectionSystem. */
  getRoadTile(): Phaser.GameObjects.Container { return this.roadContainer; }
  /** Return lines container. */
  getLinesTile(): Phaser.GameObjects.Container { return this.linesContainer; }

  destroy(): void {
    this.roadContainer.destroy(true);
    this.linesContainer.destroy(true);
  }
}
