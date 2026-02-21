/**
 * SongSelectScreen — Fullscreen track picker for Rhythm Mode.
 * Pure Phaser rendering. Managed by GameScene in SONG_SELECT state.
 */

import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { CatalogTrack, fetchAllTracks } from '../systems/MusicCatalogService';

// ── Layout constants ───────────────────────────────────────────

const SS_DEPTH = 205;
const SS_BG_COLOR = 0x0d0d0d;
const SS_BG_ALPHA = 0.97;

// Header
const SS_HEADER_TEXT = 'RHYTHM MODE';
const SS_HEADER_Y = 50;
const SS_HEADER_SIZE = 42;
const SS_HEADER_COLOR = '#ff00ff';

// Back button
const SS_BACK_X = 60;
const SS_BACK_Y = 50;
const SS_BACK_SIZE = 24;
const SS_BACK_COLOR = '#aaaaaa';
const SS_BACK_HOVER_COLOR = '#ffffff';

// Info panel (selected track)
const SS_INFO_X = 100;
const SS_INFO_Y = 120;
const SS_ART_SIZE = 140;
const SS_TITLE_SIZE = 32;
const SS_TITLE_COLOR = '#ffffff';
const SS_ARTIST_SIZE = 22;
const SS_ARTIST_COLOR = '#aaaaaa';

// Difficulty selector
const SS_DIFF_Y = 230;
const SS_DIFF_SIZE = 22;
const SS_DIFF_ARROW_SIZE = 28;
const SS_DIFF_LABELS = ['EASY', 'NORMAL', 'HARD'];
const SS_DIFF_COLORS = ['#33cc33', '#ffcc00', '#ff3300'];
const SS_DIFF_BG_COLORS = [0x33cc33, 0xffcc00, 0xff3300];

// Track list
const SS_LIST_TOP = 300;
const SS_LIST_MARGIN_X = 80;
const SS_ROW_HEIGHT = 40;
const SS_ROW_POOL = 18;
const SS_FONT = 'monospace';
const SS_ROW_SIZE = 16;
const SS_ROW_COLOR = '#cccccc';
const SS_ROW_SELECTED_COLOR = '#ffffff';
const SS_ROW_BG_SELECTED = 0x9933cc;
const SS_ROW_BG_HOVER = 0x333333;
const SS_ROW_BG_ALT = 0x1a1a1a;
const SS_HEADER_ROW_COLOR = '#888888';
const SS_HEADER_ROW_SIZE = 14;

// Column widths (fractions of list width)
const SS_COL_NUM_FRAC = 0.06;
const SS_COL_TITLE_FRAC = 0.48;
const SS_COL_ARTIST_FRAC = 0.32;
const SS_COL_TIME_FRAC = 0.14;

// Play button
const SS_PLAY_W = 220;
const SS_PLAY_H = 56;
const SS_PLAY_COLOR = 0x9933cc;
const SS_PLAY_HOVER_COLOR = 0xbb55ee;
const SS_PLAY_TEXT_SIZE = 24;
const SS_PLAY_MARGIN_BOTTOM = 50;

// Scroll
const SS_SCROLL_SPEED = 12;
const SS_SCROLL_LERP = 8;

// No course indicator
const SS_NO_COURSE_COLOR = '#666666';

export interface SongSelectCallbacks {
  onPlay: (track: CatalogTrack, difficulty: string) => void;
  onBack: () => void;
}

export class SongSelectScreen {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private cb: SongSelectCallbacks;

  // Data
  private tracks: CatalogTrack[] = [];
  private selectedIdx = 0;
  private difficultyIdx = 1; // 0=easy, 1=normal, 2=hard
  private loaded = false;
  private courseAvailable: Set<string> = new Set();

  // Scroll state
  private scrollPx = 0;
  private scrollTarget = 0;

  // Hover state
  private hoverIdx = -1;
  private hoverBack = false;
  private hoverPlay = false;
  private hoverDiffLeft = false;
  private hoverDiffRight = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // UI elements
  private bg!: Phaser.GameObjects.Rectangle;
  private headerText!: Phaser.GameObjects.Text;
  private backText!: Phaser.GameObjects.Text;
  private trackTitleText!: Phaser.GameObjects.Text;
  private artistText!: Phaser.GameObjects.Text;
  private albumArt!: Phaser.GameObjects.Rectangle; // placeholder
  private albumArtImg: Phaser.GameObjects.Image | null = null;
  private diffLabel!: Phaser.GameObjects.Text;
  private diffLeftArrow!: Phaser.GameObjects.Text;
  private diffRightArrow!: Phaser.GameObjects.Text;
  private playBtn!: Phaser.GameObjects.Rectangle;
  private playBtnText!: Phaser.GameObjects.Text;
  private noCourseText!: Phaser.GameObjects.Text;

