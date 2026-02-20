import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isConnected } from '../systems/SpotifyAuthSystem';

// ── HUD tuning (edit these) ──
const HUD_SCALE = 1.0;                    // uniform scale for entire HUD (1.0 = default)
const HUD_ORIGIN_X = 40;                  // container X position on screen
const HUD_ORIGIN_Y = 40;                  // container Y position on screen
const AVATAR_RADIUS = 64;                 // avatar circle radius in px
const AVATAR_STROKE_WIDTH = 10;            // stroke thickness around profile pic
const AVATAR_STROKE_COLOR = 0xffffff;     // stroke color
const AVATAR_STROKE_ALPHA = 1;          // stroke opacity (max 1 — higher causes flash during fade transitions)
const SCORE_FONT_SIZE = 48;               // score text font size in px
const SCORE_GAP_X = 12;                   // horizontal gap between avatar and score
const SCORE_GAP_Y = 4;                    // vertical offset of score from container top
const BAR_W = 500;                        // rage bar width in px (1.5x)
const BAR_H = 28;                         // rage bar height in px
const BAR_SEGMENTS = 10;                  // number of retro segment divisions
const BAR_GAP_Y = 4;                      // vertical gap between score bottom and rage bar
const PIP_GAP = 8;                        // vertical gap below rage bar to pips
const PIP_AREA_W = 200;                   // width used for pip layout (keeps original spacing)

const SIGN_IN_SCALE = 0.4;               // sign-in image scale
const SIGN_IN_OFFSET_X = 96;             // sign-in X offset from avatar center
const SIGN_IN_OFFSET_Y = 50;             // sign-in Y offset below avatar bottom
const RANK_FONT_SIZE = 30;               // rank text font size in px

// Shield icon tuning (under rage bar, right-justified)
const SHIELD_PILL_GAP = TUNING.SHIELD_PILL_GAP;

// Derived layout (computed from tuning above)
const AVATAR_X = AVATAR_RADIUS;
const AVATAR_Y = AVATAR_RADIUS;
const SCORE_X = AVATAR_RADIUS * 2 + SCORE_GAP_X;
const SCORE_Y = SCORE_GAP_Y;
const BAR_X = SCORE_X;

export class ProfileHud {
  private container: Phaser.GameObjects.Container;

  // Elements
  private avatarCircle: Phaser.GameObjects.Arc;
  private scoreText: Phaser.GameObjects.Text;
  private rageBg: Phaser.GameObjects.Rectangle;
  private rageFill: Phaser.GameObjects.Rectangle;
  private rageSegments: Phaser.GameObjects.Rectangle[] = [];
  private rocketBgIcons: Phaser.GameObjects.Image[] = [];
  private rocketActiveIcons: Phaser.GameObjects.Image[] = [];
  private barBottomY: number = 0;
  private barY: number = 0;
  private scoreScale: number = 1;

  private avatarImage: Phaser.GameObjects.Image | null = null;
  private avatarHoverOverlay!: Phaser.GameObjects.Arc;
  private nameDisplay!: Phaser.GameObjects.Text;
  private playingNameText!: Phaser.GameObjects.Text;
  private rankDisplay!: Phaser.GameObjects.Text;
  private clickCallback: (() => void) | null = null;

  // Shield icons (right-justified under rage bar)
  private shieldBgIcons: Phaser.GameObjects.Image[] = [];
  private shieldActiveIcons: Phaser.GameObjects.Image[] = [];
  private currentShields: number = 0;

  // Sign-in indicator (below avatar, pulses on title/tutorial)
  private signInImage!: Phaser.GameObjects.Image;
  private signInTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(HUD_ORIGIN_X, HUD_ORIGIN_Y).setDepth(1300).setScrollFactor(0).setScale(HUD_SCALE);

    // --- Avatar placeholder (filled circle) ---
    this.avatarCircle = scene.add.circle(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0x555555, 1);
    this.avatarCircle.setStrokeStyle(AVATAR_STROKE_WIDTH, AVATAR_STROKE_COLOR, AVATAR_STROKE_ALPHA);
    this.container.add(this.avatarCircle);

