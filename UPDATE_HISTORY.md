# DP Moto — Full Update History

> Latest updates at the top. Oldest at the bottom.

---

## ver 0.00.04 — <span style="color:yellow">**[ TESTING ]**</span>

- **Mobile music buttons restored to full size**: Reverted button scale back to 1.5x on mobile (same as desktop)
- **Mobile music container widened**: Added `MUSIC_UI_MOBILE_WIDTH: 1050` (vs desktop 740) to accommodate full-size buttons + thumbnail + 40px gap without overlap
- Container width used in both initial layout and expandUI()

---

## ver 0.00.03 — <span style="color:yellow">**[ TESTING ]**</span>

- **BIOS version line font**: Changed from Alagard (title font) to Early GameBoy (regular BIOS font)
- **BIOS version line width**: Now scales to match the VIDEO line width instead of the title line
- Version line size is independent — doesn't inherit title size override

---

## ver 0.00.02 — <span style="color:yellow">**[ TESTING ]**</span>

- **Music player mobile UX**: Thumbnail tap expands/collapses UI instead of opening Spotify link
- **Music player mobile UX**: Track title tap collapses UI
- **Music player mobile UX**: Tapping anywhere outside the player collapses it
- **Music player mobile UX**: Container hover expand/collapse disabled on mobile (no hover on touch)
- **Music player mobile gap**: 40px gap between thumbnail and buttons on mobile (was 14px)
- **Music player mobile buttons**: Button scale set to 1x on mobile (was 1.5x) to prevent thumbnail/heart overlap
- **Cache busting**: Added no-cache meta tags to index.html + Cache-Control headers to Vite dev server
- **Versioning system**: BIOS version line with auto-increment rules + change tracking docs

---

## ver 0.00.01 — <span style="color:yellow">**[ TESTING ]**</span>

- **BIOS version line**: Added `ver X.XX.XX . . . last saved [ DD : MM : YY ] [ HH : MM : SS ]` below title
- Version line auto-scales horizontally (scaleX) to match title width edge-to-edge
- Timestamp populated dynamically at page load
- Typed out by existing BIOS typewriter system

---

## ver 0.00.00 — Pre-Versioning Baseline

> Everything built before the versioning system was introduced.

### Core Game
- Core movement — mouse Y control, space tapping for speed, X impulse/friction
- Road system — scrolling TileSprite road, lane highlights
- Obstacle system — CRASH (instant death), SLOW (speed penalty), CAR (oncoming traffic) with object pooling
- Difficulty ramp — timer-based 0→1 over 120s, controls spawn rate and density
- Score system — distance + speed multiplier
- Weekly seed — seeded RNG from ISO week, deterministic obstacle patterns
- Local leaderboard — localStorage top 10 per week
- Katana slash — short active window + cooldown, destroys obstacles
- Rocket launcher — alt weapon with projectile system, sprite sheet animation
- Pickup system — ammo crates, shield potions with hover animation
- Shield system — damage absorption orb with visual indicator
- Time dilation — slow-mo effect on obstacle destruction

### Visual / Juice
- CRT shader pipeline — post-processing scanline/warp effect on entire game
- Parallax background — 8-layer scrolling (sky, far buildings, close buildings, railing)
- Puddle reflection system — reflections below road, visible through puddle-shaped BitmapMask holes
- Object reflections — player, obstacles, cars, pickups, slash VFX reflected with proper pivots
- Speed lines, camera shake, screen flash, edge warnings

### Audio / Music
- Engine loop, impact sounds, SFX
- Dual music player — YouTube + Spotify with thumbnail, track title, shuffle, prev/next/mute
- Countdown audio system — plays countdown music before playlist starts (both sources)
- Countdown skip — any input during countdown instantly starts gameplay
- Unified countdown audio for YT + Spotify
- YT/Spotify first-track deduplication (no same song twice in a row)

### Spotify Integration
- OAuth2 PKCE flow for Premium playback
- Spotify Web Playback SDK (device registers as "DP Moto")
- Profile system — avatar + display name from Spotify/Google auth

### UI / UX
- BIOS boot screen — retro boot sequence with loading bar, [ENTER] prompt, jitter animation
- Tutorial overlay — multi-page how-to-play with skip button pulse animation
- Profile popup — expandable card with player stats
- Death flow — anon players only see name entry for top 10
- Supabase global leaderboard — weekly top 10, avatar support, anon + named entries
- CRT hover proxy system — proxy objects pass hover state through CRT filter

### WMP (Windows Media Player) Popup
- Now Playing + Library tabs
- Library tab with track list, scroll, column resize/reorder
- Win95 context menu with submenu (Copy, Favorite, Play in Spotify, Get Info, Add to Playlist)
- Predefined playlists (Title Track, Ride or Die, this is hume)
- Favorites system — Supabase-backed per-user favorites with optimistic UI + rollback
- Custom playlists — create, inline rename, add/remove/paste tracks, delete
- Context menu Phaser rendering (HTML invisible, Phaser renders through CRT)

### Backend (Supabase)
- Music catalog sync edge function — Spotify artist catalog + YouTube auto-match + popularity scores
- Schema: music_artists, music_tracks, user_favorites, user_playlists, user_playlist_tracks
- Catalog services: MusicCatalogService (reads), TrackMappingService (writes/sync)
- PlaybackController — catalog-aware Spotify↔YouTube bridge

### Mobile (Phase 1 — In Progress)
- iOS audio unlock ritual (AudioContext.resume, Spotify activateElement, YouTube play/pause)
- Mobile sprite sheets (50% scale, nearest-neighbor)
- Touch input system — multi-touch steer + boost (left) / katana + rocket (right)
- Orientation overlay — "this isn't tik tok... rotate your shit" in red Alagard font
- touch-action: none on canvas
- Mobile cursor tracking (pointerdown/pointermove)
- Tap vs hold distinction (MOBILE_TAP_THRESHOLD)
- BIOS tap detection (pointerup with threshold)
- Cursor fade on countdown, hidden during gameplay + death screen
- Tutorial fade duration shortened (1.0s → 0.35s)

### Bug Fixes (Pre-Versioning)
- Fixed death screen green box (nameEnterBtn padding)
- Fixed CSS animation overriding BIOS scale
- Fixed avatar ring gap in ProfilePopup
- Fixed ProfileHud stroke flash during transitions
- Fixed broken comment block in WMPPopup
- Fixed column resize/reorder width calculation
