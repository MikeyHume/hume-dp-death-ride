# Changes Since Last Push

## ver 0.00.05
- **BIOS version line tuning vars**: Added `--bios-ver-size` (font size), `--bios-ver-offset-x` (horizontal nudge), `--bios-ver-offset-y` (vertical nudge)
- Version line now has its own independent font size (default: `clamp(8px, 1.2vw, 14px)`) separate from all other BIOS text
- Offset vars allow fine-tuning position without touching code

## ver 0.00.06 → 0.00.07
- **BIOS version line font**: Added `--bios-ver-font` CSS var (default: `'Courier New', monospace`) — only affects the version line
- Restored original bracket/colon format now that Courier New supports all characters
- No more mushroom glyphs from unsupported characters in Early GameBoy font

## ver 0.00.08
- **BIOS title shows real version**: Title line now reads `DP MOTO BIOS      vX.XX.XX` with the actual version number (was hardcoded `v0.1`)
- **Version line simplified**: Removed version number from subtitle — now starts with `last saved`
- Version number stored in single `verNum` JS variable for easy updating

## ver 0.00.09
- **Last saved line bold**: Added `font-weight: bold` to version line
- **Date format**: Changed to `[ DD : MonthName : YYYY ]` with full month name and 4-digit year
- **Time format**: `[ HH : MM : SS ]` with actual numbers

## ver 0.00.10
- **Fixed `--bios-ver-offset-y` not working**: CSS was using hardcoded `margin-top: 40px` instead of the var — now wired to `var(--bios-ver-offset-y)`
- Default set to `-10px` (pulls version line slightly closer to title)
- Adjust `--bios-ver-offset-y` in `:root` to fine-tune the gap

## ver 0.00.11 → 0.00.13
- **BIOS title + version lines aligned to loading bar**: Font sizes tuned via Guide Mode debug tool so right edges align with loading bar
- **Guide Mode debug tool [G]**: Select BIOS lines, adjust font size with arrow keys, press Enter to copy changes to clipboard for Claude to apply permanently
- Font-size approach replaces scaleX — uniform scaling, no horizontal distortion

## ver 0.00.14
- **Tuned font sizes baked in**: Title `clamp(13.8px, 2.59vw, 36.3px)`, version `clamp(7.6px, 1.14vw, 13.3px)` — from Guide Mode measurements
- Removed scaleX `scaleLines()` function — font sizes handle alignment natively now

## ver 0.00.15
- **Auto-fit overflow clamp**: If title or version line overflows loading bar width (e.g. longer version number), applies subtle scaleX to shrink to fit
- Re-fits on window resize so alignment tracks container width changes

## ver 0.00.16
- **iPad Preview Mode [I]**: Desktop-only debug key simulates iPad 10th gen (1180×820 @2x) standalone web-app viewport with black letterbox bars, uniform scaling, rounded corner frame
- Disabled on actual mobile devices (iPad, iPhone, Android)
- **Web-app meta tags**: Added `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` so game can be saved to iPad home screen as fullscreen app
- **Mobile fills full screen**: On mobile, Phaser game height adjusts to match device aspect ratio (no 16:9 letterboxing) — game uses entire available viewport
