import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

// Brightness threshold for extracting road lines from the texture.
// Pixels above this (0-255) are kept; below become transparent.
const ROAD_LINES_BRIGHTNESS_THRESHOLD = 80;

export class RoadSystem {
  private roadTile: Phaser.GameObjects.TileSprite;
  private linesTile: Phaser.GameObjects.TileSprite;
  private tileScaleFactor: number;

  constructor(scene: Phaser.Scene) {
    const roadHeight = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    const roadCenterY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;

    // Road surface — scale image to fit road height, tile horizontally
    const srcImg = scene.textures.get('road-img').getSourceImage() as HTMLImageElement;
    this.tileScaleFactor = roadHeight / srcImg.height;

    this.roadTile = scene.add.tileSprite(
      TUNING.GAME_WIDTH / 2, roadCenterY,
      TUNING.GAME_WIDTH, roadHeight,
      'road-img'
    );
    this.roadTile.setTileScale(this.tileScaleFactor, this.tileScaleFactor);

    // Extract bright pixels (lines) into a separate texture
    const w = srcImg.naturalWidth || srcImg.width;
    const h = srcImg.naturalHeight || srcImg.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(srcImg, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;

    for (let i = 0; i < px.length; i += 4) {
      const brightness = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      if (brightness < ROAD_LINES_BRIGHTNESS_THRESHOLD) {
        px[i + 3] = 0; // make dark pixels transparent
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const linesTex = scene.textures.createCanvas('road-lines', w, h)!;
    linesTex.getContext().drawImage(offscreen, 0, 0);
    linesTex.refresh();

    // Lines overlay — sits on top of road, same scroll, NOT hue-shifted
    this.linesTile = scene.add.tileSprite(
      TUNING.GAME_WIDTH / 2, roadCenterY,
      TUNING.GAME_WIDTH, roadHeight,
      'road-lines'
    );
    this.linesTile.setTileScale(this.tileScaleFactor, this.tileScaleFactor);
    this.linesTile.setDepth(this.roadTile.depth + 0.005);
  }

  /** Reset tile scroll to a deterministic position. offsetX is in screen pixels. */
  resetScroll(offsetX: number = 0): void {
    const tileX = offsetX / this.tileScaleFactor;
    this.roadTile.tilePositionX = tileX;
    this.linesTile.tilePositionX = tileX;
  }

  update(currentSpeed: number, dt: number): void {
    // Scroll in texture-space (divide by scale so pixel speed matches world speed)
    const scroll = (currentSpeed * dt) / this.tileScaleFactor;
    this.roadTile.tilePositionX += scroll;
    this.linesTile.tilePositionX += scroll;
  }

  setVisible(visible: boolean): void {
    this.roadTile.setVisible(visible);
    this.linesTile.setVisible(visible);
  }

  getRoadTile(): Phaser.GameObjects.TileSprite { return this.roadTile; }
  getLinesTile(): Phaser.GameObjects.TileSprite { return this.linesTile; }

  destroy(): void {
    this.roadTile.destroy();
    this.linesTile.destroy();
  }
}
