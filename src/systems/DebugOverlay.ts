/**
 * DebugOverlay — Lightweight HTML HUD for mobile debug visibility.
 * Lives outside Phaser, on top of everything (position:fixed, high z-index).
 *
 * Shows when debug is enabled in Settings:
 *   - Small "DBG" pill button always visible (tap to expand/collapse)
 *   - Expanded panel: FPS, debugger state, Send Data button
 *   - CLICKABLE toggle: shows colored rectangles over all interactive areas
 *   - INSPECT button: tap a hitbox to see full metadata + COPY button
 *
 * Debugger states: ready → collecting → compressing → sending → ready
 * (Send infrastructure comes with Deep Mode — for now shows state + placeholder.)
 */

import type { HitboxVisualizer } from './HitboxVisualizer';

export type DebugState = 'ready' | 'collecting' | 'compressing' | 'sending';

export interface BgEffectState {
  name: string;
  active: boolean;
  value?: string;  // optional current value label (e.g. "1.6")
}

// ── Layout ──
const PILL_SIZE = '36px';
const PANEL_PAD = '10px';
const FONT = '12px monospace';
const BG = 'rgba(0,0,0,0.8)';
const BORDER = '1px solid rgba(100,255,100,0.4)';
const Z = '999999';  // above everything including CRT overlay

export class DebugOverlay {
  private pill: HTMLDivElement;       // small always-visible toggle button
  private panel: HTMLDivElement;      // expandable detail panel
  private fpsText: HTMLSpanElement;
  private stateText: HTMLSpanElement;
  private sendBtn: HTMLButtonElement;
  private hitboxBtn: HTMLButtonElement;
  private inspectBtn: HTMLButtonElement;
  private avatarOverlayBtn: HTMLButtonElement;
  private fakeSpotifyBtn: HTMLButtonElement;
  private fakeSpotifyLog: HTMLDivElement;

  // Callback for fake spotify auth (wired by GameScene)
  private _onFakeSpotify: (() => string[]) | null = null;

  // Music debug panel
  private musicBtn: HTMLButtonElement;
  private musicPanel: HTMLDivElement;
  private musicRows: HTMLDivElement[] = [];
  private musicOpen = false;
  private musicRefreshId = 0;
  private _getMusicStates: (() => { name: string; active: boolean; playing: boolean; muted: boolean; volume: number }[]) | null = null;
  private _toggleSourceMute: ((name: string) => void) | null = null;

  // BG Effects debug panel
  private bgEffectsBtn!: HTMLButtonElement;
  private bgEffectsPanel!: HTMLDivElement;
  private bgEffectsOpen = false;
  private bgEffectsRefreshId = 0;
  private _getBgEffectStates: (() => BgEffectState[]) | null = null;
  private _toggleBgEffect: ((idx: number) => void) | null = null;

  // Toggle list panel
  private listPanel: HTMLDivElement;
  private listContent: HTMLDivElement;
  private allOnBtn: HTMLButtonElement;
  private allOffBtn: HTMLButtonElement;
  private listRefreshId = 0;
  private lastListIds = '';           // serialized IDs to avoid unnecessary rebuilds

  private expanded = false;
  private enabled = false;            // controlled by Settings debug toggle
  private _state: DebugState = 'ready';
  private hitboxesOn = false;
  private _hitboxViz: HitboxVisualizer | null = null;
  private avatarOverlayOn = false;
  private _profilePopup: any = null;

  // FPS tracking
  private frames = 0;
  private lastFpsTime = performance.now();
  private currentFps = 0;
  private rafId = 0;

  // Data cache (placeholder for Deep Mode)
  private pendingEntries = 0;

