# DP Moto — Game Flow Reference

> **This document maps every phase of the game from page load to restart.**
> Each phase is marked **[LOCKED]** (working perfectly, protected) or **[WIP]** (still being iterated).
> Any Claude modifying code related to a [LOCKED] phase must follow the Locked-In Protection Protocol in `claude.md`.

---

## How to Read This Doc

- **[LOCKED]** = Working perfectly. Protected from changes. Bug history included so you know what broke before.
- **[WIP]** = Still being iterated. No protection guarantees.
- If you must modify locked code: **2x testing required** — verify the full flow twice, check for regressions, flag the change to Mikey.
- Phases are ordered by player experience (what the player sees, in order).

---

## Phase 0: Page Load + Vite Bootstrap [LOCKED]

**What happens:** Browser loads `index.html`. Phaser 3.90 loaded via CDN `<script>` tag (not Vite-bundled). `main.ts` detects device profile, initializes test mode if `?test=1`, creates Phaser Game instance. GameScene + CRT pipelines loaded via dynamic imports (separate chunks).

**Files:** `index.html`, `src/main.ts`, `src/config/gameMode.ts`, `src/util/device.ts`, `src/phaserShim.ts`

**Known working:**
- CDN Phaser load + `phaserShim.ts` re-export (avoids Vite pre-bundling crash on iOS)
- Dynamic import splits GameScene (351KB) into separate chunk, reducing initial payload to ~226KB
- Device profile detection: 12 iPhone fingerprints, 5 iPads, Android fallbacks, 5 tiers
- `?simulate=<slug>` URL param overrides device profile for testing
- `?test=1` enables Robot Pilot test mode (autoDismissBios, skipTutorial, fastCountdown)

**Inputs:** None (page loading)

### Past Bugs
1. **iOS Safari crash within 1 second** — Root cause: Vite pre-bundled Phaser module crashes iPhone Xs Safari. Fix: Load Phaser 3.90 via CDN `<script>` tag, use `phaserShim.ts` to re-export `window.Phaser`. Files: `index.html`, `src/phaserShim.ts`. Date: v0.00.41.
2. **Initial payload too large (591KB)** — Root cause: All JS in single bundle. Fix: Dynamic import GameScene + CRT/Water/DamageFlash pipelines as separate chunks. `BootScene` waits for `window.__gameSceneReady` flag. Files: `src/main.ts`, `src/scenes/BootScene.ts`. Date: v0.00.45.
3. **iPhone 12 Mini crash at 4s with HUD** — Root cause: `?hud=1` vision HUD too heavy on 4GB device. Fix: Guard HUD init with device tier check. Files: `src/main.ts` (lines 42-49). Date: v0.00.49.

---

## Phase 1: BIOS Boot Screen [LOCKED]

**What happens:** Full-screen BIOS boot overlay (HTML/CSS in `index.html`) shows retro POST-style text, a loading bar, and a jittering "[ENTER]" prompt. Three CDN audio files (bootup, beep, click) begin playing. BootScene runs preload in the background loading 150+ game assets.

**Files:** `index.html` (lines 1-860), `src/scenes/BootScene.ts`

**Known working:**
- Loading bar animation fills over ~2s
- "[ENTER]" prompt jitters using CSS `bios-jitter` animation with `--bios-jitter-amount` and `--bios-jitter-speed` CSS vars
- Right-justified "[ENTER]" aligned with loading bar right edge
- BIOS text uses same jitter vars as enter prompt (unified)
- Boot audio plays from CDN (no Vite bundling)

**Inputs:** Mouse click OR Space/Enter key dismisses BIOS overlay

### Past Bugs
1. **CSS animation overriding scale** — Root cause: `bios-jitter` keyframes had `transform: translateY(...)` which completely replaces the element's `transform: scale(...)` every frame. Fix: Include `scale(var(--bios-enter-scale))` alongside `translateY` in the keyframe. Files: `index.html` CSS. Date: 2026-02-18.
2. **[ENTER] prompt not right-justified** — Root cause: Default alignment. Fix: Right-justify to match loading bar right edge. Files: `index.html`. Date: 2026-02-18.

---

## Phase 1.5: Swipe-to-Fullscreen (Phones Only) [LOCKED]

**What happens:** After BIOS dismissal on phone devices (not tablet, not desktop, not test mode), a "SWIPE UP" overlay appears. A scroll spacer extends the page to enable Safari's address bar hide on swipe-up. `window.__swipeLock = true` blocks all title screen input until swipe completes. User swipes up, Safari chrome hides, overlay disappears after 300ms delay.

