import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { loadOrCreateProfile, updateUsername, uploadAvatarAndSave, disconnectProfile } from '../systems/ProfileSystem';
import { startLogin, isConnected, disconnect } from '../systems/SpotifyAuthSystem';
import { fetchPlayerTop10, fetchWeeklyHistory, type PlayerScore, type WeeklyHistoryEntry } from '../systems/LeaderboardService';
import { getCurrentWeekKey } from '../util/time';
import { DisconnectModal } from './DisconnectModal';

// ── Popup chrome ──
const POPUP_W = 690;
const POPUP_H = 900;
const POPUP_DEPTH = 1400;
const POPUP_RADIUS = 20;
const POPUP_BG = 0x1a1a2e;
const POPUP_BG_ALPHA = 0.95;
const POPUP_BORDER = 0x444466;
const POPUP_BORDER_ALPHA = 0.8;
const BACKDROP_ALPHA = 0.6;

// ── Title ──
const TITLE_Y = -POPUP_H / 2 + 50;
const TITLE_FONT = '36px';
const TITLE_COLOR = '#ffffff';

// ── Avatar ──
const AVATAR_RADIUS = 100;
const AVATAR_TEX_SIZE = 512;
const AVATAR_RING_WIDTH = 3;
const AVATAR_RING_COLOR = 0xffffff;
const AVATAR_RING_ALPHA = 0.8;
const AVATAR_HINT_FONT = '22px';
const AVATAR_HINT_COLOR = '#666666';
const AVATAR_HINT_GAP = 40;              // space below avatar to "click to change"
export const AVATAR_TEXTURE_KEY = 'profile-avatar';

// ── Header layout (avatar left, name+spotify right) ──
const AVATAR_X = -190;                                    // avatar center, popup-relative
const HEADER_Y = -POPUP_H / 2 + 200;                     // vertical center of header row
const RIGHT_CENTER_X = 125;                               // center of right-side boxes
const RIGHT_BOX_W = 350;                                  // name box / spotify btn width
const SPOTIFY_BTN_H = 80;
const NAME_LABEL_OFFSET_Y = -90;                          // from HEADER_Y (aligns NAME top with avatar top)
const NAME_BOX_OFFSET_Y = NAME_LABEL_OFFSET_Y + 46;
const SPOTIFY_BTN_OFFSET_Y = AVATAR_RADIUS - SPOTIFY_BTN_H / 2;  // aligns spotify btn bottom with avatar bottom
const SPOTIFY_CONTENT_SCALE =1.5;

// ── Name box ──
const NAME_MAX_LENGTH = 10;
const NAME_BOX_H = 50;
const NAME_BOX_RADIUS = 8;
const NAME_BOX_BG = 0x222244;
const NAME_BOX_BG_ALPHA = 0.9;
const NAME_BOX_BORDER = 0x666688;
const NAME_BOX_BORDER_ALPHA = 0.6;
const NAME_BOX_FOCUS_COLOR = 0x8888ff;
const NAME_BOX_FOCUS_ALPHA = 0.9;
const NAME_LABEL_FONT = '20px';
const NAME_LABEL_COLOR = '#888888';
const NAME_TEXT_FONT = '28px';
const NAME_TEXT_COLOR = '#ffffff';

// ── Save-progress hint ──
const SAVE_HINT_FONT_SIZE = 30;
const SAVE_HINT_TEXT = 'login to spotify to\nsave your progress';
const SAVE_HINT_COLOR = '#888888';

// ── Scroll panel ──
const SCROLL_AREA_TOP = HEADER_Y + AVATAR_RADIUS + 69;   // below avatar + hint gap
const SCROLL_AREA_BOTTOM = POPUP_H / 2 - 120;            // above exit btn
const SCROLL_PADDING_TOP = 30;
const SCROLL_PADDING_RIGHT = 30;
const SCROLL_PADDING_BOTTOM = 30;
const SCROLL_PADDING_LEFT = 30;
const SCROLL_BG = 0x060608;
const SCROLL_BG_ALPHA = 0.92;
const SCROLL_BG_RADIUS = 12;

// ── Scrollbar ──
const SCROLLBAR_W = 6;
const SCROLLBAR_TRACK_COLOR = 0x222233;
const SCROLLBAR_TRACK_ALPHA = 0.5;
const SCROLLBAR_THUMB_COLOR = 0x666688;
const SCROLLBAR_THUMB_ALPHA = 0.8;
const SCROLLBAR_THUMB_MIN_H = 30;
const SCROLLBAR_INSET = 6;               // inset from edges of scroll area

