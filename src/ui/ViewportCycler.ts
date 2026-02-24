import Phaser from 'phaser';

/**
 * ViewportCycler — 10-mode A/B testing tool for iOS Safari viewport strategies.
 * Activated via ?viewport=1 URL param. Cycle button in bottom-left corner.
 */

interface ViewportMode {
  name: string;
  shortName: string;
  apply: (game: Phaser.Game) => void;
  revert: (game: Phaser.Game) => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function setBodyHeight(unit: string): void {
  document.documentElement.style.height = unit;
  document.body.style.height = unit;
}

function resetCSS(): void {
  setBodyHeight('100dvh');
  document.body.style.position = 'fixed';
  document.body.style.overflow = 'hidden';
  // Reset any scroll trick residue
  document.documentElement.style.minHeight = '';
  window.scrollTo(0, 0);
  // Reset canvas transform
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  if (canvas) {
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
  }
}

function applyScrollTrick(): void {
  // Temporarily allow scroll, extend page, scroll to hide toolbar
  document.body.style.position = '';
  document.body.style.overflow = '';
  document.documentElement.style.minHeight = 'calc(100lvh + 1px)';
  // Give Safari a moment to allow scroll, then scroll down
  setTimeout(() => {
    window.scrollTo(0, 1);
    // Re-lock after scroll
    setTimeout(() => {
      document.body.style.position = 'fixed';
      document.body.style.overflow = 'hidden';
    }, 100);
  }, 50);
}

// ── Mode Definitions ────────────────────────────────────────────

const MODES: ViewportMode[] = [
  // Mode 0: BASELINE — current production setup
  {
    name: 'BASELINE (dvh + FIT)',
    shortName: 'BASELINE',
    apply: (game) => {
      resetCSS();
      setBodyHeight('100dvh');
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(1920, 1080);
      game.scale.refresh();
    },
    revert: () => { resetCSS(); },
  },

  // Mode 1: LVH — large viewport height (claims space behind toolbar)
  {
    name: 'LVH (lvh + FIT)',
    shortName: 'LVH',
    apply: (game) => {
      resetCSS();
      setBodyHeight('100lvh');
      game.scale.scaleMode = Phaser.Scale.FIT;
      game.scale.setGameSize(1920, 1080);
      game.scale.refresh();
    },
    revert: () => { resetCSS(); },
  },

  // Mode 2: SCROLL TRICK — hide Safari toolbar via scroll
  {
    name: 'SCROLL TRICK (hide toolbar)',
    shortName: 'SCROLL',
    apply: (game) => {
      resetCSS();
      setBodyHeight('100lvh');
      applyScrollTrick();
      // Delay refresh to let Safari recompute after scroll
      setTimeout(() => {
        game.scale.scaleMode = Phaser.Scale.FIT;
        game.scale.setGameSize(1920, 1080);
        game.scale.refresh();
      }, 300);
    },
    revert: () => { resetCSS(); },
  },
];

// ── ViewportCycler Class ────────────────────────────────────────

export class ViewportCycler {
  private game: Phaser.Game;
  private currentMode = 0;
  private button!: HTMLButtonElement;
  private infoPanel!: HTMLDivElement;
  private infoTimeout: number | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
    this.createUI();
    // Apply baseline on init
    this.applyCurrentMode();
    // Listen for resize to update info
    window.addEventListener('resize', () => this.updateInfo());
  }

  private createUI(): void {
    // Container
    const container = document.createElement('div');
    container.id = 'viewport-cycler';
    container.style.cssText = `
      position: fixed;
      bottom: 36px;
      left: 10px;
      z-index: 100000;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
      font-family: 'Courier New', monospace;
    `;

    // Cycle button
    this.button = document.createElement('button');
    this.button.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255, 0, 0, 0.4);
      border: 2px solid rgba(255, 0, 0, 0.7);
      color: #fff;
      font-size: 18px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    `;
    this.button.textContent = '0';
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleNext();
    });

    // Info panel
    this.infoPanel = document.createElement('div');
    this.infoPanel.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(255, 0, 0, 0.5);
      border-radius: 4px;
      padding: 6px 10px;
      color: #fff;
      font-size: 11px;
      line-height: 1.4;
      white-space: pre;
      max-width: 320px;
      opacity: 1;
      transition: opacity 0.3s;
    `;

    container.appendChild(this.button);
    container.appendChild(this.infoPanel);
    document.body.appendChild(container);
  }

  private cycleNext(): void {
    // Revert current
    MODES[this.currentMode].revert(this.game);
    // Advance
    this.currentMode = (this.currentMode + 1) % MODES.length;
    this.applyCurrentMode();
  }

  private applyCurrentMode(): void {
    const mode = MODES[this.currentMode];
    mode.apply(this.game);
    this.button.textContent = String(this.currentMode);
    // Show info
    this.showInfo();
    // Update info after layout settles
    setTimeout(() => this.updateInfo(), 400);
  }

  private showInfo(): void {
    this.infoPanel.style.opacity = '1';
    if (this.infoTimeout !== null) clearTimeout(this.infoTimeout);
    this.infoTimeout = window.setTimeout(() => {
      this.infoPanel.style.opacity = '0.4';
    }, 5000);
  }

  private updateInfo(): void {
    const mode = MODES[this.currentMode];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    const coverage = Math.round((cw / vw) * 100);
    const gameW = this.game.scale.gameSize.width;
    const gameH = this.game.scale.gameSize.height;

    this.infoPanel.textContent =
      `MODE ${this.currentMode}/${MODES.length - 1}: ${mode.shortName}\n` +
      `${mode.name}\n` +
      `Viewport: ${vw}x${vh}  Canvas: ${cw}x${ch}\n` +
      `Game: ${gameW}x${gameH}  Cover: ${coverage}%`;
  }

  getModeName(): string {
    return MODES[this.currentMode].name;
  }

  getModeCount(): number {
    return MODES.length;
  }

  destroy(): void {
    const el = document.getElementById('viewport-cycler');
    if (el) el.remove();
    if (this.infoTimeout !== null) clearTimeout(this.infoTimeout);
  }
}
