import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { loadOrCreateProfile, updateUsername, uploadAvatarAndSave } from '../systems/ProfileSystem';
import { startLogin, isConnected } from '../systems/SpotifyAuthSystem';

const POPUP_W = 690;
const POPUP_H = 900;
const POPUP_DEPTH = 1400;
const BACKDROP_ALPHA = 0.6;
const AVATAR_RADIUS = 100;
const AVATAR_TEX_SIZE = 512;
const NAME_MAX_LENGTH = 10;
export const AVATAR_TEXTURE_KEY = 'profile-avatar';

// Save-progress hint layout
const SAVE_HINT_FONT_SIZE = 50;           // px
const SAVE_HINT_TEXT = 'login to spotify to\nsave your progress';  // use \n to control line breaks
const SAVE_HINT_COLOR = '#888888';

// Name field layout
const NAME_BOX_GAP = 46;                 // px gap between "NAME" label and name box top
const SPOTIFY_BTN_GAP = 120;             // px gap between name box center and spotify button center
const SPOTIFY_CONTENT_SCALE = 1.0;       // uniform scale for text+logo group inside spotify button

export class ProfilePopup {
  private scene: Phaser.Scene;
  private backdrop: Phaser.GameObjects.Rectangle;
  private container: Phaser.GameObjects.Container;
  private _isOpen: boolean = false;
  private closedAt: number = 0;

  // Callbacks
  private closeCallback: (() => void) | null = null;
  private profileChangedCallback: ((name: string, hasAvatar: boolean) => void) | null = null;

  // Content
  private avatarPlaceholder: Phaser.GameObjects.Arc;
  private avatarImage: Phaser.GameObjects.Image | null = null;
  private avatarRing: Phaser.GameObjects.Arc;
  private nameText: Phaser.GameObjects.Text;
  private nameBoxFocus: Phaser.GameObjects.Graphics;
  private currentName: string = 'ANON';
  private nameEditing: boolean = false;
  private currentAvatarUrl: string | null = null;

  // Spotify button elements
  private spotifyBg!: Phaser.GameObjects.Graphics;
  private spotifyLoginText!: Phaser.GameObjects.Text;
  private spotifyLogo!: Phaser.GameObjects.Image;
  private spotifyConnectedText!: Phaser.GameObjects.Text;
  private spotifyHit!: Phaser.GameObjects.Zone;
  private spotifyY: number = 0;
  private spotifySaveHint!: Phaser.GameObjects.Text;

  // DOM (hidden file input for OS file picker)
  private fileInput: HTMLInputElement;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = TUNING.GAME_WIDTH / 2;
    const cy = TUNING.GAME_HEIGHT / 2;

