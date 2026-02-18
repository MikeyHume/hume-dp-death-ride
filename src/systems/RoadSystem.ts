import Phaser from 'phaser';
import { TUNING } from '../config/tuning';

export class RoadSystem {
  private roadTile: Phaser.GameObjects.TileSprite;
  private tileScaleFactor: number;

  constructor(scene: Phaser.Scene) {
    const roadHeight = TUNING.ROAD_BOTTOM_Y - TUNING.ROAD_TOP_Y;
    const roadCenterY = (TUNING.ROAD_TOP_Y + TUNING.ROAD_BOTTOM_Y) / 2;

    // Road surface — scale image to fit road height, tile horizontally
    const tex = scene.textures.get('road-img').getSourceImage();
    this.tileScaleFactor = roadHeight / tex.height;

    this.roadTile = scene.add.tileSprite(
      TUNING.GAME_WIDTH / 2, roadCenterY,
      TUNING.GAME_WIDTH, roadHeight,
      'road-img'
    );
    this.roadTile.setTileScale(this.tileScaleFactor, this.tileScaleFactor);
  }

  /** Reset tile scroll to a deterministic position. offsetX is in screen pixels. */
  resetScroll(offsetX: number = 0): void {
    this.roadTile.tilePositionX = offsetX / this.tileScaleFactor;
  }

  update(currentSpeed: number, dt: number): void {
    // Scroll in texture-space (divide by scale so pixel speed matches world speed)
    this.roadTile.tilePositionX += (currentSpeed * dt) / this.tileScaleFactor;
  }

  setVisible(visible: boolean): void {
    this.roadTile.setVisible(visible);
  }

  getRoadTile(): Phaser.GameObjects.TileSprite { return this.roadTile; }

  destroy(): void {
    this.roadTile.destroy();
  }
}