**Files:** `index.html` (lines 633-682, 750-751, 1082)

**Known working:**
- Only triggers on phone device tiers (not tablet, not desktop)
- `__swipeLock` flag prevents accidental game start during swipe
- 300ms delay after scroll ensures Safari chrome fully hidden before enabling input
- Arrow animation provides clear visual instruction
- Scroll spacer div creates enough page height for Safari swipe-up gesture

**Inputs:** Swipe-up gesture (scroll event)

### Past Bugs
1. **Swipe overlay blocks all title clicks** — Root cause: No input gate during swipe phase. Fix: Added `__swipeLock` check in `updateTitle()` (GameScene.ts:2286) to ignore clicks while swipe overlay active. Files: `GameScene.ts`, `index.html`. Date: v0.00.71.

---

## Phase 2: BootScene Asset Loading [WIP]

**What happens:** BootScene `preload()` loads 150+ assets: sprites, spritesheets, audio, textures. Mobile devices get compressed `_mobile` suffix variants. Lite mode (phone-low) skips heavy spritesheets (~88MB VRAM savings). Failed assets retry with 500ms/1000ms exponential backoff, then get magenta placeholder textures. Procedural textures generated for missing lite-mode assets.

**Files:** `src/scenes/BootScene.ts`

**Why WIP:** liteMode asset gates still being tuned per device tier. Mobile road/railing texture copies recently added (v0.00.72). VRAM budgets per tier not yet finalized — `default-avatar` at 3300x3300 (41.5MB VRAM) still needs crushing.

**Known working:**
- Road + railing: real textures with nearest-neighbor downscaled mobile copies (`road_mobile.jpg` 2048x91, `railing_dark_mobile.jpg` 2048x11)
- Retry system with exponential backoff for failed assets
- Magenta placeholder fallback for persistently failed assets
- Animation definitions: title-loop (27 frames), title-start (25 frames), countdown sheet

### Past Bugs
1. **Grey road/railing on mobile** — Root cause: liteMode replaced road + railing with procedural grey textures (256x128 grey road, 256x8 grey railing). Fix: Load real textures via `_mobile` suffix nearest-neighbor downscaled copies. Files: `BootScene.ts` (lines 164-166). Date: v0.00.72.
2. **VRAM budget exceeded on 4GB phones** — Root cause: Full spritesheets loaded on all devices. Fix: Lite mode skips attack/start/powered/speedup/rocket-launch sheets. Files: `BootScene.ts`, `main.ts` (lines 23-28). Date: v0.00.45.

---

## Phase 3: Title Screen [LOCKED]

**What happens:** BIOS overlay fades out (1.3s animation), boot audio volume fades to 0 (500ms). Title screen appears with animated title loop (27 frames, desktop) or static frame (mobile). Parallax background scrolls. Music player UI positioned top-right. Profile HUD positioned top-left. Game modes button positioned bottom-left.

**Files:** `src/scenes/GameScene.ts` (lines 2277-2313 — `updateTitle()`), `src/systems/ParallaxSystem.ts`, `src/systems/MusicPlayer.ts`, `src/ui/ProfileHud.ts`

**Known working:**
- Title animation loop plays smoothly on desktop, static frame on mobile (performance)
- Parallax background visible and scrolling
- Music player UI at half-size on mobile (MUSIC_UI_SCALE = 0.5), top-right anchored
- Profile HUD shows avatar + name (Spotify) or default
- `__swipeLock` check prevents input during swipe phase on phones
- Clicking non-UI area enters Tutorial

**Inputs:**
- Click anywhere (except UI elements) → enters Tutorial
- Profile HUD avatar click → opens Profile Popup
- Music player interactions (shuffle, prev/next, mute)
- Game modes button hover → yellow highlight

### Past Bugs
1. **Queued inputs from BIOS triggering gameplay** — Root cause: Keyboard/click inputs from BIOS dismiss were still in the queue when title loaded. Fix: Drain all input queues before processing title input (GameScene.ts:2297-2299). Date: 2026-02-18.
2. **Green triangle cursor visible during title on mobile** — Root cause: Mobile cursor (InputSystem green triangle) started visible. Fix: Cursor starts hidden (`setVisible(false)`), only shown in `enterStarting()`. Files: `InputSystem.ts`, `GameScene.ts`. Date: v0.00.72.

---

## Phase 4: Tutorial [LOCKED]

**What happens:** Multi-page tutorial overlay with three sections (controls, obstacles, rage). Each section fades in, waits for Space/Enter input, fades out. Desktop gets intro-to-tutorial cutscene (27-frame animation) before controls page. Skip button pulses (min/max scale animation) in corner — click skips directly to countdown with red flash + instant fade-to-black.