    // --- Backdrop (dark overlay that swallows all clicks) ---
    this.backdrop = scene.add.rectangle(cx, cy, TUNING.GAME_WIDTH, TUNING.GAME_HEIGHT, 0x000000, BACKDROP_ALPHA)
      .setDepth(POPUP_DEPTH)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);

    // --- Container for all popup content ---
    this.container = scene.add.container(cx, cy)
      .setDepth(POPUP_DEPTH + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // --- Panel background (rounded rect) ---
    const panel = scene.add.graphics();
    panel.fillStyle(0x1a1a2e, 0.95);
    panel.fillRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, 20);
    panel.lineStyle(2, 0x444466, 0.8);
    panel.strokeRoundedRect(-POPUP_W / 2, -POPUP_H / 2, POPUP_W, POPUP_H, 20);
    this.container.add(panel);

    // --- Title ---
    const title = scene.add.text(0, -POPUP_H / 2 + 50, 'PROFILE', {
      fontSize: '36px',
      fontFamily: 'Early GameBoy',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(title);

    // --- Avatar section ---
    const avatarY = -POPUP_H / 2 + 220;

    // Black circle placeholder
    this.avatarPlaceholder = scene.add.circle(0, avatarY, AVATAR_RADIUS, 0x000000, 1);
    this.container.add(this.avatarPlaceholder);

    // White ring outline
    this.avatarRing = scene.add.circle(0, avatarY, AVATAR_RADIUS + 3, 0x000000, 0);
    this.avatarRing.setStrokeStyle(3, 0xffffff, 0.8);
    this.container.add(this.avatarRing);

    // Upload hint text
    const hint = scene.add.text(0, avatarY + AVATAR_RADIUS + 20, 'click to change', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#666666',
    }).setOrigin(0.5);
    this.container.add(hint);

    // Clickable hit zone over avatar
    const avatarHit = scene.add.zone(0, avatarY, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2)
      .setInteractive(
        new Phaser.Geom.Circle(AVATAR_RADIUS, AVATAR_RADIUS, AVATAR_RADIUS),
        Phaser.Geom.Circle.Contains
      );
    avatarHit.on('pointerdown', () => this.openFilePicker());
    this.container.add(avatarHit);

    // --- Name section ---
    const nameY = avatarY + AVATAR_RADIUS + 70;

    const nameLabel = scene.add.text(0, nameY, 'NAME', {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#888888',
    }).setOrigin(0.5);
    this.container.add(nameLabel);

    const nameBoxW = 400;
    const nameBoxH = 50;
    const nameBoxY = nameY + NAME_BOX_GAP;

    const nameBox = scene.add.graphics();
    nameBox.fillStyle(0x222244, 0.9);
    nameBox.fillRoundedRect(-nameBoxW / 2, nameBoxY - nameBoxH / 2, nameBoxW, nameBoxH, 8);
    nameBox.lineStyle(1, 0x666688, 0.6);
    nameBox.strokeRoundedRect(-nameBoxW / 2, nameBoxY - nameBoxH / 2, nameBoxW, nameBoxH, 8);
    this.container.add(nameBox);

    // Focus ring (shown when editing name)
    this.nameBoxFocus = scene.add.graphics();
    this.nameBoxFocus.lineStyle(2, 0x8888ff, 0.9);
    this.nameBoxFocus.strokeRoundedRect(-nameBoxW / 2, nameBoxY - nameBoxH / 2, nameBoxW, nameBoxH, 8);
    this.nameBoxFocus.setVisible(false);
    this.container.add(this.nameBoxFocus);

    this.nameText = scene.add.text(0, nameBoxY, 'ANON', {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.container.add(this.nameText);

    const nameHit = scene.add.zone(0, nameBoxY, nameBoxW, nameBoxH)
      .setInteractive({ useHandCursor: true });
    nameHit.on('pointerdown', () => this.startNameEditing());
    this.container.add(nameHit);

    // --- Spotify Login button ---
    const spotifyW = 400;
    const spotifyH = 50;
    this.spotifyY = nameBoxY + SPOTIFY_BTN_GAP;

    this.spotifyBg = scene.add.graphics();
    this.container.add(this.spotifyBg);

    // "Login to" text (shown when not connected)
    const spotifyFontSize = Math.round(22 * SPOTIFY_CONTENT_SCALE);
    this.spotifyLoginText = scene.add.text(0, this.spotifyY, 'Login to ', {
      fontSize: `${spotifyFontSize}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0, 0.5);
    this.container.add(this.spotifyLoginText);

    // Logo scaled to fit button height with padding
    this.spotifyLogo = scene.add.image(0, this.spotifyY, 'spotify-text-logo').setOrigin(0, 0.5);
    const logoTargetH = 26 * SPOTIFY_CONTENT_SCALE;
    const logoScale = logoTargetH / this.spotifyLogo.height;
    this.spotifyLogo.setScale(logoScale);
    this.container.add(this.spotifyLogo);

    // "Connected" text (shown when connected, inside button)
    this.spotifyConnectedText = scene.add.text(0, this.spotifyY, 'Connected', {
      fontSize: `${spotifyFontSize}px`,
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);
    this.container.add(this.spotifyConnectedText);

    this.spotifyHit = scene.add.zone(0, this.spotifyY, spotifyW, spotifyH)
      .setInteractive({ useHandCursor: true });
    this.spotifyHit.on('pointerdown', () => {
      if (!isConnected()) startLogin();
    });
    this.container.add(this.spotifyHit);

    // --- Save progress hint (centered between spotify button and exit button) ---
    const exitY = POPUP_H / 2 - 70;
    const spotifyBottom = this.spotifyY + 25; // spotifyH / 2
    const exitTop = exitY - 25;               // exitBtnH / 2
    const hintY = (spotifyBottom + exitTop) / 2;
    this.spotifySaveHint = scene.add.text(0, hintY, SAVE_HINT_TEXT, {
      fontSize: `${SAVE_HINT_FONT_SIZE}px`,
      fontFamily: 'Alagard',
      color: SAVE_HINT_COLOR,
      align: 'center',
      wordWrap: { width: POPUP_W - 40 },
    }).setOrigin(0.5).setVisible(false);
    this.container.add(this.spotifySaveHint);

    // --- Exit button ---
    const exitBtnW = 200;
    const exitBtnH = 50;

    const exitBg = scene.add.graphics();
    exitBg.fillStyle(0x442222, 0.9);
    exitBg.fillRoundedRect(-exitBtnW / 2, exitY - exitBtnH / 2, exitBtnW, exitBtnH, 10);
    exitBg.lineStyle(2, 0xff4444, 0.6);
    exitBg.strokeRoundedRect(-exitBtnW / 2, exitY - exitBtnH / 2, exitBtnW, exitBtnH, 10);
    this.container.add(exitBg);

    const exitLabel = scene.add.text(0, exitY, 'EXIT', {
      fontSize: '28px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#ff4444',
    }).setOrigin(0.5);
    this.container.add(exitLabel);

    const exitHit = scene.add.zone(0, exitY, exitBtnW, exitBtnH)
      .setInteractive({ useHandCursor: true });
    exitHit.on('pointerdown', () => this.close());
    this.container.add(exitHit);

    // --- Hidden DOM file input (only DOM usage, required for OS file picker) ---
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this.onFileSelected());
  }

  // --- Public API ---

  /** Fetch profile from Supabase and apply name + avatar. Call early (e.g. in create())
   *  so the HUD is populated before the player sees it. */
  loadProfile(): void {
    loadOrCreateProfile().then((profile) => {
      this.currentName = profile.username;
      this.nameText.setText(profile.username);
      if (profile.avatar_url) {
        this.currentAvatarUrl = profile.avatar_url;
        this.loadAvatarFromUrl(profile.avatar_url);
      }
      // Notify HUD so it can update name/avatar immediately
      if (this.profileChangedCallback) {
        this.profileChangedCallback(
          this.currentName,
          !!profile.avatar_url || this.scene.textures.exists(AVATAR_TEXTURE_KEY),
        );
      }
    }).catch((err) => {
      console.warn('ProfilePopup: failed to load profile from Supabase, using local state', err);
    });
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
    this.updateSpotifyButton();
  }

  close(): void {
    if (!this._isOpen) return;
    if (this.nameEditing) this.stopNameEditing();
    this._isOpen = false;
    this.closedAt = Date.now();
    this.backdrop.setVisible(false);
    this.container.setVisible(false);
    if (this.closeCallback) this.closeCallback();
  }

  isOpen(): boolean {
    // Treat as still open for 100ms after close to prevent the closing click
    // from propagating to the scene behind the popup
    if (!this._isOpen && Date.now() - this.closedAt < 100) return true;
    return this._isOpen;
  }

  isEditingName(): boolean {
    return this.nameEditing;
  }

  /** Forward keyboard events from GameScene while popup is open */
  handleKey(event: KeyboardEvent): void {
    if (this.nameEditing) {
      if (event.key === 'Escape') {
        this.stopNameEditing();
        return;
      }
      if (event.key === 'Enter') {
        this.stopNameEditing();
        return;
      }
      if (event.key === 'Backspace') {
        this.currentName = this.currentName.slice(0, -1);
      } else if (event.key.length === 1 && this.currentName.length < NAME_MAX_LENGTH) {
        this.currentName += event.key.toUpperCase();
      }
      this.nameText.setText(this.currentName + '_');
    } else {
      if (event.key === 'Escape') {
        this.close();
      }
    }
  }

  getName(): string {
    return this.currentName;
  }

  getAvatarTextureKey(): string | null {
    return this.scene.textures.exists(AVATAR_TEXTURE_KEY) ? AVATAR_TEXTURE_KEY : null;
  }

  onCloseCallback(cb: () => void): void {
    this.closeCallback = cb;
  }

  onProfileChanged(cb: (name: string, hasAvatar: boolean) => void): void {
    this.profileChangedCallback = cb;
  }

  // --- Private ---

  private updateSpotifyButton(): void {
    const connected = isConnected();
    const spotifyW = 400;
    const spotifyH = 50;

    // Redraw background with appropriate color
    this.spotifyBg.clear();
    this.spotifyBg.fillStyle(connected ? 0x5a0b0b : 0x1DB954, 1);
    this.spotifyBg.fillRoundedRect(-spotifyW / 2, this.spotifyY - spotifyH / 2, spotifyW, spotifyH, 10);

    // Show save hint only when not connected
    this.spotifySaveHint.setVisible(!connected);

    if (connected) {
      // Show: [logo] + "Connected"
      this.spotifyLoginText.setVisible(false);
      this.spotifyConnectedText.setVisible(true);

      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const gap = 8;
      const connW = this.spotifyConnectedText.width;
      const totalW = logoW + gap + connW;
      const startX = -totalW / 2;
      this.spotifyLogo.setPosition(startX, this.spotifyY);
      this.spotifyConnectedText.setPosition(startX + logoW + gap, this.spotifyY);
    } else {
      // Show: "Login to" + [logo]
      this.spotifyLoginText.setVisible(true);
      this.spotifyConnectedText.setVisible(false);

      const logoW = this.spotifyLogo.width * this.spotifyLogo.scaleX;
      const comboW = this.spotifyLoginText.width + logoW;
      const startX = -comboW / 2;
      this.spotifyLoginText.setPosition(startX, this.spotifyY);
      this.spotifyLogo.setPosition(startX + this.spotifyLoginText.width, this.spotifyY);
    }
  }

  private startNameEditing(): void {
    if (this.nameEditing) return;
    this.nameEditing = true;
    this.nameBoxFocus.setVisible(true);
    // Auto-clear the default ANON so you can just start typing
    if (this.currentName === 'ANON') {
      this.currentName = '';
    }
    this.nameText.setText(this.currentName + '_');
  }

  private stopNameEditing(): void {
    if (!this.nameEditing) return;
    this.nameEditing = false;
    this.nameBoxFocus.setVisible(false);

    // Fall back to ANON if empty
    if (this.currentName.trim() === '') {
      this.currentName = 'ANON';
    }
    this.nameText.setText(this.currentName);

    if (this.profileChangedCallback) {
      this.profileChangedCallback(this.currentName, this.scene.textures.exists(AVATAR_TEXTURE_KEY));
    }

    // Persist to Supabase (fire-and-forget, update UI if sanitized differently)
    const localName = this.currentName;
    updateUsername(localName).then((savedName) => {
      if (savedName !== localName) {
        this.currentName = savedName;
        if (!this.nameEditing) this.nameText.setText(savedName);
        if (this.profileChangedCallback) {
          this.profileChangedCallback(savedName, this.scene.textures.exists(AVATAR_TEXTURE_KEY));
        }
      }
    }).catch((err) => {
      console.warn('ProfilePopup: failed to save username to Supabase', err);
    });
  }

  private openFilePicker(): void {
    if (this.nameEditing) this.stopNameEditing();
    this.fileInput.click();
  }

  private onFileSelected(): void {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    // Upload to Supabase in the background
    uploadAvatarAndSave(file).then((url) => {
      this.currentAvatarUrl = url;
    }).catch((err) => {
      console.warn('ProfilePopup: avatar upload to Supabase failed, local avatar still visible', err);
    });

    // Apply locally for instant feedback
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        this.applyAvatarFromImageElement(img);

        if (this.profileChangedCallback) {
          this.profileChangedCallback(this.currentName, true);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    this.fileInput.value = '';
  }

  /** Draw an HTMLImageElement into the circular avatar texture and update display. */
  private applyAvatarFromImageElement(img: HTMLImageElement): void {
    const size = AVATAR_TEX_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Cover-fit the image into the circle
    const scale = Math.max(size / img.width, size / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);

    // Create / replace Phaser texture
    if (this.scene.textures.exists(AVATAR_TEXTURE_KEY)) {
      this.scene.textures.remove(AVATAR_TEXTURE_KEY);
    }
    this.scene.textures.addCanvas(AVATAR_TEXTURE_KEY, canvas);

    this.updatePopupAvatar();
  }

  /** Load avatar from a remote URL and apply it as the circular texture. */
  private loadAvatarFromUrl(url: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.applyAvatarFromImageElement(img);
      if (this.profileChangedCallback) {
        this.profileChangedCallback(this.currentName, true);
      }
    };
    img.onerror = () => {
      console.warn('ProfilePopup: failed to load avatar from URL', url);
    };
    img.src = url;
  }

  private updatePopupAvatar(): void {
    const avatarY = -POPUP_H / 2 + 220;

    if (this.avatarImage) {
      this.avatarImage.destroy();
      this.avatarImage = null;
    }

    this.avatarImage = this.scene.add.image(0, avatarY, AVATAR_TEXTURE_KEY);
    this.avatarImage.setDisplaySize(AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
    // Insert after placeholder (index 2) before ring (index 3)
    this.container.addAt(this.avatarImage, 3);
  }

  destroy(): void {
    this.container.destroy();
    this.backdrop.destroy();
    this.fileInput.remove();
  }
}
