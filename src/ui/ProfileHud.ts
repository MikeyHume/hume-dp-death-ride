import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isConnected } from '../systems/SpotifyAuthSystem';

// ── HUD tuning (edit these) ──
const HUD_SCALE = 1.0;                    // uniform scale for entire HUD (1.0 = default)
const HUD_ORIGIN_X = 40;                  // container X position on screen
const HUD_ORIGIN_Y = 40;                  // container Y position on screen
const AVATAR_RADIUS = 64;                 // avatar circle radius in px
const SCORE_FONT_SIZE = 48;               // score text font size in px
const SCORE_GAP_X = 12;                   // horizontal gap between avatar and score
const SCORE_GAP_Y = 4;                    // vertical offset of score from container top
const BAR_W = 500;                        // rage bar width in px (1.5x)
const BAR_H = 28;                         // rage bar height in px
const BAR_SEGMENTS = 10;                  // number of retro segment divisions
const BAR_GAP_Y = 4;                      // vertical gap between score bottom and rage bar
const PIP_RADIUS = 6;                     // rocket pip circle radius
const PIP_GAP = 8;                        // vertical gap below rage bar to pips
const PIP_AREA_W = 200;                   // width used for pip layout (keeps original spacing)
const SIGN_IN_SCALE = 0.4;               // sign-in image scale
const SIGN_IN_OFFSET_X = 96;             // sign-in X offset from avatar center
const SIGN_IN_OFFSET_Y = 50;             // sign-in Y offset below avatar bottom
const RANK_FONT_SIZE = 30;               // rank text font size in px

// Shield pill tuning (under rage bar, right-justified)
const SHIELD_PILL_W = TUNING.SHIELD_PILL_W;
const SHIELD_PILL_H = TUNING.SHIELD_PILL_H;
const SHIELD_PILL_GAP = TUNING.SHIELD_PILL_GAP;
const SHIELD_PILL_RADIUS = TUNING.SHIELD_PILL_CORNER_RADIUS;
const SHIELD_BG_COLOR = TUNING.SHIELD_PILL_BG_COLOR;
const SHIELD_BG_ALPHA = TUNING.SHIELD_PILL_BG_ALPHA;
const SHIELD_ACTIVE_COLOR = TUNING.SHIELD_PILL_ACTIVE_COLOR;
const SHIELD_ACTIVE_ALPHA = 0.9;

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
  private pips: Phaser.GameObjects.Arc[] = [];
  private maxPips: number = 0;
  private barBottomY: number = 0;
  private barY: number = 0;
  private scoreScale: number = 1;

  private avatarImage: Phaser.GameObjects.Image | null = null;
  private nameDisplay!: Phaser.GameObjects.Text;
  private playingNameText!: Phaser.GameObjects.Text;
  private rankDisplay!: Phaser.GameObjects.Text;
  private clickCallback: (() => void) | null = null;

  // Shield pills (right-justified under rage bar)
  private shieldBgPills: Phaser.GameObjects.Graphics[] = [];
  private shieldActivePills: Phaser.GameObjects.Graphics[] = [];
  private currentShields: number = 0;

  // Sign-in indicator (below avatar, pulses on title/tutorial)
  private signInImage!: Phaser.GameObjects.Image;
  private signInTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(HUD_ORIGIN_X, HUD_ORIGIN_Y).setDepth(1300).setScrollFactor(0).setScale(HUD_SCALE);

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

    // --- Shield pills (right-justified under rage bar) ---
    const shieldPillY = this.barBottomY + PIP_GAP;
    const shieldTotalW = SHIELD_PILL_W * TUNING.SHIELD_MAX + SHIELD_PILL_GAP * (TUNING.SHIELD_MAX - 1);
    const shieldStartX = BAR_X + BAR_W - shieldTotalW; // right-justified
    for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
      const px = shieldStartX + i * (SHIELD_PILL_W + SHIELD_PILL_GAP);

      // Background pill (always visible during gameplay)
      const bg = scene.add.graphics();
      bg.fillStyle(SHIELD_BG_COLOR, SHIELD_BG_ALPHA);
      bg.fillRoundedRect(px, shieldPillY, SHIELD_PILL_W, SHIELD_PILL_H, SHIELD_PILL_RADIUS);
      this.container.add(bg);
      this.shieldBgPills.push(bg);

      // Active pill overlay (neon green, shown when shield is held)
      const active = scene.add.graphics();
      active.fillStyle(SHIELD_ACTIVE_COLOR, SHIELD_ACTIVE_ALPHA);
      active.fillRoundedRect(px, shieldPillY, SHIELD_PILL_W, SHIELD_PILL_H, SHIELD_PILL_RADIUS);
      active.setVisible(false);
      this.container.add(active);
      this.shieldActivePills.push(active);
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

  setRockets(count: number, max: number): void {
    const scene = this.container.scene;

    // Rebuild pips if max changed
    if (max !== this.maxPips) {
      for (const p of this.pips) p.destroy();
      this.pips.length = 0;
      this.maxPips = max;
      const pipY = this.barBottomY + PIP_GAP + PIP_RADIUS;
      for (let i = 0; i < max; i++) {
        const pipX = BAR_X + (i + 0.5) * (PIP_AREA_W / max);
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

  setShields(count: number): void {
    if (count !== this.currentShields) {
      this.currentShields = count;
      for (let i = 0; i < TUNING.SHIELD_MAX; i++) {
        this.shieldActivePills[i].setVisible(i < count);
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
    for (let i = 0; i < this.pips.length; i++) this.pips[i].setVisible(false);
    for (let i = 0; i < this.shieldBgPills.length; i++) this.shieldBgPills[i].setVisible(false);
    for (let i = 0; i < this.shieldActivePills.length; i++) this.shieldActivePills[i].setVisible(false);
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
    for (let i = 0; i < this.shieldBgPills.length; i++) this.shieldBgPills[i].setVisible(true);

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
