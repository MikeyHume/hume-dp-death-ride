import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';
import { loadOrCreateProfile, updateUsername, uploadAvatarAndSave, disconnectProfile } from '../systems/ProfileSystem';
import { startLogin, isConnected, disconnect } from '../systems/SpotifyAuthSystem';
import { fetchPlayerTop10, fetchWeeklyHistory, type PlayerScore, type WeeklyHistoryEntry } from '../systems/LeaderboardService';
import { getCurrentWeekKey } from '../util/time';
import { DisconnectModal } from './DisconnectModal';

// ── Popup chrome ──
const isMobile = GAME_MODE.mobileMode;
const POPUP_W = isMobile ? 1580 : 890;
const POPUP_H = 900;
const POPUP_DEPTH = 1400;
const POPUP_RADIUS = 20;
const POPUP_BG = 0x1a1a2e;
const POPUP_BG_ALPHA = 0.95;
const POPUP_BORDER = 0x444466;
const POPUP_BORDER_ALPHA = 0.8;
const BACKDROP_ALPHA = 0.6;

// ── Avatar ──
const AVATAR_RADIUS = 100;
const AVATAR_TEX_SIZE = 512;
const AVATAR_RING_WIDTH = 6;          // stroke thickness of the ring around the avatar
const AVATAR_RING_COLOR = 0xffffff;
const AVATAR_RING_ALPHA = 1;
const AVATAR_HINT_FONT = '32px';
const AVATAR_HINT_COLOR = '#666666';
const AVATAR_HINT_GAP = 40;              // space below avatar to "click to change"
const AVATAR_OVERLAY_ALPHA = 0.2;        // black overlay opacity on avatar (behind add-pic icon)
const AVATAR_ADD_ICON_SCALE = 0.1;       // scale of add_pic_icon on avatar
export const AVATAR_TEXTURE_KEY = 'profile-avatar';

// ── Exit button (square "X" in upper-right corner) ──
const EXIT_MOB_SCALE = isMobile ? 3 : 1;
const EXIT_BTN_SIZE = 50 * EXIT_MOB_SCALE;
const EXIT_BTN_PAD = 40;
const EXIT_X = POPUP_W / 2 - EXIT_BTN_PAD - EXIT_BTN_SIZE / 2;
const EXIT_Y = -POPUP_H / 2 + EXIT_BTN_PAD + EXIT_BTN_SIZE / 2;
const EXIT_BTN_RADIUS = 10;
const EXIT_BTN_BG = 0x442222;
const EXIT_BTN_STROKE = 0xff4444;
const EXIT_BTN_STROKE_ALPHA = 0.6;
const EXIT_TEXT_FONT = `${28 * EXIT_MOB_SCALE}px`;
const EXIT_TEXT_COLOR = '#ff4444';

// ── Title (vertically centered on exit button, same height) ──
const TITLE_Y = EXIT_Y;
const TITLE_FONT = `${EXIT_BTN_SIZE / 2}px`;
const TITLE_COLOR = '#ffffff';

// ── Header layout (avatar left, name+spotify right) ──
const HEADER_Y = EXIT_Y + EXIT_BTN_SIZE / 2 + 40 + AVATAR_RADIUS;  // 40px below exit button bottom
const RIGHT_CENTER_X = 125;                               // center of right-side boxes (desktop)
const RIGHT_BOX_W = 350;                                  // name box / spotify btn width (desktop)
const SPOTIFY_BTN_H = 80;

// ── Avatar + Name group (centered as a unit on mobile, 80px gap) ──
const NAME_BOX_W = isMobile ? 828 : RIGHT_BOX_W;
const NAME_GAP = isMobile ? 80 : 0;
const GROUP_W = AVATAR_RADIUS * 2 + NAME_GAP + NAME_BOX_W;
const AVATAR_X = isMobile ? -GROUP_W / 2 + AVATAR_RADIUS : -190;
const NAME_CENTER_X = isMobile ? -GROUP_W / 2 + AVATAR_RADIUS * 2 + NAME_GAP + NAME_BOX_W / 2 : RIGHT_CENTER_X;

// ── Name group vertical (bottom-aligned with avatar, 4/5 height for box, 1/5 for title) ──
const NAME_LABEL_OFFSET_Y = isMobile ? -85 : -90;
const NAME_BOX_OFFSET_Y = isMobile ? 20 : NAME_LABEL_OFFSET_Y + 46;
const SPOTIFY_BTN_OFFSET_Y = AVATAR_RADIUS - SPOTIFY_BTN_H / 2;  // aligns spotify btn bottom with avatar bottom
const SPOTIFY_BTN_CENTER_X = isMobile ? 0 : RIGHT_CENTER_X;
const SPOTIFY_BTN_W_EFF = isMobile ? GROUP_W : RIGHT_BOX_W;
const SPOTIFY_BTN_H_EFF = isMobile ? SPOTIFY_BTN_H * 3 : SPOTIFY_BTN_H;
const SPOTIFY_CONTENT_SCALE = isMobile ? 4.5 : 1.5;
const SPOTIFY_BTN_SCALE = 0.7;                            // visual scale of spotify button (center stays fixed)