  // List column headers
  private colHeaders: Phaser.GameObjects.Text[] = [];

  // Row pool
  private rowBgs: Phaser.GameObjects.Rectangle[] = [];
  private rowNumTexts: Phaser.GameObjects.Text[] = [];
  private rowTitleTexts: Phaser.GameObjects.Text[] = [];
  private rowArtistTexts: Phaser.GameObjects.Text[] = [];
  private rowTimeTexts: Phaser.GameObjects.Text[] = [];

  // Geometry mask for list clipping
  private maskGfx!: Phaser.GameObjects.Graphics;
  private listMask!: Phaser.Display.Masks.GeometryMask;

  private visible = false;

  constructor(scene: Phaser.Scene, cb: SongSelectCallbacks) {
    this.scene = scene;
    this.cb = cb;
    this.container = scene.add.container(0, 0).setDepth(SS_DEPTH).setVisible(false).setScrollFactor(0);
    this.build();
    this.setupInput();
  }

  // ── Build UI ──────────────────────────────────────────────────

  private build(): void {
    const W = TUNING.GAME_WIDTH;
    const H = TUNING.GAME_HEIGHT;

    // Background
    this.bg = this.scene.add.rectangle(W / 2, H / 2, W, H, SS_BG_COLOR, SS_BG_ALPHA)
      .setScrollFactor(0).setDepth(SS_DEPTH);
    this.container.add(this.bg);

    // Header
    this.headerText = this.scene.add.text(W / 2, SS_HEADER_Y, SS_HEADER_TEXT, {
      fontFamily: SS_FONT, fontSize: `${SS_HEADER_SIZE}px`, color: SS_HEADER_COLOR,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.headerText);

    // Back button
    this.backText = this.scene.add.text(SS_BACK_X, SS_BACK_Y, '< BACK', {
      fontFamily: SS_FONT, fontSize: `${SS_BACK_SIZE}px`, color: SS_BACK_COLOR,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.backText);

    // Album art placeholder
    this.albumArt = this.scene.add.rectangle(
      SS_INFO_X + SS_ART_SIZE / 2, SS_INFO_Y + SS_ART_SIZE / 2,
      SS_ART_SIZE, SS_ART_SIZE, 0x222222
    ).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.albumArt);

    // Track title
    const infoTextX = SS_INFO_X + SS_ART_SIZE + 30;
    this.trackTitleText = this.scene.add.text(infoTextX, SS_INFO_Y + 20, '', {
      fontFamily: SS_FONT, fontSize: `${SS_TITLE_SIZE}px`, color: SS_TITLE_COLOR,
      fontStyle: 'bold', wordWrap: { width: W - infoTextX - 100 },
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.trackTitleText);

    // Artist name
    this.artistText = this.scene.add.text(infoTextX, SS_INFO_Y + 65, '', {
      fontFamily: SS_FONT, fontSize: `${SS_ARTIST_SIZE}px`, color: SS_ARTIST_COLOR,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.artistText);

    // Difficulty selector
    this.diffLeftArrow = this.scene.add.text(infoTextX, SS_DIFF_Y, '<', {
      fontFamily: SS_FONT, fontSize: `${SS_DIFF_ARROW_SIZE}px`, color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.diffLeftArrow);

    this.diffLabel = this.scene.add.text(infoTextX + 40, SS_DIFF_Y, SS_DIFF_LABELS[this.difficultyIdx], {
      fontFamily: SS_FONT, fontSize: `${SS_DIFF_SIZE}px`,
      color: SS_DIFF_COLORS[this.difficultyIdx], fontStyle: 'bold',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.diffLabel);

    this.diffRightArrow = this.scene.add.text(infoTextX + 160, SS_DIFF_Y, '>', {
      fontFamily: SS_FONT, fontSize: `${SS_DIFF_ARROW_SIZE}px`, color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.diffRightArrow);

    // Track list column headers
    const listX = SS_LIST_MARGIN_X;
    const listW = W - SS_LIST_MARGIN_X * 2;
    const headerY = SS_LIST_TOP - 24;
    const cols = [
      { label: '#', frac: SS_COL_NUM_FRAC },
      { label: 'TITLE', frac: SS_COL_TITLE_FRAC },
      { label: 'ARTIST', frac: SS_COL_ARTIST_FRAC },
      { label: 'TIME', frac: SS_COL_TIME_FRAC },
    ];
    let cumFrac = 0;
    for (const col of cols) {
      const x = listX + cumFrac * listW;
      const ht = this.scene.add.text(x + 8, headerY, col.label, {
        fontFamily: SS_FONT, fontSize: `${SS_HEADER_ROW_SIZE}px`, color: SS_HEADER_ROW_COLOR,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
      this.colHeaders.push(ht);
      this.container.add(ht);
      cumFrac += col.frac;
    }

    // List separator line
    const sepLine = this.scene.add.rectangle(
      W / 2, SS_LIST_TOP - 6, listW, 1, 0x444444
    ).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(sepLine);

    // Geometry mask for list area
    const listH = H - SS_LIST_TOP - SS_PLAY_H - SS_PLAY_MARGIN_BOTTOM - 30;
    this.maskGfx = this.scene.add.graphics().setScrollFactor(0).setVisible(false);
    this.maskGfx.fillStyle(0xffffff);
    this.maskGfx.fillRect(listX, SS_LIST_TOP, listW, listH);
    this.listMask = this.maskGfx.createGeometryMask();

    // Row pool
    for (let i = 0; i < SS_ROW_POOL; i++) {
      const rowBg = this.scene.add.rectangle(
        listX + listW / 2, 0, listW, SS_ROW_HEIGHT, 0x000000, 0
      ).setScrollFactor(0).setDepth(SS_DEPTH + 0.5).setVisible(false);
      rowBg.setMask(this.listMask);
      this.rowBgs.push(rowBg);
      this.container.add(rowBg);

      const numFrac = 0;
      const titleFrac = SS_COL_NUM_FRAC;
      const artistFrac = SS_COL_NUM_FRAC + SS_COL_TITLE_FRAC;
      const timeFrac = SS_COL_NUM_FRAC + SS_COL_TITLE_FRAC + SS_COL_ARTIST_FRAC;

      const numT = this.mkRowText(listX + numFrac * listW + 8, 0);
      const titleT = this.mkRowText(listX + titleFrac * listW + 8, 0);
      const artistT = this.mkRowText(listX + artistFrac * listW + 8, 0);
      const timeT = this.mkRowText(listX + timeFrac * listW + 8, 0);

      numT.setMask(this.listMask);
      titleT.setMask(this.listMask);
      artistT.setMask(this.listMask);
      timeT.setMask(this.listMask);

      this.rowNumTexts.push(numT);
      this.rowTitleTexts.push(titleT);
      this.rowArtistTexts.push(artistT);
      this.rowTimeTexts.push(timeT);

      this.container.add([numT, titleT, artistT, timeT]);
    }

    // Play button
    const playY = H - SS_PLAY_MARGIN_BOTTOM - SS_PLAY_H / 2;
    this.playBtn = this.scene.add.rectangle(
      W / 2, playY, SS_PLAY_W, SS_PLAY_H, SS_PLAY_COLOR
    ).setScrollFactor(0).setDepth(SS_DEPTH + 1);
    this.container.add(this.playBtn);

    this.playBtnText = this.scene.add.text(W / 2, playY, 'PLAY', {
      fontFamily: SS_FONT, fontSize: `${SS_PLAY_TEXT_SIZE}px`, color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 2);
    this.container.add(this.playBtnText);

    // "No course available" text (hidden by default)
    this.noCourseText = this.scene.add.text(W / 2, playY + SS_PLAY_H / 2 + 16, 'No course available for this track', {
      fontFamily: SS_FONT, fontSize: '14px', color: SS_NO_COURSE_COLOR,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(SS_DEPTH + 1).setVisible(false);
    this.container.add(this.noCourseText);
  }

  private mkRowText(x: number, y: number): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, '', {
      fontFamily: SS_FONT, fontSize: `${SS_ROW_SIZE}px`, color: SS_ROW_COLOR,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(SS_DEPTH + 1);
  }

  // ── Input ─────────────────────────────────────────────────────

  private setupInput(): void {
    // Track mouse position
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.visible) return;
      this.lastMouseX = pointer.x;
      this.lastMouseY = pointer.y;
    });

    // Click handler
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.visible) return;
      this.lastMouseX = pointer.x;
      this.lastMouseY = pointer.y;
      this.handleClick();
    });

    // Mousewheel scroll (Phaser 3 wheel signature: pointer, gameObjects, deltaX, deltaY, deltaZ)
    this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      if (!this.visible) return;
      this.scrollTarget += deltaY * 0.5;
      this.clampScroll();
    });

    // ESC key
    this.scene.input.keyboard?.addKey('ESC').on('down', () => {
      if (this.visible) this.cb.onBack();
    });
  }

  private handleClick(): void {
    if (this.hoverBack) {
      this.cb.onBack();
      return;
    }
    if (this.hoverDiffLeft) {
      this.difficultyIdx = Math.max(0, this.difficultyIdx - 1);
      this.updateDifficulty();
      return;
    }
    if (this.hoverDiffRight) {
      this.difficultyIdx = Math.min(2, this.difficultyIdx + 1);
      this.updateDifficulty();
      return;
    }
    if (this.hoverPlay) {
      const track = this.tracks[this.selectedIdx];
      if (track && this.courseAvailable.has(track.spotifyTrackId)) {
        this.cb.onPlay(track, this.getDifficulty());
      }
      return;
    }
    if (this.hoverIdx >= 0 && this.hoverIdx < this.tracks.length) {
      this.selectedIdx = this.hoverIdx;
      this.updateInfo();
      this.checkCourseAvailable();
    }
  }

  // ── Show / Hide ───────────────────────────────────────────────

  show(): void {
    this.visible = true;
    this.container.setVisible(true);
    if (!this.loaded) this.loadTracks();
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Data loading ──────────────────────────────────────────────

  private async loadTracks(): Promise<void> {
    try {
      this.tracks = await fetchAllTracks();
      // Sort by artist then title
      this.tracks.sort((a, b) => {
        const ac = a.artistName.localeCompare(b.artistName);
        return ac !== 0 ? ac : a.title.localeCompare(b.title);
      });
      this.loaded = true;
      this.selectedIdx = 0;
      this.scrollPx = 0;
      this.scrollTarget = 0;
      this.updateInfo();
      this.checkCourseAvailable();
      // Probe which tracks have courses
      this.probeCourses();
    } catch (err) {
      console.warn('[SongSelect] Failed to load tracks:', err);
    }
  }

  /** Check which tracks have course files by probing HEAD requests. */
  private async probeCourses(): Promise<void> {
    for (const track of this.tracks) {
      try {
        const resp = await fetch(`courses/${track.spotifyTrackId}/normal.json`, { method: 'HEAD' });
        if (resp.ok) this.courseAvailable.add(track.spotifyTrackId);
      } catch { /* no course */ }
    }
  }

  private async checkCourseAvailable(): Promise<void> {
    const track = this.tracks[this.selectedIdx];
    if (!track) return;
    if (this.courseAvailable.has(track.spotifyTrackId)) {
      this.noCourseText.setVisible(false);
      this.playBtn.setFillStyle(SS_PLAY_COLOR);
      return;
    }
    // Probe this specific track
    try {
      const diff = this.getDifficulty();
      const resp = await fetch(`courses/${track.spotifyTrackId}/${diff}.json`, { method: 'HEAD' });
      if (resp.ok) {
        this.courseAvailable.add(track.spotifyTrackId);
        this.noCourseText.setVisible(false);
        this.playBtn.setFillStyle(SS_PLAY_COLOR);
      } else {
        this.noCourseText.setVisible(true);
        this.playBtn.setFillStyle(0x444444);
      }
    } catch {
      this.noCourseText.setVisible(true);
      this.playBtn.setFillStyle(0x444444);
    }
  }

  // ── Update (called each frame) ────────────────────────────────

  update(dt: number): void {
    if (!this.visible) return;

    // Smooth scroll
    const diff = this.scrollTarget - this.scrollPx;
    if (Math.abs(diff) > 0.5) {
      this.scrollPx += diff * Math.min(1, SS_SCROLL_LERP * dt);
    } else {
      this.scrollPx = this.scrollTarget;
    }

    this.updateHover();
    this.renderList();
    this.renderHoverStates();
  }

  // ── Hover detection ───────────────────────────────────────────

  private updateHover(): void {
    const mx = this.lastMouseX;
    const my = this.lastMouseY;
    const W = TUNING.GAME_WIDTH;
    const H = TUNING.GAME_HEIGHT;

    // Back button
    const backBounds = this.backText.getBounds();
    this.hoverBack = mx >= backBounds.x && mx <= backBounds.x + backBounds.width &&
      my >= backBounds.y && my <= backBounds.y + backBounds.height;

    // Difficulty arrows
    const dlBounds = this.diffLeftArrow.getBounds();
    this.hoverDiffLeft = mx >= dlBounds.x && mx <= dlBounds.x + dlBounds.width + 10 &&
      my >= dlBounds.y && my <= dlBounds.y + dlBounds.height;

    const drBounds = this.diffRightArrow.getBounds();
    this.hoverDiffRight = mx >= drBounds.x && mx <= drBounds.x + drBounds.width + 10 &&
      my >= drBounds.y && my <= drBounds.y + drBounds.height;

    // Play button
    const playY = H - SS_PLAY_MARGIN_BOTTOM - SS_PLAY_H / 2;
    this.hoverPlay = mx >= W / 2 - SS_PLAY_W / 2 && mx <= W / 2 + SS_PLAY_W / 2 &&
      my >= playY - SS_PLAY_H / 2 && my <= playY + SS_PLAY_H / 2;

    // Track list rows
    const listX = SS_LIST_MARGIN_X;
    const listW = W - SS_LIST_MARGIN_X * 2;
    const listH = H - SS_LIST_TOP - SS_PLAY_H - SS_PLAY_MARGIN_BOTTOM - 30;
    const listBottom = SS_LIST_TOP + listH;

    this.hoverIdx = -1;
    if (mx >= listX && mx <= listX + listW && my >= SS_LIST_TOP && my < listBottom) {
      const relY = my - SS_LIST_TOP + this.scrollPx;
      const rowIdx = Math.floor(relY / SS_ROW_HEIGHT);
      if (rowIdx >= 0 && rowIdx < this.tracks.length) {
        this.hoverIdx = rowIdx;
      }
    }
  }

  private renderHoverStates(): void {
    // Back button color
    this.backText.setColor(this.hoverBack ? SS_BACK_HOVER_COLOR : SS_BACK_COLOR);

    // Difficulty arrows
    this.diffLeftArrow.setColor(this.hoverDiffLeft ? '#ff00ff' : '#ffffff');
    this.diffRightArrow.setColor(this.hoverDiffRight ? '#ff00ff' : '#ffffff');

    // Play button
    const track = this.tracks[this.selectedIdx];
    const hasCourse = track && this.courseAvailable.has(track.spotifyTrackId);
    if (hasCourse) {
      this.playBtn.setFillStyle(this.hoverPlay ? SS_PLAY_HOVER_COLOR : SS_PLAY_COLOR);
    }
  }

  // ── List rendering ────────────────────────────────────────────

  private renderList(): void {
    const W = TUNING.GAME_WIDTH;
    const H = TUNING.GAME_HEIGHT;
    const listX = SS_LIST_MARGIN_X;
    const listW = W - SS_LIST_MARGIN_X * 2;
    const listH = H - SS_LIST_TOP - SS_PLAY_H - SS_PLAY_MARGIN_BOTTOM - 30;

    const firstRow = Math.floor(this.scrollPx / SS_ROW_HEIGHT);
    const scrollFrac = this.scrollPx - firstRow * SS_ROW_HEIGHT;
    const visibleRows = Math.min(SS_ROW_POOL, Math.ceil(listH / SS_ROW_HEIGHT) + 1);

    for (let i = 0; i < SS_ROW_POOL; i++) {
      const trackIdx = firstRow + i;
      const rowY = SS_LIST_TOP + i * SS_ROW_HEIGHT - scrollFrac + SS_ROW_HEIGHT / 2;

      if (i >= visibleRows || trackIdx < 0 || trackIdx >= this.tracks.length) {
        this.rowBgs[i].setVisible(false);
        this.rowNumTexts[i].setVisible(false);
        this.rowTitleTexts[i].setVisible(false);
        this.rowArtistTexts[i].setVisible(false);
        this.rowTimeTexts[i].setVisible(false);
        continue;
      }

      const track = this.tracks[trackIdx];
      const isSelected = trackIdx === this.selectedIdx;
      const isHovered = trackIdx === this.hoverIdx;
      const hasCourse = this.courseAvailable.has(track.spotifyTrackId);

      // Row background
      this.rowBgs[i].setPosition(listX + listW / 2, rowY);
      this.rowBgs[i].setVisible(true);
      if (isSelected) {
        this.rowBgs[i].setFillStyle(SS_ROW_BG_SELECTED, 0.8);
      } else if (isHovered) {
        this.rowBgs[i].setFillStyle(SS_ROW_BG_HOVER, 0.6);
      } else {
        this.rowBgs[i].setFillStyle(trackIdx % 2 === 0 ? SS_ROW_BG_ALT : SS_BG_COLOR, trackIdx % 2 === 0 ? 0.5 : 0);
      }

      // Text color
      const textColor = !hasCourse ? SS_NO_COURSE_COLOR :
        (isSelected || isHovered) ? SS_ROW_SELECTED_COLOR : SS_ROW_COLOR;

      // Row number
      const numX = listX + 8;
      this.rowNumTexts[i].setPosition(numX, rowY).setText(`${trackIdx + 1}`).setColor(textColor).setVisible(true);

      // Title
      const titleX = listX + SS_COL_NUM_FRAC * listW + 8;
      const titleMaxW = SS_COL_TITLE_FRAC * listW - 16;
      this.rowTitleTexts[i].setPosition(titleX, rowY).setText(track.title).setColor(textColor).setVisible(true);
      this.rowTitleTexts[i].setCrop(0, 0, titleMaxW, SS_ROW_HEIGHT * 2);

      // Artist
      const artistX = listX + (SS_COL_NUM_FRAC + SS_COL_TITLE_FRAC) * listW + 8;
      const artistMaxW = SS_COL_ARTIST_FRAC * listW - 16;
      this.rowArtistTexts[i].setPosition(artistX, rowY).setText(track.artistName).setColor(textColor).setVisible(true);
      this.rowArtistTexts[i].setCrop(0, 0, artistMaxW, SS_ROW_HEIGHT * 2);

      // Time
      const timeX = listX + (SS_COL_NUM_FRAC + SS_COL_TITLE_FRAC + SS_COL_ARTIST_FRAC) * listW + 8;
      const mins = Math.floor(track.durationMs / 60000);
      const secs = Math.floor((track.durationMs % 60000) / 1000);
      this.rowTimeTexts[i].setPosition(timeX, rowY).setText(`${mins}:${String(secs).padStart(2, '0')}`).setColor(textColor).setVisible(true);
    }
  }

  // ── Info panel update ─────────────────────────────────────────

  private updateInfo(): void {
    const track = this.tracks[this.selectedIdx];
    if (!track) {
      this.trackTitleText.setText('');
      this.artistText.setText('');
      return;
    }
    this.trackTitleText.setText(track.title);
    this.artistText.setText(track.artistName);

    // Load album art if available
    if (track.albumImageUrl) {
      this.loadAlbumArt(track.albumImageUrl);
    } else {
      if (this.albumArtImg) this.albumArtImg.setVisible(false);
    }
  }

  private loadAlbumArt(url: string): void {
    const key = `ss-art-${url}`;
    if (this.scene.textures.exists(key)) {
      this.showAlbumArt(key);
      return;
    }
    this.scene.load.image(key, url);
    this.scene.load.once('complete', () => {
      if (this.visible) this.showAlbumArt(key);
    });
    this.scene.load.start();
  }

  private showAlbumArt(key: string): void {
    if (!this.albumArtImg) {
      this.albumArtImg = this.scene.add.image(
        SS_INFO_X + SS_ART_SIZE / 2, SS_INFO_Y + SS_ART_SIZE / 2, key
      ).setScrollFactor(0).setDepth(SS_DEPTH + 1.5);
      this.container.add(this.albumArtImg);
    } else {
      this.albumArtImg.setTexture(key);
    }
    this.albumArtImg.setDisplaySize(SS_ART_SIZE, SS_ART_SIZE).setVisible(true);
  }

  private updateDifficulty(): void {
    this.diffLabel.setText(SS_DIFF_LABELS[this.difficultyIdx]);
    this.diffLabel.setColor(SS_DIFF_COLORS[this.difficultyIdx]);
    this.checkCourseAvailable();
  }

  private clampScroll(): void {
    const maxScroll = Math.max(0, this.tracks.length * SS_ROW_HEIGHT -
      (TUNING.GAME_HEIGHT - SS_LIST_TOP - SS_PLAY_H - SS_PLAY_MARGIN_BOTTOM - 30));
    this.scrollTarget = Phaser.Math.Clamp(this.scrollTarget, 0, maxScroll);
  }

  // ── Public getters ────────────────────────────────────────────

  getDifficulty(): string {
    return SS_DIFF_LABELS[this.difficultyIdx].toLowerCase();
  }

  getSelectedTrack(): CatalogTrack | null {
    return this.tracks[this.selectedIdx] || null;
  }

  destroy(): void {
    this.container.destroy(true);
    this.maskGfx.destroy();
  }
}