// ── Rainbow highlight for top-ranked scores ──
const RAINBOW_COLORS = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00CCFF', '#0044FF', '#FF00FF'];
const RAINBOW_INTERVAL = 80;              // ms between color changes
const RAINBOW_RANK_THRESHOLD = 10;        // ranks <= this get rainbow effect

// ── High scores section — yellow headers ──
const SCORES_HEADER_FONT = '22px';
const SCORES_HEADER_COLOR = '#ffcc00';
const SCORES_HEADER_GAP = 40;             // space below header text

// ── High scores section — white row text ──
const SCORES_ROW_FONT = '40px';
const SCORES_ROW_COLOR = '#cccccc';
const SCORES_ROW_H = 64;
const SCORES_EMPTY_COLOR = '#666666';
const SCORES_SECTION_GAP = 30;            // vertical gap between sections

// ── Score row columns (X positions within scrollContent) ──
const SCORES_LEFT_PAD = 20;              // padding from left edge of scroll area to place numbers
const SCORES_RIGHT_PAD = SCORES_LEFT_PAD; // right padding matches left padding
const SCORES_PLACE_W = 80;              // reserved width for place text ("10.")
const SCORES_PLACE_X = -POPUP_W / 2 + SCROLL_PADDING_LEFT + SCORES_LEFT_PAD + SCORES_PLACE_W; // right edge — dots align here
const SCORES_SCORE_COL_W = 280;         // estimated width of score column for centering
const SCORES_SCORE_X = SCORES_SCORE_COL_W / 2; // right edge — centers scores in scroll area
const SCORES_RANK_W = 120;              // reserved width for rank text ("#9999")
const SCORES_RANK_X = POPUP_W / 2 - SCROLL_PADDING_RIGHT - SCORES_RIGHT_PAD - SCORES_RANK_W; // left edge of "#"
const SCORES_WEEK_X = -POPUP_W / 2 + SCROLL_PADDING_LEFT + SCORES_LEFT_PAD; // left edge — same padding as place numbers

// ── Exit button ──
const EXIT_Y = POPUP_H / 2 - 60;
const EXIT_BTN_W = 200;
const EXIT_BTN_H = 50;
const EXIT_BTN_RADIUS = 10;
const EXIT_BTN_BG = 0x442222;
const EXIT_BTN_STROKE = 0xff4444;
const EXIT_BTN_STROKE_ALPHA = 0.6;

// ── Exit button text ──
const EXIT_TEXT_FONT = '28px';
const EXIT_TEXT_COLOR = '#ff4444';

// ── Spotify button ──
const SPOTIFY_BTN_RADIUS =10;
const SPOTIFY_BTN_BG_LOGIN = 0x1DB954;
const SPOTIFY_BTN_BG_CONNECTED = 0x5a0b0b;

// ── Spotify button text ──
const SPOTIFY_TEXT_FONT = 22;
const SPOTIFY_LOGO_H = 26;
const SPOTIFY_LOGO_GAP = 8;

export class ProfilePopup {
  private scene: Phaser.Scene;
  private backdrop: Phaser.GameObjects.Rectangle;
  private container: Phaser.GameObjects.Container;
  private _isOpen = false;
  private closedAt = 0;

  private closeCallback: (() => void) | null = null;
  private profileChangedCallback: ((name: string, hasAvatar: boolean) => void) | null = null;

  // Header
  private avatarPlaceholder: Phaser.GameObjects.Arc;
  private avatarImage: Phaser.GameObjects.Image | null = null;
  private avatarRing: Phaser.GameObjects.Arc;
  private nameText: Phaser.GameObjects.Text;
  private nameBoxFocus: Phaser.GameObjects.Graphics;
  private currentName = 'ANON';
  private nameEditing = false;
  private currentAvatarUrl: string | null = null;

  // Spotify button
  private spotifyBg!: Phaser.GameObjects.Graphics;
  private spotifyLoginText!: Phaser.GameObjects.Text;
  private spotifyLogo!: Phaser.GameObjects.Image;
  private spotifyConnectedText!: Phaser.GameObjects.Text;
  private spotifyHit!: Phaser.GameObjects.Zone;
  private spotifyBtnY = 0;
  private spotifySaveHint!: Phaser.GameObjects.Text;

  // Scroll panel
  private scrollContent!: Phaser.GameObjects.Container;
  private scrollMaskGfx!: Phaser.GameObjects.Graphics;
  private scrollOffset = 0;
  private totalContentHeight = 0;
  private scrollAreaHeight: number;
  private wheelHandler: (e: WheelEvent) => void;

