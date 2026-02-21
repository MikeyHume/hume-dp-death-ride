# Changes Since Last Push

## ver 0.00.03
- **BIOS version line font**: Changed from Alagard (title font) to Early GameBoy (regular BIOS font)
- **BIOS version line width**: Now scales to match the VIDEO line width instead of the title line
- Version line size is independent — doesn't inherit title size override

## ver 0.00.04
- **Mobile music buttons restored to full size**: Reverted button scale back to 1.5x on mobile (same as desktop)
- **Mobile music container widened**: Added `MUSIC_UI_MOBILE_WIDTH: 1050` (vs desktop 740) to accommodate full-size buttons + thumbnail + 40px gap without overlap
- Container width used in both initial layout and expandUI()
