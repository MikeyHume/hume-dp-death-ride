import Phaser from 'phaser';

// Layout constants
const HUD_ORIGIN_X = 40;                  // container rest position
const HUD_ORIGIN_Y = 40;
const AVATAR_RADIUS = 64;
const AVATAR_X = AVATAR_RADIUS;           // center of avatar circle
const AVATAR_Y = AVATAR_RADIUS;
const SCORE_X = AVATAR_RADIUS * 2 + 12;   // right of avatar
const SCORE_Y = 4;
const BAR_X = SCORE_X;                    // aligned with score
const BAR_W = 200;
const BAR_H = 28;
const BAR_SEGMENTS = 10;
const PIP_RADIUS = 6;
const PIP_GAP = 8;                        // vertical gap below rage bar

export class ProfileHud {
  private container: Phaser.GameObjects.Container;

  // Elements
  private avatarCircle: Phaser.GameObjects.Arc;
  private scoreText: Phaser.GameObjects.Text;
  private rageBg: Phaser.GameObjects.Rectangle;
  private rageFill: Phaser.GameObjects.Rectangle;
  private rageSegments: Phaser.GameObjects.Rectangle[] = [];
  private pips: Phaser.GameObjects.Arc[] = [];
  private maxPips: number = 0;
  private barBottomY: number = 0;
  private barY: number = 0;
  private scoreScale: number = 1;

  private avatarImage: Phaser.GameObjects.Image | null = null;
  private nameDisplay!: Phaser.GameObjects.Text;
  private rankDisplay!: Phaser.GameObjects.Text;
  private clickCallback: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(HUD_ORIGIN_X, HUD_ORIGIN_Y).setDepth(1300).setScrollFactor(0);

    // --- Avatar placeholder (filled circle) ---
    this.avatarCircle = scene.add.circle(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0x555555, 1);
    this.avatarCircle.setStrokeStyle(2, 0xffffff, 0.6);
    this.container.add(this.avatarCircle);

