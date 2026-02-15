import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { loadOrCreateProfile, updateUsername, uploadAvatarAndSave, disconnectProfile } from '../systems/ProfileSystem';
import { startLogin, isConnected, disconnect } from '../systems/SpotifyAuthSystem';
import { fetchPlayerTop10, fetchWeeklyHistory } from '../systems/LeaderboardService';
import { getCurrentWeekKey } from '../util/time';
import { DisconnectModal } from './DisconnectModal';

// ---- Popup chrome ----
const POPUP_W = 690;
const POPUP_H = 900;
const POPUP_DEPTH = 1400;
const BACKDROP_ALPHA = 0.6;
const AVATAR_RADIUS = 100;
const AVATAR_TEX_SIZE = 512;
const NAME_MAX_LENGTH = 10;
export const AVATAR_TEXTURE_KEY = 'profile-avatar';

// ---- Header layout (avatar left, name+spotify right) ----
const AVATAR_X = -190;                                    // avatar center, popup-relative
const HEADER_Y = -POPUP_H / 2 + 200;                     // vertical center of header row
const RIGHT_CENTER_X = 105;                               // center of right-side boxes
const RIGHT_BOX_W = 300;                                  // name box / spotify btn width
const NAME_BOX_H = 50;
const SPOTIFY_BTN_H = 50;
const NAME_LABEL_OFFSET_Y = -60;                          // from HEADER_Y
const NAME_BOX_OFFSET_Y = NAME_LABEL_OFFSET_Y + 46;
const SPOTIFY_BTN_OFFSET_Y = NAME_BOX_OFFSET_Y + 75;
const SPOTIFY_CONTENT_SCALE = 1.0;

// ---- Save-progress hint ----
const SAVE_HINT_FONT_SIZE = 30;
const SAVE_HINT_TEXT = 'login to spotify to\nsave your progress';
const SAVE_HINT_COLOR = '#888888';

// ---- Scroll panel (easy-to-edit padding) ----
const SCROLL_AREA_TOP = HEADER_Y + AVATAR_RADIUS + 50;   // below avatar + hint gap
const SCROLL_AREA_BOTTOM = POPUP_H / 2 - 100;            // above exit btn
const SCROLL_PADDING_TOP = 10;
const SCROLL_PADDING_RIGHT = 30;
const SCROLL_PADDING_BOTTOM = 10;
const SCROLL_PADDING_LEFT = 30;

// ---- Score styling ----
const SECTION_HEADER_FONT = '22px';
const SECTION_HEADER_COLOR = '#ffcc00';
const SCORE_ROW_FONT = '20px';
const SCORE_ROW_COLOR = '#cccccc';
const SCORE_ROW_HEIGHT = 32;
const SECTION_GAP = 30;

