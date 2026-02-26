import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isConnected } from '../systems/SpotifyAuthSystem';

// ── HUD tuning (edit these) ──
const HUD_SCALE = 1.0;                    // uniform scale for entire HUD (1.0 = default)
const HUD_ORIGIN_X = TUNING.HUD_PAD_LEFT;  // container X position on screen (from tuning)
const HUD_ORIGIN_Y = TUNING.HUD_PAD_TOP;  // container Y position on screen (from tuning)
const AVATAR_RADIUS = 64;                 // avatar circle radius in px
const AVATAR_STROKE_WIDTH = 10;            // stroke thickness around profile pic
const AVATAR_STROKE_COLOR = 0xffffff;     // stroke color
const AVATAR_STROKE_ALPHA = 1;          // stroke opacity (max 1 — higher causes flash during fade transitions)
const SCORE_FONT_SIZE = 48;               // score text font size in px
const SCORE_GAP_X = 12;                   // horizontal gap between avatar and score
const SCORE_GAP_Y = 4;                    // vertical offset of score from container top
const BAR_W = 450;                        // rage bar width in px (1.5x)
const BAR_H = 28;                         // rage bar height in px
const BAR_SEGMENTS = 10;                  // number of retro segment divisions
const BAR_GAP_Y = 4;                      // vertical gap between score bottom and rage bar
const PIP_GAP = 8;                        // vertical gap below rage bar to pips
const PIP_AREA_W = 200;                   // width used for pip layout (keeps original spacing)

