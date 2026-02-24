/**
 * Windows Media Player popup — Win95-styled overlay with YouTube video,
 * progress bar, volume slider, and transport controls.
 *
 * Architecture (CRT Hover Proxy pattern):
 *   - HTML elements: invisible interaction layer (click, drag, layout)
 *   - Phaser Graphics + Text: visible CRT-rendered layer (synced from HTML positions)
 *   - YouTube iframe: stays visible HTML (not CRT-filtered)
 */

import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_MODE } from '../config/gameMode';
import { fetchAllTracks, fetchArtists, type CatalogTrack, type CatalogArtist } from '../systems/MusicCatalogService';
import { startLogin } from '../systems/SpotifyAuthSystem';
import { ensureAnonUser, getAuthUserId } from '../systems/AuthSystem';
import { supabase } from '../supabaseClient';

// ─── Tuning ─────────────────────────────────────────────────────

// Text size multipliers (Phaser CRT layer) — tweak these to scale text groups
const WMP_TEXT_TITLE_MULT = 2;       // title bar text ("Windows Media Player")
const WMP_TEXT_WINBTN_MULT = 4.5;    // window button labels (□, ✕)
const WMP_TEXT_STATUS_MULT = 2;      // track title / status text
const WMP_TEXT_TIME_MULT = 2;        // time labels (0:00 / 3:45)
const WMP_TEXT_TRANSPORT_MULT = 2;   // transport button labels (|<, <<, >, etc)
const WMP_TEXT_TAB_MULT = 2;         // tab labels
const WMP_TEXT_VOL_MULT = 2;         // volume icon ("Vol")
const WMP_TEXT_BOTTOM_MULT = 2;      // bottom bar ("Ready" / track count)
const WMP_TEXT_LIB_HEADER_MULT = 2;  // library column header
const WMP_TEXT_LIB_ROW_MULT = 2;     // library track rows
const WMP_TEXT_INFO_TITLE_MULT = 2;  // track info panel title
const WMP_TEXT_INFO_ARTIST_MULT = 2; // track info panel artist
const WMP_TEXT_INFO_BTN_MULT = 2;    // track info "Listen on Spotify" button

// Window frame (WMP_WIDTH_PCT, WMP_TOP_PCT in tuning.ts)
const WMP_TITLE = 'Hume Media Player';
const WMP_BORDER_W = 2;             // main window border width px
const WMP_DEPTH = 1400;             // Phaser depth (above ProfileHud 1300)
const WMP_FONT = 'Early GameBoy';   // font for Phaser text objects

// Title bar (2x height)
const WMP_TITLEBAR_FONT = 48;       // title bar font size px
const WMP_TITLEBAR_PAD_V = 4;       // title bar vertical padding px
const WMP_TITLEBAR_PAD_H = 6;       // title bar horizontal padding px

// Window buttons (close only — scaled with title bar)
const WMP_WINBTN_W = 48;            // window button width px
const WMP_WINBTN_H = 42;            // window button height px
const WMP_WINBTN_FONT = 90;         // window button font size px
const WMP_WINBTN_GAP = 10;          // gap between window buttons px
const WMP_TITLE_PAD_L = 20;         // title text left padding px
const WMP_BTNGROUP_PAD_R = 10;      // button group right padding px

// Status row
const WMP_STATUS_FONT = 22;         // status text font size px

// Progress bar
const WMP_PROG_MARGIN_V = 20;       // progress row vertical margin px
const WMP_PROG_MARGIN_H = 40;       // progress row horizontal margin px (buffer from HMP edges)
const WMP_PROG_GAP = 6;             // gap between time labels and groove px
const WMP_PROG_GROOVE_H = 6;        // progress groove height px
const WMP_PROG_WRAP_H = 20;         // progress clickable area height px
const WMP_MARKER_W = 40;            // progress marker width px
const WMP_MARKER_H = 36;            // progress marker height px
const WMP_MARKER_STROKE = 3;        // playhead diamond stroke width px
const WMP_TIME_FONT = 20;           // time label font size px
const WMP_TIME_MIN_W = 30;          // time label minimum width px

// Fullscreen mode
const WMP_FS_ANIM_MS = 300;         // fullscreen transition duration ms

// Transport buttons (WMP_TRANSPORT_SIZE, WMP_TRANSPORT_FONT, WMP_TRANSPORT_GAP in tuning.ts)

// Library tabs
const WMP_TAB_H = 60;               // tab height px
const WMP_TAB_GAP = 2;              // gap between tabs px
const WMP_TAB_RADIUS = 8;           // top corner radius px
const WMP_TAB_FONT = 11;            // tab label font size px
const WMP_TAB_LABELS = ['Artists', 'Music', 'Playlists', 'Favorites'];
const WMP_TAB_ANIM_SPEED = 10;       // tab transition speed (higher = snappier)

// Volume slider
const WMP_VOL_RAMP_MAX_H = 24;      // volume ramp max height (right edge, 100%) px
const WMP_VOL_RAMP_MIN_H = 2;       // volume ramp min height (left edge, 0%) px
const WMP_VOL_SLIDER_W = 10;        // slider thumb width px
const WMP_VOL_SLIDER_H = 30;        // slider thumb height px
const WMP_VOL_ICON_FONT = 24;       // "Vol" label font size px
const WMP_VOL_GAP = 4;              // gap between vol icon and ramp px
const WMP_VOL_RAMP_BG = 0x404040;   // dark gray (unfilled ramp)
const WMP_VOL_RAMP_FILL = 0x800080; // purple (filled portion)

// Bottom status bar
const WMP_BOTTOM_MARGIN = '0 4px 4px'; // bottom bar margin
const WMP_BOTTOM_PAD_V = 1;         // bottom bar vertical padding px
const WMP_BOTTOM_PAD_H = 4;         // bottom bar horizontal padding px
const WMP_BOTTOM_FONT = 20;         // bottom bar font size px

// Library
const WMP_LIB_ROW_POOL = 30;         // pre-created HTML row elements (pool size)
// TUNING.WMP_LIB_ROW_H now lives in TUNING.TUNING.WMP_LIB_ROW_H
const WMP_LIB_MARGIN = 4;           // library area margin px
const WMP_LIB_ROW_FONT = 20;        // library row font size px
const WMP_LIB_ROW_PAD_H = 4;        // library row horizontal padding px
const WMP_SCROLL_PX = 50;           // pixels to scroll per wheel tick
const WMP_SCROLL_LERP = 0.08;       // smooth scroll lerp speed (0-1 per frame)
const WMP_SCROLL_SNAP = 0.05;       // snap threshold — very small for smooth deceleration
const WMP_SCROLL_ACCEL_WINDOW = 120; // ms — wheel events within this window count as rapid
const WMP_SCROLL_ACCEL_MAX = 3.5;    // max velocity multiplier from rapid scrolling
const WMP_SCROLL_ACCEL_STEP = 0.35;  // multiplier added per rapid wheel tick (after threshold)
const WMP_SCROLL_ACCEL_AFTER = 4;    // rapid ticks needed before acceleration kicks in
const WMP_SCROLL_DECEL = 0.7;        // velocity decay per frame when not scrolling (toward 1)
const WMP_SCROLLBAR_W = 56;         // scrollbar width in game px
const WMP_SCROLLBAR_MIN_THUMB = 30; // minimum scrollbar thumb height in game px
const WMP_HEART_FRAC = 0.4;        // heart size as fraction of thumbnail width
const WMP_HEART_PAD = 2;           // padding from thumbnail edges (CSS px)
const WMP_HEART_STROKE = 1.5;      // heart outline stroke thickness
const WMP_HEADER_PAD = 10;          // header row padding above+below text (total extra px)
const WMP_HEADER_H_CSS = 11 * WMP_TEXT_LIB_ROW_MULT + WMP_HEADER_PAD + 4; // header row total CSS px (font + pad + border)

// Playlist sidebar (Playlists tab only)
const WMP_SIDEBAR_FRAC = 0.2;           // sidebar width as fraction of library area (1/5)
const WMP_SIDEBAR_GAP = 20;             // gap between sidebar and main library (px)
const WMP_SIDEBAR_VISIBLE_ROWS = 6;    // visible row slots (4 filled + 2 empty)
const WMP_SIDEBAR_ROW_POOL = 10;        // pre-created sidebar row elements
const WMP_SIDEBAR_PLUS_GAP = 10;        // gap between sunken list and plus button (px)
const WMP_SIDEBAR_PLUS_H = 28;          // plus button height (px)
const WMP_TEXT_SIDEBAR_MULT = 2;        // sidebar Phaser text scale multiplier
const WMP_TEXT_SIDEBAR_PLUS_MULT = 2;   // plus button text scale multiplier
const WMP_PLAYLIST_NAMES = ['Title Track', 'Ride or Die', 'this is hume', 'Favorites'];

// Column system
const WMP_COL_MIN_FRAC = 0.08;       // minimum column width as fraction
const WMP_COL_LIFT_SCALE = 1.08;     // header scale when lifted for reorder
const WMP_COL_DIVIDER_HIT_W = 40;   // divider hit area width px (centered on line)
const WMP_COL_DIVIDER_LINE_W = 3;   // visual divider line thickness px
const WMP_COL_TEXT_SLIDE_LERP = 0.15; // lerp speed for target text slide anim
const WMP_COL_LIFT_LERP = 0.25;      // lerp speed for lift scale animation
const WMP_COL_HEADER_PAD = 4;        // horizontal text padding inside header cells px
const WMP_COL_SHADOW_EXTRA_SCALE = 1.08; // shadow scale on top of lift scale
const WMP_COL_SHADOW_OFFSET_Y = 8;      // shadow Y offset (scaled by sy)
const WMP_COL_SHADOW_ALPHA = 0.69;      // shadow peak density (center)
const WMP_COL_SHADOW_DITHER_PX = 3;     // dither "pixel" size (scaled by sx)
const WMP_COL_SHADOW_SPREAD = 10;       // soft edge fade-out distance (scaled by sx)
const WMP_COL_LIFT_DARKEN = 0.15;       // darken overlay alpha on lifted header (0=none, 1=black)
const WMP_LOCKED_ROW_ALPHA = 0.5;       // black overlay opacity on locked rows (YouTube source, no YT link)

// Row highlight colors
const PH_SELECTED_ROW = 0x800080;       // selected row background (hume purple)
const PH_HOVER_ROW = 0xc060c0;          // hover row background (lightened hume purple)

// Sign-in popup (modal over WMP)
const WMP_SIGNIN_W_PCT = 60;            // sign-in popup width as % of WMP window
const WMP_SIGNIN_BACKDROP_ALPHA = 0.5;  // backdrop overlay opacity
const WMP_SIGNIN_TITLEBAR_FONT = 22;    // sign-in title bar font size px
const WMP_SIGNIN_LABEL_FONT = 24;       // "Sign in to unlock more songs!" font size px
const WMP_SIGNIN_BTN_W = 180;           // Spotify button width px
const WMP_SIGNIN_BTN_H = 28;            // Spotify button height px
const WMP_SIGNIN_BTN_FONT = 22;         // Spotify button font size px
const WMP_SIGNIN_BODY_PAD = 16;         // body vertical padding px
const WMP_TEXT_SIGNIN_TITLE_MULT = 2;   // sign-in title bar text scale
const WMP_TEXT_SIGNIN_LABEL_MULT = 2;   // sign-in label text scale
const WMP_TEXT_SIGNIN_BTN_MULT = 2;     // sign-in button text scale

// Spotify green for sign-in button
const PH_SPOTIFY_GREEN = 0x1db954;

// Context menu (right-click on library rows)
const WMP_CTX_MAX_ITEMS = 8;            // max menu item pool
const WMP_CTX_SUBMENU_MAX = 10;         // max submenu item pool (custom playlists)
const WMP_CTX_ITEM_H = 20;             // menu item height px
const WMP_CTX_PAD_H = 8;               // horizontal padding inside menu px
const WMP_CTX_PAD_V = 3;               // vertical padding (top/bottom of menu) px
const WMP_CTX_SEP_H = 7;              // separator height px
const WMP_CTX_FONT = 11;               // menu item font size px
const WMP_TEXT_CTX_MULT = 2;           // context menu text scale multiplier
const WMP_CTX_FLASH_MS = 80;           // click flash duration before dismiss (ms)
const WMP_CTX_STROKE_W = 1;            // hover stroke width (px, pre-scale)

/** Open a Spotify URL — tries the native app first (spotify: URI), falls back to web player. */
function openSpotify(webUrl: string): void {
  // Extract track/album/artist/playlist ID from https://open.spotify.com/{type}/{id}
  const m = webUrl.match(/open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)/);
  if (m) {
    const appUri = `spotify:${m[1]}:${m[2]}`;
    const w = window.open(appUri);
    // If the app URI didn't open (popup blocked or no handler), fall back to web
    if (!w || w.closed) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Some browsers open a blank tab for unhandled URIs — close it and try web
      setTimeout(() => {
        try { if (w.location.href === 'about:blank') { w.close(); window.open(webUrl, '_blank', 'noopener,noreferrer'); } }
        catch { /* cross-origin — app handled it, do nothing */ }
      }, 500);
    }
  } else {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }
}

type ColKey = 'title' | 'artist' | 'album' | 'time' | 'rank' | 'listens';
interface ColDef { key: ColKey; label: string; widthFrac: number; }
interface CtxMenuItem { label: string; action: () => void; isSeparator?: boolean; hasSubmenu?: boolean; }
interface CustomPlaylist { id: number; name: string; trackIds: string[]; }

const WMP_DEFAULT_COLS: ColDef[] = [
  { key: 'title', label: 'Title', widthFrac: 0.55 },
  { key: 'artist', label: 'Artist', widthFrac: 0.30 },
  { key: 'time', label: 'Time', widthFrac: 0.15 },
];
const WMP_HUME_COLS: ColDef[] = [
  { key: 'rank', label: '#', widthFrac: 0.08 },
  { key: 'title', label: 'Title', widthFrac: 0.40 },
  { key: 'artist', label: 'Artist', widthFrac: 0.30 },
  { key: 'listens', label: 'Listens', widthFrac: 0.22 },
];

// Win95 palette — CSS strings for HTML layout
const W95_CSS_FACE = '#c0c0c0';
const W95_CSS_HIGHLIGHT = '#ffffff';
const W95_CSS_SHADOW = '#808080';
const W95_CSS_DARK = '#0a0a0a';
const W95_CSS_LIGHT = '#dfdfdf';
const W95_CSS_TITLE = '#800080';

// Win95 palette — hex numbers for Phaser Graphics
const PH_FACE = 0xc0c0c0;
const PH_HIGHLIGHT = 0xffffff;
const PH_SHADOW = 0x808080;
const PH_TITLE = 0x800080;
const PH_BLACK = 0x000000;

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export interface WMPCallbacks {
  getPosition: () => { current: number; duration: number };
  seekTo: (seconds: number) => void;
  getVolume: () => number;
  setVolume: (fraction: number) => void;
  getYTElement: () => HTMLElement | null;
  getTrackTitle: () => string;
  getTrackArtist: () => string;
  getSpotifyUrl: () => string | null;
  getSource: () => 'youtube' | 'spotify' | 'hume';
  isSpotifyLoggedIn: () => boolean;
  playTrack: (track: CatalogTrack) => void;
  prev: () => void;
  next: () => void;
  togglePlayPause: () => void;
  toggleShuffle: () => void;
  onWMPClose: () => void;
}

export class WMPPopup {
  private scene: Phaser.Scene;
  private overlay: HTMLDivElement;
  private cb: WMPCallbacks;

  // === HTML interaction layer (invisible — layout + click targets) ===
  private win!: HTMLDivElement;
  private titleBar!: HTMLDivElement;
  private titleTextEl!: HTMLSpanElement;
  private contentSplit!: HTMLDivElement;
  private videoBox!: HTMLDivElement;
  private albumFallbackImg!: HTMLImageElement;
  private splitDivider!: HTMLDivElement;
  private topSection!: HTMLDivElement;       // flex row: video left, info right
  private trackInfoPanel!: HTMLDivElement;   // right side of top section
  private infoTitleEl!: HTMLDivElement;      // track title text
  private infoArtistWrap!: HTMLDivElement;   // artist centering wrapper
  private infoArtistEl!: HTMLDivElement;     // artist name text
  private infoHeartBtn!: HTMLDivElement;      // heart favorite toggle (info panel)
  private infoSpotifyBtn!: HTMLButtonElement; // "Listen on Spotify" button
  private statusEl!: HTMLSpanElement;
  private progGroove!: HTMLDivElement;
  private progFill!: HTMLDivElement;
  private progMarker!: HTMLDivElement;
  private tLeft!: HTMLSpanElement;
  private tRight!: HTMLSpanElement;
  private volGroove!: HTMLDivElement;
  private volFill!: HTMLDivElement;
  private volMarker!: HTMLDivElement;
  private progressGroup!: HTMLDivElement;   // left side of controls row (under video)
  private controlsRow!: HTMLDivElement;     // timeline row container
  private tabBar!: HTMLDivElement;          // tab bar above library
  private tabEls: HTMLDivElement[] = [];    // individual tab elements
  private activeTab = 2;                    // default to "Playlists" tab (index 2)
  private prevActiveTab = 2;                // tracks tab changes for scroll reset
  private tabAnimFrac: number[] = [];       // 0=inactive, 1=active — lerped each frame
  private volIconEl!: HTMLSpanElement;
  private bottomBarEl!: HTMLDivElement;
  private winBtns: HTMLButtonElement[] = [];
  private transportBtnEls: HTMLDivElement[] = [];

  // === HTML: Library ===
  private libraryList!: HTMLDivElement;
  private libraryRowEls: HTMLDivElement[] = [];
  private libHeaderRow!: HTMLDivElement;
  private colCellEls: HTMLDivElement[] = [];
  private colDividerEls: HTMLDivElement[] = [];

  // === HTML: Playlist sidebar ===
  private libraryArea!: HTMLDivElement;        // flex-row wrapper (sidebar + library)
  private playlistSidebar!: HTMLDivElement;    // column container (sunken list + plus btn)
  private sidebarList!: HTMLDivElement;        // sunken white box holding playlist rows
  private sidebarPlusBtn!: HTMLButtonElement;  // "+" button below sunken list
  private sidebarRowEls: HTMLDivElement[] = [];
  private selectedPlaylistIdx = 1;            // default to "Ride or Die" in sidebar
  private prevSelectedPlaylistIdx = 1;       // tracks playlist changes for scroll reset

  // === Artists tab (tab 0) ===
  private libArtists: CatalogArtist[] = [];
  private selectedArtistIdx = 0;
  private prevSelectedArtistIdx = 0;

  // === Column sort ===
  private sortKey: ColKey | null = null;
  private sortAsc = true;

  // === Phaser: Playlist sidebar ===
  private sidebarHeaderTextP!: Phaser.GameObjects.Text;
  private sidebarTextsP: Phaser.GameObjects.Text[] = [];
  private sidebarPlusBtnTextP!: Phaser.GameObjects.Text;