  constructor() {
    // ── Pill button (top-left corner) ──
    this.pill = document.createElement('div');
    Object.assign(this.pill.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      width: PILL_SIZE,
      height: PILL_SIZE,
      borderRadius: '50%',
      background: 'rgba(0,180,0,0.7)',
      border: '2px solid rgba(100,255,100,0.6)',
      color: '#fff',
      fontSize: '10px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      display: 'none',  // hidden until enabled
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: Z,
      userSelect: 'none',
      webkitUserSelect: 'none',
      textAlign: 'center',
      lineHeight: PILL_SIZE,
    });
    this.pill.textContent = 'DBG';
    this.pill.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleExpand();
    });
    document.body.appendChild(this.pill);

    // ── Detail panel ──
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed',
      top: `calc(8px + ${PILL_SIZE} + 6px)`,
      left: '8px',
      padding: PANEL_PAD,
      background: BG,
      border: BORDER,
      borderRadius: '6px',
      color: '#00ff00',
      fontSize: FONT,
      fontFamily: 'monospace',
      display: 'none',
      flexDirection: 'column',
      gap: '6px',
      zIndex: Z,
      minWidth: '160px',
      pointerEvents: 'auto',
    });
    document.body.appendChild(this.panel);

    // FPS row
    const fpsRow = document.createElement('div');
    fpsRow.textContent = 'FPS: ';
    this.fpsText = document.createElement('span');
    this.fpsText.textContent = '--';
    this.fpsText.style.color = '#ffffff';
    fpsRow.appendChild(this.fpsText);
    this.panel.appendChild(fpsRow);

    // State row
    const stateRow = document.createElement('div');
    stateRow.textContent = 'STATE: ';
    this.stateText = document.createElement('span');
    this.stateText.textContent = 'ready';
    this.stateText.style.color = '#88ff88';
    stateRow.appendChild(this.stateText);
    this.panel.appendChild(stateRow);

    // Pending data row
    const pendingRow = document.createElement('div');
    pendingRow.id = 'dbg-pending';
    pendingRow.textContent = 'CACHED: 0 entries';
    pendingRow.style.color = '#888888';
    this.panel.appendChild(pendingRow);

    // Send button
    this.sendBtn = document.createElement('button');
    Object.assign(this.sendBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(0,100,0,0.6)',
      border: '1px solid rgba(100,255,100,0.5)',
      borderRadius: '4px',
      color: '#00ff00',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.sendBtn.textContent = 'SEND DATA';
    this.sendBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.sendData();
    });
    this.panel.appendChild(this.sendBtn);

    // Separator
    const sep = document.createElement('div');
    sep.style.borderTop = '1px solid rgba(100,255,100,0.3)';
    sep.style.marginTop = '4px';
    this.panel.appendChild(sep);

    // Hitbox toggle button
    this.hitboxBtn = document.createElement('button');
    Object.assign(this.hitboxBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(0,60,80,0.6)',
      border: '1px solid rgba(0,200,255,0.5)',
      borderRadius: '4px',
      color: '#00ccff',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.hitboxBtn.textContent = 'CLICKABLE: OFF';
    this.hitboxBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleHitboxes();
    });
    this.panel.appendChild(this.hitboxBtn);

    // Inspect button (hidden until hitboxes are on)
    this.inspectBtn = document.createElement('button');
    Object.assign(this.inspectBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(80,60,0,0.6)',
      border: '1px solid rgba(255,200,0,0.5)',
      borderRadius: '4px',
      color: '#ffcc00',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
      display: 'none',
    });
    this.inspectBtn.textContent = 'INSPECT: OFF';
    this.inspectBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleInspect();
    });
    this.panel.appendChild(this.inspectBtn);

    // Separator before audio debug
    const sep2 = document.createElement('div');
    sep2.style.borderTop = '1px solid rgba(100,255,100,0.3)';
    sep2.style.marginTop = '4px';
    this.panel.appendChild(sep2);

    // Fake Spotify Auth button
    this.fakeSpotifyBtn = document.createElement('button');
    Object.assign(this.fakeSpotifyBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(30,215,96,0.3)',
      border: '1px solid rgba(30,215,96,0.6)',
      borderRadius: '4px',
      color: '#1ed760',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.fakeSpotifyBtn.textContent = 'FAKE SPOTIFY AUTH';
    this.fakeSpotifyBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.runFakeSpotify();
    });
    this.panel.appendChild(this.fakeSpotifyBtn);

    // Log output for fake spotify
    this.fakeSpotifyLog = document.createElement('div');
    Object.assign(this.fakeSpotifyLog.style, {
      display: 'none',
      marginTop: '4px',
      padding: '6px',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(30,215,96,0.3)',
      borderRadius: '4px',
      color: '#aaffaa',
      fontSize: '9px',
      fontFamily: 'monospace',
      lineHeight: '1.4',
      maxHeight: '200px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    });
    this.panel.appendChild(this.fakeSpotifyLog);

    // ── Music debug button (in debug panel) ──
    const sepMusic = document.createElement('div');
    sepMusic.style.borderTop = '1px solid rgba(100,255,100,0.3)';
    sepMusic.style.marginTop = '4px';
    this.panel.appendChild(sepMusic);

    this.musicBtn = document.createElement('button');
    Object.assign(this.musicBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(100,0,180,0.4)',
      border: '1px solid rgba(180,100,255,0.5)',
      borderRadius: '4px',
      color: '#cc88ff',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.musicBtn.textContent = 'MUSIC';
    this.musicBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleMusicPanel();
    });
    this.panel.appendChild(this.musicBtn);

    // Avatar overlay debug toggle
    this.avatarOverlayBtn = document.createElement('button');
    Object.assign(this.avatarOverlayBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(60,0,80,0.6)',
      border: '1px solid rgba(200,68,255,0.5)',
      borderRadius: '4px',
      color: '#cc44ff',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.avatarOverlayBtn.textContent = 'AVATAR: OFF';
    this.avatarOverlayBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleAvatarOverlay();
    });
    this.panel.appendChild(this.avatarOverlayBtn);

    // ── BG Effects button ──
    const sepBg = document.createElement('div');
    sepBg.style.borderTop = '1px solid rgba(100,255,100,0.3)';
    sepBg.style.marginTop = '4px';
    this.panel.appendChild(sepBg);

    this.bgEffectsBtn = document.createElement('button');
    Object.assign(this.bgEffectsBtn.style, {
      marginTop: '4px',
      padding: '6px 12px',
      background: 'rgba(0,80,100,0.4)',
      border: '1px solid rgba(0,200,220,0.5)',
      borderRadius: '4px',
      color: '#00ccdd',
      fontSize: '11px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      cursor: 'pointer',
    });
    this.bgEffectsBtn.textContent = 'BG EFFECTS';
    this.bgEffectsBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleBgEffectsPanel();
    });
    this.panel.appendChild(this.bgEffectsBtn);

    // ── BG Effects floating panel ──
    this.bgEffectsPanel = document.createElement('div');
    Object.assign(this.bgEffectsPanel.style, {
      position: 'fixed',
      top: '200px',
      right: '8px',
      display: 'none',
      flexDirection: 'column',
      gap: '2px',
      padding: '10px',
      background: BG,
      border: '1px solid rgba(0,200,220,0.5)',
      borderRadius: '6px',
      zIndex: Z,
      pointerEvents: 'auto',
      maxWidth: '50vw',
      minWidth: '220px',
    });
    const bgTitle = document.createElement('div');
    Object.assign(bgTitle.style, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      color: '#00ccdd',
      borderBottom: '1px solid rgba(0,200,220,0.3)',
      paddingBottom: '4px',
      marginBottom: '4px',
      letterSpacing: '1px',
    });
    bgTitle.textContent = 'BACKGROUND EFFECTS';
    this.bgEffectsPanel.appendChild(bgTitle);
    document.body.appendChild(this.bgEffectsPanel);

    // ── Music floating panel (standalone, right side of screen) ──
    this.musicPanel = document.createElement('div');
    Object.assign(this.musicPanel.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      display: 'none',
      flexDirection: 'column',
      gap: '4px',
      padding: '10px',
      background: BG,
      border: '1px solid rgba(180,100,255,0.5)',
      borderRadius: '6px',
      zIndex: Z,
      pointerEvents: 'auto',
      maxWidth: '45vw',
      minWidth: '200px',
      maxHeight: 'calc(100vh - 16px)',
      overflowY: 'auto',
    });
    // Title bar for the floating panel
    const musicTitle = document.createElement('div');
    Object.assign(musicTitle.style, {
      fontSize: '13px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      color: '#cc88ff',
      borderBottom: '1px solid rgba(180,100,255,0.3)',
      paddingBottom: '4px',
      marginBottom: '2px',
      letterSpacing: '1px',
    });
    musicTitle.textContent = 'AUDIO SOURCES';
    this.musicPanel.appendChild(musicTitle);
    document.body.appendChild(this.musicPanel);

    // ── Toggle list panel (appears when CLICKABLE is ON) ──
    this.listPanel = document.createElement('div');
    Object.assign(this.listPanel.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '2px',
      marginTop: '6px',
      borderTop: '1px solid rgba(100,255,100,0.3)',
      paddingTop: '6px',
    });

    // ALL OFF / ALL ON buttons
    const bulkRow = document.createElement('div');
    Object.assign(bulkRow.style, {
      display: 'flex', gap: '6px', marginBottom: '4px',
    });

    this.allOffBtn = document.createElement('button');
    Object.assign(this.allOffBtn.style, {
      flex: '1', padding: '4px 6px', background: 'rgba(80,0,0,0.5)',
      border: '1px solid rgba(255,100,100,0.5)', borderRadius: '3px',
      color: '#ff6666', fontSize: '10px', fontFamily: 'monospace',
      fontWeight: 'bold', cursor: 'pointer',
    });
    this.allOffBtn.textContent = 'ALL OFF';
    this.allOffBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._hitboxViz?.setAllDisabled(true);
      this.refreshList();
    });

    this.allOnBtn = document.createElement('button');
    Object.assign(this.allOnBtn.style, {
      flex: '1', padding: '4px 6px', background: 'rgba(0,80,0,0.5)',
      border: '1px solid rgba(100,255,100,0.5)', borderRadius: '3px',
      color: '#66ff66', fontSize: '10px', fontFamily: 'monospace',
      fontWeight: 'bold', cursor: 'pointer',
    });
    this.allOnBtn.textContent = 'ALL ON';
    this.allOnBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._hitboxViz?.setAllDisabled(false);
      this.refreshList();
    });

    bulkRow.appendChild(this.allOffBtn);
    bulkRow.appendChild(this.allOnBtn);
    this.listPanel.appendChild(bulkRow);

    // Scrollable list container
    this.listContent = document.createElement('div');
    Object.assign(this.listContent.style, {
      maxHeight: '200px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
    });
    this.listPanel.appendChild(this.listContent);
    this.panel.appendChild(this.listPanel);
  }

  /* ============ Public API ============ */

  /** Enable/disable the overlay. Called by Settings debug toggle. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.pill.style.display = 'flex';
      this.startFpsLoop();
    } else {
      this.pill.style.display = 'none';
      this.panel.style.display = 'none';
      this.expanded = false;
      this.stopFpsLoop();
      // Turn off hitboxes when debug is disabled
      if (this.hitboxesOn) {
        this.hitboxesOn = false;
        this._hitboxViz?.disable();
        this.hitboxBtn.textContent = 'CLICKABLE: OFF';
        this.hitboxBtn.style.color = '#00ccff';
        this.inspectBtn.style.display = 'none';
        this.listPanel.style.display = 'none';
        this.stopListRefresh();
      }
      // Turn off BG effects panel
      if (this.bgEffectsOpen) {
        this.bgEffectsOpen = false;
        this.bgEffectsPanel.style.display = 'none';
        this.bgEffectsBtn.textContent = 'BG EFFECTS';
        this.bgEffectsBtn.style.color = '#00ccdd';
        if (this.bgEffectsRefreshId) { clearInterval(this.bgEffectsRefreshId); this.bgEffectsRefreshId = 0; }
      }
      // Turn off music panel
      if (this.musicOpen) {
        this.musicOpen = false;
        this.musicPanel.style.display = 'none';
        this.musicBtn.textContent = 'MUSIC';
        this.musicBtn.style.color = '#cc88ff';
        if (this.musicRefreshId) { clearInterval(this.musicRefreshId); this.musicRefreshId = 0; }
      }
    }
  }

  /** Get current enabled state. */
  isEnabled(): boolean { return this.enabled; }

  /** Set the debugger state (shown in overlay). */
  setState(state: DebugState): void {
    this._state = state;
    this.stateText.textContent = state;
    // Color code by state
    const colors: Record<DebugState, string> = {
      ready: '#88ff88',
      collecting: '#ffff00',
      compressing: '#ff8800',
      sending: '#00aaff',
    };
    this.stateText.style.color = colors[state];
    // Pill color matches state
    const pillBg: Record<DebugState, string> = {
      ready: 'rgba(0,180,0,0.7)',
      collecting: 'rgba(180,180,0,0.7)',
      compressing: 'rgba(180,100,0,0.7)',
      sending: 'rgba(0,100,200,0.7)',
    };
    this.pill.style.background = pillBg[state];
  }

  /** Update pending entry count. */
  setPendingCount(n: number): void {
    this.pendingEntries = n;
    const el = document.getElementById('dbg-pending');
    if (el) {
      el.textContent = `CACHED: ${n} entries`;
      el.style.color = n > 0 ? '#ffff00' : '#888888';
    }
  }

  /** Get current state. */
  getState(): DebugState { return this._state; }

  /** Wire the hitbox visualizer. */
  setHitboxVisualizer(viz: HitboxVisualizer): void {
    this._hitboxViz = viz;
  }

  setProfilePopup(popup: { setAvatarOverlayDebug(on: boolean): void }): void {
    this._profilePopup = popup;
  }

  /** Wire the fake Spotify auth callback. */
  setFakeSpotifyHandler(fn: () => string[]): void {
    this._onFakeSpotify = fn;
  }

  /** Wire background effects state getter + toggler (from GameScene). */
  setBgEffectsHandler(
    getStates: () => BgEffectState[],
    toggle: (idx: number) => void,
  ): void {
    this._getBgEffectStates = getStates;
    this._toggleBgEffect = toggle;
  }

  /** Wire music source state getter (from MusicPlayer). */
  setMusicStateGetter(
    getter: () => { name: string; active: boolean; playing: boolean; muted: boolean; volume: number }[],
    toggleMute: (name: string) => void,
  ): void {
    this._getMusicStates = getter;
    this._toggleSourceMute = toggleMute;
  }

  /* ============ Internal ============ */

  private runFakeSpotify(): void {
    if (!this._onFakeSpotify) {
      this.fakeSpotifyLog.textContent = 'Not wired — no handler set';
      this.fakeSpotifyLog.style.display = 'block';
      return;
    }
    this.fakeSpotifyBtn.textContent = 'RUNNING...';
    this.fakeSpotifyBtn.style.color = '#ffff00';
    const log = this._onFakeSpotify();
    this.fakeSpotifyLog.textContent = log.join('\n');
    this.fakeSpotifyLog.style.display = 'block';
    setTimeout(() => {
      this.fakeSpotifyBtn.textContent = 'FAKE SPOTIFY AUTH';
      this.fakeSpotifyBtn.style.color = '#1ed760';
    }, 3000);
  }

  private toggleHitboxes(): void {
    this.hitboxesOn = !this.hitboxesOn;
    if (this._hitboxViz) {
      if (this.hitboxesOn) {
        this._hitboxViz.enable();
      } else {
        this._hitboxViz.disable();
      }
    }
    this.hitboxBtn.textContent = `CLICKABLE: ${this.hitboxesOn ? 'ON' : 'OFF'}`;
    this.hitboxBtn.style.color = this.hitboxesOn ? '#00ff44' : '#00ccff';
    this.hitboxBtn.style.background = this.hitboxesOn ? 'rgba(0,80,0,0.6)' : 'rgba(0,60,80,0.6)';
    this.hitboxBtn.style.borderColor = this.hitboxesOn ? 'rgba(0,255,68,0.5)' : 'rgba(0,200,255,0.5)';
    this.inspectBtn.style.display = this.hitboxesOn ? 'block' : 'none';
    this.listPanel.style.display = this.hitboxesOn ? 'flex' : 'none';
    if (this.hitboxesOn) {
      this.startListRefresh();
    } else {
      this.stopListRefresh();
      this.inspectBtn.textContent = 'INSPECT: OFF';
      this.inspectBtn.style.color = '#ffcc00';
    }
  }

  private toggleAvatarOverlay(): void {
    this.avatarOverlayOn = !this.avatarOverlayOn;
    this._profilePopup?.setAvatarOverlayDebug(this.avatarOverlayOn);
    this.avatarOverlayBtn.textContent = `AVATAR: ${this.avatarOverlayOn ? 'ON' : 'OFF'}`;
    this.avatarOverlayBtn.style.color = this.avatarOverlayOn ? '#ff44ff' : '#cc44ff';
    this.avatarOverlayBtn.style.background = this.avatarOverlayOn ? 'rgba(80,0,80,0.6)' : 'rgba(60,0,80,0.6)';
    this.avatarOverlayBtn.style.borderColor = this.avatarOverlayOn ? 'rgba(255,68,255,0.5)' : 'rgba(200,68,255,0.5)';
  }

  private toggleInspect(): void {
    if (!this._hitboxViz) return;
    const on = !this._hitboxViz.isInspectMode();
    this._hitboxViz.setInspectMode(on);
    this.inspectBtn.textContent = `INSPECT: ${on ? 'ON' : 'OFF'}`;
    this.inspectBtn.style.color = on ? '#ff4444' : '#ffcc00';
    this.inspectBtn.style.background = on ? 'rgba(80,0,0,0.6)' : 'rgba(80,60,0,0.6)';
    // Change pill to indicate inspect mode
    if (on) {
      this.pill.textContent = 'TAP';
      this.pill.style.background = 'rgba(200,100,0,0.8)';
    } else {
      this.pill.textContent = 'DBG';
      this.pill.style.background = 'rgba(0,180,0,0.7)';
    }
  }

  private toggleExpand(): void {
    this.expanded = !this.expanded;
    this.panel.style.display = this.expanded ? 'flex' : 'none';
  }

  private startFpsLoop(): void {
    if (this.rafId) return;
    this.frames = 0;
    this.lastFpsTime = performance.now();
    const tick = () => {
      this.frames++;
      const now = performance.now();
      const elapsed = now - this.lastFpsTime;
      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.frames * 1000) / elapsed);
        this.frames = 0;
        this.lastFpsTime = now;
        // Update display only when panel is visible
        if (this.expanded) {
          this.fpsText.textContent = `${this.currentFps}`;
          this.fpsText.style.color = this.currentFps >= 30 ? '#00ff00' : this.currentFps >= 20 ? '#ffff00' : '#ff4444';
        }
      }
      if (this.enabled) this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopFpsLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /* ============ Toggle List ============ */

  private startListRefresh(): void {
    if (this.listRefreshId) return;
    this.refreshList();
    this.listRefreshId = window.setInterval(() => this.refreshList(), 500);
  }

  private stopListRefresh(): void {
    if (this.listRefreshId) {
      clearInterval(this.listRefreshId);
      this.listRefreshId = 0;
    }
    this.listContent.innerHTML = '';
    this.lastListIds = '';
  }

  private refreshList(): void {
    if (!this._hitboxViz) return;
    const infos = this._hitboxViz.getVisibleInfos();

    // Check if list changed — avoid DOM thrashing
    const currentIds = infos.map(i => i.id).sort().join(',');
    if (currentIds === this.lastListIds) {
      // Just update checkbox states (no DOM rebuild)
      for (const info of infos) {
        const cb = document.getElementById(`hbx-cb-${info.id}`) as HTMLInputElement | null;
        if (cb) cb.checked = !this._hitboxViz.isDisabled(info.id);
      }
      return;
    }
    this.lastListIds = currentIds;

    // Full rebuild
    this.listContent.innerHTML = '';
    for (const info of infos) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '2px 4px', borderRadius: '2px',
        background: 'rgba(255,255,255,0.03)',
      });

      // Color dot
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '8px', height: '8px', borderRadius: '50%',
        background: info.color, flexShrink: '0',
      });

      // Name label
      const label = document.createElement('span');
      Object.assign(label.style, {
        flex: '1', fontSize: '10px', fontFamily: 'monospace',
        color: '#cccccc', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
      label.textContent = info.name;

      // Checkbox
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `hbx-cb-${info.id}`;
      cb.checked = !this._hitboxViz.isDisabled(info.id);
      Object.assign(cb.style, {
        width: '14px', height: '14px', cursor: 'pointer',
        flexShrink: '0', accentColor: info.color,
      });
      cb.addEventListener('change', () => {
        this._hitboxViz?.setDisabled(info.id, !cb.checked);
      });

      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(cb);
      this.listContent.appendChild(row);
    }
  }

  private toggleMusicPanel(): void {
    this.musicOpen = !this.musicOpen;
    this.musicPanel.style.display = this.musicOpen ? 'flex' : 'none';
    this.musicBtn.textContent = this.musicOpen ? 'MUSIC: ON' : 'MUSIC';
    this.musicBtn.style.color = this.musicOpen ? '#ee66ff' : '#cc88ff';
    this.musicBtn.style.background = this.musicOpen ? 'rgba(140,0,220,0.5)' : 'rgba(100,0,180,0.4)';
    if (this.musicOpen) {
      this.refreshMusicPanel();
      this.musicRefreshId = window.setInterval(() => this.refreshMusicPanel(), 300);
    } else {
      if (this.musicRefreshId) { clearInterval(this.musicRefreshId); this.musicRefreshId = 0; }
    }
  }

  private refreshMusicPanel(): void {
    if (!this._getMusicStates) return;
    const states = this._getMusicStates();

    // Build rows on first call or if count changed
    if (this.musicRows.length !== states.length) {
      // Keep the title element (first child), remove everything else
      while (this.musicPanel.children.length > 1) {
        this.musicPanel.removeChild(this.musicPanel.lastChild!);
      }
      this.musicRows = [];
      for (const s of states) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
        });
        row.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this._toggleSourceMute?.(s.name);
          setTimeout(() => this.refreshMusicPanel(), 50);
        });
        this.musicPanel.appendChild(row);
        this.musicRows.push(row);
      }
    }

    // Update each row
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const row = this.musicRows[i];
      const muted = s.muted;
      const playing = s.playing;
      const active = s.active;

      // Status dot color: green=playing, yellow=active but paused, red=muted, grey=inactive
      const silent = muted || s.volume < 0.01;
      let dotColor = '#444';
      if (active && playing && !muted) dotColor = '#00ff00';
      else if (active && playing && muted) dotColor = '#ff4444';
      else if (active && !playing) dotColor = '#ffaa00';
      else if (!active && playing && !silent) dotColor = '#ff6600'; // real leak
      else if (!active && playing && silent) dotColor = '#666666';  // muted companion — harmless

      // Status label
      let status = 'OFF';
      if (active && playing && !muted) status = 'PLAYING';
      else if (active && playing && muted) status = 'MUTED';
      else if (active && !playing) status = 'PAUSED';
      else if (!active && playing && !silent) status = 'LEAK!';
      else if (!active && playing && silent) status = 'SILENT';
      else if (!active && !playing && !muted) status = 'IDLE';

      const volPct = Math.round(s.volume * 100);

      row.innerHTML = '';
      row.style.background = active ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';

      // Dot
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '10px', height: '10px', borderRadius: '50%',
        background: dotColor, flexShrink: '0',
      });

      // Name
      const nameEl = document.createElement('span');
      Object.assign(nameEl.style, {
        fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold',
        color: active ? '#ffffff' : '#666666', minWidth: '90px',
      });
      nameEl.textContent = s.name;

      // Status
      const statusEl = document.createElement('span');
      const statusColor = status === 'LEAK!' ? '#ff0000' : status === 'PLAYING' ? '#00ff00' : status === 'MUTED' ? '#ff4444' : status === 'SILENT' ? '#666666' : '#888888';
      Object.assign(statusEl.style, {
        fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold',
        color: statusColor, flex: '1',
      });
      statusEl.textContent = `${status} ${volPct}%`;

      // Mute toggle indicator
      const muteEl = document.createElement('span');
      Object.assign(muteEl.style, {
        fontSize: '16px', cursor: 'pointer', flexShrink: '0',
      });
      muteEl.textContent = muted ? '🔇' : '🔊';

      row.appendChild(dot);
      row.appendChild(nameEl);
      row.appendChild(statusEl);
      row.appendChild(muteEl);
    }
  }

  private toggleBgEffectsPanel(): void {
    this.bgEffectsOpen = !this.bgEffectsOpen;
    this.bgEffectsPanel.style.display = this.bgEffectsOpen ? 'flex' : 'none';
    this.bgEffectsBtn.textContent = this.bgEffectsOpen ? 'BG EFFECTS: ON' : 'BG EFFECTS';
    this.bgEffectsBtn.style.color = this.bgEffectsOpen ? '#00ffee' : '#00ccdd';
    this.bgEffectsBtn.style.background = this.bgEffectsOpen ? 'rgba(0,120,140,0.5)' : 'rgba(0,80,100,0.4)';
    if (this.bgEffectsOpen) {
      this.refreshBgEffects();
      this.bgEffectsRefreshId = window.setInterval(() => this.refreshBgEffects(), 300);
    } else {
      if (this.bgEffectsRefreshId) { clearInterval(this.bgEffectsRefreshId); this.bgEffectsRefreshId = 0; }
    }
  }

  private refreshBgEffects(): void {
    if (!this._getBgEffectStates) return;
    const states = this._getBgEffectStates();

    // Keep the title element (first child), rebuild rows
    while (this.bgEffectsPanel.children.length > 1) {
      this.bgEffectsPanel.removeChild(this.bgEffectsPanel.lastChild!);
    }

    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '4px',
        cursor: 'pointer',
        background: s.active ? 'rgba(0,180,180,0.15)' : 'rgba(0,0,0,0.3)',
      });
      const idx = i;
      row.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this._toggleBgEffect?.(idx);
        setTimeout(() => this.refreshBgEffects(), 50);
      });

      // Status dot
      const dot = document.createElement('span');
      Object.assign(dot.style, {
        width: '10px', height: '10px', borderRadius: '50%',
        background: s.active ? '#00ff88' : '#ff4444', flexShrink: '0',
      });

      // Name
      const nameEl = document.createElement('span');
      Object.assign(nameEl.style, {
        fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold',
        color: s.active ? '#ffffff' : '#888888', flex: '1',
      });
      nameEl.textContent = s.name;

      // Value (optional)
      const valEl = document.createElement('span');
      Object.assign(valEl.style, {
        fontSize: '11px', fontFamily: 'monospace',
        color: s.active ? '#00ccdd' : '#555555',
      });
      valEl.textContent = s.value ?? '';

      row.appendChild(dot);
      row.appendChild(nameEl);
      row.appendChild(valEl);
      this.bgEffectsPanel.appendChild(row);
    }
  }

  private sendData(): void {
    if (this._state !== 'ready') return;
    if (this.pendingEntries === 0) {
      // Nothing to send — flash the button
      this.sendBtn.textContent = 'NO DATA';
      this.sendBtn.style.color = '#888888';
      setTimeout(() => {
        this.sendBtn.textContent = 'SEND DATA';
        this.sendBtn.style.color = '#00ff00';
      }, 1000);
      return;
    }
    // Deep Mode will implement actual send logic here.
    // For now, show the state cycle as a demo:
    this.setState('compressing');
    setTimeout(() => {
      this.setState('sending');
      setTimeout(() => {
        this.setPendingCount(0);
        this.setState('ready');
        this.sendBtn.textContent = 'SENT ✓';
        this.sendBtn.style.color = '#88ff88';
        setTimeout(() => {
          this.sendBtn.textContent = 'SEND DATA';
          this.sendBtn.style.color = '#00ff00';
        }, 1500);
      }, 800);
    }, 500);
  }
}
