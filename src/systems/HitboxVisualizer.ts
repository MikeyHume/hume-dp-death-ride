/**
 * HitboxVisualizer — HTML canvas overlay that draws colored rectangles
 * over every interactive area in the game.
 *
 * Sits above the CRT shader (z-index 999998) so it shows TRUE screen-space
 * positions. pointer-events: none by default — doesn't interfere with gameplay.
 * In INSPECT mode, captures taps and shows an info card for the tapped hitbox.
 *
 * Filtering:
 *  - Only draws objects that are VISIBLE (checks .visible + parent container chain)
 *  - Supports per-element disable via disabledIds set
 *  - getVisibleRects() returns currently-visible elements for the toggle list panel
 */

import Phaser from 'phaser';
import { getHitboxMeta, SYSTEM_COLORS, type HitboxMeta } from '../config/hitboxRegistry';

// ── Layout ──
const Z_CANVAS  = '999998';
const Z_CARD    = '999999';
const RECT_ALPHA = 0.25;
const STROKE_ALPHA = 0.8;
const LABEL_FONT = '10px monospace';
const CARD_FONT  = '12px monospace';

export interface DrawnRect {
  x: number; y: number; w: number; h: number;
  id: string;
  meta: HitboxMeta | undefined;
  // Live data from the game object
  gameX: number; gameY: number;
  gameW: number; gameH: number;
  scaleX: number; scaleY: number;
  depth: number;
  visible: boolean;
  type: 'phaser' | 'html';
  color: string;
}

/** Lightweight info for the toggle list (no screen coords needed). */
export interface VisibleHitboxInfo {
  id: string;
  name: string;
  color: string;
  system: string;
}