// ---- Exit button ----
const EXIT_Y = POPUP_H / 2 - 60;

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
    panel.fillStyle(0x1a1a2e, 0.95);
    panel.fillRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, 20);
    panel.lineStyle(2, 0x444466, 0.8);
    panel.strokeRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, 20);
    this.container.add(panel);

    /* ---------- Title ---------- */
    this.container.add(
      scene.add.text(0, -POPUP_H / 2 + 50, 'PROFILE', {
        fontSize: '36px', fontFamily: 'Early GameBoy', color: '#ffffff',
      }).setOrigin(0.5),
    );

    /* ======== HEADER: Avatar (left) + Name/Spotify (right) ======== */
    const avatarY = HEADER_Y;

    this.avatarPlaceholder = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS, 0x000000, 1);
    this.container.add(this.avatarPlaceholder);

    this.avatarRing = scene.add.circle(AVATAR_X, avatarY, AVATAR_RADIUS + 3, 0x000000, 0);
    this.avatarRing.setStrokeStyle(3, 0xffffff, 0.8);
    this.container.add(this.avatarRing);

    this.container.add(
      scene.add.text(AVATAR_X, avatarY + AVATAR_RADIUS + 20, 'click to change', {
        fontSize: '16px', fontFamily: 'monospace', color: '#666666',
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
        fontSize: '20px', fontFamily: 'monospace', color: '#888888',
      }).setOrigin(0.5),
    );

    const nameBox = scene.add.graphics();
    nameBox.fillStyle(0x222244, 0.9);
    nameBox.fillRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, 8);
    nameBox.lineStyle(1, 0x666688, 0.6);
    nameBox.strokeRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, 8);
    this.container.add(nameBox);

    this.nameBoxFocus = scene.add.graphics();
    this.nameBoxFocus.lineStyle(2, 0x8888ff, 0.9);
    this.nameBoxFocus.strokeRoundedRect(RIGHT_CENTER_X - RIGHT_BOX_W / 2, nameBoxY - NAME_BOX_H / 2, RIGHT_BOX_W, NAME_BOX_H, 8);
    this.nameBoxFocus.setVisible(false);
    this.container.add(this.nameBoxFocus);

    this.nameText = scene.add.text(RIGHT_CENTER_X, nameBoxY, 'ANON', {
      fontSize: '28px', fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(this.nameText);

    const nameHit = scene.add.zone(RIGHT_CENTER_X, nameBoxY, RIGHT_BOX_W, NAME_BOX_H)
      .setInteractive({ useHandCursor: true });
    nameHit.on('pointerdown', () => this.startNameEditing());
    this.container.add(nameHit);

    /* ---- Right side: Spotify button ---- */
    this.spotifyBg = scene.add.graphics();
    this.container.add(this.spotifyBg);

    const sFontSize = Math.round(22 * SPOTIFY_CONTENT_SCALE);
    this.spotifyLoginText = scene.add.text(0, this.spotifyBtnY, 'Login to ', {
      fontSize: `${sFontSize}px`, fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0, 0.5);
    this.container.add(this.spotifyLoginText);

    this.spotifyLogo = scene.add.image(0, this.spotifyBtnY, 'spotify-text-logo').setOrigin(0, 0.5);
    this.spotifyLogo.setScale((26 * SPOTIFY_CONTENT_SCALE) / this.spotifyLogo.height);
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
    const divGfx = scene.add.graphics();
    divGfx.lineStyle(1, 0x444466, 0.5);
    divGfx.lineBetween(-POPUP_W / 2 + 30, SCROLL_AREA_TOP - 8, POPUP_W / 2 - 30, SCROLL_AREA_TOP - 8);
    this.container.add(divGfx);

    this.scrollContent = scene.add.container(0, SCROLL_AREA_TOP);
    this.container.add(this.scrollContent);

    const scrollW = POPUP_W - SCROLL_PADDING_LEFT - SCROLL_PADDING_RIGHT;
    this.scrollMaskGfx = scene.make.graphics({});
    this.scrollMaskGfx.fillRect(
      cx - POPUP_W / 2 + SCROLL_PADDING_LEFT,
      cy + SCROLL_AREA_TOP,
      scrollW,
      this.scrollAreaHeight,
    );
    this.scrollContent.setMask(this.scrollMaskGfx.createGeometryMask());

    this.wheelHandler = (e: WheelEvent) => {
      if (!this._isOpen) return;
      e.preventDefault();
      const maxScroll = Math.max(0, this.totalContentHeight - this.scrollAreaHeight);
      this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + e.deltaY * 0.5, 0, maxScroll);
      this.scrollContent.y = SCROLL_AREA_TOP - this.scrollOffset;
    };

    /* ======== EXIT BUTTON ======== */
    const exitBtnW = 200;
    const exitBtnH = 50;

    const exitBg = scene.add.graphics();
    exitBg.fillStyle(0x442222, 0.9);
    exitBg.fillRoundedRect(-exitBtnW / 2, EXIT_Y - exitBtnH / 2, exitBtnW, exitBtnH, 10);
    exitBg.lineStyle(2, 0xff4444, 0.6);
    exitBg.strokeRoundedRect(-exitBtnW / 2, EXIT_Y - exitBtnH / 2, exitBtnW, exitBtnH, 10);
    this.container.add(exitBg);

    this.container.add(
      scene.add.text(0, EXIT_Y, 'EXIT', {
        fontSize: '28px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ff4444',
      }).setOrigin(0.5),
    );

    const exitHit = scene.add.zone(0, EXIT_Y, exitBtnW, exitBtnH)
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

  private updateSpotifyButton(): void {
    const connected = isConnected();

    this.spotifyBg.clear();
    this.spotifyBg.fillStyle(connected ? 0x5a0b0b : 0x1DB954, 1);
    this.spotifyBg.fillRoundedRect(
      RIGHT_CENTER_X - RIGHT_BOX_W / 2,
      this.spotifyBtnY - SPOTIFY_BTN_H / 2,
      RIGHT_BOX_W, SPOTIFY_BTN_H, 10,
    );

    this.spotifySaveHint.setVisible(!connected);

    if (connected) {
      this.spotifyLoginText.setVisible(false);
      this.spotifyConnectedText.setVisible(true);
      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const gap = 8;
      const totalW = logoW + gap + this.spotifyConnectedText.width;
      const startX = RIGHT_CENTER_X - totalW / 2;
      this.spotifyLogo.setPosition(startX, this.spotifyBtnY);
      this.spotifyConnectedText.setPosition(startX + logoW + gap, this.spotifyBtnY);
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
    this.scrollOffset = 0;
    this.scrollContent.y = SCROLL_AREA_TOP;

    if (!isConnected()) {
      this.spotifySaveHint.setVisible(true);
      return;
    }
    this.spotifySaveHint.setVisible(false);

    const [top10, history] = await Promise.all([
      fetchPlayerTop10(),
      fetchWeeklyHistory(),
    ]);

    let y = SCROLL_PADDING_TOP;
    const weekId = getCurrentWeekKey();

    // ---- TOP 10 THIS WEEK ----
    this.scrollContent.add(
      this.scene.add.text(0, y, `TOP 10 — ${weekId}`, {
        fontSize: SECTION_HEADER_FONT, fontFamily: 'Early GameBoy', color: SECTION_HEADER_COLOR,
      }).setOrigin(0.5, 0),
    );
    y += 36;

    if (top10.length === 0) {
      this.scrollContent.add(
        this.scene.add.text(0, y, 'No scores yet', {
          fontSize: SCORE_ROW_FONT, fontFamily: 'monospace', color: '#666666',
        }).setOrigin(0.5, 0),
      );
      y += SCORE_ROW_HEIGHT;
    } else {
      for (let i = 0; i < top10.length; i++) {
        const e = top10[i];
        this.scrollContent.add(
          this.scene.add.text(0, y,
            `${String(i + 1).padStart(2)}.  ${e.score.toLocaleString().padStart(8)}   #${e.rank}`,
            { fontSize: SCORE_ROW_FONT, fontFamily: 'monospace', color: SCORE_ROW_COLOR },
          ).setOrigin(0.5, 0),
        );
        y += SCORE_ROW_HEIGHT;
      }
    }

    y += SECTION_GAP;

    // ---- WEEKLY HISTORY ----
    this.scrollContent.add(
      this.scene.add.text(0, y, 'WEEKLY HISTORY', {
        fontSize: SECTION_HEADER_FONT, fontFamily: 'Early GameBoy', color: SECTION_HEADER_COLOR,
      }).setOrigin(0.5, 0),
    );
    y += 36;

    if (history.length === 0) {
      this.scrollContent.add(
        this.scene.add.text(0, y, 'No history yet', {
          fontSize: SCORE_ROW_FONT, fontFamily: 'monospace', color: '#666666',
        }).setOrigin(0.5, 0),
      );
      y += SCORE_ROW_HEIGHT;
    } else {
      for (const h of history) {
        this.scrollContent.add(
          this.scene.add.text(0, y,
            `${h.weekId}   ${h.bestScore.toLocaleString().padStart(8)}   #${h.rank}`,
            { fontSize: SCORE_ROW_FONT, fontFamily: 'monospace', color: SCORE_ROW_COLOR },
          ).setOrigin(0.5, 0),
        );
        y += SCORE_ROW_HEIGHT;
      }
    }

    y += SCROLL_PADDING_BOTTOM;
    this.totalContentHeight = y;
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
    this.scene.game.canvas.removeEventListener('wheel', this.wheelHandler);
    this.disconnectModal.destroy();
    this.scrollMaskGfx.destroy();
    this.spotifyHit.destroy();
    this.container.destroy();
    this.backdrop.destroy();
    this.fileInput.remove();
  }
}
