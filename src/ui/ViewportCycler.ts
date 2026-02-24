import Phaser from 'phaser';

/**
 * ViewportCycler — 10-mode A/B testing tool for iOS Safari viewport strategies.
 * Every mode AGGRESSIVELY tries to trick/force Safari into giving more screen.
 * Activated via ?viewport=1 URL param. Tap red circle to cycle modes.
 */

interface ViewportMode {
  name: string;
  shortName: string;
  description: string;
  apply: (game: Phaser.Game, cycler: ViewportCycler) => void;
  revert: (game: Phaser.Game, cycler: ViewportCycler) => void;
}

// ── Helpers ─────────────────────────────────────────────────────

const GAME_W = 1920;
const GAME_H = 1080;

function setBodyHeight(unit: string): void {
  document.documentElement.style.height = unit;
  document.body.style.height = unit;
}

function getContainer(): HTMLElement {
  return document.getElementById('game-container')!;
}

function resetCSS(game: Phaser.Game): void {
  setBodyHeight('100dvh');
  document.body.style.position = 'fixed';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.minHeight = '';
  window.scrollTo(0, 0);
  // Reset container
  const c = getContainer();
  c.style.height = '100%';
  c.style.position = 'fixed';
  c.style.overflow = '';
  // Reset canvas transform
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.position = '';
    canvas.style.left = '';
    canvas.style.top = '';
  }
}

/** Classic iOS Safari toolbar hide: make page taller than viewport, scroll down */
function applyScrollTrick(): void {
  document.body.style.position = '';
  document.body.style.overflow = '';
  document.documentElement.style.minHeight = 'calc(100lvh + 2px)';
  setTimeout(() => {
    window.scrollTo(0, 1);
    setTimeout(() => {
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    }, 100);
  }, 50);
}

/** Persistent scroll: re-hide toolbar whenever Safari shows it */
function persistentScrollHandler(): void {
  // On resize (toolbar show/hide), re-apply the trick
  document.body.style.position = '';
  document.body.style.overflow = '';
  document.documentElement.style.minHeight = 'calc(100lvh + 2px)';
  setTimeout(() => {
    window.scrollTo(0, 1);
    setTimeout(() => {
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    }, 100);
  }, 50);
}

// ── Mode Definitions ────────────────────────────────────────────

