# Changes Since Last Push

## ver 0.00.01
- Added BIOS version line below title: `ver X.XX.XX . . . last saved [ DD : MM : YY ] [ HH : MM : SS ]`
- Version line auto-scales horizontally (scaleX) to match title width edge-to-edge
- Timestamp populated dynamically at page load (reflects last save/build time)
- Typed out by existing BIOS typewriter system

## ver 0.00.02
- **Music player mobile UX**: Thumbnail tap expands/collapses UI instead of opening Spotify link
- **Music player mobile UX**: Track title tap collapses UI
- **Music player mobile UX**: Tapping anywhere outside the player collapses it
- **Music player mobile UX**: Container hover expand/collapse disabled on mobile (no hover on touch)
- **Music player mobile gap**: 40px gap between thumbnail and buttons on mobile (was 14px)
- **Music player mobile buttons**: Button scale set to 1x on mobile (was 1.5x on desktop) to prevent overlap with thumbnail
- **Cache busting**: Added no-cache meta tags to index.html + Cache-Control headers to Vite dev server config
- **Versioning system**: BIOS version string with auto-increment rules, stored in memory