**Files:** `src/scenes/GameScene.ts` (lines 2796-3009 — `enterTutorial()`, `updateTutorial()`)

**Known working:**
- Tutorial phases: controls_wait → controls_fade → obstacles_in → obstacles_wait → obstacles_fade → rage_in → rage_wait → rage_black
- Skip button pulse animation with `SKIP_BTN_PULSE_MIN`/`SKIP_BTN_PULSE_MAX` tuning
- Test mode (`TEST_MODE.skipTutorial`) bypasses directly to `enterStarting()`
- Intro cutscene plays on desktop only (skipped on mobile for performance)
- Game inputs (speed tap, attack, rocket) drained every frame to prevent queuing

**Inputs:**
- Space/Enter: Advance to next tutorial page
- Skip button click: Instant skip to countdown
- All game inputs drained (not processed)

### Past Bugs
1. **Skip button pulse not visible** — Root cause: Missing pulse animation on skip button. Fix: Added `SKIP_BTN_PULSE_MIN`/`SKIP_BTN_PULSE_MAX` constants with scale oscillation. Files: `GameScene.ts` (lines 50-52). Date: 2026-02-18.

---

## Phase 5: Countdown + Skip [LOCKED]

**What happens:** `enterStarting()` sets state to STARTING. Mobile cursor (green triangle) shown. Black overlay visible. Numbers 5, 4, 3, 2 animate in sequence (scale 0.5→1, alpha 1→0, ease-out cubic). Countdown music plays (hell_girl_countdown.mp3) for both Spotify and YouTube sources. When "2" finishes: music player revealed, pre-start cutscene plays (46 frames, desktop only). Any input (click/tap/key) at any point instantly skips countdown, stops countdown audio, and calls `startGame()`.

**Files:** `src/scenes/GameScene.ts` (lines 3011-3053 — `enterStarting()`, lines 2532-2655 — `updateStarting()`), `src/systems/MusicPlayer.ts`, `src/config/tuning.ts`

**Known working:**
- Countdown numbers 5→2 (no "1", transitions to gameplay)
- Countdown phases: delay → animate → (repeat for each number) → cutscene → done
- Any input = instant skip (click, tap, keyboard key)
- `musicPlayer.skipCountdownAudio()` + `musicPlayer.revealForGameplay()` on skip
- Test mode `fastCountdown` injects tap on next frame for instant skip
- Spawn grace timer set on skip to prevent instant death

**Inputs:**
- Any click/tap/keyboard key: Skip countdown immediately
- Inputs drained before processing to prevent queuing

### Past Bugs
1. **YouTube had no countdown music** — Root cause: YouTube used a delay-shuffle hack instead of actual countdown audio. Fix: Unified countdown audio (hell_girl_countdown.mp3) for both YT and Spotify sources. Files: `MusicPlayer.ts`. Date: 2026-02-18.
2. **Countdown skip didn't restore music UI** — Root cause: `musicPlayer.revealForGameplay()` not called on skip path. Fix: Explicitly call reveal + skip audio on any input. Files: `GameScene.ts` (lines 2560-2561). Date: 2026-02-18.
3. **Same first song every session** — Root cause: No deduplication of first track. Fix: Added first-track deduplication via localStorage in both MusicPlayer and SpotifyPlayerSystem. Files: `MusicPlayer.ts`, `SpotifyPlayerSystem.ts`. Date: 2026-02-18.

---

## Phase 6: Gameplay (PLAYING) [WIP]

**What happens:** `startGame()` sets state to PLAYING. Crosshair mode enabled. All game systems running: road scrolling, parallax, player movement (Y follows mouse/touch), speed tap (Space/tap), obstacles spawning (CRASH/SLOW/CAR types), collision detection, scoring (distance + speed multiplier), difficulty ramp (0→1 over 120s), pickups (ammo, shield), rockets, slash attack (F key), FX (speed lines, shake, flash), audio (engine loop, impacts). Reflections visible (except phone-low). Music playing.

**Files:** `src/scenes/GameScene.ts` (lines 3309-3380 — `startGame()`, lines 3400+ — `updatePlaying()`), `src/systems/PlayerSystem.ts`, `src/systems/ObstacleSystem.ts`, `src/systems/ScoreSystem.ts`, `src/systems/DifficultySystem.ts`, `src/systems/RoadSystem.ts`, `src/systems/ParallaxSystem.ts`, `src/systems/InputSystem.ts`, `src/systems/FXSystem.ts`, `src/systems/AudioSystem.ts`, `src/systems/PickupSystem.ts`, `src/systems/RocketSystem.ts`, `src/systems/ShieldSystem.ts`