const MODES: ViewportMode[] = [
  // ─── Mode 0: BASELINE ────────────────────────────────────────
  {
    name: 'BASELINE (reference)',
    shortName: 'BASELINE',
    description: 'Current setup. FIT 1920x1080, 100dvh. Black bars on sides.',
    apply: (game) => {
      resetCSS(game);
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(GAME_W, GAME_H);
      game.scale.refresh();
    },
    revert: (game) => { resetCSS(game); },
  },

  // ─── Mode 1: SCROLL TRICK ───────────────────────────────────
  {
    name: 'SCROLL TRICK (hide toolbar)',
    shortName: 'SCROLL',
    description: 'scrollTo(0,1) hides Safari toolbar. Classic iOS hack.',
    apply: (game) => {
      resetCSS(game);
      setBodyHeight('100lvh');
      applyScrollTrick();
      setTimeout(() => {
        game.scale.scaleMode = Phaser.Scale.FIT;
        game.scale.setGameSize(GAME_W, GAME_H);
        game.scale.refresh();
      }, 300);
    },
    revert: (game) => { resetCSS(game); },
  },

  // ─── Mode 2: SCROLL PERSISTENT ──────────────────────────────
  {
    name: 'SCROLL PERSISTENT (re-hide)',
    shortName: 'SCROLL+',
    description: 'Scroll trick + re-hides toolbar on every resize event.',
    apply: (game, cycler) => {
      resetCSS(game);
      setBodyHeight('100lvh');
      applyScrollTrick();
      cycler._scrollHandler = () => persistentScrollHandler();
      window.addEventListener('resize', cycler._scrollHandler);
      setTimeout(() => {
        game.scale.scaleMode = Phaser.Scale.FIT;
        game.scale.setGameSize(GAME_W, GAME_H);
        game.scale.refresh();
      }, 300);
    },
    revert: (game, cycler) => {
      if (cycler._scrollHandler) {
        window.removeEventListener('resize', cycler._scrollHandler);
        cycler._scrollHandler = null;
      }
      resetCSS(game);
    },
  },

  // ─── Mode 3: ENVELOP ────────────────────────────────────────
  {
    name: 'ENVELOP (fill + crop)',
    shortName: 'ENVELOP',
    description: 'Phaser fills entire viewport. Crops sky/reflections. Zero black bars.',
    apply: (game) => {
      resetCSS(game);
      game.scale.scaleMode = Phaser.Scale.ENVELOP;
      game.scale.setGameSize(GAME_W, GAME_H);
      game.scale.refresh();
    },
    revert: (game) => {
      game.scale.scaleMode = Phaser.Scale.FIT;
      resetCSS(game);
    },
  },

  // ─── Mode 4: ENVELOP + SCROLL ───────────────────────────────
  {
    name: 'ENVELOP + SCROLL (fill + hide toolbar)',
    shortName: 'ENV+SCROLL',
    description: 'Fill viewport AND hide toolbar. Less cropping than Envelop alone.',
    apply: (game) => {
      resetCSS(game);
      setBodyHeight('100lvh');
      applyScrollTrick();
      setTimeout(() => {
        game.scale.scaleMode = Phaser.Scale.ENVELOP;
        game.scale.setGameSize(GAME_W, GAME_H);
        game.scale.refresh();
      }, 300);
    },
    revert: (game) => {
      game.scale.scaleMode = Phaser.Scale.FIT;
      resetCSS(game);
    },
  },

  // ─── Mode 5: ADAPTIVE FIT ───────────────────────────────────
  {
    name: 'ADAPTIVE FIT (match viewport ratio)',
    shortName: 'ADAPTIVE',
    description: 'Game resolution auto-matches viewport. Zero bars, zero crop.',
    apply: (game) => {
      resetCSS(game);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newW = Math.round(GAME_H * (vw / vh));
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(newW, GAME_H);
      game.scale.refresh();
    },
    revert: (game) => {
      game.scale.setGameSize(GAME_W, GAME_H);
      resetCSS(game);
    },
  },

  // ─── Mode 6: ADAPTIVE + SCROLL ──────────────────────────────
  {
    name: 'ADAPTIVE + SCROLL (match + hide toolbar)',
    shortName: 'ADAPT+SCROLL',
    description: 'Auto-match viewport ratio + hide toolbar. Max visible area.',
    apply: (game) => {
      resetCSS(game);
      setBodyHeight('100lvh');
      applyScrollTrick();
      setTimeout(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const newW = Math.round(GAME_H * (vw / vh));
        game.scale.scaleMode = Phaser.Scale.FIT;
        game.scale.setGameSize(newW, GAME_H);
        game.scale.refresh();
      }, 400);
    },
    revert: (game) => {
      game.scale.setGameSize(GAME_W, GAME_H);
      resetCSS(game);
    },
  },

  // ─── Mode 7: CSS SCALE FILL ─────────────────────────────────
  {
    name: 'CSS SCALE FILL (stretch canvas)',
    shortName: 'CSS-SCALE',
    description: 'CSS transform stretches canvas to fill viewport. May break touch.',
    apply: (game) => {
      resetCSS(game);
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(GAME_W, GAME_H);
      game.scale.refresh();
      // After Phaser sizes the canvas, stretch it to fill
      setTimeout(() => {
        const canvas = game.canvas;
        const rect = canvas.getBoundingClientRect();
        const vw = window.innerWidth;
        const scaleX = vw / rect.width;
        canvas.style.transformOrigin = 'center center';
        canvas.style.transform = `scaleX(${scaleX.toFixed(4)})`;
      }, 100);
    },
    revert: (game) => { resetCSS(game); },
  },

  // ─── Mode 8: FULLSCREEN API ─────────────────────────────────
  {
    name: 'FULLSCREEN API (requestFullscreen)',
    shortName: 'FS-API',
    description: 'requestFullscreen() on tap. Works iPad, silent fail iPhone.',
    apply: (game) => {
      resetCSS(game);
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(GAME_W, GAME_H);
      // Request fullscreen — needs to be in a user gesture context.
      // The button click that triggers this IS a user gesture.
      const el = document.documentElement as any;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
      if (rfs) {
        rfs.call(el).then(() => {
          // Also lock orientation if possible
          try {
            (screen.orientation as any).lock('landscape').catch(() => {});
          } catch (_) {}
          game.scale.refresh();
        }).catch(() => {
          // Fullscreen not supported or denied — refresh anyway
          game.scale.refresh();
        });
      } else {
        game.scale.refresh();
      }
    },
    revert: (game) => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      resetCSS(game);
    },
  },

  // ─── Mode 9: COMBINED MAX ───────────────────────────────────
  {
    name: 'COMBINED MAX (all tricks)',
    shortName: 'MAX',
    description: 'Adaptive + scroll + envelop. Maximum aggression.',
    apply: (game) => {
      resetCSS(game);
      setBodyHeight('100lvh');
      applyScrollTrick();
      // Try fullscreen API too (will fail silently on iPhone)
      const el = document.documentElement as any;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
      if (rfs) rfs.call(el).catch(() => {});
      setTimeout(() => {
        // Adaptive game size
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const newW = Math.round(GAME_H * (vw / vh));
        // Use ENVELOP to ensure zero gaps even if math is slightly off
        game.scale.scaleMode = Phaser.Scale.ENVELOP;
        game.scale.setGameSize(newW, GAME_H);
        game.scale.refresh();
      }, 400);
    },
    revert: (game) => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(GAME_W, GAME_H);
      resetCSS(game);
    },
  },
];