// Slam animation (score HUD effect on point gain)
const SLAM_RISE_MS = 400;               // rise phase: shake + scale up + tilt (ms)
const SLAM_DOWN_MS = 120;               // slam down phase: scale/tilt back to normal (ms)
const SLAM_SCALE = 1.5;                 // max scale at peak of slam (1.0 = normal)
const SLAM_TILT_DEG = 8;                // max random tilt in degrees
const SLAM_SHAKE_PX = 8;                // max shake offset in pixels during rise
const SHOCKWAVE_SCALE = 2.5;            // shockwave end scale
const SHOCKWAVE_MS = 500;               // shockwave duration (ms)
const SHOCKWAVE_CYCLE_MS = 60;          // ms per color cycle step

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

  // Slam animation state
  private slamPhase: 'none' | 'rise' | 'slam' = 'none';
  private slamTimer = 0;
  private slamTilt = 0;
  private slamPendingScore = 0;
  private slamScoreUpdated = false;
  private slamColors: string[] = [];
  private slamCenterX = 0;
  private slamCenterY = 0;

  // Shockwave (behind score text, scales up + fades on slam impact)
  private shockwaveText!: Phaser.GameObjects.Text;
  private shockwavePhase: 'none' | 'active' = 'none';
  private shockwaveTimer = 0;
  private shockwaveColors: string[] = [];

  // Score gating during slam
  private latestScore = 0;
  private debugBox!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    const initHeightScale = Math.min(screen.width, screen.height) / TUNING.HUD_REF_SCREEN_H;
    const initScale = HUD_SCALE * TUNING.HUD_SCALE_MULT * initHeightScale;
    this.container = scene.add.container(HUD_ORIGIN_X, HUD_ORIGIN_Y).setDepth(1300).setScrollFactor(0).setScale(initScale);

    // --- Debug pink bounding box (shows HUD design-width extents) ---
    const debugW = TUNING.TITLE_HUD_BASE_W;
    const debugH = AVATAR_RADIUS * 2 + BAR_GAP_Y + BAR_H + PIP_GAP + 40;
    this.debugBox = scene.add.rectangle(0, 0, debugW, debugH, 0xff69b4, 0.0)
      .setOrigin(0, 0);
    this.debugBox.setStrokeStyle(2, 0xff69b4, 0.0);
    this.container.add(this.debugBox);


    // --- Avatar placeholder (filled circle) ---
    this.avatarCircle = scene.add.circle(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0x555555, 1);
    this.avatarCircle.setStrokeStyle(AVATAR_STROKE_WIDTH, AVATAR_STROKE_COLOR, AVATAR_STROKE_ALPHA);
    this.container.add(this.avatarCircle);

    // --- Clickable hit zone (covers full HUD area for easy mobile tapping) ---
    const hitZone = scene.add.zone(debugW / 2, debugH / 2, debugW, debugH)
      .setInteractive();
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
    // --- Shockwave text (behind score, hidden until slam impact) ---
    this.shockwaveText = scene.add.text(BAR_X + BAR_W, SCORE_Y, '0000000', {
      fontSize: `${SCORE_FONT_SIZE}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5).setScale(this.scoreScale).setVisible(false);
    this.container.add(this.shockwaveText);

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
    this.latestScore = score;
    if (this.slamPhase !== 'none') return; // don't update text during slam animation
    this.scoreText.setText(String(Math.floor(score)).padStart(7, '0'));
    // Recompute scale every frame to guard against late font loading changing metrics
    this.scoreScale = PIP_AREA_W / this.scoreText.width;
    this.scoreText.setScale(this.scoreScale);
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
  adjustForZoom(rageMultiplier: number): void {
    const invR = 1 / rageMultiplier;
    // Screen-height scale: device short edge (stable, ignores Safari chrome)
    const stableH = Math.min(screen.width, screen.height);
    const heightScale = stableH / TUNING.HUD_REF_SCREEN_H;
    const finalScale = HUD_SCALE * TUNING.HUD_SCALE_MULT * heightScale * invR;
    this.container.setScale(finalScale);
    this.container.setPosition(HUD_ORIGIN_X * invR, HUD_ORIGIN_Y * invR);
  }

  setAvatarTexture(key: string): void {
    if (this.avatarImage) {
      this.avatarImage.destroy();
      this.avatarImage = null;
    }
    const scene = this.container.scene;
    this.avatarImage = scene.add.image(AVATAR_X, AVATAR_Y, key);
    this.avatarImage.setDisplaySize(AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    // Insert after avatarCircle so image renders on top
    const circleIdx = this.container.getIndex(this.avatarCircle);
    this.container.addAt(this.avatarImage, circleIdx + 1);
    // Hide the gray fill but keep the stroke ring
    this.avatarCircle.setFillStyle(0x555555, 0);
  }

  onAvatarClick(callback: () => void): void {
    this.clickCallback = callback;
  }

  /** Trigger the score slam animation. Interrupts any active slam (streak). */
  triggerScoreSlam(targetScore: number, colors: string[]): void {
    // Kill any active shockwave
    this.shockwavePhase = 'none';
    this.shockwaveText.setVisible(false);

    // Restore score text to default state before origin swap
    this.scoreText.setOrigin(1, 0);
    this.scoreText.setPosition(BAR_X + BAR_W, SCORE_Y);
    this.scoreText.setRotation(0);
    this.scoreText.setColor('#ffffff');
    this.scoreText.setScale(this.scoreScale);

    // Compute visual center for center-pivot animation
    this.slamCenterX = BAR_X + BAR_W - PIP_AREA_W / 2;
    this.slamCenterY = SCORE_Y + this.scoreText.displayHeight / 2;

    // Swap to center origin for rotation/scale from center
    this.scoreText.setOrigin(0.5, 0.5);
    this.scoreText.setPosition(this.slamCenterX, this.slamCenterY);

    // Set slam state
    this.slamPhase = 'rise';
    this.slamTimer = 0;
    this.slamTilt = Phaser.Math.DegToRad((Math.random() > 0.5 ? 1 : -1) * (1 + Math.random() * (SLAM_TILT_DEG - 1)));
    this.slamPendingScore = targetScore;
    this.slamScoreUpdated = false;
    this.slamColors = colors;
  }

  /** Call every frame during gameplay (dt in seconds). */
  update(dt: number): void {
    // --- Slam animation ---
    if (this.slamPhase === 'rise') {
      this.slamTimer += dt * 1000;
      const t = Math.min(this.slamTimer / SLAM_RISE_MS, 1);

      // Ease-in (quadratic — accelerates into max scale)
      const eased = t * t;

      // Scale: 1 → SLAM_SCALE
      const scale = this.scoreScale * (1 + (SLAM_SCALE - 1) * eased);
      this.scoreText.setScale(scale);

      // Tilt eases in
      this.scoreText.setRotation(this.slamTilt * eased);

      // Shake decays from max to 0
      const shakeDecay = 1 - t;
      const shakeX = (Math.random() - 0.5) * 2 * SLAM_SHAKE_PX * shakeDecay;
      const shakeY = (Math.random() - 0.5) * 2 * SLAM_SHAKE_PX * shakeDecay;
      this.scoreText.setPosition(this.slamCenterX + shakeX, this.slamCenterY + shakeY);

      // Color cycle through type palette
      const colorIdx = Math.floor(Date.now() / SHOCKWAVE_CYCLE_MS) % this.slamColors.length;
      this.scoreText.setColor(this.slamColors[colorIdx]);

      // Midpoint: update score text (hidden in the motion)
      if (!this.slamScoreUpdated && t >= 0.5) {
        this.slamScoreUpdated = true;
        this.scoreText.setText(String(Math.floor(this.slamPendingScore)).padStart(7, '0'));
      }

      // Phase complete → slam down
      if (t >= 1) {
        this.slamPhase = 'slam';
        this.slamTimer = 0;
      }
    } else if (this.slamPhase === 'slam') {
      this.slamTimer += dt * 1000;
      const t = Math.min(this.slamTimer / SLAM_DOWN_MS, 1);

      // Ease-out (starts fast, decelerates — "slams" to rest)
      const eased = 1 - (1 - t) * (1 - t);

      // Scale: SLAM_SCALE → 1
      const scale = this.scoreScale * (SLAM_SCALE - (SLAM_SCALE - 1) * eased);
      this.scoreText.setScale(scale);

      // Tilt: slamTilt → 0
      this.scoreText.setRotation(this.slamTilt * (1 - eased));

      // Settle to center (no shake)
      this.scoreText.setPosition(this.slamCenterX, this.slamCenterY);

      // Continue color cycling
      const colorIdx = Math.floor(Date.now() / SHOCKWAVE_CYCLE_MS) % this.slamColors.length;
      this.scoreText.setColor(this.slamColors[colorIdx]);

      // Phase complete: slam landed
      if (t >= 1) {
        this.slamPhase = 'none';

        // Flash white on impact
        this.scoreText.setColor('#ffffff');

        // Restore origin and position
        this.scoreText.setOrigin(1, 0);
        this.scoreText.setPosition(BAR_X + BAR_W, SCORE_Y);
        this.scoreText.setScale(this.scoreScale);
        this.scoreText.setRotation(0);

        // Apply latest score (may have changed during slam from distance scoring)
        this.scoreText.setText(String(Math.floor(this.latestScore)).padStart(7, '0'));
        this.scoreScale = PIP_AREA_W / this.scoreText.width;
        this.scoreText.setScale(this.scoreScale);

        // Start shockwave underneath
        this.startShockwave();
      }
    }

    // --- Shockwave animation ---
    if (this.shockwavePhase === 'active') {
      this.shockwaveTimer += dt * 1000;
      const t = Math.min(this.shockwaveTimer / SHOCKWAVE_MS, 1);

      // Scale up from normal to SHOCKWAVE_SCALE
      const scale = this.scoreScale * (1 + (SHOCKWAVE_SCALE - 1) * t);
      this.shockwaveText.setScale(scale);

      // Fade out
      this.shockwaveText.setAlpha(1 - t);

      // Color cycle through type palette
      const colorIdx = Math.floor(Date.now() / SHOCKWAVE_CYCLE_MS) % this.shockwaveColors.length;
      this.shockwaveText.setColor(this.shockwaveColors[colorIdx]);

      if (t >= 1) {
        this.shockwavePhase = 'none';
        this.shockwaveText.setVisible(false);
      }
    }
  }

  /** Spawn shockwave copy behind score text on slam impact. */
  private startShockwave(): void {
    this.shockwaveText.setText(this.scoreText.text);
    this.shockwaveText.setOrigin(0.5, 0.5);
    // Position at visual center of score text
    const cx = BAR_X + BAR_W - PIP_AREA_W / 2;
    const cy = SCORE_Y + this.scoreText.displayHeight / 2;
    this.shockwaveText.setPosition(cx, cy);
    this.shockwaveText.setScale(this.scoreScale);
    this.shockwaveText.setAlpha(1);
    this.shockwaveText.setRotation(0);
    this.shockwaveText.setVisible(true);
    this.shockwaveColors = this.slamColors;
    this.shockwavePhase = 'active';
    this.shockwaveTimer = 0;
  }

  /** Cancel any active slam/shockwave and restore score text to default state. */
  private resetSlam(): void {
    this.slamPhase = 'none';
    this.slamTimer = 0;
    this.scoreText.setOrigin(1, 0);
    this.scoreText.setPosition(BAR_X + BAR_W, SCORE_Y);
    this.scoreText.setRotation(0);
    this.scoreText.setColor('#ffffff');
    this.scoreText.setScale(this.scoreScale);
    this.shockwavePhase = 'none';
    this.shockwaveText.setVisible(false);
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
    this.resetSlam();
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
    const scene = this.container.scene;
    this.signInTween = scene.tweens.add({
      targets: this.signInImage,
      alpha: { from: 1, to: 0 },
      duration: 800,
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