**Why WIP:** Ongoing mobile optimization. CAR_COUNT_MOBILE currently 0 (needs per-device tuning). Reflection system disabled on phone tiers (reflectionSystem nullable, gated by `!GAME_MODE.mobileMode`). Touch input still being refined. Performance varies across device tiers.

**Inputs:**
- Mouse Y / Touch Y: Player follows position
- Space (desktop) / Tap (mobile): Speed tap — brief acceleration burst + cooldown
- F key (desktop): Katana slash — destroys nearby obstacles, cooldown
- Right-click (desktop): Rockets (if ammo available)

---

## Phase 7: Dying Sequence [LOCKED]

**What happens:** Collision detected → `enterDead()` → state = DYING. Death juice: screen shake + white flash + explosion SFX + engine silenced. Explosion sprite plays at player position. Death animation state machine: ramp (white overlay 0→peak, quadratic ease-in, ~200ms) → snap (peak→full white, ~100ms) → hold (full white ~300ms, prepare score/leaderboard data, determine name entry vs auto-submit) → fade (white→transparent, ~400ms, reveal death screen). During hold: if profile named → auto-submit score; if anon + top 10 → prepare name entry UI; if anon + outside top 10 → show leaderboard only.

**Files:** `src/scenes/GameScene.ts` (lines 4697-4768 — `enterDead()`, lines 4549-4695 — `updateDying()`), `src/systems/FXSystem.ts`, `src/systems/AudioSystem.ts`

**Known working:**
- Smooth 4-phase death animation (ramp → snap → hold → fade)
- `deathGen` counter invalidates stale async leaderboard fetches
- Auto-submit for named profiles (Spotify login → instant leaderboard display)
- Anon top-10 detection for name entry routing
- Music player collapses to thumbnail-only (compact mode)
- All debug overlays, reflections, mobile cursors hidden during death

**Inputs:** None (frozen during animation)

### Past Bugs
1. **Green box covering death screen** — Root cause: `nameEnterBtn` Phaser Text had `padding: {x:500, y:500}` with `backgroundColor: '#003300'` at depth 211, covering everything below. Fix: Reduced padding to small values. Files: `GameScene.ts`. Date: 2026-02-18.
2. **Death overlay not reaching white** — Root cause: Linear interpolation too slow. Fix: Quadratic ease-in formula for ramp phase. Files: `GameScene.ts` (line 4556). Date: 2026-02-18.

---

## Phase 8: Name Entry (Anon + Top 10 Only) [LOCKED]

**What happens:** If death phase determines anon + top 10 score: name entry UI shown. `enteredName = ''`, cursor blinks. Keyboard handler: Enter submits, Backspace deletes, alphanumeric adds (max 10 chars). "NEW HIGH SCORE!" title rainbow-cycles. On submit: score sent to local leaderboard + Supabase global leaderboard. Updated top 10 fetched. Transitions to DEAD state with submitted name highlighted in rainbow.

**Files:** `src/scenes/GameScene.ts` (lines 4770-4820 — visuals + keyboard activation, lines 5098-5162 — `updateNameEntry()`, submit logic), `src/systems/LeaderboardService.ts`, `src/systems/LeaderboardSystem.ts`

**Known working:**
- Rainbow-cycling "NEW HIGH SCORE!" title (80ms cycle)
- Space taps consumed during name entry (prevent restart queue)
- Empty name warning: "No name? Press ENTER to submit anon"
- Dual submit: local leaderboard + Supabase global
- `deathGen` invalidation prevents stale data display

**Inputs:**
- Keyboard: Enter (submit), Backspace (delete), alphanumeric (add char)
- Name button click: Submit name
- Max 10 characters (`NAME_MAX_LENGTH`)

### Past Bugs
None recorded for name entry flow.

---

## Phase 9: Death Screen / Leaderboard [LOCKED]

**What happens:** Leaderboard display populated from global (Supabase) or local fallback data. Top 3 entries: large font (1.5x), avatar circle + medal ring. Rows 4-10: normal font. Current player's row highlighted with rainbow-cycling colors. Score and time displayed. 0.5s input delay prevents accidental restart. Speed tap → `startGame()` (instant restart, loops back to Phase 6).

**Files:** `src/scenes/GameScene.ts` (lines 4831-5090 — `prepareDeathScreenVisuals()`, lines 5164-5186 — `updateDead()`), `src/systems/LeaderboardSystem.ts`, `src/systems/LeaderboardService.ts`