// ── Name box ──
const NAME_MAX_LENGTH = 10;
const NAME_BOX_H = isMobile ? 160 : 50;
const NAME_BOX_RADIUS = isMobile ? 24 : 8;
const NAME_BOX_BG = 0x222244;
const NAME_BOX_BG_ALPHA = 0.9;
const NAME_BOX_BORDER = 0x666688;
const NAME_BOX_BORDER_ALPHA = 0.6;
const NAME_BOX_FOCUS_COLOR = 0x8888ff;
const NAME_BOX_FOCUS_ALPHA = 0.9;
const NAME_LABEL_FONT = isMobile ? '28px' : '20px';
const NAME_LABEL_COLOR = '#888888';
const NAME_TEXT_FONT = isMobile ? '72px' : '28px';
const NAME_TEXT_COLOR = '#ffffff';

// ── Save-progress hint (shown in group area when not logged in) ──
const SAVE_HINT_FONT_SIZE = 30;
const SAVE_HINT_SCALE = 3;                                    // adjustable scale from center
const SAVE_HINT_TEXT = 'login to spotify to\nsave your progress';
const SAVE_HINT_COLOR = '#888888';

// ── Spotify button Y (mobile: 100px below avatar group) ──
const SPOTIFY_MOB_BTN_Y = HEADER_Y + AVATAR_RADIUS + 100 + SPOTIFY_BTN_H_EFF / 2;

// ── Pagination dots (40px from popup bottom edge) ──
const MOB = isMobile ? 2 : 1;
const DOT_RADIUS = 10 * MOB;
const DOT_GAP = 40 + DOT_RADIUS * 2;
const DOT_Y = POPUP_H / 2 - 40 - DOT_RADIUS;
const DOT_STROKE_W = 2;
const DOT_ACTIVE_SCALE = 1.15;
const PAGE_COUNT = 2;
const SWIPE_THRESHOLD = 50;

// ── Scroll panel (page 2 — full height between title and dots) ──
const SCROLL_AREA_TOP = TITLE_Y + EXIT_BTN_SIZE / 2 + 50;
const SCROLL_AREA_BOTTOM = DOT_Y - DOT_RADIUS - 50;
const SCROLL_PADDING_TOP = 30 * MOB;
const SCROLL_PADDING_RIGHT = 50;
const SCROLL_PADDING_BOTTOM = 30 * MOB;
const SCROLL_PADDING_LEFT = 50;
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
const SCORES_HEADER_FONT = `${22 * MOB}px`;
const SCORES_HEADER_COLOR = '#ffcc00';
const SCORES_HEADER_GAP = 40 * MOB;

// ── High scores section — white row text ──
const SCORES_ROW_FONT = `${40 * MOB}px`;
const SCORES_ROW_COLOR = '#cccccc';
const SCORES_ROW_H = 64 * MOB;
const SCORES_EMPTY_COLOR = '#666666';
const SCORES_SECTION_GAP = 30 * MOB;