  // === Phaser CRT rendering layer ===
  private tabTextsP: Phaser.GameObjects.Text[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private gfxHeaderOv!: Phaser.GameObjects.Graphics; // header overlay (covers row text/thumbs)
  private gfxDataMask!: Phaser.GameObjects.Graphics;   // mask shape for data area clipping
  private dataMask!: Phaser.Display.Masks.GeometryMask; // geometry mask applied to row content
  private gfxLift!: Phaser.GameObjects.Graphics; // lifted header layer (above normal texts)
  private titleTextP!: Phaser.GameObjects.Text;
  private statusTextP!: Phaser.GameObjects.Text;
  private tLeftP!: Phaser.GameObjects.Text;
  private tRightP!: Phaser.GameObjects.Text;
  private bottomTextP!: Phaser.GameObjects.Text;
  private volIconP!: Phaser.GameObjects.Text;
  private winBtnTextsP: Phaser.GameObjects.Text[] = [];
  private transportTextsP: Phaser.GameObjects.Text[] = [];
  private phaserAll: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
  private lastFontSize = 0;

  // === Phaser: Track info panel ===
  private infoTitleP!: Phaser.GameObjects.Text;
  private infoArtistP!: Phaser.GameObjects.Text;
  private infoHeartP!: Phaser.GameObjects.Text;
  private infoSpotifyBtnP!: Phaser.GameObjects.Text;
  private infoSpotifyLogoP!: Phaser.GameObjects.Image;

  // === Phaser: Library columns ===
  private colHeaderTextsP: Phaser.GameObjects.Text[] = [];
  private colCellTextsP: Phaser.GameObjects.Text[] = []; // flat: row * 4 + col

  // === Phaser: Thumbnail images ===
  private thumbImgsP: Phaser.GameObjects.Image[] = [];   // pool of thumb images (one per visible row)
  private thumbCache = new Map<string, string>();          // albumImageUrl -> phaser texture key
  private thumbLoading = new Set<string>();                // currently loading URLs
  private thumbCounter = 0;                                // unique key counter

  // === Phaser: Heart (favorite) icons ===
  private heartTextsP: Phaser.GameObjects.Text[] = [];    // pool of heart text objects (one per visible row)
  private hoverHeartTrackIdx = -1;                         // track index of heart being hovered (-1 = none)
  private heartBounceTrackId: string | null = null;        // spotifyTrackId currently bouncing
  private heartBounceT = 0;                                // bounce animation progress (0..1)

  // === State ===
  private videoActive = true;
  private isOpen = false;
  private updateRAF = 0;
  private dragging = false;
  private dX = 0;
  private dY = 0;
  private oL = 0;
  private oT = 0;
  private seeking = false;
  private volDragging = false;
  private cursorOver = false;
  private isFullscreen = false;
  private fsAnimating = false;
  private preFsRect = { left: '', top: '', width: '', height: '' };
  private preFsSplitH = 0;

  // === Video/Library split state ===
  private splitVideoFrac: number = TUNING.WMP_SPLIT_VIDEO_FRAC;
  private splitDragging = false;
  private splitDragStartY = 0;
  private splitDragStartFrac = 0;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // === Window resize state ===
  private resizing = false;
  private resizeEdge = '';           // e.g. 'n','s','e','w','ne','nw','se','sw'
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartRect = { left: 0, top: 0, width: 0, height: 0 };
  private resizeStartSplitH = 0;
  private currentSplitH: number = TUNING.WMP_SPLIT_H;  // mutable copy of split height

  // === Library state ===
  private libTracks: CatalogTrack[] = [];
  private libScrollPx = 0;           // current smooth scroll offset in game-coord pixels
  private libScrollTarget = 0;       // target scroll offset (lerped toward)
  private scrollVelocity = 1;        // current scroll velocity multiplier (1 = normal)
  private lastWheelTime = 0;         // timestamp of last wheel event for momentum
  private rapidTickCount = 0;        // consecutive rapid wheel events
  private sbDragging = false;        // scrollbar thumb drag active
  private sbDragStartY = 0;          // mousedown clientY for scrollbar drag
  private sbDragStartScrollFrac = 0; // scroll fraction at drag start
  private sbHitDiv!: HTMLDivElement;  // scrollbar click/drag hit area
  private libLoaded = false;
  private selectedTrackIdx = -1;          // index into libTracks of user-clicked track
  private playingTrackId: string | null = null;  // spotifyTrackId of currently playing track

  // === Favorites state ===
  private favoriteTrackIds: Set<string> = new Set();
  private favoriteTracks: CatalogTrack[] = [];

  // === Custom playlists state ===
  private customPlaylists: CustomPlaylist[] = [];
  private editingPlaylistIdx = -1;
  private sidebarRenameInput: HTMLInputElement | null = null;

  // === Cell hover-scroll state ===
  private hoverTrackIdx = -1;            // track index of hovered row (-1 = none)
  private hoverCellRow = -1;             // visible row index (-1 = none)
  private hoverCellCol = -1;             // column index (-1 = none)
  private cellScrollOffset = 0;          // current scroll px offset
  private cellScrollPhase: 'idle' | 'pause_start' | 'scrolling' | 'pause_end' = 'idle';
  private cellScrollTimer = 0;           // accumulated time in current phase (seconds)
  private cellScrollMax = 0;             // max scroll offset (textWidth - colWidth)
  private lastTickTime = 0;              // for delta time calculation

  // === Context menu ===
  private ctxMenuOpen = false;
  private ctxMenuTrack: CatalogTrack | null = null;
  private ctxMenuItems: CtxMenuItem[] = [];
  private ctxHoverIdx = -1;
  private ctxMenuEl!: HTMLDivElement;
  private ctxItemEls: HTMLDivElement[] = [];
  private ctxTextsP: Phaser.GameObjects.Text[] = [];
  private ctxSubTextsP: Phaser.GameObjects.Text[] = [];
  private clipboardTrack: CatalogTrack | null = null;

  // === Context menu click flash ===
  private ctxClickIdx = -1;
  private ctxClickTime = 0;
  private ctxSubClickIdx = -1;
  private ctxSubClickTime = 0;

  // === Context submenu (Add to playlist) ===
  private ctxSubmenuEl!: HTMLDivElement;
  private ctxSubItemEls: HTMLDivElement[] = [];
  private ctxSubHoverIdx = -1;
  private ctxSubmenuItems: CtxMenuItem[] = [];
  private ctxSubmenuTimeout: ReturnType<typeof setTimeout> | null = null;

  // === Sign-in popup ===
  private signInOpen = false;
  private signInWin!: HTMLDivElement;
  private signInBackdrop!: HTMLDivElement;
  private signInCloseBtn!: HTMLButtonElement;
  private signInBtn!: HTMLButtonElement;
  private signInTitleTextP!: Phaser.GameObjects.Text;
  private signInLabelP!: Phaser.GameObjects.Text;
  private signInBtnTextP!: Phaser.GameObjects.Text;
  private signInCloseBtnTextP!: Phaser.GameObjects.Text;

  // === Column system ===
  private columns: ColDef[] = WMP_DEFAULT_COLS.map((c) => ({ ...c }));
  private activeColSet: 'default' | 'hume' = 'default';
  // Keep legacy initializer comment for reference:
  // [
  //   { key: 'title', label: 'Title', widthFrac: 0.35 },
  //   { key: 'artist', label: 'Artist', widthFrac: 0.25 },
  //   { key: 'album', label: 'Album', widthFrac: 0.25 },
  //   { key: 'time', label: 'Time', widthFrac: 0.15 },
  // ];
  private colResizeDrag: {
    divIdx: number; startX: number; leftFrac: number; rightFrac: number;
  } | null = null;
  private colReorderDrag: {
    colIdx: number; grabOffsetX: number; lastClientX: number; startClientX: number;
    liftAnim: number; targetIdx: number; targetTextOffset: number;
  } | null = null;

  constructor(scene: Phaser.Scene, overlay: HTMLDivElement, callbacks: WMPCallbacks) {
    this.scene = scene;
    this.overlay = overlay;
    this.cb = callbacks;
    this.buildHTML();
    this.makeHTMLInvisible();
    this.buildPhaser();
    this.bindGlobal();
  }

  // ─── DOM helpers ────────────────────────────────────────────
  private div(): HTMLDivElement { return document.createElement('div'); }
  private sp(): HTMLSpanElement { return document.createElement('span'); }

  /** Apply Win95 raised border (CSS — kept for layout sizing only) */
  private raised(el: HTMLElement): void {
    el.style.background = W95_CSS_FACE;
    el.style.border = `${WMP_BORDER_W}px solid`;
    el.style.borderColor = `${W95_CSS_HIGHLIGHT} ${W95_CSS_SHADOW} ${W95_CSS_SHADOW} ${W95_CSS_HIGHLIGHT}`;
    el.style.boxShadow = `inset 1px 1px 0 ${W95_CSS_LIGHT}, inset -1px -1px 0 ${W95_CSS_DARK}`;
  }

  /** Apply Win95 sunken border (CSS — kept for layout sizing only) */
  private sunken(el: HTMLElement): void {
    el.style.border = `${WMP_BORDER_W}px solid`;
    el.style.borderColor = `${W95_CSS_SHADOW} ${W95_CSS_HIGHLIGHT} ${W95_CSS_HIGHLIGHT} ${W95_CSS_SHADOW}`;
  }

  private win95Btn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    this.raised(btn);
    Object.assign(btn.style, {
      width: `${WMP_WINBTN_W}px`, height: `${WMP_WINBTN_H}px`, padding: '0',
      fontFamily: 'Marlett, Arial, sans-serif',
      fontSize: `${WMP_WINBTN_FONT}px`, lineHeight: `${WMP_WINBTN_FONT}px`,
      cursor: 'none', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#000',
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  /** Create a fresh transport click-target div (no text, no button element) */
  private mkTransportHit(onClick: () => void): HTMLDivElement {
    const el = this.div();
    this.raised(el);
    Object.assign(el.style, {
      width: `${TUNING.WMP_TRANSPORT_SIZE}px`, height: `${TUNING.WMP_TRANSPORT_SIZE}px`,
      cursor: 'none', overflow: 'hidden',
    });
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return el;
  }

  // ─── Build HTML (invisible interaction layer) ───────────────
  private buildHTML(): void {
    // Window frame
    this.win = this.div();
    this.raised(this.win);
    Object.assign(this.win.style, {
      position: 'absolute',
      left: `${(100 - TUNING.WMP_WIDTH_PCT) / 2}%`,
      top: `${TUNING.WMP_TOP_PCT}%`,
      width: `${TUNING.WMP_WIDTH_PCT}%`,
      display: 'none',
      flexDirection: 'column',
      fontFamily: 'Tahoma, "MS Sans Serif", Arial, sans-serif',
      fontSize: `${WMP_STATUS_FONT}px`,
      cursor: 'none',
      userSelect: 'none',
      zIndex: '20000',
      pointerEvents: 'auto',
    });
    this.win.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.win.addEventListener('mousedown', (e) => e.stopPropagation());
    this.win.addEventListener('mouseenter', () => { this.cursorOver = true; });
    this.win.addEventListener('mouseleave', () => { this.cursorOver = false; });

    // Resize handles (edges + corners)
    const rh = TUNING.WMP_RESIZE_HANDLE;
    const rc = TUNING.WMP_RESIZE_CORNER;
    const edges: { edge: string; css: string }[] = [
      { edge: 'n',  css: `top:0;left:${rc}px;right:${rc}px;height:${rh}px;cursor:n-resize;` },
      { edge: 's',  css: `bottom:0;left:${rc}px;right:${rc}px;height:${rh}px;cursor:s-resize;` },
      { edge: 'w',  css: `left:0;top:${rc}px;bottom:${rc}px;width:${rh}px;cursor:w-resize;` },
      { edge: 'e',  css: `right:0;top:${rc}px;bottom:${rc}px;width:${rh}px;cursor:e-resize;` },
      { edge: 'nw', css: `top:0;left:0;width:${rc}px;height:${rc}px;cursor:nw-resize;` },
      { edge: 'ne', css: `top:0;right:0;width:${rc}px;height:${rc}px;cursor:ne-resize;` },
      { edge: 'sw', css: `bottom:0;left:0;width:${rc}px;height:${rc}px;cursor:sw-resize;` },
      { edge: 'se', css: `bottom:0;right:0;width:${rc}px;height:${rc}px;cursor:se-resize;` },
    ];
    for (const { edge, css } of edges) {
      const handle = this.div();
      handle.style.cssText = `position:absolute;z-index:1;${css}`;
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.resizing = true;
        this.resizeEdge = edge;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartRect = {
          left: this.win.offsetLeft,
          top: this.win.offsetTop,
          width: this.win.offsetWidth,
          height: this.win.offsetHeight,
        };
        this.resizeStartSplitH = this.currentSplitH;
      });
      this.win.appendChild(handle);
    }

    // Title bar
    this.titleBar = this.div();
    Object.assign(this.titleBar.style, {
      background: `linear-gradient(90deg, ${W95_CSS_TITLE}, #d010d0)`,
      color: '#fff', fontWeight: 'bold', fontSize: `${WMP_TITLEBAR_FONT}px`,
      padding: `${WMP_TITLEBAR_PAD_V}px ${WMP_TITLEBAR_PAD_H}px`, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      cursor: 'grab',
    });
    this.titleTextEl = this.sp();
    this.titleTextEl.textContent = WMP_TITLE;
    this.titleTextEl.style.marginLeft = `${WMP_TITLE_PAD_L}px`;

    const btnGroup = this.div();
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = `${WMP_WINBTN_GAP}px`;
    btnGroup.style.marginRight = `${WMP_BTNGROUP_PAD_R}px`;
    const fsBtn = this.win95Btn('□', () => this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen());
    const closeBtn = this.win95Btn('✕', () => this.close());
    this.winBtns = [fsBtn, closeBtn];
    btnGroup.append(fsBtn, closeBtn);
    this.titleBar.append(this.titleTextEl, btnGroup);

    // Drag on title bar
    this.titleBar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.dragging = true;
      this.dX = e.clientX;
      this.dY = e.clientY;
      this.oL = this.win.offsetLeft;
      this.oT = this.win.offsetTop;
      this.titleBar.style.cursor = 'grabbing';
    });

    // Content split container (video + divider + library)
    this.contentSplit = this.div();
    Object.assign(this.contentSplit.style, {
      display: 'flex', flexDirection: 'column',
      height: `${this.currentSplitH}px`,
      overflow: 'hidden',
      margin: `${WMP_LIB_MARGIN}px`,
    });

    // Top section: video (left) + track info (right)
    this.topSection = this.div();
    Object.assign(this.topSection.style, {
      display: 'flex', flexDirection: 'row',
      flexShrink: '0', overflow: 'hidden',
    });

    // Video area (left/top justified, explicit size)
    this.videoBox = this.div();
    this.sunken(this.videoBox);
    Object.assign(this.videoBox.style, {
      background: '#000', position: 'relative',
      overflow: 'hidden', flexShrink: '0',
    });

    // Album art fallback (shown when Spotify track has no YouTube video)
    this.albumFallbackImg = document.createElement('img');
    Object.assign(this.albumFallbackImg.style, {
      position: 'absolute', top: '0', left: '50%',
      transform: 'translateX(-50%)',
      height: '100%', width: 'auto',
      display: 'none', pointerEvents: 'none',
    });
    this.videoBox.appendChild(this.albumFallbackImg);

    // Track info panel (right side of top section)
    this.trackInfoPanel = this.div();
    const infoPad = TUNING.WMP_INFO_PAD;
    Object.assign(this.trackInfoPanel.style, {
      flex: '1', display: 'flex', flexDirection: 'column',
      padding: `${infoPad}px`,
      overflow: 'hidden', minWidth: '0',
    });
    // Title — top of container, left-justified
    this.infoTitleEl = this.div();
    Object.assign(this.infoTitleEl.style, {
      fontSize: `${TUNING.WMP_INFO_TITLE_FONT}px`,
      lineHeight: `${TUNING.WMP_INFO_TITLE_FONT * 1.4}px`,
      fontWeight: 'bold', color: '#000',
      whiteSpace: 'nowrap', overflow: 'hidden',
      flexShrink: '0',
    });
    this.infoTitleEl.textContent = '\u00A0';
    // Artist — vertically centered in remaining space
    this.infoArtistWrap = this.div();
    Object.assign(this.infoArtistWrap.style, {
      flex: '1', display: 'flex', alignItems: 'center',
      overflow: 'hidden', minHeight: '0',
    });
    this.infoArtistEl = this.div();
    Object.assign(this.infoArtistEl.style, {
      fontSize: `${TUNING.WMP_INFO_ARTIST_FONT}px`,
      lineHeight: `${TUNING.WMP_INFO_ARTIST_FONT * 1.4}px`,
      color: '#000',
      whiteSpace: 'nowrap', overflow: 'hidden',
      width: '100%',
    });
    this.infoArtistEl.textContent = '\u00A0';
    this.infoArtistWrap.appendChild(this.infoArtistEl);
    // Heart favorite toggle — transparent HTML click target, Phaser renders visuals
    const btnH = TUNING.WMP_INFO_BTN_FONT * 6;
    const heartBtnW = btnH; // square hit area
    this.infoHeartBtn = this.div();
    Object.assign(this.infoHeartBtn.style, {
      width: `${heartBtnW}px`, height: `${btnH}px`,
      flexShrink: '0', cursor: 'none',
    });
    this.infoHeartBtn.addEventListener('click', () => {
      if (!this.playingTrackId) return;
      const track = this.libTracks.find(t => t.spotifyTrackId === this.playingTrackId);
      if (track) {
        this.heartBounceTrackId = track.spotifyTrackId;
        this.heartBounceT = 0;
        this.toggleFavorite(track);
      }
    });
    // Spotify button — transparent HTML click target, Phaser renders the visuals through CRT
    this.infoSpotifyBtn = document.createElement('button');
    Object.assign(this.infoSpotifyBtn.style, {
      border: 'none',
      background: 'transparent',
      cursor: 'none', width: `${500 - heartBtnW - 40}px`,
      height: `${btnH}px`,
      flexShrink: '0',
      padding: '0',
    });
    this.infoSpotifyBtn.addEventListener('click', () => {
      const url = this.cb.getSpotifyUrl();
      if (url) openSpotify(url);
    });
    // transportDiv is built later — appended in the assembly section below
    this.trackInfoPanel.append(this.infoTitleEl, this.infoArtistWrap);
    this.topSection.append(this.videoBox, this.trackInfoPanel);