**Known working:**
- Top 3 with avatar circles and medal rings
- Rainbow-cycling highlight for current player's row
- 0.5s input delay prevents accidental restart
- Speed tap = instant restart (no title screen required)
- Profile HUD avatar click still opens popup during death screen

**Inputs:**
- Space / Speed tap: Restart game (after 0.5s delay)
- Profile HUD click: Opens profile popup
- Music player interactions: Normal

### Past Bugs
1. **Avatar ring gap on death screen** — Root cause: Phaser draws strokes centered on shape edge (half inside, half outside). Ring radius was `AVATAR_RADIUS + AVATAR_RING_WIDTH` instead of `+ AVATAR_RING_WIDTH / 2`. Fix: Offset radius by half stroke width. Files: `ProfilePopup.ts`, `GameScene.ts`. Date: 2026-02-18.
2. **ProfileHud stroke flash during transitions** — Root cause: `AVATAR_STROKE_ALPHA = 2` — Phaser multiplies child alpha by container alpha during tweens. Alpha > 1 means stroke stays visible during fades. Fix: Never set alpha > 1 on objects inside containers that get alpha-tweened. Files: `ProfileHud.ts`. Date: 2026-02-18.
3. **Death screen avatars appeared large** — Root cause: Separate constants (`DLB_T3_AVATAR_R=30`) — they were always that size, hidden by the green box bug above. Resolution: Not a bug, expected behavior. Date: 2026-02-18.

---

## Phase 10: Return to Title [LOCKED]

**What happens:** From DEAD state, speed tap calls `startGame()` which resets and starts a new run (loops to Phase 6). Alternatively, `returnToTitle()` performs full cleanup: state → TITLE, crosshair off, all timers/phases reset, all HUD overlays hidden (death container, name entry, leaderboard entries), all game objects hidden (player, obstacles, pickups, rockets, effects), rhythm mode cleared, road/parallax/sky made visible, title animation started. Loops back to Phase 3 (Title Screen).

**Files:** `src/scenes/GameScene.ts` (lines 2657-2756 — `returnToTitle()`)

**Known working:**
- Comprehensive cleanup of all game state
- All overlays and containers properly hidden
- Rhythm mode state fully cleared
- Road/parallax/sky systems restored to title state
- Title loop animation restarted (desktop) or static frame shown (mobile)
- Green triangle cursor hidden during title

**Inputs:** Title screen input resumes (see Phase 3)

### Past Bugs
1. **Leftover tutorial UI visible after restart** — Root cause: Tutorial containers not hidden in cleanup. Fix: Comprehensive cleanup in `returnToTitle()` resets all tutorial, countdown, and death phases to 'done'. Files: `GameScene.ts` (lines 2664-2756). Date: 2026-02-18.

---

## Quick Reference: State Machine

```
GameState enum:
  TITLE        → Phase 3   (Title screen)
  SONG_SELECT  → (Rhythm mode playlist/difficulty — future)
  TUTORIAL     → Phase 4   (Multi-page tutorial)
  STARTING     → Phase 5   (Countdown 5→2)
  PLAYING      → Phase 6   (Gameplay loop)
  DYING        → Phase 7   (Death animation)
  NAME_ENTRY   → Phase 8   (Anon top-10 name prompt)
  DEAD         → Phase 9   (Leaderboard display)

Flow: 0 → 1 → 1.5 → 2 → 3 → 4 → 5 → 6 → 7 → 8? → 9 → 6 (restart) or 10 → 3 (title)
```

## Status Summary

| Phase | Name | Status | Perfect Item |
|-------|------|--------|-------------|
| 0 | Page Load + Vite Bootstrap | [LOCKED] | Verified iPhone Xs + 12 Mini |
| 1 | BIOS Boot Screen | [LOCKED] | Since 2026-02-18 |
| 1.5 | Swipe-to-Fullscreen | [LOCKED] | Since 2026-02-24 |
| 2 | BootScene Asset Loading | [WIP] | — |
| 3 | Title Screen | [LOCKED] | Part of "Full Game Flow" |
| 4 | Tutorial | [LOCKED] | Part of "Full Game Flow" |
| 5 | Countdown + Skip | [LOCKED] | Since 2026-02-18 |
| 6 | Gameplay (PLAYING) | [WIP] | — |
| 7 | Dying Sequence | [LOCKED] | Part of "Transition Animations" |
| 8 | Name Entry | [LOCKED] | Part of "High Score Screen" |
| 9 | Death/Leaderboard | [LOCKED] | Since 2026-02-18 |
| 10 | Return to Title | [LOCKED] | Part of "Full Game Flow" |