  // Scrollbar
  private scrollbarTrackGfx!: Phaser.GameObjects.Graphics;
  private scrollbarThumbGfx!: Phaser.GameObjects.Graphics;
  private scrollbarHit!: Phaser.GameObjects.Zone;
  private scrollbarDragging = false;

  // Rainbow highlight
  private rainbowTexts: Phaser.GameObjects.Text[] = [];
  private rainbowTimer: Phaser.Time.TimerEvent | null = null;

  // Disconnect modal
  private disconnectModal: DisconnectModal;

  // DOM
  private fileInput: HTMLInputElement;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = TUNING.GAME_WIDTH / 2;
    const cy = TUNING.GAME_HEIGHT / 2;
    this.scrollAreaHeight = SCROLL_AREA_BOTTOM - SCROLL_AREA_TOP;

    /* ---------- Backdrop ---------- */
    this.backdrop = scene.add.rectangle(cx, cy, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT, 0x000000, BACKDROP_ALPHA)
      .setDepth(POPUP_DEPTH).setScrollFactor(0).setInteractive().setVisible(false);

    /* ---------- Container ---------- */
    this.container = scene.add.container(cx, cy)
      .setDepth(POPUP_DEPTH + 1).setScrollFactor(0).setVisible(false);

    /* ---------- Panel BG ---------- */
    const panel = scene.add.graphics();
    panel.fillStyle(POPUP_BG, POPUP_BG_ALPHA);
    panel.fillRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, POPUP_RADIUS);
    panel.lineStyle(2, POPUP_BORDER, POPUP_BORDER_ALPHA);
    panel.strokeRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, POPUP_RADIUS);
    this.container.add(panel);

    /* ---------- Title ---------- */
    this.container.add(
      scene.add.text(0, TITLE_Y, 'PROFILE', {
        fontSize: TITLE_FONT, fontFamily: 'Early GameBoy', color: TITLE_COLOR,
      }).setOrigin(0.5),
    );

    /* ======== HEADER: Avatar (left) + Name/Spotify (right) ======== */
    const avatarY = HEADER_Y;

    this.avatarPlaceholder = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS, 0x000000, 1);
    this.container.add(this.avatarPlaceholder);

    this.avatarRing = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS + AVATAR_RING_WIDTH, 0x000000, 0);
    this.avatarRing.setStrokeStyle(AVATAR_RING_WIDTH, AVATAR_RING_COLOR, AVATAR_RING_ALPHA);
    this.container.add(this.avatarRing);

    this.container.add(
      scene.add.text(AVATAR_X, avatarY + AVATAR_RADIUS + AVATAR_HINT_GAP, 'click to change', {
        fontSize: AVATAR_HINT_FONT, fontFamily: 'monospace', color: AVATAR_HINT_COLOR,
      }).setOrigin(0.5),
    );

    const avatarHit = scene.add.zone(AVATAR_X, avatarY, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2)
      .setInteractive(
        new Phaser.Geom.Circle(AVATAR_RADIUS, AVATAR_RADIUS, AVATAR_RADIUS),
        Phaser.Geom.Circle.Contains,
      );
    avatarHit.on('pointerdown', () => this.openFilePicker());
    this.container.add(avatarHit);

    /* ---- Right side: Name ---- */
    const nameLabelY = avatarY + NAME_LABEL_OFFSET_Y;
    const nameBoxY = avatarY + NAME_BOX_OFFSET_Y;
    this.spotifyBtnY = avatarY + SPOTIFY_BTN_OFFSET_Y;

    this.container.add(
      scene.add.text(RIGHT_CENTER_X, nameLabelY, 'NAME', {
        fontSize: NAME_LABEL_FONT, fontFamily: 'monospace', color: NAME_LABEL_COLOR,
      }).setOrigin(0.5),
    );

    const nameBox = scene.add.graphics();
    nameBox.fillStyle(NAME_BOX_BG, NAME_BOX_BG_ALPHA);
    nameBox.fillRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    nameBox.lineStyle(1, NAME_BOX_BORDER, NAME_BOX_BORDER_ALPHA);
    nameBox.strokeRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    this.container.add(nameBox);

    this.nameBoxFocus = scene.add.graphics();
    this.nameBoxFocus.lineStyle(2, NAME_BOX_FOCUS_COLOR, NAME_BOX_FOCUS_ALPHA);
    this.nameBoxFocus.strokeRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    this.nameBoxFocus.setVisible(false);
    this.container.add(this.nameBoxFocus);

    this.nameText = scene.add.text(RIGHT_CENTER_X, nameBoxY, 'ANON', {
      fontSize: NAME_TEXT_FONT, fontFamily: 'monospace', color: NAME_TEXT_COLOR,
    }).setOrigin(0.5);
    this.container.add(this.nameText);

    const nameHit = scene.add.zone(RIGHT_CENTER_X, nameBoxY, RIGHT_BOX_W, NAME_BOX_H)
      .setInteractive({ useHandCursor: true });
    nameHit.on('pointerdown', () => this.startNameEditing());
    this.container.add(nameHit);

    /* ---- Right side: Spotify button ---- */
    this.spotifyBg = scene.add.graphics();
    this.container.add(this.spotifyBg);

    const sFontSize = Math.round(SPOTIFY_TEXT_FONT * SPOTIFY_CONTENT_SCALE);
    this.spotifyLoginText = scene.add.text(0, this.spotifyBtnY, 'Login to ', {
      fontSize: `${sFontSize}px`, fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0, 0.5);
    this.container.add(this.spotifyLoginText);

    this.spotifyLogo = scene.add.image(0, this.spotifyBtnY, 'spotify-text-logo').setOrigin(0, 0.5);
    this.spotifyLogo.setScale((SPOTIFY_LOGO_H * SPOTIFY_CONTENT_SCALE) / this.spotifyLogo.height);
    this.container.add(this.spotifyLogo);

    this.spotifyConnectedText = scene.add.text(0, this.spotifyBtnY, 'Connected', {
      fontSize: `${sFontSize}px`, fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);
    this.container.add(this.spotifyConnectedText);

    // Scene-level hit zone for spotify button
    this.spotifyHit = scene.add.zone(cx + RIGHT_CENTER_X, cy + this.spotifyBtnY, RIGHT_BOX_W, SPOTIFY_BTN_H)
      .setDepth(POPUP_DEPTH + 2).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    this.spotifyHit.on('pointerdown', async () => {
      if (isConnected()) {
        const confirmed = await this.disconnectModal.show();
        if (confirmed) {
          await disconnectProfile();
          disconnect();
          this.updateSpotifyButton();
          this.scene.events.emit('spotify-auth-changed');
          this.loadScoreData();
        }
      } else {
        const success = await startLogin();
        if (success) {
          this.updateSpotifyButton();
          this.scene.events.emit('spotify-auth-changed');
          this.loadProfile();
          this.loadScoreData();
        }
      }
    });

    /* ---- Save-progress hint (shown in scroll area when not connected) ---- */
    this.spotifySaveHint = scene.add.text(0, (SCROLL_AREA_TOP + SCROLL_AREA_BOTTOM) / 2, SAVE_HINT_TEXT, {
      fontSize: `${SAVE_HINT_FONT_SIZE}px`, fontFamily: 'Alagard',
      color: SAVE_HINT_COLOR, align: 'center', wordWrap: { width: POPUP_W - 60 },
    }).setOrigin(0.5).setVisible(false);
    this.container.add(this.spotifySaveHint);

    /* ======== SCROLL PANEL ======== */
    const scrollBgX = -POPUP_W / 2 + SCROLL_PADDING_LEFT;
    const scrollBgW = POPUP_W - SCROLL_PADDING_LEFT - SCROLL_PADDING_RIGHT;

    // Dark rounded background
    const scrollBg = scene.add.graphics();
    scrollBg.fillStyle(SCROLL_BG, SCROLL_BG_ALPHA);
    scrollBg.fillRoundedRect(scrollBgX, SCROLL_AREA_TOP, scrollBgW, this.scrollAreaHeight, SCROLL_BG_RADIUS);
    this.container.add(scrollBg);

    // Scrollable content container
    this.scrollContent = scene.add.container(0, SCROLL_AREA_TOP);
    this.container.add(this.scrollContent);

    // Rounded mask (clips content to rounded bg shape)
    this.scrollMaskGfx = scene.make.graphics({});
    this.scrollMaskGfx.fillRoundedRect(
      cx + scrollBgX,
      cy + SCROLL_AREA_TOP,
      scrollBgW,
      this.scrollAreaHeight,
      SCROLL_BG_RADIUS,
    );
    this.scrollContent.setMask(this.scrollMaskGfx.createGeometryMask());

    // Scrollbar track
    const trackX = POPUP_W / 2 - SCROLL_PADDING_RIGHT - SCROLLBAR_INSET;
    const trackTop = SCROLL_AREA_TOP + SCROLLBAR_INSET;
    const trackH = this.scrollAreaHeight - SCROLLBAR_INSET * 2;
    this.scrollbarTrackGfx = scene.add.graphics();
    this.scrollbarTrackGfx.fillStyle(SCROLLBAR_TRACK_COLOR, SCROLLBAR_TRACK_ALPHA);
    this.scrollbarTrackGfx.fillRoundedRect(trackX - SCROLLBAR_W, trackTop, SCROLLBAR_W, trackH, SCROLLBAR_W / 2);
    this.container.add(this.scrollbarTrackGfx);

    // Scrollbar thumb (redrawn dynamically)
    this.scrollbarThumbGfx = scene.add.graphics();
    this.container.add(this.scrollbarThumbGfx);

    // Scrollbar hit zone (scene-level for reliable input)
    this.scrollbarHit = scene.add.zone(
      cx + trackX - SCROLLBAR_W / 2,
      cy + SCROLL_AREA_TOP + this.scrollAreaHeight / 2,
      SCROLLBAR_W + 20,
      this.scrollAreaHeight,
    ).setDepth(POPUP_DEPTH + 2).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setVisible(false);

    this.scrollbarHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.scrollbarDragging = true;
      this.applyScrollFromPointer(pointer.y);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.scrollbarDragging) this.applyScrollFromPointer(pointer.y);
    });
    scene.input.on('pointerup', () => { this.scrollbarDragging = false; });

    this.wheelHandler = (e: WheelEvent) => {
      if (!this._isOpen) return;
      e.preventDefault();
      const maxScroll = Math.max(0, this.totalContentHeight - this.scrollAreaHeight);
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + e.deltaY * 0.5, 0, maxScroll);
      this.scrollContent.y = SCROLL_AREA_TOP - this.scrollOffset;
      this.updateScrollbar();
    };

    /* ======== EXIT BUTTON ======== */
    const exitBg = scene.add.graphics();
    exitBg.fillStyle(EXIT_BTN_BG, 0.9);
    exitBg.fillRoundedRect(-EXIT_BTN_W / 2, EXIT_Y - EXIT_BTN_H / 2, EXIT_BTN_W, EXIT_BTN_H, EXIT_BTN_RADIUS);
    exitBg.lineStyle(2, EXIT_BTN_STROKE, EXIT_BTN_STROKE_ALPHA);
    exitBg.strokeRoundedRect(-EXIT_BTN_W / 2, EXIT_Y - EXIT_BTN_H / 2, EXIT_BTN_W, EXIT_BTN_H, EXIT_BTN_RADIUS);
    this.container.add(exitBg);

    this.container.add(
      scene.add.text(0, EXIT_Y, 'EXIT', {
        fontSize: EXIT_TEXT_FONT, fontFamily: 'monospace', fontStyle: 'bold', color: EXIT_TEXT_COLOR,
      }).setOrigin(0.5),
    );

    const exitHit = scene.add.zone(0, EXIT_Y, EXIT_BTN_W, EXIT_BTN_H)
      .setInteractive({ useHandCursor: true });
    exitHit.on('pointerdown', () => this.close());
    this.container.add(exitHit);

    /* ---- Misc ---- */
    this.disconnectModal = new DisconnectModal(scene);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this.onFileSelected());
  }

  /* ============ Public API ============ */

  loadProfile(): void {
    loadOrCreateProfile().then((profile) => {
      this.currentName = profile.username;
      this.nameText.setText(profile.username);
      if (profile.avatar_url) {
        this.currentAvatarUrl = profile.avatar_url;
        this.loadAvatarFromUrl(profile.avatar_url);
      }
      if (this.profileChangedCallback) {
        this.profileChangedCallback(
          this.currentName,
          !!profile.avatar_url || this.scene.textures.exists(AVATAR_TEXTURE_KEY),
        );
      }
    }).catch((err) => console.warn('ProfilePopup: profile load failed', err));
  }

  open(initialName?: string): void {
    if (this._isOpen) return;
    this._isOpen = true;
    if (initialName !== undefined) {
      this.currentName = initialName;
      this.nameText.setText(initialName);
    }
    this.backdrop.setVisible(true);
    this.container.setVisible(true);
    this.spotifyHit.setVisible(true);
    this.scrollbarHit.setVisible(true);
    this.updateSpotifyButton();
    this.loadScoreData();
    this.scene.game.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  close(): void {
    if (!this._isOpen) return;
    if (this.nameEditing) this.stopNameEditing();
    this._isOpen = false;
    this.closedAt = Date.now();
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.spotifyHit.setVisible(false);
    this.scrollbarHit.setVisible(false);
    this.scrollbarDragging = false;
    this.stopRainbow();
    this.scene.game.canvas.removeEventListener('wheel', this.wheelHandler);
    if (this.closeCallback) this.closeCallback();
  }

  isOpen(): boolean {
    if (!this._isOpen && Date.now() - this.closedAt < 100) return true;
    return this._isOpen;
  }

  isEditingName(): boolean { return this.nameEditing; }

  handleKey(event: KeyboardEvent): void {
    if (this.nameEditing) {
      if (event.key === 'Escape' || event.key === 'Enter') { this.stopNameEditing(); return; }
      if (event.key === 'Backspace') {
        this.currentName = this.currentName.slice(0, -1);
      } else if (event.key.length === 1 && this.currentName.length < NAME_MAX_LENGTH) {
        this.currentName += event.key.toUpperCase();
      }
      this.nameText.setText(this.currentName + '_');
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  getName(): string { return this.currentName; }

  getAvatarTextureKey(): string | null {
    return this.scene.textures.exists(AVATAR_TEXTURE_KEY) ? AVATAR_TEXTURE_KEY : null;
  }

  onCloseCallback(cb: () => void): void { this.closeCallback = cb; }

  onProfileChanged(cb: (name: string, hasAvatar: boolean) => void): void { this.profileChangedCallback = cb; }

  /* ============ Private ============ */

  private updateScrollbar(): void {
    this.scrollbarThumbGfx.clear();
    const maxScroll = Math.max(0, this.totalContentHeight - this.scrollAreaHeight);
    if (maxScroll <= 0) {
      this.scrollbarThumbGfx.setVisible(false);
      this.scrollbarTrackGfx.setVisible(false);
      return;
    }
    this.scrollbarThumbGfx.setVisible(true);
    this.scrollbarTrackGfx.setVisible(true);

    const trackX = POPUP_W / 2 - SCROLL_PADDING_RIGHT - SCROLLBAR_INSET;
    const trackTop = SCROLL_AREA_TOP + SCROLLBAR_INSET;
    const trackH = this.scrollAreaHeight - SCROLLBAR_INSET * 2;
    const thumbH = Math.max(SCROLLBAR_THUMB_MIN_H, (this.scrollAreaHeight / this.totalContentHeight) * trackH);
    const scrollFraction = this.scrollOffset / maxScroll;
    const thumbY = trackTop + scrollFraction * (trackH - thumbH);

    this.scrollbarThumbGfx.fillStyle(SCROLLBAR_THUMB_COLOR, SCROLLBAR_THUMB_ALPHA);
    this.scrollbarThumbGfx.fillRoundedRect(trackX - SCROLLBAR_W, thumbY, SCROLLBAR_W, thumbH, SCROLLBAR_W / 2);
  }

  private applyScrollFromPointer(worldY: number): void {
    const cy = TUNING.GAME_HEIGHT / 2;
    const trackTop = cy + SCROLL_AREA_TOP + SCROLLBAR_INSET;
    const trackH = this.scrollAreaHeight - SCROLLBAR_INSET * 2;
    const fraction = Phaser.Math.Clamp((worldY - trackTop) / trackH, 0, 1);
    const maxScroll = Math.max(0, this.totalContentHeight - this.scrollAreaHeight);
    this.scrollOffset = fraction * maxScroll;
    this.scrollContent.y = SCROLL_AREA_TOP - this.scrollOffset;
    this.updateScrollbar();
  }

  private startRainbow(): void {
    this.stopRainbow();
    if (this.rainbowTexts.length === 0) return;
    this.rainbowTimer = this.scene.time.addEvent({
      delay: RAINBOW_INTERVAL,
      loop: true,
      callback: () => {
        const idx = Math.floor(Date.now() / RAINBOW_INTERVAL) % RAINBOW_COLORS.length;
        for (const t of this.rainbowTexts) t.setColor(RAINBOW_COLORS[idx]);
      },
    });
  }

  private stopRainbow(): void {
    if (this.rainbowTimer) {
      this.rainbowTimer.destroy();
      this.rainbowTimer = null;
    }
  }

  private updateSpotifyButton(): void {
    const connected = isConnected();

    this.spotifyBg.clear();
    this.spotifyBg.fillStyle(connected ? SPOTIFY_BTN_BG_CONNECTED : SPOTIFY_BTN_BG_LOGIN, 1);
    this.spotifyBg.fillRoundedRect(
      RIGHT_CENTER_X - RIGHT_BOX_W / 2,
      this.spotifyBtnY - SPOTIFY_BTN_H / 2,
      RIGHT_BOX_W, SPOTIFY_BTN_H, SPOTIFY_BTN_RADIUS,
    );

    this.spotifySaveHint.setVisible(!connected);

    if (connected) {
      this.spotifyLoginText.setVisible(false);
      this.spotifyConnectedText.setVisible(true);
      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const totalW = logoW + SPOTIFY_LOGO_GAP + this.spotifyConnectedText.width;
      const startX = RIGHT_CENTER_X - totalW / 2;
      this.spotifyLogo.setPosition(startX, this.spotifyBtnY);
      this.spotifyConnectedText.setPosition(startX + logoW + SPOTIFY_LOGO_GAP, this.spotifyBtnY);
    } else {
      this.spotifyLoginText.setVisible(true);
      this.spotifyConnectedText.setVisible(false);
      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const comboW = this.spotifyLoginText.width + logoW;
      const startX = RIGHT_CENTER_X - comboW / 2;
      this.spotifyLoginText.setPosition(startX, this.spotifyBtnY);
      this.spotifyLogo.setPosition(startX + this.spotifyLoginText.width, this.spotifyBtnY);
    }
  }

  /** Fetch and render score data in the scroll panel. */
  private async loadScoreData(): Promise<void> {
    this.scrollContent.removeAll(true);
    this.rainbowTexts = [];
    this.stopRainbow();
    this.scrollOffset = 0;
    this.scrollContent.y = SCROLL_AREA_TOP;

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (!isLocal && !isConnected()) {
      this.spotifySaveHint.setVisible(true);
      return;
    }
    this.spotifySaveHint.setVisible(false);

    let top10: PlayerScore[];
    let history: WeeklyHistoryEntry[];

    if (isLocal) {
      top10 = [
        { score: 9999999999, rank: 1 },
        { score: 8750420, rank: 3 },
        { score: 7231085, rank: 7 },
        { score: 5900312, rank: 12 },
        { score: 4480099, rank: 25 },
        { score: 3120777, rank: 48 },
        { score: 2005614, rank: 99 },
        { score: 1450230, rank: 184 },
        { score: 870045, rank: 302 },
        { score: 123456, rank: 9999 },
      ];
      history = [
        { weekId: '2026-W07', bestScore: 9999999999, rank: 1 },
        { weekId: '2026-W06', bestScore: 6543210, rank: 5 },
        { weekId: '2026-W05', bestScore: 4321098, rank: 14 },
        { weekId: '2026-W04', bestScore: 2109876, rank: 42 },
        { weekId: '2026-W03', bestScore: 987654, rank: 128 },
        { weekId: '2026-W02', bestScore: 543210, rank: 256 },
        { weekId: '2026-W01', bestScore: 100000, rank: 9999 },
      ];
    } else {
      [top10, history] = await Promise.all([
        fetchPlayerTop10(),
        fetchWeeklyHistory(),
      ]);
    }

    let y = SCROLL_PADDING_TOP;
    const weekId = getCurrentWeekKey();

    // ---- TOP 10 THIS WEEK ----
    this.scrollContent.add(
      this.scene.add.text(0, y, `TOP 10 — ${weekId}`, {
        fontSize: SCORES_HEADER_FONT, fontFamily: 'Early GameBoy', color: SCORES_HEADER_COLOR,
      }).setOrigin(0.5, 0),
    );
    y += SCORES_HEADER_GAP;

    const rowStyle = { fontSize: SCORES_ROW_FONT, fontFamily: 'monospace', color: SCORES_ROW_COLOR };

    if (top10.length === 0) {
      this.scrollContent.add(
        this.scene.add.text(0, y, 'No scores yet', {
          fontSize: SCORES_ROW_FONT, fontFamily: 'monospace', color: SCORES_EMPTY_COLOR,
        }).setOrigin(0.5, 0),
      );
      y += SCORES_ROW_H;
    } else {
      for (let i = 0; i < top10.length; i++) {
        const e = top10[i];
        const placeT = this.scene.add.text(SCORES_PLACE_X, y, `${i + 1}.`, rowStyle).setOrigin(1, 0);
        const scoreT = this.scene.add.text(SCORES_SCORE_X, y, e.score.toLocaleString(), rowStyle).setOrigin(1, 0);
        const rankT = this.scene.add.text(SCORES_RANK_X, y, `#${e.rank}`, rowStyle).setOrigin(0, 0);
        this.scrollContent.add([placeT, scoreT, rankT]);
        if (e.rank <= RAINBOW_RANK_THRESHOLD) {
          this.rainbowTexts.push(placeT, scoreT, rankT);
        }
        y += SCORES_ROW_H;
      }
    }

    y += SCORES_SECTION_GAP;

    // ---- WEEKLY HISTORY ----
    this.scrollContent.add(
      this.scene.add.text(0, y, 'WEEKLY HISTORY', {
        fontSize: SCORES_HEADER_FONT, fontFamily: 'Early GameBoy', color: SCORES_HEADER_COLOR,
      }).setOrigin(0.5, 0),
    );
    y += SCORES_HEADER_GAP;

    if (history.length === 0) {
      this.scrollContent.add(
        this.scene.add.text(0, y, 'No history yet', {
          fontSize: SCORES_ROW_FONT, fontFamily: 'monospace', color: SCORES_EMPTY_COLOR,
        }).setOrigin(0.5, 0),
      );
      y += SCORES_ROW_H;
    } else {
      for (const h of history) {
        const weekT = this.scene.add.text(SCORES_WEEK_X, y, `Y${h.weekId.slice(2, 4)}-W${parseInt(h.weekId.split('W')[1])}`, rowStyle).setOrigin(0, 0);
        const scoreT = this.scene.add.text(SCORES_SCORE_X, y, h.bestScore.toLocaleString(), rowStyle).setOrigin(1, 0);
        const rankT = this.scene.add.text(SCORES_RANK_X, y, `#${h.rank}`, rowStyle).setOrigin(0, 0);
        this.scrollContent.add([weekT, scoreT, rankT]);
        if (h.rank <= RAINBOW_RANK_THRESHOLD) {
          this.rainbowTexts.push(weekT, scoreT, rankT);
        }
        y += SCORES_ROW_H;
      }
    }

    y += SCROLL_PADDING_BOTTOM;
    this.totalContentHeight = y;
    this.updateScrollbar();
    this.startRainbow();
  }

  private startNameEditing(): void {
    if (this.nameEditing) return;
    this.nameEditing = true;
    this.nameBoxFocus.setVisible(true);
    if (this.currentName === 'ANON') this.currentName = '';
    this.nameText.setText(this.currentName + '_');
  }

  private stopNameEditing(): void {
    if (!this.nameEditing) return;
    this.nameEditing = false;
    this.nameBoxFocus.setVisible(false);
    if (this.currentName.trim() === '') this.currentName = 'ANON';
    this.nameText.setText(this.currentName);

    if (this.profileChangedCallback) {
      this.profileChangedCallback(this.currentName, this.scene.textures.exists(AVATAR_TEXTURE_KEY));
    }

    const localName = this.currentName;
    updateUsername(localName).then((savedName) => {
      if (savedName !== localName) {
        this.currentName = savedName;
        if (!this.nameEditing) this.nameText.setText(savedName);
        if (this.profileChangedCallback) {
          this.profileChangedCallback(savedName, this.scene.textures.exists(AVATAR_TEXTURE_KEY));
        }
      }
    }).catch((err) => console.warn('ProfilePopup: username save failed', err));
  }

  private openFilePicker(): void {
    if (this.nameEditing) this.stopNameEditing();
    this.fileInput.click();
  }

  private onFileSelected(): void {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    uploadAvatarAndSave(file).then((url) => {
      if (url) this.currentAvatarUrl = url;
    }).catch((err) => console.warn('ProfilePopup: avatar upload failed', err));

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.applyAvatarFromImageElement(img);
        if (this.profileChangedCallback) {
          this.profileChangedCallback(this.currentName, true);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    this.fileInput.value = '';
  }

  private applyAvatarFromImageElement(img: HTMLImageElement): void {
    const size = AVATAR_TEX_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scale = Math.max(size / img.width, size / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);

    if (this.scene.textures.exists(AVATAR_TEXTURE_KEY)) {
      this.scene.textures.remove(AVATAR_TEXTURE_KEY);
    }
    this.scene.textures.addCanvas(AVATAR_TEXTURE_KEY, canvas);
    this.updatePopupAvatar();
  }

  private loadAvatarFromUrl(url: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.applyAvatarFromImageElement(img);
      if (this.profileChangedCallback) {
        this.profileChangedCallback(this.currentName, true);
      }
    };
    img.onerror = () => console.warn('ProfilePopup: avatar URL load failed', url);
    img.src = url;
  }

  private updatePopupAvatar(): void {
    if (this.avatarImage) {
      this.avatarImage.destroy();
      this.avatarImage = null;
    }
    this.avatarImage = this.scene.add.image(AVATAR_X, HEADER_Y, AVATAR_TEXTURE_KEY);
    this.avatarImage.setDisplaySize(AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    this.container.addAt(this.avatarImage, 3);
  }

  destroy(): void {
    this.stopRainbow();
    this.scene.game.canvas.removeEventListener('wheel', this.wheelHandler);
    this.disconnectModal.destroy();
    this.scrollMaskGfx.destroy();
    this.scrollbarHit.destroy();
    this.spotifyHit.destroy();
    this.container.destroy();
    this.backdrop.destroy();
    this.fileInput.remove();
  }
}