// ── ViewportCycler Class ────────────────────────────────────────

export class ViewportCycler {
  private game: Phaser.Game;
  private currentMode = 0;
  private button!: HTMLButtonElement;
  private infoPanel!: HTMLDivElement;
  private modeLabel!: HTMLDivElement;
  /** Public so modes can attach/detach resize handlers */
  _scrollHandler: (() => void) | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.createUI();
    // Apply baseline on init
    this.applyCurrentMode();
    // Listen for resize to update info
    window.addEventListener('resize', () => this.updateInfo());
  }

  private createUI(): void {
    // ── Big neon green mode label — always visible at top center ──
    this.modeLabel = document.createElement('div');
    this.modeLabel.id = 'vp-mode-label';
    this.modeLabel.style.cssText = `
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 100001;
      font-family: 'Courier New', monospace;
      font-size: 22px;
      font-weight: bold;
      color: #00ff66;
      text-shadow: 0 0 8px #00ff66, 0 0 16px #00ff44;
      background: rgba(0, 0, 0, 0.7);
      padding: 4px 16px;
      border-radius: 6px;
      border: 1px solid rgba(0, 255, 102, 0.4);
      pointer-events: none;
      white-space: nowrap;
    `;
    document.body.appendChild(this.modeLabel);

    // ── Bottom-left: button + info panel ──
    const container = document.createElement('div');
    container.id = 'viewport-cycler';
    container.style.cssText = `
      position: fixed;
      bottom: 36px;
      left: 10px;
      z-index: 100000;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      pointer-events: auto;
      font-family: 'Courier New', monospace;
    `;

    // Cycle button — big, always visible
    this.button = document.createElement('button');
    this.button.style.cssText = `
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(0, 255, 102, 0.4);
      border: 3px solid #00ff66;
      color: #00ff66;
      font-size: 22px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      flex-shrink: 0;
      text-shadow: 0 0 6px #00ff66;
      box-shadow: 0 0 12px rgba(0, 255, 102, 0.3);
    `;
    this.button.textContent = '0';
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleNext();
    });
    // Prevent Phaser from seeing this touch
    this.button.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });

    // Info panel — smaller details below button
    this.infoPanel = document.createElement('div');
    this.infoPanel.style.cssText = `
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(0, 255, 102, 0.4);
      border-radius: 4px;
      padding: 4px 8px;
      color: #00ff66;
      font-size: 10px;
      line-height: 1.3;
      white-space: pre;
      max-width: 280px;
    `;

    container.appendChild(this.button);
    container.appendChild(this.infoPanel);
    document.body.appendChild(container);
  }

  private cycleNext(): void {
    MODES[this.currentMode].revert(this.game, this);
    this.currentMode = (this.currentMode + 1) % MODES.length;
    this.applyCurrentMode();
  }

  private applyCurrentMode(): void {
    const mode = MODES[this.currentMode];
    mode.apply(this.game, this);
    this.button.textContent = String(this.currentMode);
    // Update info after layout settles (scroll trick needs time)
    this.updateInfo();
    setTimeout(() => this.updateInfo(), 500);
  }

  private updateInfo(): void {
    const mode = MODES[this.currentMode];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    const coverW = Math.round((cw / vw) * 100);
    const coverH = Math.round((ch / vh) * 100);
    const gameW = this.game.scale.gameSize.width;
    const gameH = this.game.scale.gameSize.height;

    // Big neon label at top — always visible
    this.modeLabel.textContent = `${this.currentMode}/${MODES.length - 1} ${mode.shortName}  [${coverW}%]`;

    // Detail panel — always visible
    this.infoPanel.textContent =
      `${mode.description}\n` +
      `VP:${vw}x${vh} Canvas:${cw}x${ch}\n` +
      `Game:${gameW}x${gameH}`;
  }

  destroy(): void {
    if (this._scrollHandler) {
      window.removeEventListener('resize', this._scrollHandler);
    }
    MODES[this.currentMode].revert(this.game, this);
    const el = document.getElementById('viewport-cycler');
    if (el) el.remove();
    const label = document.getElementById('vp-mode-label');
    if (label) label.remove();
  }
}