    // --- Clickable hit zone over avatar ---
    const hitZone = scene.add.zone(AVATAR_X, AVATAR_Y, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    hitZone.setInteractive(
      new Phaser.Geom.Circle(AVATAR_RADIUS, AVATAR_RADIUS, AVATAR_RADIUS),
      Phaser.Geom.Circle.Contains
    );
    hitZone.on('pointerdown', () => {
      if (this.clickCallback) this.clickCallback();
    });
    this.container.add(hitZone);

    // --- Score text (scaled uniformly so width matches BAR_W) ---
    this.scoreText = scene.add.text(SCORE_X, SCORE_Y, '0000000', {
      fontSize: '48px',
      fontFamily: 'monospace',
      color: '#ffffff',
    });
    // Scale uniformly to match rage bar width
    this.scoreScale = BAR_W / this.scoreText.width;
    this.scoreText.setScale(this.scoreScale);
    this.barY = SCORE_Y + this.scoreText.height * this.scoreScale + 4;
    const barY = this.barY;
    this.container.add(this.scoreText);

    // --- Rage bar background ---
    this.barBottomY = barY + BAR_H;
    this.rageBg = scene.add.rectangle(BAR_X, barY, BAR_W, BAR_H, 0x222222, 0.9)
      .setOrigin(0, 0);
    this.container.add(this.rageBg);

    // --- Rage bar fill ---
    this.rageFill = scene.add.rectangle(BAR_X, barY, BAR_W, BAR_H, 0xff4400, 1)
      .setOrigin(0, 0).setScale(0, 1);
    this.container.add(this.rageFill);

    // --- Retro segment lines ---
    for (let i = 1; i < BAR_SEGMENTS; i++) {
      const sx = BAR_X + (BAR_W / BAR_SEGMENTS) * i;
      const seg = scene.add.rectangle(sx, barY, 1, BAR_H, 0x000000, 0.5)
        .setOrigin(0.5, 0);
      this.rageSegments.push(seg);
      this.container.add(seg);
    }

    // Profile mode: name display (vertically centered on avatar)
    this.nameDisplay = scene.add.text(SCORE_X, AVATAR_Y, '', {
      fontSize: '48px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);
    this.container.add(this.nameDisplay);

    // Profile mode: rank display (bottom-aligned with avatar bottom)
    this.rankDisplay = scene.add.text(BAR_X, AVATAR_Y + AVATAR_RADIUS, '', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#ffcc00',
    }).setOrigin(0, 1).setVisible(false);
    this.container.add(this.rankDisplay);

    // Start hidden
    this.container.setVisible(false);
  }

  // --- Public API ---

  setScore(score: number): void {
    this.scoreText.setText(String(Math.floor(score)).padStart(7, '0'));
    // Recompute scale every frame to guard against late font loading changing metrics
    this.scoreText.setScale(BAR_W / this.scoreText.width);
  }

  setRage01(v: number): void {
    this.rageFill.setScale(Phaser.Math.Clamp(v, 0, 1), 1);
  }

  setRageColor(color: number): void {
    this.rageFill.setFillStyle(color, 1);
  }

  setRockets(count: number, max: number): void {
    const scene = this.container.scene;

    // Rebuild pips if max changed
    if (max !== this.maxPips) {
      for (const p of this.pips) p.destroy();
      this.pips.length = 0;
      this.maxPips = max;
      const pipY = this.barBottomY + PIP_GAP + PIP_RADIUS;
      for (let i = 0; i < max; i++) {
        const pipX = BAR_X + (i + 0.5) * (BAR_W / max);
        const pip = scene.add.circle(
          pipX, pipY,
          PIP_RADIUS, 0xffff00, 1
        );
        pip.setStrokeStyle(1, 0xffaa00, 0.8);
        pip.setVisible(false);
        this.pips.push(pip);
        this.container.add(pip);
      }
    }

    for (let i = 0; i < this.maxPips; i++) {
      this.pips[i].setVisible(i < count);
    }
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  setAlpha(alpha: number): void {
    this.container.setAlpha(alpha);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /** Counter-scale and reposition so camera zoom doesn't push HUD off-screen */
  adjustForZoom(zoom: number): void {
    const cam = this.container.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    // Zoom scales around camera center — reverse-transform to keep HUD at its original screen position
    this.container.setScale(1 / zoom);
    this.container.setPosition(
      cx + (HUD_ORIGIN_X - cx) / zoom,
      cy + (HUD_ORIGIN_Y - cy) / zoom,
    );
  }

  setAvatarTexture(key: string): void {
    if (this.avatarImage) {
      this.avatarImage.destroy();
      this.avatarImage = null;
    }
    const scene = this.container.scene;
    this.avatarImage = scene.add.image(AVATAR_X, AVATAR_Y, key);
    this.avatarImage.setDisplaySize(AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    // Insert after avatarCircle (0) but before hitZone (1)
    this.container.addAt(this.avatarImage, 1);
  }

  onAvatarClick(callback: () => void): void {
    this.clickCallback = callback;
  }

  showProfileMode(name: string, rankText: string): void {
    // Hide playing elements
    this.scoreText.setVisible(false);
    this.rageBg.setVisible(false);
    this.rageFill.setVisible(false);
    for (let i = 0; i < this.rageSegments.length; i++) this.rageSegments[i].setVisible(false);
    for (let i = 0; i < this.pips.length; i++) this.pips[i].setVisible(false);

    // Show name (capped at score scale so short names aren't oversized)
    this.nameDisplay.setText(name || 'ANON');
    this.nameDisplay.setScale(1);
    const nameScale = Math.min(BAR_W / (this.nameDisplay.width || 1), this.scoreScale);
    this.nameDisplay.setScale(nameScale);
    this.nameDisplay.setVisible(true);

    // Show rank
    this.rankDisplay.setText(rankText);
    this.rankDisplay.setVisible(rankText.length > 0);
  }

  showPlayingMode(): void {
    this.scoreText.setVisible(true);
    this.rageBg.setVisible(true);
    this.rageFill.setVisible(true);
    for (let i = 0; i < this.rageSegments.length; i++) this.rageSegments[i].setVisible(true);

    this.nameDisplay.setVisible(false);
    this.rankDisplay.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