    // --- Clickable hit zone over avatar ---
    const hitZone = scene.add.zone(AVATAR_X, AVATAR_Y, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    hitZone.setInteractive(
      new Phaser.Geom.Circle(AVATAR_RADIUS, AVATAR_RADIUS, AVATAR_RADIUS),
      Phaser.Geom.Circle.Contains
    );
    // White overlay for hover brightness (inserted after avatar image, before hit zone)
    this.avatarHoverOverlay = scene.add.circle(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0xffffff, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.container.add(this.avatarHoverOverlay);

    hitZone.on('pointerover', () => {
      scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME });
      this.avatarHoverOverlay.setVisible(true);
    });
    hitZone.on('pointerout', () => {
      this.avatarHoverOverlay.setVisible(false);
    });
    hitZone.on('pointerdown', () => {
      scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      if (this.clickCallback) this.clickCallback();
    });
    this.container.add(hitZone);

    // --- Score text (right-justified above rage bar, scaled to PIP_AREA_W) ---
    this.scoreText = scene.add.text(BAR_X + BAR_W, SCORE_Y, '0000000', {
      fontSize: `${SCORE_FONT_SIZE}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(1, 0); // right-justified
    // Scale uniformly to original bar width (PIP_AREA_W) so score stays its original size
    this.scoreScale = PIP_AREA_W / this.scoreText.width;
    this.scoreText.setScale(this.scoreScale);
    this.barY = SCORE_Y + this.scoreText.height * this.scoreScale + BAR_GAP_Y;
    const barY = this.barY;
    this.container.add(this.scoreText);

    // --- Player name (left-justified above rage bar, same row as score) ---
    this.playingNameText = scene.add.text(BAR_X, SCORE_Y, '', {
      fontSize: `${SCORE_FONT_SIZE}px`,
      fontFamily: 'Alagard',
      color: '#ffffff',
    }).setOrigin(0, 0).setScale(this.scoreScale).setVisible(false);
    this.container.add(this.playingNameText);

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

    // --- Rocket icons (left-justified under rage bar) ---
    const pillY = this.barBottomY + PIP_GAP;
    const iconScale = TUNING.ROCKET_ICON_SCALE;
    for (let i = 0; i < TUNING.PICKUP_MAX_AMMO; i++) {
      const bg = scene.add.image(0, 0, 'rocket-icon-empty')
        .setScale(iconScale)
        .setTint(0x666666)
        .setAlpha(0.4);
      // Position based on the scaled icon width
      const iconW = bg.displayWidth;
      const px = BAR_X + i * (iconW + SHIELD_PILL_GAP) + iconW / 2;
      const py = pillY + bg.displayHeight / 2;
      bg.setPosition(px, py);
      this.container.add(bg);
      this.rocketBgIcons.push(bg);

      const active = scene.add.image(px, py, 'rocket-icon')
        .setScale(iconScale)
        .setVisible(false);
      this.container.add(active);
      this.rocketActiveIcons.push(active);
    }

    // --- Shield icons (right-justified under rage bar) ---
    const shieldIconScale = TUNING.SHIELD_ICON_SCALE;
    // Measure one icon to compute layout
    const shieldProbe = scene.add.image(0, 0, 'shield-icon-empty').setScale(shieldIconScale);
    const shieldIconW = shieldProbe.displayWidth;
    const shieldIconH = shieldProbe.displayHeight;
    shieldProbe.destroy();
    const shieldTotalW = shieldIconW * TUNING.SHIELD_MAX + SHIELD_PILL_GAP * (TUNING.SHIELD_MAX - 1);
    const shieldStartX = BAR_X + BAR_W - shieldTotalW; // right-justified
    for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
      const px = shieldStartX + i * (shieldIconW + SHIELD_PILL_GAP) + shieldIconW / 2;
      const py = pillY + shieldIconH / 2;

      const bg = scene.add.image(px, py, 'shield-icon-empty')
        .setScale(shieldIconScale)
        .setTint(0x666666)
        .setAlpha(0.4);
      this.container.add(bg);
      this.shieldBgIcons.push(bg);

      const active = scene.add.image(px, py, 'shield-icon')
        .setScale(shieldIconScale)
        .setVisible(false);
      this.container.add(active);
      this.shieldActiveIcons.push(active);
    }

    // --- Sign-in indicator (below avatar, white-tinted, hidden if Spotify connected) ---
    const signInX = AVATAR_X + SIGN_IN_OFFSET_X;
    const signInY = AVATAR_Y + AVATAR_RADIUS + SIGN_IN_OFFSET_Y;
    this.signInImage = scene.add.image(signInX, signInY, 'sign-in')
      .setTintFill(0xffffff)
      .setScale(SIGN_IN_SCALE)
      .setVisible(false);
    this.container.add(this.signInImage);

    // Profile mode: name display (same position/font as playing name)
    this.nameDisplay = scene.add.text(BAR_X, SCORE_Y, '', {
      fontSize: `${SCORE_FONT_SIZE}px`,
      fontFamily: 'Alagard',
      color: '#ffffff',
    }).setOrigin(0, 0).setScale(this.scoreScale).setVisible(false);
    this.container.add(this.nameDisplay);

    // Profile mode: rank display (aligned with rage bar Y)
    this.rankDisplay = scene.add.text(BAR_X, barY, '', {
      fontSize: `${RANK_FONT_SIZE}px`,
      fontFamily: 'monospace',
      color: '#ffcc00',
    }).setOrigin(0, 0).setVisible(false);
    this.container.add(this.rankDisplay);

    // Start hidden
    this.container.setVisible(false);
  }

  // --- Public API ---

  setScore(score: number): void {
    this.scoreText.setText(String(Math.floor(score)).padStart(7, '0'));
    // Recompute scale every frame to guard against late font loading changing metrics
    this.scoreText.setScale(PIP_AREA_W / this.scoreText.width);
  }

  setRage01(v: number): void {
    this.rageFill.setScale(Phaser.Math.Clamp(v, 0, 1), 1);
  }

  setRageColor(color: number): void {
    this.rageFill.setFillStyle(color, 1);
  }

  setRockets(count: number, _max: number): void {
    for (let i = 0; i < this.rocketActiveIcons.length; i++) {
      this.rocketActiveIcons[i].setVisible(i < count);
    }
  }

  setShields(count: number): void {
    if (count !== this.currentShields) {
      this.currentShields = count;
      for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
        this.shieldActiveIcons[i].setVisible(i < count);
      }
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
    this.container.setScale(HUD_SCALE / zoom);
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
    for (let i = 0; i < this.rocketBgIcons.length; i++) this.rocketBgIcons[i].setVisible(false);
    for (let i = 0; i < this.rocketActiveIcons.length; i++) this.rocketActiveIcons[i].setVisible(false);
    for (let i = 0; i < this.shieldBgIcons.length; i++) this.shieldBgIcons[i].setVisible(false);
    for (let i = 0; i < this.shieldActiveIcons.length; i++) this.shieldActiveIcons[i].setVisible(false);
    this.playingNameText.setVisible(false);

    // Show name (same font/scale as playing name)
    this.nameDisplay.setText(name || 'ANON');
    this.nameDisplay.setScale(this.scoreScale);
    this.nameDisplay.setVisible(true);

    // Show rank
    this.rankDisplay.setText(rankText);
    this.rankDisplay.setVisible(rankText.length > 0);

    // Show sign-in pulse if not connected to Spotify
    this.startSignInPulse();
  }

  showPlayingMode(name?: string): void {
    this.scoreText.setVisible(true);
    this.rageBg.setVisible(true);
    this.rageFill.setVisible(true);
    for (let i = 0; i < this.rageSegments.length; i++) this.rageSegments[i].setVisible(true);
    for (let i = 0; i < this.rocketBgIcons.length; i++) this.rocketBgIcons[i].setVisible(true);
    for (let i = 0; i < this.shieldBgIcons.length; i++) this.shieldBgIcons[i].setVisible(true);

    // Show player name left-justified above rage bar
    this.playingNameText.setText(name || '');
    this.playingNameText.setVisible(!!name);

    this.nameDisplay.setVisible(false);
    this.rankDisplay.setVisible(false);
    this.stopSignInPulse();
  }

  /** Start the sign-in pulse animation (only if not connected to Spotify). */
  private startSignInPulse(): void {
    if (isConnected()) {
      this.signInImage.setVisible(false);
      return;
    }
    this.signInImage.setAlpha(1).setVisible(true);
    if (this.signInTween) {
      this.signInTween.destroy();
      this.signInTween = null;
    }
    // Timeline: 1.5s visible → 1s fade out → 0.5s off → 1s fade in → repeat
    const scene = this.container.scene;
    this.signInTween = scene.tweens.add({
      targets: this.signInImage,
      alpha: { from: 1, to: 0 },
      delay: 1500,
      duration: 1000,
      hold: 500,
      yoyo: true,
      repeat: -1,
    });
  }

  /** Stop the sign-in pulse and hide the image. */
  private stopSignInPulse(): void {
    if (this.signInTween) {
      this.signInTween.destroy();
      this.signInTween = null;
    }
    this.signInImage.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