export class HitboxVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private infoCard: HTMLDivElement;

  private _enabled = false;
  private _inspectMode = false;
  private drawnRects: DrawnRect[] = [];

  /** IDs the user has toggled OFF in the list panel. */
  private disabledIds = new Set<string>();

  /** Whitelist — ONLY these IDs are shown. If empty, nothing draws. */
  private whitelist = new Set<string>(['hud-profile']);

  /** All visible+active hitbox IDs from last frame (for the toggle list). */
  private _visibleInfos: VisibleHitboxInfo[] = [];

  // Reference to the Phaser game (set via setGame)
  private game: Phaser.Game | null = null;

  constructor() {
    // ── Overlay canvas ──
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '0', left: '0',
      width: '100vw', height: '100vh',
      zIndex: Z_CANVAS,
      pointerEvents: 'none',
      display: 'none',
    });
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext('2d')!;
    document.body.appendChild(this.canvas);

    // ── Info card (hidden until inspect tap) ──
    this.infoCard = document.createElement('div');
    Object.assign(this.infoCard.style, {
      position: 'fixed',
      zIndex: Z_CARD,
      display: 'none',
      background: 'rgba(0,0,0,0.92)',
      border: '2px solid #00ff44',
      borderRadius: '8px',
      padding: '12px 16px',
      color: '#00ff44',
      fontSize: CARD_FONT,
      fontFamily: 'monospace',
      maxWidth: '400px',
      lineHeight: '1.5',
      pointerEvents: 'auto',
      userSelect: 'text',
      webkitUserSelect: 'text',
      overflow: 'auto',
      maxHeight: '80vh',
    });
    document.body.appendChild(this.infoCard);

    // Resize handler
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });

    // Tap handler for inspect mode
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this._inspectMode) return;
      e.stopPropagation();
      e.preventDefault();
      this.handleInspectTap(e.clientX, e.clientY);
    });
  }

  /* ============ Public API ============ */

  setGame(game: Phaser.Game): void {
    this.game = game;
  }

  enable(): void {
    this._enabled = true;
    this.canvas.style.display = 'block';
  }

  disable(): void {
    this._enabled = false;
    this._inspectMode = false;
    this.canvas.style.display = 'none';
    this.canvas.style.pointerEvents = 'none';
    this.hideInfoCard();
  }

  isEnabled(): boolean { return this._enabled; }

  setInspectMode(on: boolean): void {
    this._inspectMode = on;
    this.canvas.style.pointerEvents = on ? 'auto' : 'none';
    if (!on) this.hideInfoCard();
  }

  isInspectMode(): boolean { return this._inspectMode; }

  /** Toggle a specific hitbox ID on/off. */
  setDisabled(id: string, disabled: boolean): void {
    if (disabled) {
      this.disabledIds.add(id);
    } else {
      this.disabledIds.delete(id);
    }
  }

  /** Check if a hitbox is disabled. */
  isDisabled(id: string): boolean {
    return this.disabledIds.has(id);
  }

  /** Disable or enable ALL hitbox IDs. */
  setAllDisabled(disabled: boolean): void {
    if (disabled) {
      // Add all currently-visible IDs to disabled set
      for (const info of this._visibleInfos) {
        this.disabledIds.add(info.id);
      }
    } else {
      this.disabledIds.clear();
    }
  }

  /** Get info about all currently visible+active hitboxes (for the toggle list). */
  getVisibleInfos(): VisibleHitboxInfo[] {
    return this._visibleInfos;
  }

  /** Get drawn rectangles (for editor tap detection). */
  getDrawnRects(): DrawnRect[] {
    return this.drawnRects;
  }

  /** Add an element ID to the whitelist. */
  addToWhitelist(id: string): void {
    this.whitelist.add(id);
  }

  /** Remove an element ID from the whitelist. */
  removeFromWhitelist(id: string): void {
    this.whitelist.delete(id);
  }

  /** Get all whitelisted IDs. */
  getWhitelist(): string[] {
    return [...this.whitelist];
  }

  /** Call every frame from GameScene.update() when enabled. */
  update(scene: Phaser.Scene): void {
    if (!this._enabled || !this.game) return;

    // Resize canvas if needed
    if (this.canvas.width !== window.innerWidth || this.canvas.height !== window.innerHeight) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawnRects = [];
    const visibleInfos: VisibleHitboxInfo[] = [];

    const canvasRect = this.game.canvas.getBoundingClientRect();
    const gameW = this.game.config.width as number;
    const gameH = this.game.config.height as number;
    const sx = canvasRect.width / gameW;
    const sy = canvasRect.height / gameH;

    // ── Draw Phaser interactive objects ──
    const inputList = (scene.input as any)._list as Phaser.GameObjects.GameObject[] | undefined;
    if (inputList) {
      for (const go of inputList) {
        const obj = go as unknown as Phaser.GameObjects.Components.Transform &
          Phaser.GameObjects.Components.Visible &
          Phaser.GameObjects.Components.Depth &
          { name?: string; input?: any; getBounds?: () => Phaser.Geom.Rectangle;
            scaleX?: number; scaleY?: number; type?: string;
            parentContainer?: Phaser.GameObjects.Container };

        if (!obj.getBounds) continue;

        // ── Visibility filter: skip invisible objects ──
        if ((obj as any).visible === false) continue;

        // Walk up container chain — skip if any parent is invisible
        let parentHidden = false;
        let parent: Phaser.GameObjects.Container | undefined = obj.parentContainer;
        while (parent) {
          if (!parent.visible) { parentHidden = true; break; }
          parent = parent.parentContainer;
        }
        if (parentHidden) continue;

        const name = obj.name || '';

        // ── Whitelist filter: only show explicitly added elements ──
        if (!name || !this.whitelist.has(name)) continue;

        const meta = name ? getHitboxMeta(name) : undefined;
        const systemName = meta?.system || 'GameScene';
        const color = SYSTEM_COLORS[systemName] || '#00ff44';
        const displayName = meta?.name || name || obj.type || '???';

        // Track as visible (for the toggle list)
        const infoId = name;
        visibleInfos.push({ id: infoId, name: displayName, color, system: systemName });

        // Skip drawing if user has disabled this ID
        if (this.disabledIds.has(infoId)) continue;

        const bounds = obj.getBounds();

        // Map game coords to screen coords
        const screenX = canvasRect.left + bounds.x * sx;
        const screenY = canvasRect.top + bounds.y * sy;
        const screenW = bounds.width * sx;
        const screenH = bounds.height * sy;

        // Draw filled rect
        ctx.fillStyle = hexToRgba(color, RECT_ALPHA);
        ctx.fillRect(screenX, screenY, screenW, screenH);

        // Draw stroke
        ctx.strokeStyle = hexToRgba(color, STROKE_ALPHA);
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX, screenY, screenW, screenH);

        // Draw label
        ctx.font = LABEL_FONT;
        ctx.fillStyle = color;
        const textY = screenY - 3;
        if (textY > 10) {
          ctx.fillText(displayName, screenX + 2, textY);
        } else {
          ctx.fillText(displayName, screenX + 2, screenY + 12);
        }

        // Store for hit-testing
        this.drawnRects.push({
          x: screenX, y: screenY, w: screenW, h: screenH,
          id: infoId,
          meta,
          gameX: Math.round(bounds.x), gameY: Math.round(bounds.y),
          gameW: Math.round(bounds.width), gameH: Math.round(bounds.height),
          scaleX: obj.scaleX ?? 1, scaleY: obj.scaleY ?? 1,
          depth: (obj as any).depth ?? 0,
          visible: true,
          type: 'phaser',
          color,
        });
      }
    }

    // ── Draw HTML interactive elements (data-hitbox) ──
    const htmlHitboxes = document.querySelectorAll('[data-hitbox]');
    for (const el of htmlHitboxes) {
      const htmlEl = el as HTMLElement;
      // Skip invisible elements (strict check)
      if (htmlEl.style.display === 'none' || htmlEl.style.visibility === 'hidden') continue;
      if (htmlEl.offsetWidth === 0 && htmlEl.offsetHeight === 0) continue;

      const id = htmlEl.getAttribute('data-hitbox') || '';

      // ── Whitelist filter: only show explicitly added elements ──
      if (!id || !this.whitelist.has(id)) continue;

      const meta = getHitboxMeta(id);
      const systemName = meta?.system || 'MusicPlayer';
      const color = SYSTEM_COLORS[systemName] || '#00ccff';
      const displayName = meta?.name || id;

      // Track as visible
      visibleInfos.push({ id, name: displayName, color, system: systemName });

      // Skip drawing if user has disabled this ID
      if (this.disabledIds.has(id)) continue;

      const rect = htmlEl.getBoundingClientRect();

      ctx.fillStyle = hexToRgba(color, RECT_ALPHA);
      ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
      ctx.strokeStyle = hexToRgba(color, STROKE_ALPHA);
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

      ctx.font = LABEL_FONT;
      ctx.fillStyle = color;
      const textY = rect.top - 3;
      if (textY > 10) {
        ctx.fillText(displayName, rect.left + 2, textY);
      } else {
        ctx.fillText(displayName, rect.left + 2, rect.top + 12);
      }

      this.drawnRects.push({
        x: rect.left, y: rect.top, w: rect.width, h: rect.height,
        id,
        meta,
        gameX: Math.round(rect.left), gameY: Math.round(rect.top),
        gameW: Math.round(rect.width), gameH: Math.round(rect.height),
        scaleX: 1, scaleY: 1,
        depth: parseInt(htmlEl.style.zIndex || '0', 10) || 0,
        visible: true,
        type: 'html',
        color,
      });
    }

    this._visibleInfos = visibleInfos;
  }

  /* ============ Inspect ============ */

  private handleInspectTap(cx: number, cy: number): void {
    // Find the top-most (last drawn) rect under the tap
    let hit: DrawnRect | null = null;
    for (let i = this.drawnRects.length - 1; i >= 0; i--) {
      const r = this.drawnRects[i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        hit = r;
        break;
      }
    }

    if (hit) {
      this.showInfoCard(hit, cx, cy);
    } else {
      this.hideInfoCard();
    }
  }

  private showInfoCard(r: DrawnRect, tapX: number, tapY: number): void {
    const meta = r.meta;
    const name = meta?.name || r.id || 'Unknown Element';
    const system = meta?.system || '???';

    const lines: string[] = [];
    lines.push(`${name}`);
    lines.push('─'.repeat(Math.min(name.length + 4, 40)));
    lines.push(`System:   ${system}`);
    lines.push(`Type:     ${r.type === 'phaser' ? 'Phaser' : 'HTML'}`);
    lines.push(`Position: x=${r.gameX}, y=${r.gameY}`);
    lines.push(`Size:     ${r.gameW} x ${r.gameH} px`);
    if (r.type === 'phaser') {
      lines.push(`Scale:    ${r.scaleX.toFixed(2)} x ${r.scaleY.toFixed(2)}`);
      lines.push(`Depth:    ${r.depth}`);
      lines.push(`Visible:  ${r.visible}`);
    }

    if (meta) {
      if (meta.tuningVars.length > 0) {
        lines.push('─'.repeat(30));
        lines.push(`Tuning: ${meta.tuningVars.join(', ')}`);
      }
      lines.push('─'.repeat(30));
      lines.push(`Action: ${meta.description}`);
      lines.push(`Code:   ${meta.codeRef}`);
      lines.push(`Runs:   ${meta.callbackSummary}`);
    }

    // Build the card HTML
    const copyText = lines.join('\n');
    const escapedLines = lines.map(l => escapeHtml(l)).join('<br>');

    this.infoCard.innerHTML = `
      <div style="white-space:pre-wrap;word-break:break-word;">${escapedLines}</div>
      <div style="margin-top:10px;text-align:center;">
        <button id="hbx-copy-btn" style="
          padding:8px 24px;
          background:rgba(0,100,0,0.7);
          border:2px solid #00ff44;
          border-radius:6px;
          color:#00ff44;
          font:bold 13px monospace;
          cursor:pointer;
        ">COPY</button>
        <button id="hbx-close-btn" style="
          padding:8px 16px;
          margin-left:8px;
          background:rgba(100,0,0,0.7);
          border:2px solid #ff4444;
          border-radius:6px;
          color:#ff4444;
          font:bold 13px monospace;
          cursor:pointer;
        ">CLOSE</button>
      </div>
    `;

    // Position near tap but keep on screen
    const cardW = 380;
    const cardH = 300;
    let left = tapX + 10;
    let top = tapY + 10;
    if (left + cardW > window.innerWidth) left = tapX - cardW - 10;
    if (top + cardH > window.innerHeight) top = tapY - cardH - 10;
    if (left < 0) left = 10;
    if (top < 0) top = 10;

    Object.assign(this.infoCard.style, {
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
    });

    // Wire copy button
    const copyBtn = document.getElementById('hbx-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          copyBtn.textContent = 'COPIED ✓';
          copyBtn.style.color = '#88ff88';
          setTimeout(() => {
            copyBtn.textContent = 'COPY';
            copyBtn.style.color = '#00ff44';
          }, 1500);
        });
      };
    }

    // Wire close button
    const closeBtn = document.getElementById('hbx-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => this.hideInfoCard();
    }
  }

  private hideInfoCard(): void {
    this.infoCard.style.display = 'none';
  }
}

/* ============ Helpers ============ */

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