// ── Score row columns (X positions within scrollContent) ──
const SCORES_LEFT_PAD = 20 * MOB;
const SCORES_RIGHT_PAD = 20 * MOB;
const SCORES_RANK_W = 120 * MOB;
const SCORES_RANK_X = -POPUP_W / 2 + SCROLL_PADDING_LEFT + SCORES_LEFT_PAD;            // left edge of rank (origin 0,0)
const SCORES_GAP = 10 * MOB;                                                            // gap between rank and score
const SCORES_SCORE_X = SCORES_RANK_X + SCORES_RANK_W + SCORES_GAP;                      // left edge of score (origin 0,0)
const SCORES_WEEK_X = POPUP_W / 2 - SCROLL_PADDING_RIGHT - SCORES_RIGHT_PAD;            // right edge of week (origin 1,0)

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

  // Title
  private titleText!: Phaser.GameObjects.Text;

  // Header
  private avatarPlaceholder: Phaser.GameObjects.Arc;
  private avatarImage: Phaser.GameObjects.Image | null = null;
  private avatarRing: Phaser.GameObjects.Arc;
  private avatarHint!: Phaser.GameObjects.Text;
  private avatarOverlay!: Phaser.GameObjects.Arc;
  private avatarAddIcon!: Phaser.GameObjects.Image;
  private avatarHit!: Phaser.GameObjects.Zone;
  private nameText: Phaser.GameObjects.Text;
  private nameBoxFocus: Phaser.GameObjects.Graphics;
  private currentName = 'ANON';
  private nameEditing = false;
  private currentAvatarUrl: string | null = null;
  private profileLoadGen = 0;
  private openedOnDeathScreen = false;
  private openedDuringGameplay = false;

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

  // Pagination
  private currentPage = 0;
  private page1Elements: Phaser.GameObjects.GameObject[] = [];
  private page2Elements: Phaser.GameObjects.GameObject[] = [];
  private avatarNameGroup: Phaser.GameObjects.GameObject[] = [];
  private dots: Phaser.GameObjects.Arc[] = [];
  private swipeStartX = 0;

  // Disconnect modal
  private disconnectModal: DisconnectModal;

  // DOM
  private fileInput: HTMLInputElement;
  private nameInput: HTMLInputElement;
  private debugAvatarOverlay = false;
  private _savedCaptures: number[] = [];
  private _kbResizeHandler: (() => void) | null = null;
  private _origContainerY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = GAME_MODE.canvasWidth / 2;
    const cy = TUNING.GAME_HEIGHT / 2;
    this.scrollAreaHeight = SCROLL_AREA_BOTTOM - SCROLL_AREA_TOP;

    /* ---------- Backdrop ---------- */
    this.backdrop = scene.add.rectangle(cx, cy, GAME_MODE.canvasWidth, TUNING.GAME_HEIGHT, 0x000000, BACKDROP_ALPHA)
      .setDepth(POPUP_DEPTH).setScrollFactor(0).setInteractive().setVisible(false);
    this.backdrop.name = 'profile-backdrop';

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
    this.titleText = scene.add.text(0, TITLE_Y, 'PROFILE', {
      fontSize: TITLE_FONT, fontFamily: 'Early GameBoy', color: TITLE_COLOR,
    }).setOrigin(0.5);
    this.container.add(
      this.titleText,
    );

    /* ======== HEADER: Avatar (left) + Name/Spotify (right) ======== */
    const avatarY = HEADER_Y;

    this.avatarPlaceholder = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS, 0x000000, 1);
    this.container.add(this.avatarPlaceholder);

    this.avatarRing = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS + AVATAR_RING_WIDTH / 2, 0x000000, 0);
    this.avatarRing.setStrokeStyle(AVATAR_RING_WIDTH, AVATAR_RING_COLOR, AVATAR_RING_ALPHA);
    this.container.add(this.avatarRing);

    // Black circle overlay on avatar (behind add-pic icon)
    this.avatarOverlay = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS, 0x000000, AVATAR_OVERLAY_ALPHA)
      .setVisible(false);
    this.container.add(this.avatarOverlay);

    // Add-pic icon centered on avatar
    this.avatarAddIcon = scene.add.image(AVATAR_X, avatarY, 'add-pic-icon')
      .setScale(AVATAR_ADD_ICON_SCALE)
      .setVisible(false);
    this.container.add(this.avatarAddIcon);

    this.avatarHint = scene.add.text(AVATAR_X, avatarY + AVATAR_RADIUS + AVATAR_HINT_GAP, 'click to upload', {
      fontSize: AVATAR_HINT_FONT, fontFamily: 'monospace', color: AVATAR_HINT_COLOR,
    }).setOrigin(0.5);
    this.container.add(this.avatarHint);

    this.avatarHit = scene.add.zone(AVATAR_X, avatarY, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2)
      .setInteractive(
        new Phaser.Geom.Circle(AVATAR_RADIUS, AVATAR_RADIUS, AVATAR_RADIUS),
        Phaser.Geom.Circle.Contains,
      )
      .setScrollFactor(0);
    this.avatarHit.name = 'profile-avatar';
    this.avatarHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    this.avatarHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER }); this.openFilePicker(); });
    this.container.add(this.avatarHit);

    // Show default anon avatar on init (overwritten by loadProfile if Spotify-connected)
    this.showDefaultAvatar();

    /* ---- Right side: Name ---- */
    const nameLabelY = avatarY + NAME_LABEL_OFFSET_Y;
    const nameBoxY = avatarY + NAME_BOX_OFFSET_Y;
    this.spotifyBtnY = isMobile ? SPOTIFY_MOB_BTN_Y : avatarY + SPOTIFY_BTN_OFFSET_Y;

    const nameLabel = scene.add.text(NAME_CENTER_X, nameLabelY, 'NAME', {
      fontSize: NAME_LABEL_FONT, fontFamily: 'monospace', color: NAME_LABEL_COLOR,
    }).setOrigin(0.5);
    this.container.add(nameLabel);

    const nameBox = scene.add.graphics();
    nameBox.fillStyle(NAME_BOX_BG, NAME_BOX_BG_ALPHA);
    nameBox.fillRoundedRect(NAME_CENTER_X - NAME_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, NAME_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    nameBox.lineStyle(1, NAME_BOX_BORDER, NAME_BOX_BORDER_ALPHA);
    nameBox.strokeRoundedRect(NAME_CENTER_X - NAME_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, NAME_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    this.container.add(nameBox);

    this.nameBoxFocus = scene.add.graphics();
    this.nameBoxFocus.lineStyle(2, NAME_BOX_FOCUS_COLOR, NAME_BOX_FOCUS_ALPHA);
    this.nameBoxFocus.strokeRoundedRect(NAME_CENTER_X - NAME_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, NAME_BOX_W, NAME_BOX_H, NAME_BOX_RADIUS);
    this.nameBoxFocus.setVisible(false);
    this.container.add(this.nameBoxFocus);

    this.nameText = scene.add.text(NAME_CENTER_X, nameBoxY, 'ANON', {
      fontSize: NAME_TEXT_FONT, fontFamily: 'monospace', color: NAME_TEXT_COLOR,
    }).setOrigin(0.5);
    this.container.add(this.nameText);

    const nameHit = scene.add.zone(NAME_CENTER_X, nameBoxY, NAME_BOX_W, NAME_BOX_H)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    nameHit.name = 'profile-name-edit';
    nameHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    nameHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER }); this.startNameEditing(); });
    this.container.add(nameHit);

    /* ---- Right side: Spotify button ---- */
    this.spotifyBg = scene.add.graphics();
    this.container.add(this.spotifyBg);

    const sFontSize = Math.round(SPOTIFY_TEXT_FONT * SPOTIFY_CONTENT_SCALE * SPOTIFY_BTN_SCALE);
    this.spotifyLoginText = scene.add.text(0, this.spotifyBtnY, 'Login to ', {
      fontSize: `${sFontSize}px`, fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0, 0.5);
    this.container.add(this.spotifyLoginText);

    this.spotifyLogo = scene.add.image(0, this.spotifyBtnY, 'spotify-text-logo').setOrigin(0, 0.5);
    this.spotifyLogo.setScale((SPOTIFY_LOGO_H * SPOTIFY_CONTENT_SCALE * SPOTIFY_BTN_SCALE) / this.spotifyLogo.height);
    this.container.add(this.spotifyLogo);

    this.spotifyConnectedText = scene.add.text(0, this.spotifyBtnY, 'Connected', {
      fontSize: `${sFontSize}px`, fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);
    this.container.add(this.spotifyConnectedText);

    // Hit zone for spotify button (inside container for reliable mobile input)
    this.spotifyHit = scene.add.zone(SPOTIFY_BTN_CENTER_X, this.spotifyBtnY, SPOTIFY_BTN_W_EFF * SPOTIFY_BTN_SCALE, SPOTIFY_BTN_H_EFF * SPOTIFY_BTN_SCALE)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    this.spotifyHit.name = 'profile-spotify-btn';
    this.spotifyHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    this.spotifyHit.on('pointerdown', async () => {
      this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
      if (isConnected()) {
        const confirmed = await this.disconnectModal.show();
        if (confirmed) {
          await disconnectProfile();
          disconnect();
          // Reset to anonymous state — clear cached name/avatar
          this.currentName = 'ANON';
          this.currentAvatarUrl = null;
          this.nameText.setText('ANON');
          // Reload profile from Supabase (returns anonymous profile now)
          await this.loadProfile();
          this.updateSpotifyButton();
          this.applyLoginVisibility();
          this.scene.events.emit('spotify-auth-changed');
          this.loadScoreData();
        }
      } else {
        const success = await startLogin();
        if (success) {
          if (this.openedOnDeathScreen) {
            window.location.reload();
            return;
          }
          this.updateSpotifyButton();
          await this.loadProfile();
          this.scene.events.emit('spotify-auth-changed');
          this.loadScoreData();
        }
      }
    });
    this.container.add(this.spotifyHit);

    /* ---- Save-progress hint (shown in group area when not logged in) ---- */
    this.spotifySaveHint = scene.add.text(0, HEADER_Y + 50, SAVE_HINT_TEXT, {
      fontSize: `${Math.round(SAVE_HINT_FONT_SIZE * SAVE_HINT_SCALE)}px`, fontFamily: 'Alagard',
      color: SAVE_HINT_COLOR, align: 'center',
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
    // Offset mask X by -contentOffsetX to compensate for camera scroll vs scrollFactor(0) container
    this.scrollMaskGfx = scene.make.graphics({});
    this.scrollMaskGfx.fillRoundedRect(
      cx + scrollBgX - GAME_MODE.contentOffsetX,
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
    this.scrollbarHit.name = 'profile-scrollbar';

    this.scrollbarHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.scrollbarDragging = true;
      this.applyScrollFromPointer(pointer.y);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.scrollbarDragging) this.applyScrollFromPointer(pointer.y);
    });
    scene.input.on('pointerup', () => { this.scrollbarDragging = false; });

    this.wheelHandler = (e: WheelEvent) => {
      if (!this._isOpen || this.currentPage !== 1) return;
      e.preventDefault();
      const maxScroll = Math.max(0, this.totalContentHeight - this.scrollAreaHeight);
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + e.deltaY * 0.5, 0, maxScroll);
      this.scrollContent.y = SCROLL_AREA_TOP - this.scrollOffset;
      this.updateScrollbar();
    };

    /* ======== EXIT BUTTON (square "X", upper-right corner) ======== */
    const exitBg = scene.add.graphics();
    exitBg.fillStyle(EXIT_BTN_BG, 0.9);
    exitBg.fillRoundedRect(EXIT_X - EXIT_BTN_SIZE / 2, EXIT_Y - EXIT_BTN_SIZE / 2, EXIT_BTN_SIZE, EXIT_BTN_SIZE, EXIT_BTN_RADIUS);
    exitBg.lineStyle(2, EXIT_BTN_STROKE, EXIT_BTN_STROKE_ALPHA);
    exitBg.strokeRoundedRect(EXIT_X - EXIT_BTN_SIZE / 2, EXIT_Y - EXIT_BTN_SIZE / 2, EXIT_BTN_SIZE, EXIT_BTN_SIZE, EXIT_BTN_RADIUS);
    this.container.add(exitBg);

    this.container.add(
      scene.add.text(EXIT_X, EXIT_Y, 'X', {
        fontSize: EXIT_TEXT_FONT, fontFamily: 'monospace', fontStyle: 'bold', color: EXIT_TEXT_COLOR,
      }).setOrigin(0.5),
    );

    const exitHit = scene.add.zone(EXIT_X, EXIT_Y, EXIT_BTN_SIZE, EXIT_BTN_SIZE)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    exitHit.name = 'profile-exit';
    exitHit.on('pointerover', () => this.scene.sound.play('sfx-hover', { volume: TUNING.SFX_HOVER_VOLUME }));
    exitHit.on('pointerdown', () => { this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER }); this.close(); });
    this.container.add(exitHit);

    /* ======== PAGINATION DOTS ======== */
    const dotsStartX = -((PAGE_COUNT - 1) * DOT_GAP) / 2;
    for (let i = 0; i < PAGE_COUNT; i++) {
      const dotX = dotsStartX + i * DOT_GAP;
      const dot = scene.add.circle(dotX, DOT_Y, DOT_RADIUS, 0xffffff, i === 0 ? 1 : 0);
      dot.setStrokeStyle(DOT_STROKE_W, 0xffffff, 1);
      if (i === 0) dot.setScale(DOT_ACTIVE_SCALE);
      this.container.add(dot);
      this.dots.push(dot);

      const dotHit = scene.add.zone(dotX, DOT_Y, DOT_RADIUS * 3, DOT_RADIUS * 3)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0);
      dotHit.name = `profile-dot-${i}`;
      dotHit.on('pointerdown', () => {
        this.scene.sound.play('sfx-click', { volume: TUNING.SFX_CLICK_VOLUME * TUNING.SFX_CLICK_MASTER });
        this.setPage(i);
      });
      this.container.add(dotHit);
    }

    /* ======== PAGE ELEMENT TRACKING ======== */
    this.avatarNameGroup = [
      this.avatarPlaceholder, this.avatarRing, this.avatarOverlay,
      this.avatarAddIcon, this.avatarHint, this.avatarHit,
      nameLabel, nameBox, this.nameBoxFocus, this.nameText, nameHit,
    ];
    this.page1Elements = [
      ...this.avatarNameGroup,
      this.spotifySaveHint,
      this.spotifyBg, this.spotifyLoginText, this.spotifyLogo,
      this.spotifyConnectedText, this.spotifyHit,
    ];
    this.page2Elements = [
      scrollBg, this.scrollContent, this.scrollbarTrackGfx,
      this.scrollbarThumbGfx,
    ];
    // Hide page 2 elements initially
    for (const el of this.page2Elements) (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);

    /* ======== SWIPE DETECTION (scene-level for reliable capture) ======== */
    scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this._isOpen) return;
      this.swipeStartX = ptr.x;
    });
    scene.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!this._isOpen) return;
      const dx = ptr.x - this.swipeStartX;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0 && this.currentPage < PAGE_COUNT - 1) this.setPage(this.currentPage + 1);
        else if (dx > 0 && this.currentPage > 0) this.setPage(this.currentPage - 1);
      }
    });

    /* ---- Misc ---- */
    this.disconnectModal = new DisconnectModal(scene);

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.style.position = 'fixed';
    this.fileInput.style.opacity = '0';
    this.fileInput.style.zIndex = '100000';
    this.fileInput.style.display = 'none';
    this.fileInput.style.borderRadius = '50%';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this.onFileSelected());

    // Name text input overlay (triggers mobile keyboard)
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.autocapitalize = 'none';
    this.nameInput.autocomplete = 'off';
    this.nameInput.style.position = 'fixed';
    this.nameInput.style.opacity = '0';
    this.nameInput.style.zIndex = '100000';
    this.nameInput.style.display = 'none';
    this.nameInput.style.caretColor = 'white';
    this.nameInput.style.color = 'white';
    this.nameInput.style.background = 'transparent';
    this.nameInput.style.border = 'none';
    this.nameInput.style.outline = 'none';
    this.nameInput.style.fontSize = '16px';
    this.nameInput.style.fontFamily = 'monospace';
    document.body.appendChild(this.nameInput);
    this.nameInput.addEventListener('input', () => {
      this.currentName = this.nameInput.value.slice(0, NAME_MAX_LENGTH);
      this.nameText.setText(this.currentName + '_');
    });
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.stopNameEditing();
      }
    });
    this.nameInput.addEventListener('blur', () => {
      if (this.nameEditing) this.stopNameEditing();
    });
  }

  /* ============ Public API ============ */

  setAvatarOverlayDebug(on: boolean): void {
    this.debugAvatarOverlay = on;
    if (this._isOpen) this.positionFileInput();
  }

  loadProfile(): Promise<void> {
    const gen = ++this.profileLoadGen;
    return loadOrCreateProfile().then((profile) => {
      // Discard stale response — a newer loadProfile() already ran
      if (gen !== this.profileLoadGen) return;
      this.currentName = profile.username;
      this.nameText.setText(profile.username);
      if (profile.avatar_url) {
        this.currentAvatarUrl = profile.avatar_url;
        this.loadAvatarFromUrl(profile.avatar_url);
      } else {
        this.showDefaultAvatar();
      }
      if (isConnected()) this.enableAvatarEditing();
      if (this.profileChangedCallback) {
        this.profileChangedCallback(
          this.currentName,
          !!profile.avatar_url || this.scene.textures.exists(AVATAR_TEXTURE_KEY),
        );
      }
    }).catch((err) => console.warn('ProfilePopup: profile load failed', err));
  }

  open(initialName?: string, onDeathScreen = false, duringGameplay = false): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.openedOnDeathScreen = onDeathScreen;
    this.openedDuringGameplay = duringGameplay;
    if (initialName !== undefined) {
      this.currentName = initialName;
      this.nameText.setText(initialName);
    }
    this.backdrop.setVisible(true);
    this.container.setVisible(true);

    // Reset to page 1
    this.currentPage = 0;
    for (const el of this.page1Elements) (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
    for (const el of this.page2Elements) (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.scrollbarHit.setVisible(false);
    for (let i = 0; i < this.dots.length; i++) {
      this.dots[i].setFillStyle(0xffffff, i === 0 ? 1 : 0);
      this.dots[i].setScale(i === 0 ? DOT_ACTIVE_SCALE : 1);
    }

    this.titleText.setText('PROFILE');
    this.updateSpotifyButton();
    this.applyLoginVisibility();
    this.positionFileInput();
    this.scene.game.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  close(): void {
    if (!this._isOpen) return;
    if (this.nameEditing) this.stopNameEditing();
    this._isOpen = false;
    this.closedAt = Date.now();
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    this.scrollbarHit.setVisible(false);
    this.scrollbarDragging = false;
    this.stopRainbow();
    this.fileInput.style.display = 'none';
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
      if (event.key === 'Escape' || event.key === 'Enter') this.stopNameEditing();
      // All other keys handled by the DOM nameInput element
      return;
    }
    if (event.key === 'Escape') this.close();
  }

  getName(): string { return this.currentName; }

  getAvatarTextureKey(): string | null {
    return this.scene.textures.exists(AVATAR_TEXTURE_KEY) ? AVATAR_TEXTURE_KEY : null;
  }

  onCloseCallback(cb: () => void): void { this.closeCallback = cb; }

  onProfileChanged(cb: (name: string, hasAvatar: boolean) => void): void { this.profileChangedCallback = cb; }

  /* ============ Private ============ */

  private setPage(page: number): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    this.titleText.setText(page === 0 ? 'PROFILE' : 'HIGH SCORES');

    // Toggle page element visibility
    const showPage1 = page === 0;
    for (const el of this.page1Elements) (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(showPage1);
    for (const el of this.page2Elements) (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(!showPage1);

    // Show/hide scrollbar hit zone (scene-level, not in container)
    this.scrollbarHit.setVisible(!showPage1);

    // Update dot indicators
    for (let i = 0; i < this.dots.length; i++) {
      const active = i === page;
      this.dots[i].setFillStyle(0xffffff, active ? 1 : 0);
      this.dots[i].setScale(active ? DOT_ACTIVE_SCALE : 1);
    }

    // Reset scroll when entering page 2
    if (page === 1) {
      this.scrollOffset = 0;
      this.scrollContent.y = SCROLL_AREA_TOP;
      this.loadScoreData();
    }

    // Re-apply conditional visibility when returning to page 1
    if (page === 0) {
      this.updateSpotifyButton();
      this.applyLoginVisibility();
    }
    this.positionFileInput();
  }

  private applyLoginVisibility(): void {
    const connected = isConnected();
    for (const el of this.avatarNameGroup)
      (el as unknown as Phaser.GameObjects.Components.Visible).setVisible(connected);
    if (this.avatarImage) this.avatarImage.setVisible(connected);
    this.spotifySaveHint.setVisible(!connected);
    if (connected) {
      if (!this.currentAvatarUrl) this.showDefaultAvatar();
      this.enableAvatarEditing();
    }
    this.positionFileInput();
  }

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

    const drawW = SPOTIFY_BTN_W_EFF * SPOTIFY_BTN_SCALE;
    const drawH = SPOTIFY_BTN_H_EFF * SPOTIFY_BTN_SCALE;
    this.spotifyBg.clear();
    this.spotifyBg.fillStyle(connected ? SPOTIFY_BTN_BG_CONNECTED : SPOTIFY_BTN_BG_LOGIN, 1);
    this.spotifyBg.fillRoundedRect(
      SPOTIFY_BTN_CENTER_X - drawW / 2,
      this.spotifyBtnY - drawH / 2,
      drawW, drawH, SPOTIFY_BTN_RADIUS,
    );

    const scaledGap = SPOTIFY_LOGO_GAP * SPOTIFY_BTN_SCALE;
    if (connected) {
      this.spotifyLoginText.setVisible(false);
      this.spotifyConnectedText.setVisible(true);
      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const totalW = logoW + scaledGap + this.spotifyConnectedText.width;
      const startX = SPOTIFY_BTN_CENTER_X - totalW / 2;
      this.spotifyLogo.setPosition(startX, this.spotifyBtnY);
      this.spotifyConnectedText.setPosition(startX + logoW + scaledGap, this.spotifyBtnY);
    } else {
      this.spotifyLoginText.setVisible(true);
      this.spotifyConnectedText.setVisible(false);
      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const comboW = this.spotifyLoginText.width + logoW;
      const startX = SPOTIFY_BTN_CENTER_X - comboW / 2;
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
      const msg = this.scene.add.text(0, this.scrollAreaHeight / 2, 'connect to spotify\nto see your scores', {
        fontSize: SCORES_HEADER_FONT, fontFamily: 'Alagard',
        color: SCORES_EMPTY_COLOR, align: 'center',
      }).setOrigin(0.5);
      this.scrollContent.add(msg);
      this.totalContentHeight = this.scrollAreaHeight;
      return;
    }

    let top10: PlayerScore[];
    let history: WeeklyHistoryEntry[];

    if (isLocal) {
      top10 = [
        { score: 99999, rank: 1 },
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
        { weekId: '2026-W07', bestScore: 99999, rank: 1 },
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
      const weekLabel = `Y${weekId.slice(2, 4)}-W${parseInt(weekId.split('W')[1])}`;
      for (let i = 0; i < top10.length; i++) {
        const e = top10[i];
        const rankT = this.scene.add.text(SCORES_RANK_X, y, `#${e.rank}`, rowStyle).setOrigin(0, 0);
        const scoreT = this.scene.add.text(SCORES_SCORE_X, y, e.score.toLocaleString(), rowStyle).setOrigin(0, 0);
        const weekT = this.scene.add.text(SCORES_WEEK_X, y, weekLabel, rowStyle).setOrigin(1, 0);
        this.scrollContent.add([rankT, scoreT, weekT]);
        if (e.rank <= RAINBOW_RANK_THRESHOLD) {
          this.rainbowTexts.push(rankT, scoreT, weekT);
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
        const weekLabel = `Y${h.weekId.slice(2, 4)}-W${parseInt(h.weekId.split('W')[1])}`;
        const rankT = this.scene.add.text(SCORES_RANK_X, y, `#${h.rank}`, rowStyle).setOrigin(0, 0);
        const scoreT = this.scene.add.text(SCORES_SCORE_X, y, h.bestScore.toLocaleString(), rowStyle).setOrigin(0, 0);
        const weekT = this.scene.add.text(SCORES_WEEK_X, y, weekLabel, rowStyle).setOrigin(1, 0);
        this.scrollContent.add([rankT, scoreT, weekT]);
        if (h.rank <= RAINBOW_RANK_THRESHOLD) {
          this.rainbowTexts.push(rankT, scoreT, weekT);
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
    this.positionNameInput();
    this.nameInput.value = this.currentName;
    this.nameInput.style.display = 'block';
    // Try inputmode hack to suppress iOS accessory bar (unreliable but zero risk)
    this.nameInput.setAttribute('inputmode', 'none');
    this.nameInput.focus();
    setTimeout(() => this.nameInput.setAttribute('inputmode', 'text'), 100);
    // Clear Phaser key captures so debug hotkeys don't block DOM input
    const kb = this.scene.input.keyboard;
    if (kb) {
      this._savedCaptures = kb.getCaptures();
      kb.clearCaptures();
    }
    // Slide popup up when keyboard opens (mobile)
    this._origContainerY = this.container.y;
    if (window.visualViewport) {
      this._kbResizeHandler = () => this._onViewportResize();
      window.visualViewport.addEventListener('resize', this._kbResizeHandler);
    }
  }

  private stopNameEditing(): void {
    if (!this.nameEditing) return;
    this.nameEditing = false;
    this.currentName = this.nameInput.value.slice(0, NAME_MAX_LENGTH);
    this.nameInput.style.display = 'none';
    this.nameInput.blur();
    // Restore Phaser key captures for gameplay
    const kb2 = this.scene.input.keyboard;
    if (kb2 && this._savedCaptures.length > 0) {
      kb2.addCapture(this._savedCaptures);
      this._savedCaptures = [];
    }
    // Restore popup position after keyboard close
    if (this._kbResizeHandler && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._kbResizeHandler);
      this._kbResizeHandler = null;
    }
    this.container.y = this._origContainerY;
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

  /** Shift popup up so name field stays visible above the on-screen keyboard. */
  private _onViewportResize(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const kbHeight = window.innerHeight - vv.height;
    if (kbHeight < 50) {
      // Keyboard closed — restore position
      this.container.y = this._origContainerY;
      this.positionNameInput();
      return;
    }
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const cy = TUNING.GAME_HEIGHT / 2;
    // Name field bottom in DOM pixels
    const nameBottomGame = cy + HEADER_Y + NAME_BOX_OFFSET_Y + NAME_BOX_H / 2;
    const nameBottomDom = rect.top + (nameBottomGame / TUNING.GAME_HEIGHT) * rect.height;
    const margin = 60; // generous margin to clear accessory bar (~44px) + breathing room
    const visibleBottom = vv.height - margin;
    if (nameBottomDom > visibleBottom) {
      const overlapDom = nameBottomDom - visibleBottom;
      const gamePerDom = TUNING.GAME_HEIGHT / rect.height;
      this.container.y = this._origContainerY - (overlapDom * gamePerDom) * 0.5 - 50;
    } else {
      this.container.y = this._origContainerY;
    }
    this.positionNameInput();
  }

  /** Show the default anon avatar (dp_anon_pic) and disable avatar editing. */
  private showDefaultAvatar(): void {
    // Load the preloaded default-avatar into the circular AVATAR_TEXTURE_KEY slot
    if (this.scene.textures.exists('default-avatar')) {
      const src = this.scene.textures.get('default-avatar').getSourceImage() as HTMLImageElement;
      this.applyAvatarFromImageElement(src);
    }
    // Disable avatar change for anon users
    this.avatarHint.setVisible(false);
    this.avatarOverlay.setVisible(false);
    this.avatarAddIcon.setVisible(false);
    this.avatarHit.disableInteractive();
  }

  /** Enable avatar editing (Spotify-connected users). */
  private enableAvatarEditing(): void {
    this.avatarHint.setVisible(true);
    this.avatarOverlay.setVisible(true);
    this.avatarAddIcon.setVisible(true);
    this.avatarHit.setInteractive();
  }

  private openFilePicker(): void {
    if (!isConnected()) return; // Only Spotify users can change avatar
    if (this.nameEditing) this.stopNameEditing();
    this.fileInput.click();
  }

  /** Position transparent file-input overlay on top of avatar circle (iOS needs real DOM tap). */
  private positionFileInput(): void {
    if (!isConnected() || this.currentPage !== 0) {
      this.fileInput.style.display = 'none';
      return;
    }
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const cx = GAME_MODE.canvasWidth / 2;
    const cy = TUNING.GAME_HEIGHT / 2;
    const domX = rect.left + ((cx + AVATAR_X) / GAME_MODE.canvasWidth) * rect.width;
    const domY = rect.top + ((cy + HEADER_Y) / TUNING.GAME_HEIGHT) * rect.height;
    const domR = (AVATAR_RADIUS / GAME_MODE.canvasWidth) * rect.width;
    this.fileInput.style.left = `${domX - domR}px`;
    this.fileInput.style.top = `${domY - domR}px`;
    this.fileInput.style.width = `${domR * 2}px`;
    this.fileInput.style.height = `${domR * 2}px`;
    if (this.debugAvatarOverlay) {
      this.fileInput.style.border = '3px solid #cc44ff';
      this.fileInput.style.background = 'rgba(204, 68, 255, 0.25)';
      this.fileInput.style.opacity = '1';
    } else {
      this.fileInput.style.border = 'none';
      this.fileInput.style.background = 'none';
      this.fileInput.style.opacity = '0';
    }
    this.fileInput.style.display = 'block';
  }

  /** Position the invisible name text input overlay for mobile keyboard. */
  private positionNameInput(): void {
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const cx = GAME_MODE.canvasWidth / 2;
    const cy = TUNING.GAME_HEIGHT / 2;
    const domX = rect.left + ((cx + NAME_CENTER_X - NAME_BOX_W / 2) / GAME_MODE.canvasWidth) * rect.width;
    const domY = rect.top + ((cy + HEADER_Y + NAME_BOX_OFFSET_Y - NAME_BOX_H / 2) / TUNING.GAME_HEIGHT) * rect.height;
    const domW = (NAME_BOX_W / GAME_MODE.canvasWidth) * rect.width;
    const domH = (NAME_BOX_H / TUNING.GAME_HEIGHT) * rect.height;
    this.nameInput.style.left = `${domX}px`;
    this.nameInput.style.top = `${domY}px`;
    this.nameInput.style.width = `${domW}px`;
    this.nameInput.style.height = `${domH}px`;
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

  getUIObjects(): Phaser.GameObjects.GameObject[] {
    return [this.container, this.backdrop,
      this.disconnectModal.getContainer(), this.disconnectModal.getBackdrop()];
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
    this.nameInput.remove();
  }
}