    // Draggable divider between video and library
    this.splitDivider = this.div();
    Object.assign(this.splitDivider.style, {
      height: `${TUNING.WMP_DIVIDER_H}px`,
      cursor: 'row-resize', flexShrink: '0',
    });
    this.splitDivider.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.splitDragging = true;
      this.splitDragStartY = e.clientY;
      this.splitDragStartFrac = this.splitVideoFrac;
    });

    // Status row
    const statusRow = this.div();
    Object.assign(statusRow.style, { display: 'none' });
    this.statusEl = this.sp();
    statusRow.appendChild(this.statusEl);

    // Controls row: progress timeline (full width)
    this.controlsRow = this.div();
    Object.assign(this.controlsRow.style, {
      display: 'flex', alignItems: 'center', flexShrink: '0',
      margin: `${WMP_PROG_MARGIN_V}px ${WMP_PROG_MARGIN_H}px`,
    });

    // Progress group (full HMP width)
    this.progressGroup = this.div();
    Object.assign(this.progressGroup.style, {
      flex: '1', display: 'flex', alignItems: 'center', gap: `${WMP_PROG_GAP}px`,
    });
    this.tLeft = this.sp();
    this.tLeft.textContent = '0:00';
    Object.assign(this.tLeft.style, { fontSize: `${WMP_TIME_FONT}px`, minWidth: `${WMP_TIME_MIN_W}px`, color: '#000' });
    this.tRight = this.sp();
    this.tRight.textContent = '0:00';
    Object.assign(this.tRight.style, { fontSize: `${WMP_TIME_FONT}px`, minWidth: `${WMP_TIME_MIN_W}px`, textAlign: 'right', color: '#000' });

    const progWrap = this.div();
    Object.assign(progWrap.style, {
      flex: '1', position: 'relative', height: `${WMP_PROG_WRAP_H}px`,
      display: 'flex', alignItems: 'center', cursor: 'none',
      margin: '0 100px',
    });
    this.progGroove = this.div();
    this.sunken(this.progGroove);
    Object.assign(this.progGroove.style, { width: '100%', height: `${WMP_PROG_GROOVE_H}px`, position: 'relative', background: '#000' });
    this.progFill = this.div();
    Object.assign(this.progFill.style, { height: '100%', width: '0%', background: W95_CSS_TITLE });
    this.progGroove.appendChild(this.progFill);
    this.progMarker = this.div();
    Object.assign(this.progMarker.style, {
      position: 'absolute', top: '50%', left: '0%', transform: 'translate(-50%, -50%)',
      width: `${WMP_MARKER_W}px`, height: `${WMP_MARKER_H}px`, cursor: 'none', zIndex: '1',
    });
    progWrap.append(this.progGroove, this.progMarker);
    progWrap.addEventListener('mousedown', (e) => { this.seeking = true; this.handleSeek(e); });
    this.progressGroup.append(this.tLeft, progWrap, this.tRight);

    // ── New transport buttons (clean rebuild — no text in HTML at all) ──
    const transportDiv = this.div();
    Object.assign(transportDiv.style, {
      display: 'flex', gap: `${TUNING.WMP_TRANSPORT_GAP}px`,
      justifyContent: 'center', flexShrink: '0',
    });

    // Button 1: single click = restart track, double click = previous track
    let restartTimer: number | null = null;
    const onRestartBtn = () => {
      if (restartTimer !== null) {
        clearTimeout(restartTimer);
        restartTimer = null;
        this.cb.prev();
      } else {
        restartTimer = window.setTimeout(() => {
          restartTimer = null;
          this.cb.seekTo(0);
        }, 300);
      }
    };
    const tActions = [
      onRestartBtn,
      () => { const p = this.cb.getPosition(); this.cb.seekTo(Math.max(0, p.current - 10)); },
      () => this.cb.togglePlayPause(),
      () => { const p = this.cb.getPosition(); this.cb.seekTo(Math.min(p.duration, p.current + 10)); },
      () => this.cb.next(),
      () => this.cb.toggleShuffle(),
    ];
    for (let i = 0; i < tActions.length; i++) {
      const hit = this.mkTransportHit(tActions[i]);
      this.transportBtnEls.push(hit);
      transportDiv.appendChild(hit);
    }

    // Volume group — sits right of Spotify button, fills remaining space
    const volGroup = this.div();
    Object.assign(volGroup.style, {
      flex: '1', display: 'flex', alignItems: 'center', gap: `${WMP_VOL_GAP}px`,
      minWidth: '0',
    });
    this.volIconEl = this.sp();
    this.volIconEl.textContent = 'Vol';
    this.volIconEl.style.fontSize = `${WMP_VOL_ICON_FONT}px`;

    // Ramp wrapper — click/drag target (Phaser draws the visual ramp), fills remaining space
    this.volGroove = this.div();
    Object.assign(this.volGroove.style, {
      position: 'relative', flex: '1', height: `${WMP_VOL_RAMP_MAX_H}px`,
      cursor: 'none', minWidth: '0',
    });
    // Fill tracker (invisible — just stores the volume fraction for Phaser to read)
    this.volFill = this.div();
    this.volFill.style.width = '69%';
    this.volFill.style.display = 'none';
    // Slider thumb (invisible HTML — Phaser draws it)
    this.volMarker = this.div();
    Object.assign(this.volMarker.style, {
      position: 'absolute', top: '50%', left: '69%', transform: 'translate(-50%, -50%)',
      width: `${WMP_VOL_SLIDER_W}px`, height: `${WMP_VOL_SLIDER_H}px`, cursor: 'none',
    });
    this.volGroove.append(this.volFill, this.volMarker);
    this.volGroove.addEventListener('mousedown', (e) => { this.volDragging = true; this.handleVolume(e); });
    volGroup.append(this.volIconEl, this.volGroove);

    // Spotify button + volume row (inside trackInfoPanel)
    const spotifyVolRow = this.div();
    Object.assign(spotifyVolRow.style, {
      display: 'flex', alignItems: 'center',
      gap: '40px',              // 40px between button and volume slider
      paddingRight: '40px',     // 40px padding on right side
      flexShrink: '0',
    });
    spotifyVolRow.append(this.infoHeartBtn, this.infoSpotifyBtn, volGroup);

    this.controlsRow.append(this.progressGroup);
    this.trackInfoPanel.append(spotifyVolRow);

    // ── Tab bar (sits directly above library) ──
    this.tabBar = this.div();
    Object.assign(this.tabBar.style, {
      display: 'flex', gap: `${WMP_TAB_GAP}px`,
      flexShrink: '0', marginTop: '10px',
    });
    for (let i = 0; i < WMP_TAB_LABELS.length; i++) {
      const tab = this.div();
      tab.textContent = WMP_TAB_LABELS[i]; // text for sizing (makeHTMLInvisible hides it)
      Object.assign(tab.style, {
        flex: '1',
        height: `${WMP_TAB_H}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'none', fontSize: `${WMP_TAB_FONT}px`, color: '#000',
        boxSizing: 'border-box',
      });
      tab.addEventListener('click', () => { this.activeTab = i; });
      this.tabEls.push(tab);
      this.tabAnimFrac.push(i === this.activeTab ? 1 : 0);
      this.tabBar.appendChild(tab);
    }

    // ── Library list (fills remaining space in content split) ──
    this.libraryList = this.div();
    this.sunken(this.libraryList);
    Object.assign(this.libraryList.style, {
      background: '#fff', overflow: 'hidden',
      flex: '1', minHeight: '0',
      position: 'relative',
    });

    // Column header row — height matches visual header, not data rows
    const headerRowH = WMP_HEADER_H_CSS;
    // Offset header row past thumbnail + left padding so HTML cells align with Phaser columns
    const headerLeftOffset = TUNING.WMP_LIB_ROW_H + 10; // thumbnail (=rowH) + rowTextPadL
    this.libHeaderRow = this.div();
    Object.assign(this.libHeaderRow.style, {
      position: 'relative', height: `${headerRowH}px`,
      marginLeft: `${headerLeftOffset}px`,
      width: `calc(100% - ${headerLeftOffset}px)`,
      zIndex: '3',  // above sbHitDiv (z:2) so divider grabs take priority
    });
    // Column header cells (position:absolute inside header row)
    for (let ci = 0; ci < this.columns.length; ci++) {
      const cell = this.div();
      Object.assign(cell.style, {
        position: 'absolute', top: '0', height: '100%',
        display: 'flex', alignItems: 'center', cursor: 'none',
        overflow: 'hidden', boxSizing: 'border-box',
        padding: `0 ${WMP_COL_HEADER_PAD}px`,
      });
      cell.addEventListener('mousedown', (e) => { e.stopPropagation(); this.onColHeaderDown(ci, e); });
      this.colCellEls.push(cell);
      this.libHeaderRow.appendChild(cell);
    }
    // Column dividers (between columns, z-index:2 above cells, cursor:col-resize)
    for (let di = 0; di < this.columns.length - 1; di++) {
      const divider = this.div();
      Object.assign(divider.style, {
        position: 'absolute', top: '0', height: '100%',
        width: `${WMP_COL_DIVIDER_HIT_W}px`, cursor: 'col-resize',
        zIndex: '2',
      });
      divider.addEventListener('mousedown', (e) => { e.stopPropagation(); this.onColDividerDown(di, e); });
      this.colDividerEls.push(divider);
      this.libHeaderRow.appendChild(divider);
    }
    this.libraryList.appendChild(this.libHeaderRow);
    this.updateColLayout();

    // Create HTML row elements for click targets (pool — show/hide dynamically)
    for (let i = 0; i < WMP_LIB_ROW_POOL; i++) {
      const row = this.div();
      Object.assign(row.style, {
        height: `${TUNING.WMP_LIB_ROW_H}px`, padding: `0 ${WMP_LIB_ROW_PAD_H}px`,
        display: 'flex', alignItems: 'center', cursor: 'none',
        fontSize: `${WMP_LIB_ROW_FONT}px`,
      });
      this.libraryRowEls.push(row);
      this.libraryList.appendChild(row);
    }
    // Click handler — uses hoverTrackIdx computed from mouse position in syncPhaser
    this.libraryList.addEventListener('click', () => {
      // Heart click — toggle favorite with bounce animation
      if (this.hoverHeartTrackIdx >= 0) {
        const tracks = this.getDisplayTracks();
        const track = tracks[this.hoverHeartTrackIdx];
        if (track) {
          this.heartBounceTrackId = track.spotifyTrackId;
          this.heartBounceT = 0;
          this.toggleFavorite(track);
        }
        return;
      }
      if (this.hoverTrackIdx >= 0) this.onLibRowClick(this.hoverTrackIdx);
    });
    // Right-click handler — uses hoverTrackIdx like click does
    this.libraryList.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.hoverTrackIdx >= 0) this.onLibRowRightClick(this.hoverTrackIdx, e);
    });
    // Scroll handler — rapid scrolling builds momentum
    this.libraryList.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.applyWheelScroll(e.deltaY);
    }, { passive: false });

    // Scrollbar hit area — sits at z-index 2 to intercept over resize handles (z-index 1)
    this.sbHitDiv = this.div();
    Object.assign(this.sbHitDiv.style, {
      position: 'absolute', right: '0', top: '0', bottom: '0',
      width: `${WMP_SCROLLBAR_W}px`,
      zIndex: '2', cursor: 'default',
    });
    this.libraryList.appendChild(this.sbHitDiv);

    this.sbHitDiv.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const listRect = this.libraryList.getBoundingClientRect();
      const totalH = this.getDisplayTracks().length * TUNING.WMP_LIB_ROW_H;
      const viewH = listRect.height - WMP_HEADER_H_CSS;
      const maxScroll = Math.max(0, totalH - viewH);
      if (maxScroll <= 0) return;
      // Compute thumb position to decide: click on thumb vs click on track
      const trackH = listRect.height - WMP_HEADER_H_CSS;
      const thumbFrac = Math.min(1, viewH / totalH);
      const thumbH = Math.max(WMP_SCROLLBAR_MIN_THUMB, thumbFrac * trackH);
      const scrollFracNorm = maxScroll > 0 ? this.libScrollTarget / maxScroll : 0;
      const thumbTop = scrollFracNorm * (trackH - thumbH);
      const relY = e.clientY - listRect.top;
      if (relY < thumbTop || relY > thumbTop + thumbH) {
        // Clicked on track (not thumb) — jump scroll to click position
        const clickFrac = Math.max(0, Math.min(1, (relY - thumbH / 2) / (trackH - thumbH)));
        this.libScrollTarget = clickFrac * maxScroll;
        this.clampScrollTarget();
      }
      this.sbDragging = true;
      this.sbDragStartY = e.clientY;
      this.sbDragStartScrollFrac = maxScroll > 0 ? this.libScrollTarget / maxScroll : 0;
    });

    // Scrollbar wheel — intercepts wheel events so they scroll even over the scrollbar
    this.sbHitDiv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.applyWheelScroll(e.deltaY);
    }, { passive: false });

    // ── Playlist sidebar (visible only on Playlists tab) ──
    this.playlistSidebar = this.div();
    Object.assign(this.playlistSidebar.style, {
      width: `${WMP_SIDEBAR_FRAC * 100}%`,
      flexShrink: '0', display: 'none',
      flexDirection: 'column',
    });

    // Sunken list box (header + playlist rows)
    this.sidebarList = this.div();
    this.sunken(this.sidebarList);
    Object.assign(this.sidebarList.style, {
      background: '#fff', overflow: 'hidden',
      flex: '1', minHeight: '0',
      display: 'flex', flexDirection: 'column',
    });
    // Sidebar header row
    const sidebarHeader = this.div();
    Object.assign(sidebarHeader.style, {
      flex: '1', minHeight: '0', width: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    this.sidebarList.appendChild(sidebarHeader);
    // Sidebar row pool
    for (let i = 0; i < WMP_SIDEBAR_ROW_POOL; i++) {
      const row = this.div();
      Object.assign(row.style, {
        flex: '1', minHeight: '0', padding: `0 ${WMP_LIB_ROW_PAD_H}px`,
        display: 'none', alignItems: 'center', justifyContent: 'flex-end',
        cursor: 'none', fontSize: `${WMP_LIB_ROW_FONT}px`,
      });
      row.addEventListener('click', () => {
        if (this.activeTab === 0) { this.selectedArtistIdx = i; }
        else { this.selectedPlaylistIdx = i; }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onSidebarRowRightClick(i, e);
      });
      row.addEventListener('dblclick', () => {
        const customIdx = i - WMP_PLAYLIST_NAMES.length;
        if (customIdx >= 0 && customIdx < this.customPlaylists.length) {
          this.startPlaylistRename(customIdx);
        }
      });
      this.sidebarRowEls.push(row);
      this.sidebarList.appendChild(row);
    }

    // Plus button (below sunken list, outside it)
    this.sidebarPlusBtn = this.win95Btn('+', () => { this.createPlaylist(); });
    Object.assign(this.sidebarPlusBtn.style, {
      width: '100%', height: `${WMP_SIDEBAR_PLUS_H}px`,
      marginTop: `${WMP_SIDEBAR_PLUS_GAP}px`,
      flexShrink: '0',
    });

    this.playlistSidebar.append(this.sidebarList, this.sidebarPlusBtn);

    // ── Library area wrapper (sidebar + gap + library list) ──
    this.libraryArea = this.div();
    Object.assign(this.libraryArea.style, {
      display: 'flex', flexDirection: 'row',
      flex: '1', minHeight: '0',
      gap: `${WMP_SIDEBAR_GAP}px`,
    });
    this.libraryArea.append(this.playlistSidebar, this.libraryList);

    // Bottom status bar
    this.bottomBarEl = this.div();
    this.sunken(this.bottomBarEl);
    Object.assign(this.bottomBarEl.style, { margin: WMP_BOTTOM_MARGIN, padding: `${WMP_BOTTOM_PAD_V}px ${WMP_BOTTOM_PAD_H}px`, fontSize: `${WMP_BOTTOM_FONT}px`, color: '#000' });
    this.bottomBarEl.textContent = 'Ready';

    // ── Sign-in popup (modal over WMP) ──
    this.signInBackdrop = this.div();
    Object.assign(this.signInBackdrop.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      zIndex: '1',
    });
    this.signInBackdrop.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.hideSignInPopup();
    });

    this.signInWin = this.div();
    Object.assign(this.signInWin.style, {
      width: `${WMP_SIGNIN_W_PCT}%`,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Tahoma, "MS Sans Serif", Arial, sans-serif',
      pointerEvents: 'auto',
    });
    this.signInWin.addEventListener('mousedown', (e) => e.stopPropagation());

    // Sign-in title bar
    const signInTitleBar = this.div();
    Object.assign(signInTitleBar.style, {
      background: `linear-gradient(90deg, ${W95_CSS_TITLE}, #d010d0)`,
      color: '#fff', fontWeight: 'bold', fontSize: `${WMP_SIGNIN_TITLEBAR_FONT}px`,
      padding: `${WMP_TITLEBAR_PAD_V}px ${WMP_TITLEBAR_PAD_H}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    });
    const signInTitleText = this.sp();
    signInTitleText.textContent = WMP_TITLE;
    signInTitleText.style.marginLeft = '2px';
    this.signInCloseBtn = this.win95Btn('×', () => this.hideSignInPopup());
    signInTitleBar.append(signInTitleText, this.signInCloseBtn);

    // Sign-in body
    const signInBody = this.div();
    Object.assign(signInBody.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: `${WMP_SIGNIN_BODY_PAD}px`, gap: `${WMP_SIGNIN_BODY_PAD}px`,
    });
    const signInLabel = this.sp();
    signInLabel.textContent = 'Sign in to unlock more songs!';
    signInLabel.style.fontSize = `${WMP_SIGNIN_LABEL_FONT}px`;
    signInLabel.style.textAlign = 'center';

    this.signInBtn = document.createElement('button');
    this.signInBtn.textContent = 'Sign in with Spotify';
    this.raised(this.signInBtn);
    Object.assign(this.signInBtn.style, {
      width: `${WMP_SIGNIN_BTN_W}px`, height: `${WMP_SIGNIN_BTN_H}px`,
      padding: '0', fontSize: `${WMP_SIGNIN_BTN_FONT}px`, cursor: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontFamily: 'Tahoma, "MS Sans Serif", Arial, sans-serif',
    });
    this.signInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideSignInPopup();
      startLogin();
    });

    signInBody.append(signInLabel, this.signInBtn);
    this.signInWin.append(signInTitleBar, signInBody);
    this.signInBackdrop.appendChild(this.signInWin);

    // ── Context menu (right-click on library rows) ──
    this.ctxMenuEl = this.div();
    Object.assign(this.ctxMenuEl.style, {
      position: 'absolute', display: 'none',
      padding: `${WMP_CTX_PAD_V}px 0`,
      zIndex: '2', flexDirection: 'column',
    });
    this.ctxMenuEl.addEventListener('mousedown', (e) => e.stopPropagation());
    for (let i = 0; i < WMP_CTX_MAX_ITEMS; i++) {
      const item = this.div();
      Object.assign(item.style, {
        height: `${WMP_CTX_ITEM_H}px`, padding: `0 ${WMP_CTX_PAD_H}px`,
        display: 'none', alignItems: 'center', cursor: 'none',
        fontSize: `${WMP_CTX_FONT}px`, whiteSpace: 'nowrap',
      });
      item.addEventListener('mouseenter', () => {
        this.ctxHoverIdx = i;
        if (i < this.ctxMenuItems.length && this.ctxMenuItems[i].hasSubmenu) {
          this.showSubmenu(i);
        } else {
          this.hideSubmenu();
        }
      });
      item.addEventListener('mouseleave', () => {
        if (this.ctxHoverIdx === i) this.ctxHoverIdx = -1;
      });
      item.addEventListener('click', () => {
        if (i < this.ctxMenuItems.length && !this.ctxMenuItems[i].isSeparator && !this.ctxMenuItems[i].hasSubmenu) {
          this.ctxClickIdx = i;
          this.ctxClickTime = performance.now();
          const action = this.ctxMenuItems[i].action;
          setTimeout(() => {
            action();
            this.hideContextMenu();
            this.ctxClickIdx = -1;
          }, WMP_CTX_FLASH_MS);
        }
      });
      this.ctxItemEls.push(item);
      this.ctxMenuEl.appendChild(item);
    }

    // ── Context submenu (Add to playlist) ──
    this.ctxSubmenuEl = this.div();
    Object.assign(this.ctxSubmenuEl.style, {
      position: 'absolute', display: 'none',
      padding: `${WMP_CTX_PAD_V}px 0`,
      zIndex: '3', flexDirection: 'column',
    });
    this.ctxSubmenuEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.ctxSubmenuEl.addEventListener('mouseenter', () => {
      if (this.ctxSubmenuTimeout) { clearTimeout(this.ctxSubmenuTimeout); this.ctxSubmenuTimeout = null; }
    });
    this.ctxSubmenuEl.addEventListener('mouseleave', () => {
      this.ctxSubmenuTimeout = setTimeout(() => this.hideSubmenu(), 150);
    });
    for (let i = 0; i < WMP_CTX_SUBMENU_MAX; i++) {
      const item = this.div();
      Object.assign(item.style, {
        height: `${WMP_CTX_ITEM_H}px`, padding: `0 ${WMP_CTX_PAD_H}px`,
        display: 'none', alignItems: 'center', cursor: 'none',
        fontSize: `${WMP_CTX_FONT}px`, whiteSpace: 'nowrap',
      });
      item.addEventListener('mouseenter', () => { this.ctxSubHoverIdx = i; });
      item.addEventListener('mouseleave', () => { if (this.ctxSubHoverIdx === i) this.ctxSubHoverIdx = -1; });
      item.addEventListener('click', () => {
        if (i < this.ctxSubmenuItems.length && !this.ctxSubmenuItems[i].isSeparator) {
          this.ctxSubClickIdx = i;
          this.ctxSubClickTime = performance.now();
          const action = this.ctxSubmenuItems[i].action;
          setTimeout(() => {
            action();
            this.hideContextMenu();
            this.ctxSubClickIdx = -1;
          }, WMP_CTX_FLASH_MS);
        }
      });
      this.ctxSubItemEls.push(item);
      this.ctxSubmenuEl.appendChild(item);
    }
    this.ctxMenuEl.appendChild(this.ctxSubmenuEl);

    // Dismiss context menu when clicking elsewhere in the window
    this.win.addEventListener('mousedown', () => { this.hideContextMenu(); });

    // Prevent browser context menu on the entire WMP overlay
    this.win.addEventListener('contextmenu', (e) => e.preventDefault());

    // Assemble content split (video + controls + divider + tabs + library area)
    this.contentSplit.append(
      this.topSection,
      statusRow, this.controlsRow,
      this.splitDivider,
      this.tabBar,
      this.libraryArea,
    );

    // Assemble window
    this.win.append(
      this.titleBar,
      this.contentSplit,
      this.bottomBarEl,
      this.signInBackdrop,
      this.ctxMenuEl,
    );
    this.overlay.appendChild(this.win);
  }

  // ─── Strip visual styling from HTML (keep layout, hide visuals) ──
  private makeHTMLInvisible(): void {
    const strip = (el: HTMLElement) => {
      if (el.tagName === 'IFRAME') return;
      el.style.background = 'transparent';
      el.style.borderColor = 'transparent';
      el.style.color = 'transparent';
      el.style.boxShadow = 'none';
      el.style.textShadow = 'none';
      for (let i = 0; i < el.children.length; i++) {
        strip(el.children[i] as HTMLElement);
      }
    };
    strip(this.win);
  }

  // ─── Build Phaser CRT rendering layer ──────────────────────
  private buildPhaser(): void {
    const d = WMP_DEPTH;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: `"${WMP_FONT}"`, fontSize: '16px', color: '#000000',
    };
    const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: `"${WMP_FONT}"`, fontSize: '16px', color: '#ffffff',
    };

    this.gfx = this.scene.add.graphics().setDepth(d).setScrollFactor(0).setVisible(false);
    this.gfxHeaderOv = this.scene.add.graphics().setDepth(d + 1.2).setScrollFactor(0).setVisible(false);
    this.gfxLift = this.scene.add.graphics().setDepth(d + 1.5).setScrollFactor(0).setVisible(false);

    const mkText = (txt: string, s: Phaser.Types.GameObjects.Text.TextStyle, originX = 0, originY = 0.5) =>
      this.scene.add.text(0, 0, txt, s).setDepth(d + 1).setScrollFactor(0).setOrigin(originX, originY).setVisible(false);

    this.titleTextP = mkText(WMP_TITLE, titleStyle);
    this.statusTextP = mkText('', style);
    this.tLeftP = mkText('0:00', style);
    this.tRightP = mkText('0:00', style, 1, 0.5);
    this.bottomTextP = mkText('Ready', style);
    this.volIconP = mkText('Vol', style, 0.5, 0.5);

    for (const label of ['□', '✕']) {
      this.winBtnTextsP.push(mkText(label, style, 0.5, 0.5));
    }
    for (const label of ['|◄', '◄◄', '▶', '►►', '►|', '⤭']) {
      this.transportTextsP.push(mkText(label, style, 0.5, 0.5));
    }

    // Tab labels
    for (const label of WMP_TAB_LABELS) {
      this.tabTextsP.push(mkText(label, style, 0.5, 0.5));
    }

    // Track info panel texts
    this.infoTitleP = mkText('', style);
    this.infoArtistP = mkText('', style);
    this.infoHeartP = this.scene.add.text(0, 0, '\u2665', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px',
      color: 'rgba(0,0,0,0)', stroke: '#ffffff', strokeThickness: WMP_HEART_STROKE,
    }).setDepth(d + 1).setScrollFactor(0).setOrigin(0.5, 0.5).setVisible(false);
    this.infoSpotifyBtnP = mkText('Listen on', { ...style, color: '#ffffff' }, 0, 0.5);
    this.infoSpotifyLogoP = this.scene.add.image(0, 0, 'spotify-text-logo')
      .setDepth(d + 1).setScrollFactor(0).setOrigin(0.5, 0.5).setVisible(false);

    // Library: column headers + cell pool (headers at d+1.3 so they render above row content at d+1)
    for (let ci = 0; ci < this.columns.length; ci++) {
      const ht = mkText(this.columns[ci].label, style, 0.5, 0.5);
      ht.setDepth(d + 1.3);
      this.colHeaderTextsP.push(ht);
    }
    // Data area geometry mask — clips row content (thumbs + cell texts) to the library data area
    // Must be created before the objects that use it
    this.gfxDataMask = this.scene.add.graphics().setScrollFactor(0).setVisible(false);
    this.dataMask = this.gfxDataMask.createGeometryMask();

    for (let i = 0; i < WMP_LIB_ROW_POOL * this.columns.length; i++) {
      const ct = mkText('', style);
      ct.setMask(this.dataMask);
      this.colCellTextsP.push(ct);
    }

    // Playlist sidebar texts
    this.sidebarHeaderTextP = mkText('Playlists', style, 0.5, 0.5);
    for (let i = 0; i < WMP_SIDEBAR_ROW_POOL; i++) {
      this.sidebarTextsP.push(mkText('', style, 1, 0.5)); // origin 1 = right-justified
    }
    this.sidebarPlusBtnTextP = mkText('+', style, 0.5, 0.5);

    // Thumbnail image pool (one per visible library row)
    for (let i = 0; i < WMP_LIB_ROW_POOL; i++) {
      const img = this.scene.add.image(0, 0, '__DEFAULT')
        .setDepth(d + 1).setScrollFactor(0).setOrigin(0, 0).setVisible(false);
      img.setMask(this.dataMask);
      this.thumbImgsP.push(img);
    }

    // Heart (favorite) icon pool — sits on top of thumbnails (depth d+1.1)
    for (let i = 0; i < WMP_LIB_ROW_POOL; i++) {
      const ht = this.scene.add.text(0, 0, '\u2665', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: 'rgba(0,0,0,0)',
        stroke: '#ffffff',
        strokeThickness: WMP_HEART_STROKE,
      }).setDepth(d + 1.1).setScrollFactor(0).setOrigin(0.5, 1).setVisible(false);
      ht.setMask(this.dataMask);
      this.heartTextsP.push(ht);
    }

    // Sign-in popup texts (depth +3 so they render above everything)
    this.signInTitleTextP = this.scene.add.text(0, 0, WMP_TITLE, titleStyle)
      .setDepth(d + 3).setScrollFactor(0).setOrigin(0, 0.5).setVisible(false);
    this.signInLabelP = this.scene.add.text(0, 0, 'Sign in to unlock more songs!', { fontFamily: `"${WMP_FONT}"`, fontSize: '16px', color: '#ffffff' })
      .setDepth(d + 3).setScrollFactor(0).setOrigin(0.5, 0.5).setVisible(false);
    this.signInBtnTextP = this.scene.add.text(0, 0, 'Sign in with Spotify', { fontFamily: `"${WMP_FONT}"`, fontSize: '16px', color: '#ffffff' })
      .setDepth(d + 3).setScrollFactor(0).setOrigin(0.5, 0.5).setVisible(false);
    this.signInCloseBtnTextP = mkText('×', style, 0.5, 0.5);
    this.signInCloseBtnTextP.setDepth(d + 3);

    // Context menu text pool (depth d+4 to float above everything)
    for (let i = 0; i < WMP_CTX_MAX_ITEMS; i++) {
      const t = mkText('', style, 0, 0.5);
      t.setDepth(d + 4).setVisible(false);
      this.ctxTextsP.push(t);
    }
    // Submenu text pool
    for (let i = 0; i < WMP_CTX_SUBMENU_MAX; i++) {
      const t = mkText('', style, 0, 0.5);
      t.setDepth(d + 4).setVisible(false);
      this.ctxSubTextsP.push(t);
    }

    this.phaserAll = [
      this.gfx, this.gfxHeaderOv, this.gfxLift, this.titleTextP, this.statusTextP,
      this.tLeftP, this.tRightP, this.bottomTextP, this.volIconP,
      ...this.winBtnTextsP, ...this.transportTextsP, ...this.tabTextsP,
      this.infoTitleP, this.infoArtistP, this.infoHeartP, this.infoSpotifyBtnP, this.infoSpotifyLogoP,
      ...this.colHeaderTextsP, ...this.colCellTextsP, ...this.thumbImgsP, ...this.heartTextsP,
      this.sidebarHeaderTextP, ...this.sidebarTextsP, this.sidebarPlusBtnTextP,
      this.signInTitleTextP, this.signInLabelP, this.signInBtnTextP, this.signInCloseBtnTextP,
      ...this.ctxTextsP, ...this.ctxSubTextsP,
    ];
  }

  // ─── Phaser Graphics helpers ───────────────────────────────
  private drawRaised(x: number, y: number, w: number, h: number, bw: number, target?: Phaser.GameObjects.Graphics): void {
    const g = target || this.gfx;
    g.fillStyle(PH_FACE);
    g.fillRect(x, y, w, h);
    g.fillStyle(PH_HIGHLIGHT);
    g.fillRect(x, y, w, bw);           // top
    g.fillRect(x, y, bw, h);           // left
    g.fillStyle(PH_SHADOW);
    g.fillRect(x, y + h - bw, w, bw);  // bottom
    g.fillRect(x + w - bw, y, bw, h);  // right
  }

  private drawSunken(x: number, y: number, w: number, h: number, bw: number): void {
    const g = this.gfx;
    g.fillStyle(PH_SHADOW);
    g.fillRect(x, y, w, bw);
    g.fillRect(x, y, bw, h);
    g.fillStyle(PH_HIGHLIGHT);
    g.fillRect(x, y + h - bw, w, bw);
    g.fillRect(x + w - bw, y, bw, h);
  }

  private async loadLibrary(): Promise<void> {
    this.libLoaded = true;
    try {
      this.libTracks = await fetchAllTracks();
      this.libArtists = await fetchArtists();
      this.updateBottomBar();
      this.loadFavorites();          // fire-and-forget — don't block library display
      this.loadCustomPlaylists();   // fire-and-forget — loads user's custom playlists
    } catch {
      this.bottomBarEl.textContent = 'Failed to load library';
    }
  }

  private updateBottomBar(): void {
    const source = this.cb.getSource();
    if (source === 'hume') {
      this.bottomBarEl.textContent = `${this.libTracks.length} tracks | hume`;
    } else if (source === 'youtube') {
      const playable = this.libTracks.filter(t => t.youtubeVideoId).length;
      this.bottomBarEl.textContent = `${playable} tracks | YouTube`;
    } else {
      this.bottomBarEl.textContent = `${this.libTracks.length} tracks | Spotify`;
    }
  }

  private onLibRowClick(trackIndex: number): void {
    const tracks = this.getDisplayTracks();
    if (trackIndex < 0 || trackIndex >= tracks.length) return;
    const track = tracks[trackIndex];
    const source = this.cb.getSource();

    if (source === 'youtube' && !track.youtubeVideoId && !this.cb.isSpotifyLoggedIn()) {
      // Anon user clicking locked track — show sign-in popup
      this.showSignInPopup();
      return;
    }

    // Logged-in free users can click any track (preview for non-YT tracks)
    // Premium users play everything via Spotify
    this.selectedTrackIdx = trackIndex;
    this.cb.playTrack(track);
  }

  private showSignInPopup(): void {
    this.signInOpen = true;
    this.signInBackdrop.style.display = 'flex';
  }

  private hideSignInPopup(): void {
    this.signInOpen = false;
    this.signInBackdrop.style.display = 'none';
  }

  // ─── Context menu ────────────────────────────────────────────

  /** Right-click handler on library row — build and show context menu. */
  private onLibRowRightClick(trackIndex: number, e: MouseEvent): void {
    const tracks = this.getDisplayTracks();
    if (trackIndex < 0 || trackIndex >= tracks.length) return;
    const track = tracks[trackIndex];

    // Only show on Music (tab 1), Artists (tab 0), or Playlists (tab 2) tabs
    if (this.activeTab === 3) return;  // no right-click on Favorites tab (use toggle)

    this.ctxMenuTrack = track;
    this.ctxMenuItems = [];
    this.ctxHoverIdx = -1;

    const isCustomPlaylist = this.activeTab === 2 &&
      this.selectedPlaylistIdx >= WMP_PLAYLIST_NAMES.length;
    const customIdx = this.selectedPlaylistIdx - WMP_PLAYLIST_NAMES.length;
    const customPl = isCustomPlaylist ? this.customPlaylists[customIdx] : null;

    if (isCustomPlaylist && customPl) {
      // Custom playlist context menu — paste and remove
      if (this.clipboardTrack && !customPl.trackIds.includes(this.clipboardTrack.spotifyTrackId)) {
        const clip = this.clipboardTrack;
        this.ctxMenuItems.push({
          label: `Paste "${clip.title.slice(0, 20)}"`,
          action: () => { this.addTrackToPlaylist(customPl, clip); },
        });
      }
      this.ctxMenuItems.push({
        label: 'Remove from playlist',
        action: () => { this.removeTrackFromPlaylist(customPl, track.spotifyTrackId); },
      });
      this.ctxMenuItems.push({ label: '', action: () => {}, isSeparator: true });
    }

    // Standard items for all tabs
    this.ctxMenuItems.push({
      label: 'Add to playlist  \u25B8',
      hasSubmenu: true,
      action: () => {},  // submenu handles action
    });
    this.ctxMenuItems.push({
      label: this.favoriteTrackIds.has(track.spotifyTrackId) ? '\u2713 Favorite' : 'Favorite',
      action: () => { this.toggleFavorite(track); },
    });
    this.ctxMenuItems.push({ label: '', action: () => {}, isSeparator: true });
    if (track.spotifyUrl) {
      this.ctxMenuItems.push({
        label: 'Play in Spotify',
        action: () => { openSpotify(track.spotifyUrl!); },
      });
    }
    this.ctxMenuItems.push({
      label: 'Get info',
      action: () => { this.selectedTrackIdx = trackIndex; },
    });
    this.ctxMenuItems.push({ label: '', action: () => {}, isSeparator: true });
    this.ctxMenuItems.push({
      label: 'Copy',
      action: () => { this.clipboardTrack = track; },
    });

    // Position menu at mouse location relative to win
    const winRect = this.win.getBoundingClientRect();
    const left = e.clientX - winRect.left;
    const top = e.clientY - winRect.top;

    // Show items + set textContent for auto-width
    for (let i = 0; i < WMP_CTX_MAX_ITEMS; i++) {
      const el = this.ctxItemEls[i];
      if (i < this.ctxMenuItems.length) {
        const item = this.ctxMenuItems[i];
        if (item.isSeparator) {
          el.textContent = '';
          el.style.display = 'flex';
          el.style.height = `${WMP_CTX_SEP_H}px`;
          el.style.pointerEvents = 'none';
        } else {
          el.textContent = item.label;
          el.style.display = 'flex';
          el.style.height = `${WMP_CTX_ITEM_H}px`;
          el.style.pointerEvents = 'auto';
        }
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }

    this.ctxClickIdx = -1;
    this.ctxMenuEl.style.display = 'flex';
    this.ctxMenuEl.style.left = `${left}px`;
    this.ctxMenuEl.style.top = `${top}px`;
    this.ctxMenuOpen = true;
  }

  private hideContextMenu(): void {
    this.ctxMenuOpen = false;
    this.ctxMenuEl.style.display = 'none';
    this.ctxHoverIdx = -1;
    this.ctxClickIdx = -1;
    this.ctxSubClickIdx = -1;
    this.hideSubmenu();
  }

  /** Show the "Add to playlist" submenu positioned to the right of the hovered item. */
  private showSubmenu(parentIdx: number): void {
    if (this.ctxSubmenuTimeout) { clearTimeout(this.ctxSubmenuTimeout); this.ctxSubmenuTimeout = null; }
    this.ctxSubmenuItems = [];
    this.ctxSubHoverIdx = -1;
    const track = this.ctxMenuTrack;
    if (!track) return;

    if (this.customPlaylists.length === 0) {
      this.ctxSubmenuItems.push({ label: '(no playlists)', action: () => {}, isSeparator: false });
    } else {
      for (const pl of this.customPlaylists) {
        const already = pl.trackIds.includes(track.spotifyTrackId);
        this.ctxSubmenuItems.push({
          label: already ? `\u2713 ${pl.name}` : pl.name,
          action: already ? () => {} : () => { this.addTrackToPlaylist(pl, track); },
        });
      }
    }

    // Position submenu to the right of the parent item
    const parentEl = this.ctxItemEls[parentIdx];
    if (parentEl) {
      this.ctxSubmenuEl.style.left = `${parentEl.offsetWidth}px`;
      this.ctxSubmenuEl.style.top = `${parentEl.offsetTop - WMP_CTX_PAD_V}px`;
    }

    // Show submenu items + set textContent for auto-width
    this.ctxSubClickIdx = -1;
    for (let i = 0; i < WMP_CTX_SUBMENU_MAX; i++) {
      const el = this.ctxSubItemEls[i];
      if (i < this.ctxSubmenuItems.length) {
        el.textContent = this.ctxSubmenuItems[i].label;
        el.style.display = 'flex';
        el.style.height = `${WMP_CTX_ITEM_H}px`;
        el.style.pointerEvents = this.ctxSubmenuItems[i].label === '(no playlists)' ? 'none' : 'auto';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }
    this.ctxSubmenuEl.style.display = 'flex';
  }

  private hideSubmenu(): void {
    this.ctxSubmenuEl.style.display = 'none';
    this.ctxSubHoverIdx = -1;
    this.ctxSubmenuItems = [];
  }

  /** Right-click on sidebar row — delete or rename custom playlists. */
  private onSidebarRowRightClick(sidebarIdx: number, e: MouseEvent): void {
    const customIdx = sidebarIdx - WMP_PLAYLIST_NAMES.length;
    if (customIdx < 0 || customIdx >= this.customPlaylists.length) return;

    this.ctxMenuTrack = null;
    this.ctxMenuItems = [];
    this.ctxHoverIdx = -1;

    this.ctxMenuItems.push({
      label: 'Rename',
      action: () => { this.startPlaylistRename(customIdx); },
    });
    this.ctxMenuItems.push({
      label: 'Delete playlist',
      action: () => { this.deletePlaylist(customIdx); },
    });

    const winRect = this.win.getBoundingClientRect();
    const left = e.clientX - winRect.left;
    const top = e.clientY - winRect.top;

    for (let i = 0; i < WMP_CTX_MAX_ITEMS; i++) {
      const el = this.ctxItemEls[i];
      if (i < this.ctxMenuItems.length) {
        el.textContent = this.ctxMenuItems[i].label;
        el.style.display = 'flex';
        el.style.height = `${WMP_CTX_ITEM_H}px`;
        el.style.pointerEvents = 'auto';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }

    this.ctxClickIdx = -1;
    this.ctxMenuEl.style.display = 'flex';
    this.ctxMenuEl.style.left = `${left}px`;
    this.ctxMenuEl.style.top = `${top}px`;
    this.ctxMenuOpen = true;
  }

  /** Load favorites from Supabase for the current auth user. Fire-and-forget safe. */
  private async loadFavorites(): Promise<void> {
    try {
      const uid = getAuthUserId() ?? await ensureAnonUser();
      const { data, error } = await supabase
        .from('user_favorites')
        .select('spotify_track_id')
        .eq('user_id', uid);
      if (error) {
        console.warn('[WMP] loadFavorites failed:', error.message);
        return;
      }
      this.favoriteTrackIds.clear();
      for (const row of data) this.favoriteTrackIds.add(row.spotify_track_id);
      this.rebuildFavoriteTracks();
    } catch (err) {
      console.warn('[WMP] loadFavorites error:', err);
    }
  }

  /** Toggle favorite for a track — optimistic UI with Supabase persistence. */
  private async toggleFavorite(track: CatalogTrack): Promise<void> {
    const uid = getAuthUserId() ?? await ensureAnonUser();
    const trackId = track.spotifyTrackId;
    const wasFavorite = this.favoriteTrackIds.has(trackId);

    // Optimistic update
    if (wasFavorite) {
      this.favoriteTrackIds.delete(trackId);
    } else {
      this.favoriteTrackIds.add(trackId);
    }
    this.rebuildFavoriteTracks();

    // Persist to Supabase
    if (wasFavorite) {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', uid)
        .eq('spotify_track_id', trackId);
      if (error) {
        console.warn('[WMP] removeFavorite failed:', error.message);
        this.favoriteTrackIds.add(trackId);  // rollback
        this.rebuildFavoriteTracks();
      }
    } else {
      const { error } = await supabase
        .from('user_favorites')
        .insert({ user_id: uid, spotify_track_id: trackId });
      if (error) {
        console.warn('[WMP] addFavorite failed:', error.message);
        this.favoriteTrackIds.delete(trackId);  // rollback
        this.rebuildFavoriteTracks();
      }
    }
  }

  /** Rebuild the favoriteTracks array from current favoriteTrackIds Set. */
  private rebuildFavoriteTracks(): void {
    this.favoriteTracks = this.libTracks.filter(t => this.favoriteTrackIds.has(t.spotifyTrackId));
  }

  // ─── Thumbnail loading ──────────────────────────────────────────

  /** Get Phaser texture key for album art URL, or null if not loaded yet. Starts async load. */
  private getThumbKey(url: string): string | null {
    const cached = this.thumbCache.get(url);
    if (cached) return cached;
    if (this.thumbLoading.has(url)) return null;
    this.thumbLoading.add(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const key = `wmp_thumb_${this.thumbCounter++}`;
      this.scene.textures.addImage(key, img);
      this.thumbCache.set(url, key);
      this.thumbLoading.delete(url);
    };
    img.onerror = () => { this.thumbLoading.delete(url); };
    img.src = url;
    return null;
  }

  // ─── Custom playlists ─────────────────────────────────────────

  /** Load custom playlists from Supabase. Fire-and-forget safe. */
  private async loadCustomPlaylists(): Promise<void> {
    try {
      const uid = getAuthUserId() ?? await ensureAnonUser();
      const { data: playlists, error: plErr } = await supabase
        .from('user_playlists')
        .select('id, name')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });
      if (plErr) {
        console.warn('[WMP] loadCustomPlaylists failed:', plErr.message);
        return;
      }
      this.customPlaylists = [];
      for (const pl of playlists) {
        const { data: tracks, error: trErr } = await supabase
          .from('user_playlist_tracks')
          .select('spotify_track_id')
          .eq('playlist_id', pl.id)
          .order('position', { ascending: true });
        this.customPlaylists.push({
          id: pl.id,
          name: pl.name,
          trackIds: trErr ? [] : tracks.map((t: { spotify_track_id: string }) => t.spotify_track_id),
        });
      }
    } catch (err) {
      console.warn('[WMP] loadCustomPlaylists error:', err);
    }
  }

  /** Create a new custom playlist via plus button. */
  private async createPlaylist(): Promise<void> {
    const uid = getAuthUserId() ?? await ensureAnonUser();
    const { data, error } = await supabase
      .from('user_playlists')
      .insert({ user_id: uid })
      .select('id, name')
      .single();
    if (error) {
      console.warn('[WMP] createPlaylist failed:', error.message);
      return;
    }
    const pl: CustomPlaylist = { id: data.id, name: data.name, trackIds: [] };
    this.customPlaylists.push(pl);
    this.selectedPlaylistIdx = WMP_PLAYLIST_NAMES.length + this.customPlaylists.length - 1;
    this.startPlaylistRename(this.customPlaylists.length - 1);
  }

  /** Start inline rename for a custom playlist (customIdx is index into customPlaylists). */
  private startPlaylistRename(customIdx: number): void {
    const sidebarIdx = WMP_PLAYLIST_NAMES.length + customIdx;
    this.editingPlaylistIdx = sidebarIdx;
    if (this.sidebarRenameInput) this.sidebarRenameInput.remove();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.customPlaylists[customIdx].name;
    Object.assign(input.style, {
      position: 'absolute', width: '100%', height: '100%',
      left: '0', top: '0', border: 'none', outline: 'none',
      fontSize: `${WMP_LIB_ROW_FONT}px`, textAlign: 'right',
      padding: `0 ${WMP_LIB_ROW_PAD_H}px`, boxSizing: 'border-box',
      background: '#ffffff', color: '#000000',
    });
    const row = this.sidebarRowEls[sidebarIdx];
    if (row) {
      row.style.position = 'relative';
      row.appendChild(input);
    }
    this.sidebarRenameInput = input;
    input.focus();
    input.select();
    const finish = () => this.finishPlaylistRename(customIdx);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
    input.addEventListener('blur', finish, { once: true });
  }

  /** Finish inline rename — persist to Supabase. */
  private finishPlaylistRename(customIdx: number): void {
    if (this.editingPlaylistIdx === -1) return;
    const input = this.sidebarRenameInput;
    if (!input) return;
    const name = (input.value || '').trim() || 'Untitled';
    const pl = this.customPlaylists[customIdx];
    if (pl) {
      pl.name = name;
      supabase
        .from('user_playlists')
        .update({ name })
        .eq('id', pl.id)
        .then(({ error }) => {
          if (error) console.warn('[WMP] renamePlaylist failed:', error.message);
        });
    }
    input.remove();
    this.sidebarRenameInput = null;
    this.editingPlaylistIdx = -1;
  }

  /** Get all sidebar names (predefined + custom). */
  private getSidebarNames(): string[] {
    return [...WMP_PLAYLIST_NAMES, ...this.customPlaylists.map(p => p.name)];
  }

  /** Add a track to a custom playlist (optimistic). */
  private async addTrackToPlaylist(pl: CustomPlaylist, track: CatalogTrack): Promise<void> {
    if (pl.trackIds.includes(track.spotifyTrackId)) return;
    pl.trackIds.push(track.spotifyTrackId);
    const { error } = await supabase
      .from('user_playlist_tracks')
      .insert({ playlist_id: pl.id, spotify_track_id: track.spotifyTrackId, position: pl.trackIds.length - 1 });
    if (error) {
      console.warn('[WMP] addTrackToPlaylist failed:', error.message);
      pl.trackIds.pop();
    }
  }

  /** Remove a track from a custom playlist (optimistic). */
  private async removeTrackFromPlaylist(pl: CustomPlaylist, trackId: string): Promise<void> {
    const idx = pl.trackIds.indexOf(trackId);
    if (idx === -1) return;
    pl.trackIds.splice(idx, 1);
    const { error } = await supabase
      .from('user_playlist_tracks')
      .delete()
      .eq('playlist_id', pl.id)
      .eq('spotify_track_id', trackId);
    if (error) {
      console.warn('[WMP] removeTrackFromPlaylist failed:', error.message);
      pl.trackIds.splice(idx, 0, trackId);  // rollback
    }
  }

  /** Delete an entire custom playlist (optimistic). */
  private async deletePlaylist(customIdx: number): Promise<void> {
    const pl = this.customPlaylists[customIdx];
    if (!pl) return;
    this.customPlaylists.splice(customIdx, 1);
    if (this.selectedPlaylistIdx >= WMP_PLAYLIST_NAMES.length + this.customPlaylists.length) {
      this.selectedPlaylistIdx = 0;
    }
    const { error } = await supabase
      .from('user_playlists')
      .delete()
      .eq('id', pl.id);
    if (error) {
      console.warn('[WMP] deletePlaylist failed:', error.message);
      this.customPlaylists.splice(customIdx, 0, pl);  // rollback
    }
  }

  /** Get tracks to display in the library for the current tab/playlist. */
  private getDisplayTracks(): CatalogTrack[] {
    if (this.activeTab === 0) return this.getArtistTracks();
    if (this.activeTab === 2) return this.getPlaylistTracks(this.selectedPlaylistIdx);
    if (this.activeTab === 3) return this.favoriteTracks;
    return this.libTracks;
  }

  /** Return tracks for the selected artist, optionally sorted by column. */
  private getArtistTracks(): CatalogTrack[] {
    const artist = this.libArtists[this.selectedArtistIdx];
    if (!artist) return [];
    const tracks = this.libTracks.filter(t => t.spotifyArtistId === artist.spotifyArtistId);
    return this.applySortIfActive(tracks);
  }

  /** Apply column sort to a track list (returns a sorted copy, or original if no sort active). */
  private applySortIfActive(tracks: CatalogTrack[]): CatalogTrack[] {
    if (!this.sortKey) return tracks;
    const sorted = [...tracks];
    const dir = this.sortAsc ? 1 : -1;
    const key = this.sortKey;
    sorted.sort((a, b) => {
      switch (key) {
        case 'title': return dir * a.title.localeCompare(b.title);
        case 'artist': return dir * a.artistName.localeCompare(b.artistName);
        case 'album': return dir * (a.albumName ?? '').localeCompare(b.albumName ?? '');
        case 'time': return dir * ((a.durationMs || 0) - (b.durationMs || 0));
        case 'rank': return dir; // rank is row index — ascending = natural, descending = reversed
        case 'listens': return dir * ((a.popularity || 0) - (b.popularity || 0));
        default: return 0;
      }
    });
    return sorted;
  }

  /** Toggle sort on a column. Same column flips direction; new column starts ascending. */
  private toggleSort(colIdx: number): void {
    const key = this.columns[colIdx].key;
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }
  }

  /** Return tracks for a predefined or custom playlist by sidebar index. */
  private getPlaylistTracks(idx: number): CatalogTrack[] {
    switch (idx) {
      case 0: // Title Track — Red Malibu only
        return this.libTracks.filter(
          (t) => t.title.toLowerCase() === TUNING.INTRO_TRACK_TITLE.toLowerCase(),
        );
      case 1: // Ride or Die — all deathpixie tracks
        return this.libTracks.filter(
          (t) => t.artistName.toLowerCase() === TUNING.INTRO_TRACK_ARTIST.toLowerCase(),
        );
      case 2: // this is hume — top 5 per artist by popularity
        return this.getThisIsHumeTracks();
      case 3: // Favorites
        return this.favoriteTracks;
      default: {
        const customIdx = idx - WMP_PLAYLIST_NAMES.length;
        if (customIdx >= 0 && customIdx < this.customPlaylists.length) {
          const pl = this.customPlaylists[customIdx];
          return pl.trackIds
            .map(id => this.libTracks.find(t => t.spotifyTrackId === id))
            .filter((t): t is CatalogTrack => t !== undefined);
        }
        return [];
      }
    }
  }

  /** "this is hume" — groups tracks by artist, takes top 5 per artist by popularity. */
  private getThisIsHumeTracks(): CatalogTrack[] {
    const byArtist = new Map<string, CatalogTrack[]>();
    for (const t of this.libTracks) {
      const key = t.spotifyArtistId;
      if (!byArtist.has(key)) byArtist.set(key, []);
      byArtist.get(key)!.push(t);
    }
    const result: CatalogTrack[] = [];
    for (const tracks of byArtist.values()) {
      tracks.sort((a, b) => b.popularity - a.popularity);
      result.push(...tracks.slice(0, 5));
    }
    result.sort((a, b) => b.popularity - a.popularity);
    return result;
  }

  // ─── Column helpers ───────────────────────────────────────

  /** Cumulative left fraction for column at index */
  private getColLeftFrac(colIdx: number): number {
    let f = 0;
    for (let i = 0; i < colIdx; i++) f += this.columns[i].widthFrac;
    return f;
  }

  /** Get display value from track for a given column key */
  private getCellValue(track: CatalogTrack, key: ColKey, trackIdx = 0): string {
    switch (key) {
      case 'title': return track.title;
      case 'artist': return track.artistName;
      case 'album': return track.albumName || '';
      case 'time': return track.durationMs ? formatTime(track.durationMs / 1000) : '';
      case 'rank': return `${trackIdx + 1}`;
      case 'listens': return track.popularity ? track.popularity.toLocaleString() : '';
    }
  }

  /** Reposition HTML header cells + dividers from columns[] state */
  private updateColLayout(): void {
    let left = 0;
    for (let ci = 0; ci < this.columns.length; ci++) {
      const frac = this.columns[ci].widthFrac;
      this.colCellEls[ci].style.left = `${left * 100}%`;
      this.colCellEls[ci].style.width = `${frac * 100}%`;
      if (ci < this.colDividerEls.length) {
        const divLeft = left + frac;
        this.colDividerEls[ci].style.left = `calc(${divLeft * 100}% - ${WMP_COL_DIVIDER_HIT_W / 2}px)`;
      }
      left += frac;
    }
  }

  // ─── Column interaction handlers ──────────────────────────

  private onColDividerDown(divIdx: number, e: MouseEvent): void {
    this.colResizeDrag = {
      divIdx,
      startX: e.clientX,
      leftFrac: this.columns[divIdx].widthFrac,
      rightFrac: this.columns[divIdx + 1].widthFrac,
    };
  }

  private onColHeaderDown(colIdx: number, e: MouseEvent): void {
    const cell = this.colCellEls[colIdx];
    const rect = cell.getBoundingClientRect();
    this.colReorderDrag = {
      colIdx,
      grabOffsetX: e.clientX - rect.left - rect.width / 2,
      lastClientX: e.clientX,
      startClientX: e.clientX,
      liftAnim: 0,
      targetIdx: -1,
      targetTextOffset: 0,
    };
  }

  private handleColResize(e: MouseEvent): void {
    if (!this.colResizeDrag) return;
    const { divIdx, startX, leftFrac, rightFrac } = this.colResizeDrag;
    const hdrRect = this.libHeaderRow.getBoundingClientRect();
    const totalW = hdrRect.width || 1; // header row already excludes thumbnail + pad + scrollbar
    const deltaFrac = (e.clientX - startX) / totalW;
    let newLeft = leftFrac + deltaFrac;
    let newRight = rightFrac - deltaFrac;
    if (newLeft < WMP_COL_MIN_FRAC) { newRight -= (WMP_COL_MIN_FRAC - newLeft); newLeft = WMP_COL_MIN_FRAC; }
    if (newRight < WMP_COL_MIN_FRAC) { newLeft -= (WMP_COL_MIN_FRAC - newRight); newRight = WMP_COL_MIN_FRAC; }
    this.columns[divIdx].widthFrac = newLeft;
    this.columns[divIdx + 1].widthFrac = newRight;
    this.updateColLayout();
  }

  private finishColReorder(): void {
    if (!this.colReorderDrag) return;
    const { colIdx, targetIdx, startClientX, lastClientX } = this.colReorderDrag;
    const wasDrag = Math.abs(lastClientX - startClientX) > 5;
    if (wasDrag && targetIdx >= 0 && targetIdx !== colIdx) {
      const temp = this.columns[colIdx];
      this.columns[colIdx] = this.columns[targetIdx];
      this.columns[targetIdx] = temp;
      this.updateColLayout();
    } else if (!wasDrag) {
      this.toggleSort(colIdx);
    }
    this.colReorderDrag = null;
  }

  /** Convert HTML element rect → game coordinates */
  private toGame(el: HTMLElement, or: DOMRect, sx: number, sy: number) {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - or.left) * sx,
      y: (r.top - or.top) * sy,
      w: r.width * sx,
      h: r.height * sy,
      cx: (r.left + r.width / 2 - or.left) * sx,
      cy: (r.top + r.height / 2 - or.top) * sy,
    };
  }

  // ─── Sync Phaser objects from HTML positions ───────────────
  private syncPhaser(): void {
    if (!this.isOpen) return;

    const or = this.overlay.getBoundingClientRect();
    const ow = or.width || 1;
    const oh = or.height || 1;
    const sx = GAME_MODE.canvasWidth / ow;
    const sy = TUNING.GAME_HEIGHT / oh;
    const bw = Math.max(1, 2 * sx);   // 2px border scaled to game coords
    const bwThin = Math.max(1, 1.5 * sx);

    const g = this.gfx;
    g.clear();
    this.gfxHeaderOv.clear();
    this.gfxLift.clear();

    // Window frame (raised)
    const w = this.toGame(this.win, or, sx, sy);
    this.drawRaised(w.x, w.y, w.w, w.h, bw);

    // Title bar (solid blue — authentic Win95)
    const tb = this.toGame(this.titleBar, or, sx, sy);
    g.fillStyle(PH_TITLE);
    g.fillRect(tb.x, tb.y, tb.w, tb.h);
    this.titleTextP.setPosition(tb.x + WMP_TITLE_PAD_L * sx, tb.cy);

    // Window buttons (raised small rectangles)
    for (let i = 0; i < this.winBtns.length; i++) {
      const b = this.toGame(this.winBtns[i], or, sx, sy);
      this.drawRaised(b.x, b.y, b.w, b.h, bwThin);
      this.winBtnTextsP[i].setPosition(b.cx, b.cy).setColor('#000000').setStroke('#000000', 2 * sx);
    }

    // Video area (sunken black)
    const vb = this.toGame(this.videoBox, or, sx, sy);
    this.drawSunken(vb.x, vb.y, vb.w, vb.h, bw);
    g.fillStyle(PH_BLACK);
    g.fillRect(vb.x + bw, vb.y + bw, vb.w - bw * 2, vb.h - bw * 2);

    // Track info panel (right of video)
    const ip = this.toGame(this.trackInfoPanel, or, sx, sy);
    // Background fill (same gray face as window)
    g.fillStyle(PH_FACE);
    g.fillRect(ip.x, ip.y, ip.w, ip.h);

    // Track info texts — crop to panel width
    const infoCropW = ip.w - TUNING.WMP_INFO_PAD * 2 * sx;
    const it = this.toGame(this.infoTitleEl, or, sx, sy);
    this.infoTitleP.setPosition(it.x, it.cy);
    this.infoTitleP.setCrop(0, 0, infoCropW, it.h * 2);
    const ia = this.toGame(this.infoArtistEl, or, sx, sy);
    this.infoArtistP.setPosition(ia.x, ia.cy);
    this.infoArtistP.setCrop(0, 0, infoCropW, ia.h * 2);
    // Info heart (favorite toggle for currently playing track)
    const ih = this.toGame(this.infoHeartBtn, or, sx, sy);
    const infoIsFav = !!this.playingTrackId && this.favoriteTrackIds.has(this.playingTrackId);
    const infoBouncing = this.heartBounceTrackId === this.playingTrackId && this.heartBounceT < 1;
    const infoHeartScale = infoBouncing ? 1 + 0.4 * Math.sin(this.heartBounceT * Math.PI) : 1;
    this.infoHeartP.setFontSize(ih.h * 0.75);
    this.infoHeartP.setStroke('#4a0080', 3 * sy);
    this.infoHeartP.setColor(infoIsFav ? '#4a0080' : 'rgba(0,0,0,0)');
    this.infoHeartP.setAlpha(infoIsFav ? 1 : 0.8);
    this.infoHeartP.setScale(infoHeartScale);
    this.infoHeartP.setPosition(ih.cx, ih.cy);
    this.infoHeartP.setVisible(ih.w > 0 && ih.h > 0);

    // Spotify button (green fill + "Listen on" text + logo)
    const ib = this.toGame(this.infoSpotifyBtn, or, sx, sy);
    if (ib.w > 0 && ib.h > 0) {
      g.fillStyle(PH_SPOTIFY_GREEN);
      g.fillRect(ib.x, ib.y, ib.w, ib.h);
    }
    // Logo at 70% of button height, group scaled down and centered
    const gs = TUNING.WMP_INFO_BTN_GROUP_SCALE;
    const logoNatH = this.infoSpotifyLogoP.height || 1;
    const logoBase = (ib.h * 0.7) / logoNatH;
    this.infoSpotifyLogoP.setScale(logoBase * gs);
    this.infoSpotifyBtnP.setScale(gs);
    const btnGap = 20 * sx * gs;
    const textW = (this.infoSpotifyBtnP.width || 1) * gs;
    const logoW = this.infoSpotifyLogoP.width * logoBase * gs;
    const groupW = textW + btnGap + logoW;
    const groupX = ib.cx - groupW / 2;
    this.infoSpotifyBtnP.setPosition(groupX, ib.cy);
    this.infoSpotifyLogoP.setPosition(groupX + textW + btnGap + logoW / 2, ib.cy);

    // Split divider (raised bar)
    const dv = this.toGame(this.splitDivider, or, sx, sy);
    this.drawRaised(dv.x, dv.y, dv.w, dv.h, bwThin);

    // Status text (hidden — title is in the info panel now)
    this.statusTextP.setVisible(false);

    // Progress groove (sunken)
    const pg = this.toGame(this.progGroove, or, sx, sy);
    this.drawSunken(pg.x, pg.y, pg.w, pg.h, bwThin);
    const fillPct = parseFloat(this.progFill.style.width) || 0;
    if (fillPct > 0) {
      g.fillStyle(PH_TITLE);
      g.fillRect(pg.x + bwThin, pg.y + bwThin, (fillPct / 100) * (pg.w - bwThin * 2), pg.h - bwThin * 2);
    }
    // Playhead — purple diamond with black stroke
    const pm = this.toGame(this.progMarker, or, sx, sy);
    const dHalfW = pm.w / 2;
    const dHalfH = pm.h / 2;
    g.fillStyle(PH_TITLE);
    g.beginPath();
    g.moveTo(pm.cx, pm.cy - dHalfH);  // top
    g.lineTo(pm.cx + dHalfW, pm.cy);   // right
    g.lineTo(pm.cx, pm.cy + dHalfH);   // bottom
    g.lineTo(pm.cx - dHalfW, pm.cy);   // left
    g.closePath();
    g.fillPath();
    g.lineStyle(WMP_MARKER_STROKE * Math.min(sx, sy), this.isFullscreen ? 0xffffff : PH_BLACK, 1);
    g.beginPath();
    g.moveTo(pm.cx, pm.cy - dHalfH);
    g.lineTo(pm.cx + dHalfW, pm.cy);
    g.lineTo(pm.cx, pm.cy + dHalfH);
    g.lineTo(pm.cx - dHalfW, pm.cy);
    g.closePath();
    g.strokePath();

    // Time texts
    const tl = this.toGame(this.tLeft, or, sx, sy);
    this.tLeftP.setPosition(tl.x, tl.cy);
    this.tLeftP.setColor(W95_CSS_TITLE);
    const tr = this.toGame(this.tRight, or, sx, sy);
    this.tRightP.setPosition(tr.x + tr.w, tr.cy);
    this.tRightP.setColor(W95_CSS_TITLE);

    // Transport buttons disabled — mystery text investigation

    // Volume ramp
    const vg = this.toGame(this.volGroove, or, sx, sy);
    const vFillPct = (parseFloat(this.volFill.style.width) || 0) / 100;
    const rampMinH = WMP_VOL_RAMP_MIN_H * sy;
    const rampMaxH = vg.h;
    // Draw ramp as a trapezoid: left edge thin, right edge full height, bottom-aligned
    // Background (dark gray) — full ramp
    g.fillStyle(WMP_VOL_RAMP_BG);
    g.beginPath();
    g.moveTo(vg.x, vg.y + vg.h);                             // bottom-left
    g.lineTo(vg.x, vg.y + vg.h - rampMinH);                  // top-left (thin)
    g.lineTo(vg.x + vg.w, vg.y + vg.h - rampMaxH);           // top-right (tall)
    g.lineTo(vg.x + vg.w, vg.y + vg.h);                      // bottom-right
    g.closePath();
    g.fillPath();
    // Filled portion (red) — from left up to slider position
    if (vFillPct > 0) {
      const fillX = vg.x + vg.w * vFillPct;
      const fillH = rampMinH + (rampMaxH - rampMinH) * vFillPct;
      g.fillStyle(WMP_VOL_RAMP_FILL);
      g.beginPath();
      g.moveTo(vg.x, vg.y + vg.h);                           // bottom-left
      g.lineTo(vg.x, vg.y + vg.h - rampMinH);                // top-left (thin)
      g.lineTo(fillX, vg.y + vg.h - fillH);                   // top at slider
      g.lineTo(fillX, vg.y + vg.h);                           // bottom at slider
      g.closePath();
      g.fillPath();
    }
    // Slider thumb (raised)
    const vm = this.toGame(this.volMarker, or, sx, sy);
    this.drawRaised(vm.x, vm.y, vm.w, vm.h, bwThin);
    const vi = this.toGame(this.volIconEl, or, sx, sy);
    this.volIconP.setPosition(vi.cx, vi.cy);

    // Tab bar — animated: each tab lerps width/height/color based on tabAnimFrac
    const tbar = this.toGame(this.tabBar, or, sx, sy);
    const nTabs = this.tabEls.length;
    const gap = WMP_TAB_GAP * Math.min(sx, sy);
    const totalGap = gap * (nTabs - 1);
    const availW = tbar.w - totalGap;
    const rBase = WMP_TAB_RADIUS * Math.min(sx, sy);
    const baseH = tbar.h;
    // Compute per-tab scale from animated fractions: each tab's share is (1 + 0.15*frac)
    let totalShares = 0;
    for (let i = 0; i < nTabs; i++) totalShares += 1 + 0.15 * this.tabAnimFrac[i];
    const unitW = availW / totalShares;
    let curX = tbar.x;
    for (let i = 0; i < nTabs; i++) {
      const f = this.tabAnimFrac[i];  // 0..1 animated
      const tw = unitW * (1 + 0.15 * f);
      const th = baseH * (1 + 0.15 * f);
      const tx = curX;
      const ty = tbar.y + tbar.h - th;   // anchored at bottom
      const r = rBase * (1 + 0.15 * f);
      // Color snaps immediately on click — size animates
      const isActive = i === this.activeTab;
      g.fillStyle(isActive ? PH_TITLE : PH_FACE);
      g.beginPath();
      g.moveTo(tx, ty + th);
      g.lineTo(tx, ty + r);
      g.arc(tx + r, ty + r, r, Math.PI, Math.PI * 1.5);
      g.lineTo(tx + tw - r, ty);
      g.arc(tx + tw - r, ty + r, r, Math.PI * 1.5, 0);
      g.lineTo(tx + tw, ty + th);
      g.closePath();
      g.fillPath();
      // Border
      g.lineStyle(bwThin, PH_SHADOW, 1);
      g.beginPath();
      g.moveTo(tx, ty + th);
      g.lineTo(tx, ty + r);
      g.arc(tx + r, ty + r, r, Math.PI, Math.PI * 1.5);
      g.lineTo(tx + tw - r, ty);
      g.arc(tx + tw - r, ty + r, r, Math.PI * 1.5, 0);
      g.lineTo(tx + tw, ty + th);
      g.strokePath();
      // Label — color snaps instantly, size animates
      const tp = this.tabTextsP[i];
      tp.setPosition(tx + tw / 2, ty + th / 2);
      tp.setColor(isActive ? '#ffffff' : '#000000');
      tp.setFontStyle(isActive ? 'bold' : '');
      tp.setScale(1 + 0.15 * f);
      curX += tw + gap;
    }

    // Library list (sunken white area)
    const ll = this.toGame(this.libraryList, or, sx, sy);
    this.drawSunken(ll.x, ll.y, ll.w, ll.h, bw);
    g.fillStyle(0xffffff);
    g.fillRect(ll.x + bw, ll.y + bw, ll.w - bw * 2, ll.h - bw * 2);

    const numCols = this.columns.length;
    const listInnerW = ll.w - bw * 2;
    const listX = ll.x + bw;
    const headerY = ll.y + bw;
    const padX = WMP_COL_HEADER_PAD * sx;
    // Header height: text size + padding
    const headerFontPx = 11 * WMP_TEXT_LIB_ROW_MULT * sy; // approximate rendered font size
    const headerH = headerFontPx + WMP_HEADER_PAD * sy;
    // Data row height: derived from HTML row height scaled to game coords
    const rowH = TUNING.WMP_LIB_ROW_H * sy;
    const dataTop = headerY + headerH;          // top of data area
    const dataH = ll.h - bw * 2 - headerH;      // available data area height
    // Only reserve scrollbar width if content overflows
    const totalTrackH = this.getDisplayTracks().length * rowH;
    const needsScroll = totalTrackH > dataH;
    const scrollbarW = needsScroll ? WMP_SCROLLBAR_W * sx : 0;
    this.sbHitDiv.style.display = needsScroll ? 'block' : 'none';
    const sbCssPx = needsScroll ? WMP_SCROLLBAR_W : 0;
    const hdrLeftOff = TUNING.WMP_LIB_ROW_H + 10; // thumbnail + rowTextPadL (matches buildPhaser)
    this.libHeaderRow.style.width = `calc(100% - ${hdrLeftOff + sbCssPx}px)`;
    const dataContentW = listInnerW - scrollbarW; // data area minus scrollbar
    const thumbW = rowH;              // square thumbnail = row height
    const rowTextPadL = 10 * sx;      // left buffer before text columns
    const colAreaX = listX + thumbW + rowTextPadL;  // columns start after thumbnail + pad
    const colAreaW = dataContentW - thumbW - rowTextPadL; // column area width
    // Smooth scroll: how many rows fit + 1 extra for partial
    const visRows = Math.ceil(dataH / rowH) + 1;
    // First visible row index and pixel offset within that row
    // libScrollPx is in CSS px, so use CSS row height for row counting, then scale offset to game px
    const cssRowH = TUNING.WMP_LIB_ROW_H;
    const firstRow = Math.floor(this.libScrollPx / cssRowH);
    const scrollFrac = (this.libScrollPx - firstRow * cssRowH) * sy; // CSS remainder → game px

    // Header background (gray) — spans full width including scrollbar
    g.fillStyle(PH_FACE);
    g.fillRect(listX, headerY, listInnerW, headerH);
    // Header bottom divider line
    g.fillStyle(PH_SHADOW);
    g.fillRect(listX, headerY + headerH - 1, listInnerW, 1);

    // Column headers + vertical dividers (offset past thumbnail area)
    for (let ci = 0; ci < numCols; ci++) {
      const colLeft = colAreaX + this.getColLeftFrac(ci) * colAreaW;
      const colW = this.columns[ci].widthFrac * colAreaW;
      const headerText = this.colHeaderTextsP[ci];
      let colLabel = this.columns[ci].label;
      if (this.sortKey === this.columns[ci].key) {
        colLabel += this.sortAsc ? ' \u25B2' : ' \u25BC';
      }
      headerText.setText(colLabel);

      if (this.colReorderDrag && this.colReorderDrag.colIdx === ci) {
        // Lifted column — skip normal rendering (drawn last on top)
        headerText.setVisible(false);
      } else if (this.colReorderDrag && this.colReorderDrag.targetIdx === ci) {
        // Target column: shift text toward the incoming side
        const offsetDir = this.colReorderDrag.targetTextOffset;
        headerText.setPosition(colLeft + colW / 2 + offsetDir * (colW / 2 - padX), headerY + headerH / 2);
        headerText.setVisible(true);
        headerText.setScale(1);
      } else {
        headerText.setPosition(colLeft + colW / 2, headerY + headerH / 2);
        headerText.setVisible(true);
        headerText.setScale(1);
      }

      // Vertical divider line (right edge of each column except last)
      if (ci < numCols - 1) {
        const divX = colLeft + colW;
        g.fillStyle(PH_SHADOW);
        g.fillRect(divX - 1, headerY, 1, headerH);
        g.fillStyle(PH_HIGHLIGHT);
        g.fillRect(divX, headerY, 1, headerH);
      }
    }

    // Lifted header (drawn on top when reordering)
    if (this.colReorderDrag) {
      const drag = this.colReorderDrag;
      // Lerp lift animation toward 1
      drag.liftAnim += (1 - drag.liftAnim) * WMP_COL_LIFT_LERP;

      // Determine target column from cursor position
      const liftedCenterClient = drag.lastClientX - drag.grabOffsetX;
      const hdrRect = this.libHeaderRow.getBoundingClientRect();
      const colAreaLeft = hdrRect.left;
      const colAreaWidth = hdrRect.width || 1;
      const liftedFrac = (liftedCenterClient - colAreaLeft) / colAreaWidth;
      let newTarget = -1;
      let cumFrac = 0;
      for (let ci = 0; ci < numCols; ci++) {
        if (ci === drag.colIdx) { cumFrac += this.columns[ci].widthFrac; continue; }
        if (liftedFrac >= cumFrac && liftedFrac < cumFrac + this.columns[ci].widthFrac) {
          newTarget = ci;
          break;
        }
        cumFrac += this.columns[ci].widthFrac;
      }
      drag.targetIdx = newTarget;

      // Animate target text offset
      if (newTarget >= 0) {
        const targetCenter = this.getColLeftFrac(newTarget) + this.columns[newTarget].widthFrac / 2;
        const goalDir = liftedFrac < targetCenter ? 1 : -1;
        drag.targetTextOffset += (goalDir - drag.targetTextOffset) * WMP_COL_TEXT_SLIDE_LERP;
      } else {
        drag.targetTextOffset += (0 - drag.targetTextOffset) * WMP_COL_TEXT_SLIDE_LERP;
      }

      // Draw lifted header with raised border
      const scale = 1 + (WMP_COL_LIFT_SCALE - 1) * drag.liftAnim;
      const origColW = this.columns[drag.colIdx].widthFrac * colAreaW;
      const liftedGameX = liftedFrac * colAreaW + colAreaX;
      const liftW = origColW * scale;
      const liftH = headerH * scale;
      const liftX = liftedGameX - liftW / 2;
      const liftY = headerY + headerH / 2 - liftH / 2;

      // Drop shadow — Bayer 4x4 ordered dither on lift layer
      const gl = this.gfxLift;
      const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
      const sScale = scale * WMP_COL_SHADOW_EXTRA_SCALE;
      const sW = origColW * sScale;
      const sH = headerH * sScale;
      const sX = liftedGameX - sW / 2;
      const sY = headerY + headerH / 2 - sH / 2 + WMP_COL_SHADOW_OFFSET_Y * sy;
      const dpx = WMP_COL_SHADOW_DITHER_PX * sx;
      const spread = WMP_COL_SHADOW_SPREAD * sx;
      const exL = sX - spread, exT = sY - spread;
      const exR = sX + sW + spread, exB = sY + sH + spread;
      gl.fillStyle(PH_BLACK);
      for (let py = exT; py < exB; py += dpx) {
        for (let px = exL; px < exR; px += dpx) {
          const dx = Math.max(sX - px, px + dpx - (sX + sW), 0);
          const dy = Math.max(sY - py, py + dpx - (sY + sH), 0);
          const edgeDist = Math.sqrt(dx * dx + dy * dy);
          const density = edgeDist <= 0
            ? WMP_COL_SHADOW_ALPHA
            : WMP_COL_SHADOW_ALPHA * Math.max(0, 1 - edgeDist / spread);
          const bx = (Math.floor(px / dpx) & 3);
          const by = (Math.floor(py / dpx) & 3);
          if (density > BAYER[by * 4 + bx] / 16) {
            gl.fillRect(px, py, dpx, dpx);
          }
        }
      }

      // Raised box on lift layer
      this.drawRaised(liftX, liftY, liftW, liftH, bwThin, gl);
      // Darken overlay on lifted header
      gl.fillStyle(PH_BLACK, WMP_COL_LIFT_DARKEN);
      gl.fillRect(liftX + bwThin, liftY + bwThin, liftW - bwThin * 2, liftH - bwThin * 2);

      // Lifted text
      const liftedText = this.colHeaderTextsP[drag.colIdx];
      liftedText.setPosition(liftedGameX, headerY + headerH / 2);
      liftedText.setScale(scale);
      liftedText.setDepth(WMP_DEPTH + 2);
      liftedText.setVisible(true);
    }

    // Update data area mask shape (clips row thumbnails + text to data area)
    this.gfxDataMask.clear();
    this.gfxDataMask.fillStyle(0xffffff);
    this.gfxDataMask.fillRect(ll.x, dataTop, ll.w, dataH);

    // Data rows — smooth pixel scroll
    const displayTracks = this.getDisplayTracks();
    const currentSource = this.cb.getSource();
    const dataBottom = dataTop + dataH;
    let rendered = 0;
    for (let i = 0; i < visRows; i++) {
      const trackIdx = firstRow + i;
      const rowY = dataTop + i * rowH - scrollFrac;

      // Skip rows entirely outside visible data area
      if (rowY + rowH <= dataTop || rowY >= dataBottom) {
        if (i < this.thumbImgsP.length) this.thumbImgsP[i].setVisible(false);
        if (i < this.heartTextsP.length) this.heartTextsP[i].setVisible(false);
        for (let ci = 0; ci < numCols; ci++) {
          const cellIdx = i * numCols + ci;
          if (cellIdx < this.colCellTextsP.length) this.colCellTextsP[cellIdx].setVisible(false);
        }
        continue;
      }

      const isPlaying = trackIdx < displayTracks.length && this.playingTrackId !== null &&
        displayTracks[trackIdx].spotifyTrackId === this.playingTrackId;
      const isSelected = trackIdx === this.selectedTrackIdx || isPlaying;

      // Clamp row fill to data area bounds (prevents bleeding past sunken border)
      const fillTop = Math.max(rowY, dataTop);
      const fillBot = Math.min(rowY + rowH, dataBottom);
      const fillH = fillBot - fillTop;

      // Row background: selected = purple, hovered = light purple, alternating = light gray
      const isHoveredRow = trackIdx === this.hoverTrackIdx;
      if (fillH > 0 && trackIdx < displayTracks.length && isSelected) {
        g.fillStyle(PH_SELECTED_ROW);
        g.fillRect(listX, fillTop, dataContentW, fillH);
      } else if (fillH > 0 && trackIdx < displayTracks.length && isHoveredRow) {
        g.fillStyle(PH_HOVER_ROW);
        g.fillRect(listX, fillTop, dataContentW, fillH);
      } else if (fillH > 0 && trackIdx < displayTracks.length && trackIdx % 2 === 1) {
        g.fillStyle(0xf0f0f0);
        g.fillRect(listX, fillTop, dataContentW, fillH);
      }

      // Locked row overlay
      if (fillH > 0 && trackIdx < displayTracks.length && !isSelected && currentSource === 'youtube' && !this.cb.isSpotifyLoggedIn() && !displayTracks[trackIdx].youtubeVideoId) {
        g.fillStyle(PH_BLACK, WMP_LOCKED_ROW_ALPHA);
        g.fillRect(listX, fillTop, dataContentW, fillH);
      }

      // Thumbnail (square, fills row height, far left)
      const thumbImg = i < this.thumbImgsP.length ? this.thumbImgsP[i] : null;
      if (thumbImg) {
        if (trackIdx < displayTracks.length) {
          const track = displayTracks[trackIdx];
          const artUrl = track.albumImageUrl || track.youtubeThumbnailUrl;
          const texKey = artUrl ? this.getThumbKey(artUrl) : null;
          if (texKey) {
            thumbImg.setTexture(texKey);
            thumbImg.clearTint();
          } else {
            thumbImg.setTexture('__DEFAULT');
            thumbImg.setTint(0x333333);
          }
          thumbImg.setPosition(listX, rowY);
          thumbImg.setDisplaySize(thumbW, rowH);
          thumbImg.setCrop();
          thumbImg.setVisible(true);
        } else {
          thumbImg.setVisible(false);
        }
      }

      // Heart (favorite) icon — bottom-left corner of thumbnail
      const heartText = i < this.heartTextsP.length ? this.heartTextsP[i] : null;
      if (heartText) {
        if (trackIdx < displayTracks.length) {
          const track = displayTracks[trackIdx];
          const isFav = this.favoriteTrackIds.has(track.spotifyTrackId);
          const isHeartHover = trackIdx === this.hoverHeartTrackIdx;
          const heartSize = thumbW * WMP_HEART_FRAC;
          heartText.setFontSize(heartSize);
          heartText.setStroke('#ffffff', WMP_HEART_STROKE * sy);
          if (isFav) {
            // Favorited: purple fill, white stroke
            heartText.setColor('#4a0080');
            heartText.setAlpha(1);
          } else if (isHeartHover) {
            // Hovered (not fav): white fill, white stroke
            heartText.setColor('#ffffff');
            heartText.setAlpha(1);
          } else {
            // Default: transparent fill, white stroke only
            heartText.setColor('rgba(0,0,0,0)');
            heartText.setAlpha(0.7);
          }
          // Bounce animation
          const isBouncing = this.heartBounceTrackId === track.spotifyTrackId && this.heartBounceT < 1;
          const bounceScale = isBouncing ? 1 + 0.4 * Math.sin(this.heartBounceT * Math.PI) : 1;
          const hPad = WMP_HEART_PAD * sy;
          heartText.setScale(bounceScale);
          heartText.setPosition(listX + hPad + heartSize * 0.5, rowY + rowH - hPad);
          heartText.setVisible(true);
        } else {
          heartText.setVisible(false);
        }
      }

      // Column text cells (offset past thumbnail area)
      for (let ci = 0; ci < numCols; ci++) {
        const cellIdx = i * numCols + ci;
        if (cellIdx >= this.colCellTextsP.length) break;
        const cellText = this.colCellTextsP[cellIdx];
        const colLeft = colAreaX + this.getColLeftFrac(ci) * colAreaW;
        const colW = this.columns[ci].widthFrac * colAreaW;
        const availW = colW - padX * 2;

        if (trackIdx < displayTracks.length) {
          const track = displayTracks[trackIdx];
          const val = this.getCellValue(track, this.columns[ci].key, trackIdx);
          cellText.setText(val);
          cellText.setColor(isSelected || isHoveredRow ? '#ffffff' : '#000000');
          cellText.setVisible(true);

          const isTime = this.columns[ci].key === 'time';
          const isTitle = this.columns[ci].key === 'title';
          if (isTime) {
            cellText.setOrigin(0.5, 0.5);
            cellText.setPosition(colLeft + colW / 2, rowY + rowH / 2);
          } else if (isTitle) {
            cellText.setOrigin(0, 0.5);
            cellText.setPosition(colLeft + padX, rowY + rowH / 2);
          } else {
            cellText.setOrigin(1, 0.5);
            cellText.setPosition(colLeft + colW - padX, rowY + rowH / 2);
          }

          const textW = cellText.width;
          const overflows = textW > availW;
          const isHovered = i === this.hoverCellRow && ci === this.hoverCellCol;
          const cropX = isHovered && overflows ? this.cellScrollOffset : 0;

          if (isTime) {
            const originOffX = Math.max(0, (textW - availW) / 2);
            cellText.setCrop(originOffX, 0, availW, rowH * 2);
          } else if (isTitle) {
            // Left-justified: crop from left
            cellText.setCrop(cropX, 0, availW, rowH * 2);
          } else {
            // Right-justified: crop from left edge, showing rightmost availW
            const overflowX = Math.max(0, textW - availW);
            const cropStart = isHovered && overflows ? overflowX - cropX : overflowX;
            cellText.setCrop(Math.max(0, cropStart), 0, availW, rowH * 2);
          }

          if (isHovered && overflows && this.cellScrollMax === 0) {
            this.cellScrollMax = textW - availW;
          }
        } else {
          cellText.setText('');
          cellText.setVisible(false);
          cellText.setCrop();
        }
      }
      rendered++;
    }

    // Header overlay — drawn on gfxHeaderOv (depth d+1.2) so it covers row text/thumbs (d+1)
    const gh = this.gfxHeaderOv;
    gh.fillStyle(PH_FACE);
    gh.fillRect(listX, headerY, listInnerW, headerH);
    gh.fillStyle(PH_SHADOW);
    gh.fillRect(listX, headerY + headerH - 1, listInnerW, 1);
    for (let ci = 0; ci < numCols; ci++) {
      const colLeft = colAreaX + this.getColLeftFrac(ci) * colAreaW;
      const colW = this.columns[ci].widthFrac * colAreaW;
      if (!this.colReorderDrag || this.colReorderDrag.colIdx !== ci) {
        this.colHeaderTextsP[ci].setPosition(colLeft + colW / 2, headerY + headerH / 2);
      }
      if (ci < numCols - 1) {
        const divX = colLeft + colW;
        const divLineW = WMP_COL_DIVIDER_LINE_W * sx;
        gh.fillStyle(PH_BLACK);
        gh.fillRect(divX - divLineW / 2, headerY, divLineW, headerH + dataH);
      }
    }
    // Bottom clip — cover row background overflow below data area
    const clipBottom = dataTop + dataH;
    g.fillStyle(0xffffff);
    g.fillRect(listX, clipBottom, dataContentW, ll.y + ll.h - clipBottom);

    // ── Scrollbar (purple, right edge of library) — only when content overflows ──
    if (needsScroll) {
      const sbX = listX + dataContentW;
      const sbTop = dataTop;
      const sbH = dataH;
      // Use CSS-px maxScroll so thumb position matches libScrollPx (which is CSS px)
      const listRect = this.libraryList.getBoundingClientRect();
      const totalContentCss = displayTracks.length * TUNING.WMP_LIB_ROW_H;
      const viewCss = listRect.height - WMP_HEADER_H_CSS;
      const maxScrollCss = Math.max(0, totalContentCss - viewCss);

      // Track background
      g.fillStyle(PH_FACE);
      g.fillRect(sbX, sbTop, scrollbarW, sbH);
      g.fillStyle(PH_SHADOW);
      g.fillRect(sbX, sbTop, 1, sbH);

      if (maxScrollCss > 0) {
        const thumbFrac = Math.min(1, viewCss / totalContentCss);
        const thumbH = Math.max(WMP_SCROLLBAR_MIN_THUMB * sy, thumbFrac * sbH);
        const scrollFracNorm = this.libScrollPx / maxScrollCss;
        const thumbY = sbTop + scrollFracNorm * (sbH - thumbH);

        // Purple thumb
        g.fillStyle(PH_TITLE);
        g.fillRect(sbX + 1, thumbY, scrollbarW - 2, thumbH);
        // Highlight/shadow edges
        g.fillStyle(PH_HIGHLIGHT);
        g.fillRect(sbX + 1, thumbY, scrollbarW - 2, 1);
        g.fillRect(sbX + 1, thumbY, 1, thumbH);
        g.fillStyle(PH_SHADOW);
        g.fillRect(sbX + 1, thumbY + thumbH - 1, scrollbarW - 2, 1);
        g.fillRect(sbX + scrollbarW - 2, thumbY, 1, thumbH);
      }
    }

    // Hover detection — determine which library row + cell the mouse is in
    {
      const mgx = ((this.lastMouseX - or.left) / or.width) * GAME_MODE.canvasWidth;
      const mgy = ((this.lastMouseY - or.top) / or.height) * TUNING.GAME_HEIGHT;
      let newRow = -1;
      let newCol = -1;
      let newHoverTrack = -1;
      let newHoverHeart = -1;
      // Hover over full row width (thumbnail + columns) for row highlight
      if (this.cursorOver && mgy >= dataTop && mgy < dataBottom && mgx >= listX && mgx < listX + dataContentW) {
        const relY = mgy - dataTop + scrollFrac;
        const visRow = Math.floor(relY / rowH);
        const trackIdx = firstRow + visRow;
        if (trackIdx >= 0 && trackIdx < displayTracks.length) {
          newHoverTrack = trackIdx;
        }
        // Heart hit area: bottom-left quadrant of thumbnail
        const heartAreaW = thumbW * WMP_HEART_FRAC * 1.6; // generous hit area
        const heartAreaH = rowH * WMP_HEART_FRAC * 1.6;
        const rowY = dataTop + visRow * rowH - scrollFrac;
        if (mgx >= listX && mgx < listX + heartAreaW && mgy >= rowY + rowH - heartAreaH && mgy < rowY + rowH) {
          if (trackIdx >= 0 && trackIdx < displayTracks.length) {
            newHoverHeart = trackIdx;
          }
        }
        // Column detection (only in column area)
        if (mgx >= colAreaX && mgx < colAreaX + colAreaW) {
          newRow = visRow;
          const relX = mgx - colAreaX;
          let cumFrac = 0;
          for (let ci = 0; ci < numCols; ci++) {
            cumFrac += this.columns[ci].widthFrac;
            if (relX < cumFrac * colAreaW) { newCol = ci; break; }
          }
        }
      }
      this.hoverTrackIdx = newHoverTrack;
      this.hoverHeartTrackIdx = newHoverHeart;
      if (newRow !== this.hoverCellRow || newCol !== this.hoverCellCol) {
        this.hoverCellRow = newRow;
        this.hoverCellCol = newCol;
        this.cellScrollOffset = 0;
        this.cellScrollMax = 0;
        this.cellScrollTimer = 0;
        this.cellScrollPhase = newRow >= 0 && newCol >= 0 ? 'pause_start' : 'idle';
      }
    }

    // Hide unused pool cells + thumbnails + hearts beyond rendered rows
    for (let i = visRows; i < WMP_LIB_ROW_POOL; i++) {
      if (i < this.thumbImgsP.length) this.thumbImgsP[i].setVisible(false);
      if (i < this.heartTextsP.length) this.heartTextsP[i].setVisible(false);
      for (let ci = 0; ci < numCols; ci++) {
        const cellIdx = i * numCols + ci;
        if (cellIdx < this.colCellTextsP.length) {
          this.colCellTextsP[cellIdx].setVisible(false);
        }
      }
    }

    // Reset lifted header depth when not dragging
    if (!this.colReorderDrag) {
      for (const t of this.colHeaderTextsP) t.setDepth(WMP_DEPTH + 1.3);
    }

    // ── Playlist sidebar (only on Playlists tab) ──
    if (this.activeTab === 2 || this.activeTab === 0) {
      const isArtistsTab = this.activeTab === 0;
      // Sunken list box
      const sl = this.toGame(this.sidebarList, or, sx, sy);
      this.drawSunken(sl.x, sl.y, sl.w, sl.h, bw);
      g.fillStyle(0xffffff);
      g.fillRect(sl.x + bw, sl.y + bw, sl.w - bw * 2, sl.h - bw * 2);

      const sidebarNames = isArtistsTab ? this.libArtists.map(a => a.name) : this.getSidebarNames();
      const selectedIdx = isArtistsTab ? this.selectedArtistIdx : this.selectedPlaylistIdx;

      const slInnerW = sl.w - bw * 2;
      const slTotalRows = Math.max(WMP_SIDEBAR_VISIBLE_ROWS, sidebarNames.length) + 1; // +1 for header
      const slRowH = sl.h / slTotalRows;
      const slListX = sl.x + bw;
      const slHeaderY = sl.y + bw;

      // Header row (gray)
      g.fillStyle(PH_FACE);
      g.fillRect(slListX, slHeaderY, slInnerW, slRowH);
      g.fillStyle(PH_SHADOW);
      g.fillRect(slListX, slHeaderY + slRowH - 1, slInnerW, 1);
      this.sidebarHeaderTextP.setText(isArtistsTab ? 'Artists' : 'Playlists');
      this.sidebarHeaderTextP.setPosition(sl.x + sl.w / 2, slHeaderY + slRowH / 2);
      this.sidebarHeaderTextP.setVisible(true);

      // Sidebar name rows (right-justified, with divider lines)
      const visibleSidebarRows = Math.min(sidebarNames.length, WMP_SIDEBAR_ROW_POOL);
      for (let i = 0; i < visibleSidebarRows; i++) {
        const rowY = slHeaderY + slRowH * (i + 1);
        const isSelected = i === selectedIdx;
        const isEditing = !isArtistsTab && i === this.editingPlaylistIdx;
        const isCustom = !isArtistsTab && i >= WMP_PLAYLIST_NAMES.length;

        if (isSelected) {
          g.fillStyle(PH_TITLE);
          g.fillRect(slListX, rowY, slInnerW, slRowH);
        }

        // Divider line between rows
        if (i > 0 && !isSelected) {
          g.fillStyle(PH_SHADOW, 0.3);
          g.fillRect(slListX, rowY, slInnerW, 1);
        }

        if (!isEditing && i < this.sidebarTextsP.length) {
          this.sidebarTextsP[i].setText(sidebarNames[i]);
          this.sidebarTextsP[i].setPosition(slListX + slInnerW - padX, rowY + slRowH / 2);
          this.sidebarTextsP[i].setColor(isSelected ? '#ffffff' : '#000000');
          this.sidebarTextsP[i].setFontStyle(isSelected ? 'bold' : isCustom ? 'italic' : '');
          this.sidebarTextsP[i].setVisible(true);
        } else if (i < this.sidebarTextsP.length) {
          this.sidebarTextsP[i].setVisible(false);  // hide while editing inline
        }
      }
      // Hide unused pool texts beyond visible rows
      for (let i = visibleSidebarRows; i < WMP_SIDEBAR_ROW_POOL; i++) {
        if (i < this.sidebarTextsP.length) this.sidebarTextsP[i].setVisible(false);
      }

      // Plus button (raised, below sunken list) — only on Playlists tab
      if (!isArtistsTab) {
        const pb = this.toGame(this.sidebarPlusBtn, or, sx, sy);
        this.drawRaised(pb.x, pb.y, pb.w, pb.h, bwThin);
        this.sidebarPlusBtnTextP.setPosition(pb.cx, pb.cy);
        this.sidebarPlusBtnTextP.setVisible(true);
      } else {
        this.sidebarPlusBtnTextP.setVisible(false);
      }
    } else {
      this.sidebarHeaderTextP.setVisible(false);
      for (const t of this.sidebarTextsP) t.setVisible(false);
      this.sidebarPlusBtnTextP.setVisible(false);
    }

    // Bottom status bar (sunken)
    const bb = this.toGame(this.bottomBarEl, or, sx, sy);
    this.drawSunken(bb.x, bb.y, bb.w, bb.h, bwThin);
    g.fillStyle(PH_FACE);
    g.fillRect(bb.x + bwThin, bb.y + bwThin, bb.w - bwThin * 2, bb.h - bwThin * 2);
    this.bottomTextP.setPosition(bb.x + 4 * sx, bb.cy);

    // ── Sign-in popup (drawn on top of everything when open) ──
    if (this.signInOpen) {
      // Semi-transparent backdrop over entire WMP window
      const w = this.toGame(this.win, or, sx, sy);
      g.fillStyle(PH_BLACK, WMP_SIGNIN_BACKDROP_ALPHA);
      g.fillRect(w.x, w.y, w.w, w.h);

      // Sign-in window (raised)
      const si = this.toGame(this.signInWin, or, sx, sy);
      this.drawRaised(si.x, si.y, si.w, si.h, bw);

      // Title bar (blue)
      const siTb = this.toGame(this.signInWin.children[0] as HTMLElement, or, sx, sy);
      g.fillStyle(PH_TITLE);
      g.fillRect(siTb.x, siTb.y, siTb.w, siTb.h);
      this.signInTitleTextP.setPosition(siTb.x + 4 * sx, siTb.cy);
      this.signInTitleTextP.setVisible(true);

      // Close button (raised)
      const siClose = this.toGame(this.signInCloseBtn, or, sx, sy);
      this.drawRaised(siClose.x, siClose.y, siClose.w, siClose.h, bwThin);
      this.signInCloseBtnTextP.setPosition(siClose.cx, siClose.cy);
      this.signInCloseBtnTextP.setVisible(true);

      // Body background (face color, already drawn by drawRaised)

      // Label text
      const siBody = this.toGame(this.signInWin.children[1] as HTMLElement, or, sx, sy);
      this.signInLabelP.setPosition(siBody.x + siBody.w / 2, siBody.y + siBody.h * 0.35);
      this.signInLabelP.setVisible(true);

      // Spotify button (green raised)
      const siBtn = this.toGame(this.signInBtn, or, sx, sy);
      // Green fill
      g.fillStyle(PH_SPOTIFY_GREEN);
      g.fillRect(siBtn.x, siBtn.y, siBtn.w, siBtn.h);
      // Raised border on top of green
      g.fillStyle(PH_HIGHLIGHT);
      g.fillRect(siBtn.x, siBtn.y, siBtn.w, bwThin);       // top
      g.fillRect(siBtn.x, siBtn.y, bwThin, siBtn.h);       // left
      g.fillStyle(PH_SHADOW);
      g.fillRect(siBtn.x, siBtn.y + siBtn.h - bwThin, siBtn.w, bwThin); // bottom
      g.fillRect(siBtn.x + siBtn.w - bwThin, siBtn.y, bwThin, siBtn.h); // right
      this.signInBtnTextP.setPosition(siBtn.cx, siBtn.cy);
      this.signInBtnTextP.setVisible(true);
    } else {
      this.signInTitleTextP.setVisible(false);
      this.signInLabelP.setVisible(false);
      this.signInBtnTextP.setVisible(false);
      this.signInCloseBtnTextP.setVisible(false);
    }

    // ── Context menu (Win95 dropdown) ──
    if (this.ctxMenuOpen && this.ctxMenuItems.length > 0) {
      const cm = this.toGame(this.ctxMenuEl, or, sx, sy);
      const stk = WMP_CTX_STROKE_W * sx;
      // Purple fill + thin raised border
      g.fillStyle(PH_TITLE);
      g.fillRect(cm.x, cm.y, cm.w, cm.h);
      // Render items
      for (let i = 0; i < WMP_CTX_MAX_ITEMS; i++) {
        const txt = this.ctxTextsP[i];
        if (i >= this.ctxMenuItems.length) { txt.setVisible(false); continue; }
        const item = this.ctxMenuItems[i];
        const el = this.ctxItemEls[i];
        if (el.style.display === 'none') { txt.setVisible(false); continue; }
        const ir = this.toGame(el, or, sx, sy);
        if (item.isSeparator) {
          // Separator line — lighter purple
          const sepY = ir.y + ir.h / 2;
          g.fillStyle(0xc080c0);
          g.fillRect(ir.x + 2 * sx, sepY, ir.w - 4 * sx, bwThin);
          txt.setVisible(false);
        } else {
          const clicked = i === this.ctxClickIdx;
          const hovered = i === this.ctxHoverIdx && !clicked;
          if (clicked) {
            // Click flash — black bg, white text
            g.fillStyle(0x000000);
            g.fillRect(ir.x, ir.y, ir.w, ir.h);
            txt.setColor('#ffffff');
          } else if (hovered) {
            // Hover — white bg, purple stroke, purple text
            g.fillStyle(0xffffff);
            g.fillRect(ir.x, ir.y, ir.w, ir.h);
            g.lineStyle(stk, PH_TITLE, 1);
            g.strokeRect(ir.x, ir.y, ir.w, ir.h);
            txt.setColor('#800080');
          } else {
            // Normal — purple bg, white text (already filled)
            txt.setColor('#ffffff');
          }
          txt.setText(item.label);
          txt.setPosition(ir.x + WMP_CTX_PAD_H * sx, ir.cy);
          txt.setVisible(true);
        }
      }
      // Submenu rendering
      if (this.ctxSubmenuEl.style.display !== 'none' && this.ctxSubmenuItems.length > 0) {
        const sm = this.toGame(this.ctxSubmenuEl, or, sx, sy);
        g.fillStyle(PH_TITLE);
        g.fillRect(sm.x, sm.y, sm.w, sm.h);
        for (let i = 0; i < WMP_CTX_SUBMENU_MAX; i++) {
          const txt = this.ctxSubTextsP[i];
          if (i >= this.ctxSubmenuItems.length) { txt.setVisible(false); continue; }
          const subItem = this.ctxSubmenuItems[i];
          const el = this.ctxSubItemEls[i];
          if (el.style.display === 'none') { txt.setVisible(false); continue; }
          const ir = this.toGame(el, or, sx, sy);
          const clicked = i === this.ctxSubClickIdx;
          const hovered = i === this.ctxSubHoverIdx && !clicked;
          if (clicked) {
            g.fillStyle(0x000000);
            g.fillRect(ir.x, ir.y, ir.w, ir.h);
            txt.setColor('#ffffff');
          } else if (hovered) {
            g.fillStyle(0xffffff);
            g.fillRect(ir.x, ir.y, ir.w, ir.h);
            g.lineStyle(stk, PH_TITLE, 1);
            g.strokeRect(ir.x, ir.y, ir.w, ir.h);
            txt.setColor('#800080');
          } else {
            txt.setColor('#ffffff');
          }
          txt.setText(subItem.label);
          txt.setPosition(ir.x + WMP_CTX_PAD_H * sx, ir.cy);
          txt.setVisible(true);
        }
      } else {
        for (const t of this.ctxSubTextsP) t.setVisible(false);
      }
    } else {
      for (const t of this.ctxTextsP) t.setVisible(false);
      for (const t of this.ctxSubTextsP) t.setVisible(false);
    }

    // Update font sizes when scale changes (per-group multipliers)
    const baseSize = Math.max(1, Math.round(11 * sx));
    if (baseSize !== this.lastFontSize) {
      this.lastFontSize = baseSize;
      const s = (base: number, mult: number) => Math.max(1, Math.round(base * sx * mult));
      this.titleTextP.setFontSize(s(12, WMP_TEXT_TITLE_MULT));
      for (const t of this.winBtnTextsP) t.setFontSize(s(11, WMP_TEXT_WINBTN_MULT));
      this.statusTextP.setFontSize(s(11, WMP_TEXT_STATUS_MULT));
      this.tLeftP.setFontSize(s(11, WMP_TEXT_TIME_MULT));
      this.tRightP.setFontSize(s(11, WMP_TEXT_TIME_MULT));
      for (const t of this.transportTextsP) t.setFontSize(s(11, WMP_TEXT_TRANSPORT_MULT));
      this.volIconP.setFontSize(s(11, WMP_TEXT_VOL_MULT));
      this.bottomTextP.setFontSize(s(11, WMP_TEXT_BOTTOM_MULT));
      for (const t of this.tabTextsP) t.setFontSize(s(WMP_TAB_FONT, WMP_TEXT_TAB_MULT));
      for (const t of this.colHeaderTextsP) t.setFontSize(s(11, WMP_TEXT_LIB_HEADER_MULT));
      for (const t of this.colCellTextsP) t.setFontSize(s(11, WMP_TEXT_LIB_ROW_MULT));
      this.sidebarHeaderTextP.setFontSize(s(11, WMP_TEXT_SIDEBAR_MULT));
      for (const t of this.sidebarTextsP) t.setFontSize(s(11, WMP_TEXT_SIDEBAR_MULT));
      this.sidebarPlusBtnTextP.setFontSize(s(11, WMP_TEXT_SIDEBAR_PLUS_MULT));
      this.infoTitleP.setFontSize(s(TUNING.WMP_INFO_TITLE_FONT, WMP_TEXT_INFO_TITLE_MULT));
      this.infoArtistP.setFontSize(s(TUNING.WMP_INFO_ARTIST_FONT, WMP_TEXT_INFO_ARTIST_MULT));
      this.infoSpotifyBtnP.setFontSize(s(TUNING.WMP_INFO_BTN_FONT, WMP_TEXT_INFO_BTN_MULT));
      this.signInTitleTextP.setFontSize(s(12, WMP_TEXT_SIGNIN_TITLE_MULT));
      this.signInLabelP.setFontSize(s(11, WMP_TEXT_SIGNIN_LABEL_MULT));
      this.signInBtnTextP.setFontSize(s(11, WMP_TEXT_SIGNIN_BTN_MULT));
      this.signInCloseBtnTextP.setFontSize(s(11, WMP_TEXT_WINBTN_MULT));
      for (const t of this.ctxTextsP) t.setFontSize(s(WMP_CTX_FONT, WMP_TEXT_CTX_MULT));
      for (const t of this.ctxSubTextsP) t.setFontSize(s(WMP_CTX_FONT, WMP_TEXT_CTX_MULT));
    }
  }

  private setPhaserVisible(vis: boolean): void {
    for (const obj of this.phaserAll) (obj as any).setVisible(vis);
  }

  // ─── Global listeners ──────────────────────────────────────
  private onMouseMove = (e: MouseEvent): void => {
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    if (this.dragging) {
      this.win.style.left = (this.oL + e.clientX - this.dX) + 'px';
      this.win.style.top = (this.oT + e.clientY - this.dY) + 'px';
    }
    if (this.seeking) this.handleSeek(e);
    if (this.volDragging) this.handleVolume(e);
    if (this.colResizeDrag) this.handleColResize(e);
    if (this.colReorderDrag) this.colReorderDrag.lastClientX = e.clientX;
    if (this.splitDragging) this.handleSplitDrag(e);
    if (this.sbDragging) this.handleScrollbarDrag(e);
    if (this.resizing) this.handleResize(e);
  };

  private onMouseUp = (): void => {
    if (this.dragging) this.titleBar.style.cursor = 'grab';
    this.dragging = false;
    this.seeking = false;
    this.volDragging = false;
    this.splitDragging = false;
    this.sbDragging = false;
    this.resizing = false;
    if (this.colResizeDrag) this.colResizeDrag = null;
    if (this.colReorderDrag) this.finishColReorder();
  };

  private bindGlobal(): void {
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  // ─── Seek / Volume handlers ────────────────────────────────
  private handleSeek(e: MouseEvent): void {
    const rect = this.progGroove.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const frac = rect.width > 0 ? x / rect.width : 0;
    this.progFill.style.width = `${frac * 100}%`;
    this.progMarker.style.left = `${frac * 100}%`;
    const pos = this.cb.getPosition();
    if (pos.duration > 0) this.cb.seekTo(frac * pos.duration);
  }

  private handleVolume(e: MouseEvent): void {
    const rect = this.volGroove.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const frac = rect.width > 0 ? x / rect.width : 0;
    this.volFill.style.width = `${frac * 100}%`;
    this.volMarker.style.left = `${frac * 100}%`;
    this.cb.setVolume(frac);
  }

  // ─── Update loop ───────────────────────────────────────────
  private tick = (): void => {
    if (!this.isOpen) return;

    // Sync progress bar (skip while user is dragging)
    if (!this.seeking) {
      const pos = this.cb.getPosition();
      const frac = pos.duration > 0 ? pos.current / pos.duration : 0;
      this.progFill.style.width = `${frac * 100}%`;
      this.progMarker.style.left = `${frac * 100}%`;
      this.tLeft.textContent = formatTime(pos.current);
      this.tRight.textContent = formatTime(pos.duration);
    }
    this.statusEl.textContent = '';

    // Sync track info panel from callbacks (works for auto-played and manually selected tracks)
    const title = this.cb.getTrackTitle();
    const artist = this.cb.getTrackArtist();
    const spotifyUrl = this.cb.getSpotifyUrl();
    this.infoTitleEl.textContent = title || '\u00A0';
    this.infoArtistEl.textContent = artist || '\u00A0';
    this.infoTitleP.setText(title);
    this.infoArtistP.setText(artist);
    const hasSpotify = !!spotifyUrl;
    const hasTrack = !!this.playingTrackId;
    this.infoHeartBtn.style.display = hasTrack ? '' : 'none';
    this.infoSpotifyBtn.style.display = hasSpotify ? '' : 'none';
    this.infoSpotifyBtnP.setVisible(hasSpotify);
    this.infoSpotifyLogoP.setVisible(hasSpotify);

    // Update bottom bar source indicator
    if (this.libLoaded && this.libTracks.length > 0) this.updateBottomBar();

    // Sync iframe position with videoBox (follows drag / maximize)
    this.syncIframePosition();

    // Sync Phaser visuals to HTML positions
    this.syncPhaser();

    // Sync Phaser text content from HTML
    this.tLeftP.setText(this.tLeft.textContent || '0:00');
    this.tRightP.setText(this.tRight.textContent || '0:00');
    this.bottomTextP.setText(this.bottomBarEl.textContent || 'Ready');

    const now = performance.now() / 1000;
    const dt = this.lastTickTime > 0 ? Math.min(now - this.lastTickTime, 0.1) : 0;
    this.lastTickTime = now;

    // Heart bounce animation (~300ms total)
    if (this.heartBounceTrackId && this.heartBounceT < 1) {
      this.heartBounceT = Math.min(1, this.heartBounceT + dt * 3.3);
    }

    // Tab transition animation — lerp each tab's fraction toward target
    for (let i = 0; i < this.tabAnimFrac.length; i++) {
      const target = i === this.activeTab ? 1 : 0;
      const diff = target - this.tabAnimFrac[i];
      if (Math.abs(diff) < 0.001) {
        this.tabAnimFrac[i] = target;
      } else {
        this.tabAnimFrac[i] += diff * Math.min(1, WMP_TAB_ANIM_SPEED * dt);
      }
    }

    // Toggle sidebar visibility based on active tab + reset scroll on tab/playlist/artist change
    const showSidebar = this.activeTab === 2 || this.activeTab === 0;
    this.playlistSidebar.style.display = showSidebar ? 'flex' : 'none';
    this.sidebarPlusBtn.style.display = this.activeTab === 0 ? 'none' : '';
    if (this.activeTab !== this.prevActiveTab) {
      this.prevActiveTab = this.activeTab;
      this.libScrollPx = 0; this.libScrollTarget = 0;
      this.sortKey = null; this.sortAsc = true;
    }
    if (this.selectedPlaylistIdx !== this.prevSelectedPlaylistIdx) {
      this.prevSelectedPlaylistIdx = this.selectedPlaylistIdx;
      this.libScrollPx = 0; this.libScrollTarget = 0;
    }
    if (this.selectedArtistIdx !== this.prevSelectedArtistIdx) {
      this.prevSelectedArtistIdx = this.selectedArtistIdx;
      this.libScrollPx = 0; this.libScrollTarget = 0;
      this.sortKey = null; this.sortAsc = true;
    }

    // Smooth scroll lerp
    const scrollDiff = this.libScrollTarget - this.libScrollPx;
    if (Math.abs(scrollDiff) < WMP_SCROLL_SNAP) {
      this.libScrollPx = this.libScrollTarget;
    } else {
      this.libScrollPx += scrollDiff * WMP_SCROLL_LERP;
    }

    // Decay scroll velocity back to 1 when not actively scrolling
    if (this.scrollVelocity > 1) {
      this.scrollVelocity = 1 + (this.scrollVelocity - 1) * WMP_SCROLL_DECEL;
      if (this.scrollVelocity < 1.01) this.scrollVelocity = 1;
    }

    // Sync sidebar row visibility — show exactly slTotalRows-1 rows so flex heights match Phaser
    if (showSidebar) {
      const sideNames = this.activeTab === 0 ? this.libArtists.map(a => a.name) : this.getSidebarNames();
      const visibleSlots = Math.max(WMP_SIDEBAR_VISIBLE_ROWS, sideNames.length);
      for (let i = 0; i < WMP_SIDEBAR_ROW_POOL; i++) {
        this.sidebarRowEls[i].style.display = i < visibleSlots ? 'flex' : 'none';
      }
    }

    // Cell hover-scroll animation
    if (this.cellScrollPhase !== 'idle' && this.cellScrollMax > 0) {
      this.cellScrollTimer += dt;
      const pause = TUNING.WMP_CELL_SCROLL_PAUSE;
      if (this.cellScrollPhase === 'pause_start') {
        if (this.cellScrollTimer >= pause) {
          this.cellScrollPhase = 'scrolling';
          this.cellScrollTimer = 0;
        }
      } else if (this.cellScrollPhase === 'scrolling') {
        this.cellScrollOffset += TUNING.WMP_CELL_SCROLL_SPEED * dt;
        if (this.cellScrollOffset >= this.cellScrollMax) {
          this.cellScrollOffset = this.cellScrollMax;
          this.cellScrollPhase = 'pause_end';
          this.cellScrollTimer = 0;
        }
      } else if (this.cellScrollPhase === 'pause_end') {
        if (this.cellScrollTimer >= pause) {
          this.cellScrollOffset = 0;
          this.cellScrollPhase = 'pause_start';
          this.cellScrollTimer = 0;
        }
      }
    }

    this.updateRAF = requestAnimationFrame(this.tick);
  };

  // ─── Video/Library split ──────────────────────────────────
  /** Calculate how many data rows fit in the current library list height. */
  private getVisibleRowCount(): number {
    const listRect = this.libraryList.getBoundingClientRect();
    const available = listRect.height - WMP_HEADER_H_CSS; // subtract header
    return Math.max(1, Math.floor(available / TUNING.WMP_LIB_ROW_H));
  }

  /** Apply wheel scroll with momentum — rapid scrolling builds velocity after threshold. */
  private applyWheelScroll(deltaY: number): void {
    const now = performance.now();
    if (now - this.lastWheelTime < WMP_SCROLL_ACCEL_WINDOW) {
      this.rapidTickCount++;
      if (this.rapidTickCount > WMP_SCROLL_ACCEL_AFTER) {
        this.scrollVelocity = Math.min(WMP_SCROLL_ACCEL_MAX, this.scrollVelocity + WMP_SCROLL_ACCEL_STEP);
      }
    } else {
      this.rapidTickCount = 1;
      this.scrollVelocity = 1;
    }
    this.lastWheelTime = now;
    const delta = (deltaY > 0 ? WMP_SCROLL_PX : -WMP_SCROLL_PX) * this.scrollVelocity;
    this.libScrollTarget += delta;
    this.clampScrollTarget();
  }

  /** Clamp scroll target to valid range (all values in CSS px). */
  private clampScrollTarget(): void {
    const totalH = this.getDisplayTracks().length * TUNING.WMP_LIB_ROW_H;
    const listRect = this.libraryList.getBoundingClientRect();
    const viewH = listRect.height - WMP_HEADER_H_CSS;
    const maxScroll = Math.max(0, totalH - viewH);
    this.libScrollTarget = Math.max(0, Math.min(maxScroll, this.libScrollTarget));
  }

  /** Recalculate video box dimensions from split fraction. */
  private updateVideoSize(): void {
    const splitRect = this.contentSplit.getBoundingClientRect();
    if (splitRect.width === 0 || splitRect.height === 0) return;
    const divH = TUNING.WMP_DIVIDER_H;
    const availH = splitRect.height * this.splitVideoFrac - divH / 2;
    const maxW = splitRect.width * TUNING.WMP_VIDEO_MAX_W_FRAC;

    // Use 1:1 for album art fallback, 16:9 for video
    const aspect = this.videoActive ? 16 / 9 : 1;
    let videoW = availH * aspect;
    let videoH = availH;
    if (videoW > maxW) {
      videoW = maxW;
      videoH = maxW / aspect;
    }
    videoW = Math.max(0, videoW);
    videoH = Math.max(0, videoH);

    Object.assign(this.videoBox.style, {
      width: `${videoW}px`,
      height: `${videoH}px`,
    });
    // Top section height matches video so info panel fills alongside
    this.topSection.style.height = `${videoH}px`;
  }

  /** Handle vertical split divider drag. */
  private handleSplitDrag(e: MouseEvent): void {
    const splitRect = this.contentSplit.getBoundingClientRect();
    if (splitRect.height === 0) return;
    const deltaFrac = (e.clientY - this.splitDragStartY) / splitRect.height;
    this.splitVideoFrac = Math.max(
      TUNING.WMP_SPLIT_VIDEO_MIN,
      Math.min(TUNING.WMP_SPLIT_VIDEO_MAX, this.splitDragStartFrac + deltaFrac),
    );
    this.updateVideoSize();
  }

  /** Handle scrollbar thumb drag — maps vertical mouse delta to scroll position. */
  private handleScrollbarDrag(e: MouseEvent): void {
    const listRect = this.libraryList.getBoundingClientRect();
    if (listRect.height === 0) return;
    const totalH = this.getDisplayTracks().length * TUNING.WMP_LIB_ROW_H;
    const viewH = listRect.height - WMP_HEADER_H_CSS;
    const maxScroll = Math.max(0, totalH - viewH);
    if (maxScroll <= 0) return;
    // The scrollbar track height = data area (below header).
    const trackH = listRect.height - WMP_HEADER_H_CSS;
    const thumbFrac = Math.min(1, viewH / totalH);
    const thumbH = Math.max(WMP_SCROLLBAR_MIN_THUMB, thumbFrac * trackH);
    const scrollableTrackH = trackH - thumbH;
    if (scrollableTrackH <= 0) return;
    const deltaY = e.clientY - this.sbDragStartY;
    const deltaFrac = deltaY / scrollableTrackH;
    const newFrac = Math.max(0, Math.min(1, this.sbDragStartScrollFrac + deltaFrac));
    this.libScrollTarget = newFrac * maxScroll;
    this.clampScrollTarget();
  }

  /** Handle window edge/corner resize drag. */
  private handleResize(e: MouseEvent): void {
    const dx = e.clientX - this.resizeStartX;
    const dy = e.clientY - this.resizeStartY;
    const r = this.resizeStartRect;
    const minW = TUNING.WMP_MIN_W;
    const minH = TUNING.WMP_MIN_H;
    const edge = this.resizeEdge;

    let newLeft = r.left;
    let newTop = r.top;
    let newWidth = r.width;
    let newSplitH = this.resizeStartSplitH;

    // Horizontal resize
    if (edge.includes('e')) {
      newWidth = Math.max(minW, r.width + dx);
    } else if (edge.includes('w')) {
      const maxDx = r.width - minW;
      const clampedDx = Math.min(dx, maxDx);
      newWidth = r.width - clampedDx;
      newLeft = r.left + clampedDx;
    }

    // Vertical resize — adjusts contentSplit height
    if (edge.includes('s')) {
      const deltaH = dy;
      newSplitH = Math.max(minH - (r.height - this.resizeStartSplitH), this.resizeStartSplitH + deltaH);
    } else if (edge.includes('n')) {
      const maxDy = this.resizeStartSplitH - (minH - (r.height - this.resizeStartSplitH));
      const clampedDy = Math.min(dy, maxDy);
      newSplitH = this.resizeStartSplitH - clampedDy;
      newTop = r.top + clampedDy;
    }

    // Apply
    this.win.style.left = newLeft + 'px';
    this.win.style.top = newTop + 'px';
    this.win.style.width = newWidth + 'px';
    this.currentSplitH = newSplitH;
    this.contentSplit.style.height = newSplitH + 'px';
    this.updateVideoSize();
  }

  // ─── Open / Close / Minimize / Maximize ────────────────────
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.win.style.transition = 'none';
    this.win.style.transform = 'none';
    this.win.style.opacity = '1';
    this.win.style.display = 'flex';

    // Size video area from split fraction
    this.updateVideoSize();

    // Center window vertically on screen
    const winH = this.win.offsetHeight;
    const overlayH = this.overlay.offsetHeight || window.innerHeight;
    const centeredTop = Math.max(0, (overlayH - winH) / 2);
    this.win.style.top = centeredTop + 'px';

    // Position YT iframe over the video box (stays in body — never moved)
    this.showIframe();

    // Sync initial volume
    const vol = this.cb.getVolume();
    this.volFill.style.width = `${vol * 100}%`;
    this.volMarker.style.left = `${vol * 100}%`;

    // Load library if not already loaded
    if (!this.libLoaded) this.loadLibrary();

    // Position Phaser objects BEFORE making visible (prevents white text flash at 0,0)
    this.syncPhaser();
    this.setPhaserVisible(true);
    this.updateRAF = requestAnimationFrame(this.tick);
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.isFullscreen) this.exitFullscreen();
    this.isOpen = false;
    this.hideSignInPopup();
    this.win.style.display = 'none';
    this.hideIframe();
    this.setPhaserVisible(false);
    this.cb.onWMPClose();
    if (this.updateRAF) { cancelAnimationFrame(this.updateRAF); this.updateRAF = 0; }
  }


  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private enterFullscreen(): void {
    if (this.isFullscreen || this.fsAnimating) return;
    this.isFullscreen = true;
    this.fsAnimating = true;

    // Swap icon to windowed/restore
    this.winBtns[0].textContent = '⧉';
    this.winBtnTextsP[0].setText('⧉');

    // Save current window rect so we can restore on exit
    const s = this.win.style;
    this.preFsRect = { left: s.left, top: s.top, width: s.width, height: s.height || '' };
    this.preFsSplitH = this.currentSplitH;

    // Animate win to fill the overlay (viewport)
    s.transition = `left ${WMP_FS_ANIM_MS}ms ease, top ${WMP_FS_ANIM_MS}ms ease, width ${WMP_FS_ANIM_MS}ms ease, height ${WMP_FS_ANIM_MS}ms ease`;
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';

    // ContentSplit fills remaining vertical space
    this.contentSplit.style.flex = '1';
    this.contentSplit.style.height = 'auto';

    // Update video + iframe continuously during the transition
    const start = performance.now();
    const animFrame = () => {
      this.updateVideoSize();
      this.syncIframePosition();
      if (performance.now() - start < WMP_FS_ANIM_MS) {
        requestAnimationFrame(animFrame);
      } else {
        this.fsAnimating = false;
        s.transition = 'none';
      }
    };
    requestAnimationFrame(animFrame);
  }

  private exitFullscreen(): void {
    if (!this.isFullscreen || this.fsAnimating) return;
    this.isFullscreen = false;
    this.fsAnimating = true;

    // Swap icon back to fullscreen
    this.winBtns[0].textContent = '□';
    this.winBtnTextsP[0].setText('□');

    // Animate win back to saved rect
    const s = this.win.style;
    s.transition = `left ${WMP_FS_ANIM_MS}ms ease, top ${WMP_FS_ANIM_MS}ms ease, width ${WMP_FS_ANIM_MS}ms ease, height ${WMP_FS_ANIM_MS}ms ease`;
    s.left = this.preFsRect.left;
    s.top = this.preFsRect.top;
    s.width = this.preFsRect.width;
    s.height = this.preFsRect.height;

    // Restore contentSplit to fixed height
    this.currentSplitH = this.preFsSplitH;
    this.contentSplit.style.flex = '';
    this.contentSplit.style.height = `${this.preFsSplitH}px`;

    // Update video + iframe continuously during the transition
    const start = performance.now();
    const animFrame = () => {
      this.updateVideoSize();
      this.syncIframePosition();
      if (performance.now() - start < WMP_FS_ANIM_MS) {
        requestAnimationFrame(animFrame);
      } else {
        this.fsAnimating = false;
        s.transition = 'none';
      }
    };
    requestAnimationFrame(animFrame);
  }

  // ─── YT element management (never moves DOM parent — uses fixed positioning) ──
  private showIframe(): void {
    if (!this.videoActive) return;
    const ytEl = this.cb.getYTElement();
    if (!ytEl) return;
    this.syncIframePosition();
    Object.assign(ytEl.style, {
      pointerEvents: 'none',
      border: 'none',
      overflow: 'hidden',
      zIndex: '9999',
      filter: 'brightness(1.4) saturate(1.1)',
    });
  }

  private hideIframe(): void {
    const ytEl = this.cb.getYTElement();
    if (!ytEl) return;
    Object.assign(ytEl.style, {
      position: 'fixed',
      width: '1px', height: '1px',
      bottom: '0', right: '0',
      top: 'auto', left: 'auto',
      overflow: 'hidden', border: 'none',
      filter: 'none', zIndex: '0',
    });
    ytEl.setAttribute('width', '1');
    ytEl.setAttribute('height', '1');
  }

  private syncIframePosition(): void {
    if (!this.videoActive) return;
    const ytEl = this.cb.getYTElement();
    if (!ytEl) return;
    const vr = this.videoBox.getBoundingClientRect();
    Object.assign(ytEl.style, {
      position: 'fixed',
      left: `${vr.left}px`,
      top: `${vr.top}px`,
      width: `${vr.width}px`,
      height: `${vr.height}px`,
      bottom: 'auto', right: 'auto',
    });
    ytEl.setAttribute('width', String(Math.round(vr.width)));
    ytEl.setAttribute('height', String(Math.round(vr.height)));
  }

  // ─── Public getters / z-ordering ────────────────────────────
  isCursorOver(): boolean { return this.cursorOver && this.isOpen; }
  getIsOpen(): boolean { return this.isOpen; }

  /** True when cursor is over the active YouTube iframe (HTML above canvas). */
  isCursorOverIframe(): boolean {
    if (!this.isOpen || !this.videoActive || !this.cursorOver) return false;
    const r = this.videoBox.getBoundingClientRect();
    return this.lastMouseX >= r.left && this.lastMouseX <= r.right &&
           this.lastMouseY >= r.top && this.lastMouseY <= r.bottom;
  }

  /** Tell WMP whether a YouTube video is actively playing (controls iframe visibility). */
  setVideoActive(active: boolean): void {
    this.videoActive = active;
    if (!active) {
      this.hideIframe();
    } else if (this.isOpen) {
      this.hideAlbumFallback();
      this.showIframe();
      this.updateVideoSize();  // switch back to 16:9 aspect ratio
    }
  }

  /** Show album art scaled to fill frame vertically, centered on black background. */
  showAlbumFallback(url: string): void {
    this.hideIframe();
    this.videoActive = false;
    this.albumFallbackImg.src = url;
    this.albumFallbackImg.style.display = 'block';
    this.updateVideoSize();  // switch to 1:1 aspect ratio
  }

  /** Hide album art fallback. */
  hideAlbumFallback(): void {
    this.albumFallbackImg.style.display = 'none';
  }

  /** Set the currently playing track by Spotify track ID (highlights in library). */
  setPlayingTrack(spotifyTrackId: string | null): void {
    this.playingTrackId = spotifyTrackId;
  }

  /** Check if a track is favorited. */
  isFavorited(spotifyTrackId: string): boolean {
    return this.favoriteTrackIds.has(spotifyTrackId);
  }

  /** Toggle favorite for a track by its Spotify ID (used by external UI like MusicPlayer). */
  toggleFavoriteById(spotifyTrackId: string): void {
    const track = this.libTracks.find(t => t.spotifyTrackId === spotifyTrackId);
    if (track) {
      this.heartBounceTrackId = spotifyTrackId;
      this.heartBounceT = 0;
      this.toggleFavorite(track);
    }
  }

  /** Hide/show iframe when another popup (e.g. profile) needs to be on top. */
  setIframeBehind(behind: boolean): void {
    const ytEl = this.cb.getYTElement();
    if (behind) {
      this.hideIframe();
    } else if (ytEl && this.isOpen && this.videoActive) {
      this.showIframe();
    }
  }

  destroy(): void {
    this.close();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    for (const obj of this.phaserAll) obj.destroy();
    this.phaserAll.length = 0;
    this.dataMask.destroy();
    this.gfxDataMask.destroy();
    if (this.win.parentElement) this.win.remove();
  }
}
