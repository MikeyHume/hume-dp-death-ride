# DP Moto — Mobile Ship & Optimization Plan

> **Purpose:** End-to-end analysis for shipping on iPhone + iPad, followed by a prioritized optimization roadmap.
> **Status:** Read-only research — no code changes made.
> **Date:** 2026-02-20
> **Reference:** Both Mikey and Claude should use this doc when executing the plan.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [What Already Works on Mobile](#2-what-already-works-on-mobile)
3. [Mobile Ship Plan](#3-mobile-ship-plan)
   - [Phase 1: Must-Fix](#phase-1-must-fix-game-wont-run-without-these)
   - [Phase 2: Should-Fix](#phase-2-should-fix-degraded-but-usable-without-these)
   - [Phase 3: Nice-to-Have](#phase-3-nice-to-have-polish)
4. [Optimization Plan](#4-optimization-plan)
   - [Tier 1: Asset Pipeline](#tier-1-asset-pipeline-highest-impact)
   - [Tier 2: Runtime Performance](#tier-2-runtime-performance)
   - [Tier 3: Network / API](#tier-3-network--api)
   - [Tier 4: Build / Bundle](#tier-4-build--bundle)
5. [Metrics & Validation](#5-metrics--validation)
6. [Top 10 Risks / Unknowns](#6-top-10-risks--unknowns)
7. [Appendix: Full Asset Inventory](#7-appendix-full-asset-inventory)
8. [Appendix: Audio System Deep-Dive](#8-appendix-audio-system-deep-dive)
9. [Appendix: Rendering Pipeline](#9-appendix-rendering-pipeline)

---

## 1. Architecture Overview

| Layer | Tech | Notes |
|-------|------|-------|
| **Engine** | Phaser 3.90 (WebGL only) | 1920x1080, Scale.FIT, DOM overlay enabled |
| **Build** | Vite 6.3.1, TypeScript 5.7.2 | Phaser code-split into separate chunk |
| **Backend** | Supabase (Postgres + Edge Functions) | Anon auth, leaderboard, music catalog |
| **Audio** | Phaser Sound + Web Audio API + Spotify SDK + YouTube IFrame | 4 separate audio paths |
| **Deploy** | Vercel (static) | SPA fallback routing via `vercel.json` |
| **Assets** | ~548 MB total | 200+ images, 14 audio files, 3 custom fonts |

### Boot Flow

```
index.html (BIOS overlay)
    |
    v
main.ts (Phaser config, Spotify callback check)
    |
    v
BootScene.preload() — loads ALL assets (~3s)
    |
    v
BootScene.create() — builds 100+ animations, generates textures, loads fonts
    |
    v
GameScene.create() — wires all systems, enters TITLE state
    |
    v
User input --> Tutorial --> Countdown --> Gameplay
```

### Key File Map

| Area | Files | Size |
|------|-------|------|
| Core boot | `main.ts`, `BootScene.ts`, `index.html` | Small |
| Game hub | `GameScene.ts` | ~158 KB (huge) |
| Config | `tuning.ts`, `crtTuning.ts`, `gameMode.ts` | Small |
| Audio | `AudioSystem.ts`, `MusicPlayer.ts`, `SpotifyPlayerSystem.ts`, `SpotifyAuthSystem.ts` | Medium |
| Rendering | `ParallaxSystem.ts`, `ReflectionSystem.ts`, `FXSystem.ts`, `CRTPipeline.ts` | Medium |
| Gameplay | `PlayerSystem.ts`, `ObstacleSystem.ts`, `RocketSystem.ts`, `ShieldSystem.ts`, etc. | Medium |
| UI | `WMPPopup.ts` (3000+ lines), `ProfileHud.ts`, `ProfilePopup.ts`, `DisconnectModal.ts` | Large |
| Backend | `AuthSystem.ts`, `LeaderboardService.ts`, `MusicCatalogService.ts`, `supabaseClient.ts` | Small |

---

## 2. What Already Works on Mobile

These are **confirmed implemented** in the codebase:

- **Dual-pointer touch input** — left half = steer + boost, right half = attack + rocket
- **Tap vs hold detection** — 180ms threshold separates taps from holds
- **Mobile cursor** — green triangle on left edge (replaces mouse cursor)
- **Landscape lock overlay** — dark overlay + "Rotate your device" when in portrait
- **Device detection** — `detectMobileLike()` and `isiOS()` in `device.ts`
- **WebGL context loss handling** — `webglcontextlost` / `webglcontextrestored` listeners in `main.ts`
- **Viewport meta** — `viewport-fit=cover`, `user-scalable=no`, `maximum-scale=1.0`
- **GPU power hint** — `powerPreference: 'low-power'` on mobile devices
- **Quality auto-downgrade** — PerfSystem drops from High → Medium → Low based on FPS
- **Phaser Scale.FIT** — maintains 16:9 aspect ratio on any screen size

---

## 3. Mobile Ship Plan

### Phase 1: Must-Fix (Game won't run without these)

---

#### 1. iOS Audio Unlock Ritual

> **Priority:** CRITICAL
> **Confidence:** High — this is a known iOS Safari requirement

**The Problem**

iOS Safari requires a user gesture (tap/click) to create or resume an `AudioContext`. The codebase has four separate audio paths (Phaser Sound, Web Audio API, Spotify SDK, YouTube IFrame) and none of them have an explicit iOS unlock pattern.

- `AudioSystem.start()` creates an `AudioContext` but doesn't call `.resume()`
- `startTitleMusic()` in MusicPlayer has **zero gesture guard**
- Spotify Web Playback SDK needs an unlocked `AudioContext` to register as a device
- Phaser's sound system uses Web Audio backend but relies on implicit gesture propagation

**Files to Change**

| File | What to do |
|------|-----------|
| `src/systems/AudioSystem.ts` | Add explicit `AudioContext.resume()` in `start()`, add `isUnlocked()` check |
| `src/systems/MusicPlayer.ts` | Gate `startTitleMusic()` behind audio unlock confirmation |
| `src/scenes/GameScene.ts` | Ensure gesture → `AudioContext.resume()` → `audioSystem.start()` chain at ~line 1752 |
| `src/main.ts` | Consider adding Phaser `audio: { disableWebAudio: false, context: sharedContext }` to config |

**How to Validate**

1. iPhone Safari, fresh page load (no prior interaction)
2. Tap through BIOS overlay → confirm boot sounds play
3. First game input → confirm title music starts
4. Enter gameplay → confirm engine SFX, slash sounds, pickup sounds all work
5. If Spotify connected → confirm playback registers and audio comes through

**Failure Modes**
- Silent audio on first play (most common)
- Spotify SDK device never registers (shows "no device" in Spotify app)
- Countdown music plays but gameplay audio doesn't
- Engine sound starts but slash/impact Web Audio synthesis fails

---

#### 2. Memory / VRAM Budget

> **Priority:** CRITICAL
> **Confidence:** High — iOS Safari enforces ~250MB WebGL texture limit

**The Problem**

All assets are loaded upfront in `BootScene.preload()`. Total disk size is ~548MB. Estimated VRAM after GPU decompression: **400-500MB** — roughly double what iOS Safari allows.

**Biggest Offenders**

| Category | Count | Size | VRAM Est. |
|----------|-------|------|-----------|
| Cutscene frames (pre_start) | 46 PNG at 1920x1080 | ~60 MB | ~380 MB |
| Tutorial frames (controls) | 29 JPG at 1920x1080 | ~25 MB | ~240 MB |
| Title sequence (start_loop + start_play) | 52 JPG at 1920x1080 | ~39 MB | ~430 MB |
| Car sprite sheets | 20 PNG at 4-6 MB each | ~100 MB | ~200 MB |
| Player sprite sheets | 6 PNG (16+11+8.5+5.5+4.6+... MB) | ~47 MB | ~160 MB |
| **Total** | | **~548 MB** | **~1.4 GB** |

> Note: VRAM estimates assume RGBA decompression. Actual depends on GPU texture format.

**Files to Change**

| File | What to do |
|------|-----------|
| `src/scenes/BootScene.ts` | Split preload into phases: essentials first, cutscenes/tutorial on-demand |
| `src/scenes/GameScene.ts` | Load cutscene textures before playing, destroy after |
| `public/assets/` | Convert PNG → WebP, downscale for mobile, or replace frame sequences with video |

**How to Validate**

1. Safari Web Inspector → Memory tab → watch "Images" during gameplay
2. Target: stay under 200MB GPU memory on iPad
3. If WebGL context is lost during play → memory exceeded
4. Test on oldest target iPad (A10 Fusion = iPad 7th gen)

**Failure Modes**
- WebGL context lost → black screen (handler prevents reload, but game is dead)
- Safari tab crashes silently
- 30+ second load times on cellular

---

#### 3. CRT Shader GPU Budget

> **Priority:** HIGH
> **Confidence:** Medium — depends on target device

**The Problem**

The CRT post-processing shader (`CRTPipeline.ts`) does **24 texture lookups per pixel per frame**:

| Effect | Samples/px |
|--------|-----------|
| Bloom (3x3 kernel) | 9 |
| Beam focus | 4 |
| Chromatic aberration | 3 |
| Scanlines | 8 iterations |
| **Total** | **~24** |

At 1920x1080 @ 60fps = ~3 billion texture samples per second. Fine on desktop, brutal on mobile GPU.

**Files to Change**

| File | What to do |
|------|-----------|
| `src/fx/CRTPipeline.ts` | Create mobile variant: skip bloom + beam focus (saves 13 samples/px) |
| `src/config/crtTuning.ts` | Add mobile preset with reduced values |
| `src/systems/PerfSystem.ts` | Ensure "Low" tier fully disables CRT (currently unclear) |
| `src/main.ts` | Consider half-res rendering on mobile (960x540) |

**How to Validate**

1. Safari Web Inspector → GPU timeline during gameplay
2. Toggle CRT on/off, measure FPS delta
3. Target: 60fps with CRT on iPad Air (A14), 60fps without CRT on iPad 7th gen

**Failure Modes**
- Sustained <30fps
- GPU thermal throttling (smooth for 30s, then frame drops)
- Heavy battery drain

---

#### 4. Spotify Auth on iOS Safari

> **Priority:** HIGH
> **Confidence:** High — `window.open()` is notoriously broken on iOS Safari

**The Problem**

The Spotify PKCE login opens a popup window via `window.open()`. On iOS Safari:
- Popups are blocked by default
- Even if allowed, the popup loses focus and may not return properly
- Game state is not preserved if same-page redirect is used instead

Additionally: the stored `refresh_token` is **never used** — access token expires after ~1 hour with no renewal.

**Files to Change**

| File | What to do |
|------|-----------|
| `src/systems/SpotifyAuthSystem.ts` | Detect iOS → use same-page redirect instead of popup. Save game state to `sessionStorage` before redirect. Implement `refresh_token` usage. |
| `src/main.ts` | After callback, restore game state from `sessionStorage` |

**How to Validate**

1. iPhone Safari → tap "Sign in with Spotify" → complete auth → returns to game with state intact
2. Leave game open 1+ hours → Spotify playback continues (token refreshed)
3. Kill Safari, reopen → session restored from localStorage

**Failure Modes**
- Blank page after auth redirect (game state lost)
- Playback stops after 1 hour (token expired, no refresh)
- Popup blocked silently (user sees nothing happen)

---

### Phase 2: Should-Fix (Degraded but usable without these)

---

#### 5. Touch-Friendly WMP Popup

> **Priority:** MEDIUM

**The Problem**

The Windows Media Player popup is entirely mouse-centric:

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Window drag | Mouse on titlebar | **Broken** |
| Window resize | Mouse on edges | **Broken** |
| Context menu | Right-click | **No alternative** |
| Library scroll | Mousewheel | **No touch scroll** |
| Column resize | Mouse drag divider | **Broken** |
| Column reorder | Mouse drag header | **Broken** |

**Files to Change**

| File | What to do |
|------|-----------|
| `src/ui/WMPPopup.ts` | Add long-press (500ms) as right-click alternative. Add touch drag/swipe for scrolling. Consider mobile-specific full-screen layout. |

**How to Validate**

- iPad Safari → open WMP → scroll library by swiping, long-press a track to see context menu
- All context menu actions accessible via long-press

---

#### 6. ProfilePopup Touch Scroll

> **Priority:** LOW

**The Problem:** Scroll area only responds to mousewheel, not touch swipe.

**File:** `src/ui/ProfilePopup.ts` — add `touchstart`/`touchmove`/`touchend` listeners

---

#### 7. Safe Area Insets (iPhone Notch / Dynamic Island)

> **Priority:** LOW-MEDIUM

**The Problem:** `viewport-fit=cover` is set but no `env(safe-area-inset-*)` CSS offsets are applied. HUD at position (40, 40) may be clipped by the notch/Dynamic Island in landscape.

**Files:** `index.html` (CSS), `ProfileHud.ts` (positioning), `GameScene.ts` (HUD layout)

---

### Phase 3: Nice-to-Have (Polish)

---

#### 8. Touch Target Sizes

Apple's minimum recommended touch target is 44x44pt. Many UI buttons (music controls, tab buttons, window close) are smaller. Increase hit areas on mobile.

#### 9. Haptic Feedback

iOS supports haptics via webkit. Could add subtle vibration on obstacle hit, slash, death — adds to the arcade feel.

#### 10. PWA Manifest & Service Worker

No `manifest.json` or service worker exists. Adding these would:
- Allow "Add to Home Screen" on iOS
- Cache assets for instant reload
- Enable offline fallback screen

---

## 4. Optimization Plan

> Execute **after** the game works on mobile. Ordered by impact vs effort.

### Tier 1: Asset Pipeline (Highest Impact)

| # | Action | Savings | Effort | Where |
|---|--------|---------|--------|-------|
| **1** | **Replace frame sequences with video** — 125+ individual 1920x1080 JPGs for cutscenes/tutorials/title → H.264 MP4 | ~300 MB disk, ~1 GB VRAM | Medium | `BootScene.ts`, `GameScene.ts`, `public/assets/cutscenes/`, `tutorial/`, `start/` |
| **2** | **WebP sprite sheets** — Convert all PNG sprite sheets to WebP with fallback | 30-40% file size | Low | All `public/assets/*.png` |
| **3** | **Atlas car sprites** — 20 separate textures → 2-3 combined atlases | Fewer GPU state switches | Medium | `BootScene.ts`, `ObstacleSystem.ts`, `public/assets/cars/` |
| **4** | **Mobile asset variants** — Serve 960x540 assets on mobile | 75% VRAM reduction | Medium | `BootScene.ts`, `device.ts` |
| **5** | **Delete WAV duplicate** — `red malibu 1.5.wav` (22 MB) alongside MP3 of same track | 22 MB | Trivial | `public/assets/audio/music/` |
| **6** | **Compress SFX** — Reduce MP3 bitrate to 96kbps for short sound effects | ~50% audio size | Low | `public/assets/audio/sfx/` |

### Tier 2: Runtime Performance

| # | Action | Impact | Effort | Where |
|---|--------|--------|--------|-------|
| **7** | **Mobile CRT variant** — Skip bloom (9 samples) + beam focus (4 samples) | 55% fewer texture lookups | Medium | `CRTPipeline.ts`, `crtTuning.ts` |
| **8** | **Half-res rendering on mobile** — Internal resolution 960x540, CRT upscales | 4x fewer pixels shaded | Medium | `main.ts`, `CRTPipeline.ts` |
| **9** | **Lazy-load cutscene/tutorial textures** — Load on entry, destroy on exit | ~200 MB VRAM freed during gameplay | Medium | `BootScene.ts`, `GameScene.ts` |
| **10** | **Reflection system LOD** — Skip object RT draws on Low quality tier | Fewer RT.draw() calls/frame | Low | `ReflectionSystem.ts`, `PerfSystem.ts` |

### Tier 3: Network / API

| # | Action | Impact | Effort | Where |
|---|--------|--------|--------|-------|
| **11** | **Spotify token refresh** — Use stored `refresh_token` before expiry | Prevents 1-hour playback death | Low | `SpotifyAuthSystem.ts` |
| **12** | **Network retry with backoff** — Leaderboard + catalog fetches | Resilience on flaky mobile data | Low | `LeaderboardService.ts`, `MusicCatalogService.ts` |
| **13** | **Batch Supabase queries** — Profile + leaderboard + favorites in one RPC | Fewer round trips on boot | Medium | `AuthSystem.ts`, `LeaderboardService.ts` |

### Tier 4: Build / Bundle

| # | Action | Impact | Effort | Where |
|---|--------|--------|--------|-------|
| **14** | **Verify Brotli/gzip on Vercel** | ~70% JS transfer reduction | Trivial | `vercel.json` / Vercel dashboard |
| **15** | **Lazy-load WMPPopup** — Dynamic import on music menu click | ~50 KB less in initial bundle | Low | `GameScene.ts`, `WMPPopup.ts` |
| **16** | **PWA service worker** — Cache assets after first load | Instant reload, offline shell | Medium | New: `sw.js`, `manifest.json` |

---

## 5. Metrics & Validation

### What to Measure

| Metric | Tool | Desktop Target | Mobile Target |
|--------|------|---------------|---------------|
| FPS (sustained gameplay) | PerfSystem + Safari GPU Timeline | 60 fps | 60 fps iPad Air / 30 fps iPad 7th gen |
| VRAM usage | Safari Web Inspector → Memory | < 500 MB | **< 250 MB** |
| JS heap memory | Safari Web Inspector → Timelines | < 200 MB | < 150 MB |
| Initial page load | Lighthouse / WebPageTest | < 3s | < 5s on 4G |
| Time to interactive | Safari Timeline → First Input | < 3s | < 4s |
| JS bundle (gzipped) | `npx vite-bundle-visualizer` | — | < 400 KB |
| Audio latency (tap → sound) | Manual stopwatch | < 50ms | < 100ms |
| Asset transfer size | Network tab | — | < 50 MB first load |

### Testing Checklist (iPhone + iPad)

**Audio:**
- [ ] BIOS boot sounds play after first tap
- [ ] Title music starts after first game input
- [ ] Countdown audio plays with volume
- [ ] Engine SFX modulates with speed during gameplay
- [ ] Katana slash + impact sounds work (Web Audio synthesis)
- [ ] Spotify playback starts (if Premium connected)
- [ ] YouTube fallback works (if Spotify unavailable)
- [ ] Volume controls affect both sources
- [ ] Tab switch → return doesn't break audio context

**Input:**
- [ ] Touch left side → bike moves up/down
- [ ] Tap left side → speed boost
- [ ] Tap right side → katana slash
- [ ] Hold right side (1s) → rocket fires
- [ ] No phantom inputs or stuck states

**Display:**
- [ ] Game fills screen in landscape (no black bars beyond letterbox)
- [ ] Portrait → landscape overlay appears → rotate → game shows
- [ ] No UI clipped by notch/Dynamic Island
- [ ] CRT shader renders without artifacts
- [ ] Custom cursor not visible (touch mode uses green triangle)

**Flow:**
- [ ] BIOS → Title → Tutorial → Countdown → Gameplay → Death → Leaderboard → Retry
- [ ] Spotify login works (redirect, not popup) and returns to game
- [ ] Profile popup opens/closes
- [ ] WMP popup opens (even if not fully touch-friendly yet)

**Stability:**
- [ ] 5 minutes continuous gameplay without crash
- [ ] Tab away for 30s → return → game recovers
- [ ] WebGL context not lost during normal play
- [ ] No Safari tab crash under memory pressure

---

## 6. Top 10 Risks / Unknowns

> These are things I **cannot confirm** from the codebase alone.
> Each needs a specific answer before the plan can be fully executed.

| # | Risk | Why Unknown | Question for Mikey |
|---|------|-------------|-------------------|
| **1** | Actual VRAM usage on iOS | Can't run Safari Web Inspector remotely | Can you open Safari Web Inspector on a connected iPhone/iPad and check Memory → Images during gameplay? |
| **2** | CRT shader FPS on target iPads | No device testing possible | What's the **oldest iPad/iPhone** you want to support? (A10? A12? A14?) |
| **3** | Spotify redirect URI for production | `.env.local` has `127.0.0.1:8081` | What domain is registered in the Spotify developer dashboard for production? |
| **4** | Exact asset file sizes | Estimated from names, didn't run `du` | Can I run `du -sh public/assets/*` to get actual sizes? |
| **5** | Vercel compression status | Didn't check Vercel dashboard | Is Brotli/gzip enabled on Vercel for your static assets? |
| **6** | iOS WebGL context loss frequency | Handler exists but recovery is unclear | Have you seen black screens or crashes on iOS during any testing? |
| **7** | Spotify Web Playback SDK on iOS | SDK docs say iOS is "not officially supported" | Have you tested Spotify playback on iPhone Safari? Does it register as a Connect device? |
| **8** | YouTube IFrame behavior on iOS | `playsinline=1` is set but iOS may override | Does the YouTube video play inline in the WMP popup on iPhone, or does it go fullscreen? |
| **9** | Touch input feel | Dual-pointer system exists but may feel wrong | Have you playtested the touch controls on an actual phone? How does steering feel? |
| **10** | Current deploy state | `vercel.json` exists but unclear if live | Is the game currently deployed anywhere, or still local-only? |

---

## 7. Appendix: Full Asset Inventory

### Directory Breakdown

```
public/
  assets/
    audio/
      music/
        hell_girl_countdown.mp3          Countdown chime
        red malibu - deathpixie.mp3      Title track (MP3)
        red malibu 1.5.wav               Title track (WAV — DUPLICATE, delete)
      sfx/
        old_bootup.mp3                   BIOS startup sound
        bios complete loading.mp3        BIOS complete chime
        mouse click.mp3                  UI click
        mouse hover.mp3                  UI hover
        motorcycle engine.mp3            Engine loop (continuous)
        explode.mp3                      Obstacle explosion
        rocket_fire.mp3                  Rocket launch
        obstacle_kill.mp3                Obstacle destroy
        ammo_pickup.mp3                  Ammo crate pickup
        potion_pickup.mp3               Shield pickup
        potion_used.mp3                  Shield activate

    background/
      sky.jpg                            Static sky layer
      buildings_back_row_dark.png        Parallax back row
      buildings_Front_row_dark.png       Parallax front row
      big_buildings_v03.png              Parallax big buildings
      railing_dark.jpg                   Road railing
      railing_v2.png                     Railing alternate
      road.jpg                           Scrolling road TileSprite
      puddle example.png                 Puddle reflection mask

    dp_player/                           6 sprite sheets
      dp_start.png                       Start animation (7x2, 14 frames)
      dp_moto_v03.png                    Ride loop (9 frames)
      dp_attack.png                      Katana slash (5x4+1, 21 frames)
      dp_powered_up.png                  Powered mode (6x3, 18 frames)
      dp_speed_up.png                    Speed boost (16x4, 64 frames)
      dp_rocket_lancher_v2.png           Rocket launcher (5x4, 20 frames)

    cars/                                20 animated car sprite sheets
      car_001.png ... car_020.png        Each: 59 animation frames

    COL/                                 Collection impact animations
      COL_rocket.png                     Rocket collect (4x5, 19 frames)
      COL_shield.png                     Shield collect (4x5, 19 frames)
      COL_hit.png                        Hit impact (4x5, 19 frames)

    vfx/
      vfx_explosion.png                  Explosion sprite sheet
      slash.png                          Slash VFX (8 frames)

    pickups/
      rocket pickup.png                  Rocket ammo (hover anim)
      rocket_Projectile.png              Rocket flight
      shield_pickup.png                  Shield potion (hover anim)
      rocket_icon.png                    HUD: ammo indicator
      rocket_empty_icon.png              HUD: empty ammo
      shield_icon.png                    HUD: shield indicator
      shield_empty_icon.png              HUD: empty shield

    obstacles/
      road_barrier_01.png                Crash barrier
      road_barrier_01_reflection_alt.png Reflection texture

    start/
      countdown.png                      Countdown digits (3x2, 6 frames)
      start_loop/                        Title animation (27 JPG, 1920x1080)
      start_play/                        Title-to-play transition (25 JPG, 1920x1080)

    cutscenes/
      pre_start/v02/                     Pre-gameplay (46 PNG, 1920x1080)
      intro_to_tut/v3/                   Title-to-tutorial (27 JPG, 1920x1080)

    tutorial/
      how_to_play_v2.jpg                 Tutorial title card
      skip_v02.png                       Skip button
      tut_v2/rules_v2.jpg               Rules page
      tut_v2/rage_v2/                    Rage mechanic (4 JPG)
      controls_v4/                       Controls animation (29 JPG, 1920x1080)

    profiles/
      dp_anon_pic.jpg                    Default avatar

    fonts/
      alagard.ttf                        Retro game font
      Early GameBoy.ttf                  LCD font
      Retro Gaming.ttf                   Arcade font

  ui/
    cursor.png                           Custom cursor shape
    crosshair.png                        Gameplay crosshair
    spotify_text_logo_.png               Spotify branding
    sign_in.png                          Spotify sign-in button
    music menu.png                       Music menu button
    skip.png                             Skip button
    unmuted.png / muted.png              Volume icons
    add_pic_icon.png                     Avatar upload indicator
    insta.png                            Instagram icon
```

### Heaviest Assets (Top Optimization Targets)

| Asset | Disk Size | VRAM (est.) | Optimization |
|-------|-----------|-------------|-------------|
| Title sequence (52 frames) | ~39 MB | ~430 MB | Replace with H.264 video |
| Pre-start cutscene (46 frames) | ~60 MB | ~380 MB | Replace with H.264 video |
| Tutorial controls (29 frames) | ~25 MB | ~240 MB | Replace with H.264 video or lazy-load |
| Intro-to-tutorial (27 frames) | ~15 MB | ~220 MB | Replace with H.264 video |
| Car sprite sheets (20 files) | ~100 MB | ~200 MB | Atlas into 2-3 sheets, WebP |
| Player dp_speed_up.png | ~16 MB | ~50 MB | WebP, or 2x downscale on mobile |
| Player dp_powered_up.png | ~11 MB | ~35 MB | WebP, or 2x downscale on mobile |
| Player dp_attack.png | ~8.5 MB | ~25 MB | WebP |
| COL animations (3 files) | ~20 MB | ~60 MB | WebP |
| red malibu 1.5.wav | ~22 MB | — | Delete (MP3 duplicate exists) |

---

## 8. Appendix: Audio System Deep-Dive

### Four Audio Paths

```
                        +---> Phaser Sound System (engine loop, SFX, countdown)
                        |         Uses Web Audio API backend
                        |
  User Gesture --------+---> Web Audio API direct (slash, impact synthesis)
  (first tap)           |         AudioContext created in AudioSystem.start()
                        |
                        +---> Spotify Web Playback SDK (Premium playback)
                        |         Loads sdk.scdn.co/spotify-player.js
                        |
                        +---> YouTube IFrame API (fallback playback)
                              Loads youtube.com/iframe_api
```

### iOS Gesture Requirement Chain

```
BIOS overlay click/tap
    |
    v
Boot audio plays (HTML5 Audio with 3 fallback attempts)
    |
    v
First game input (Space/tap) at GameScene line ~1752
    |
    v
AudioSystem.start() creates AudioContext  <--- NEEDS .resume() CALL
    |
    v
Engine sample starts (Phaser sound)
    |
    v
Title music starts (MusicPlayer)  <--- NEEDS GESTURE GUARD
    |
    v
Countdown audio (Phaser sound)
    |
    v
Spotify SDK / YouTube playback
```

### Current Gaps

| Component | Requires Gesture? | Has Guard? | iOS Risk |
|-----------|-------------------|------------|----------|
| `AudioContext` creation | YES | NO `.resume()` | May stay in `suspended` state |
| Phaser sound playback | YES (first play) | Implicit only | May fail silently |
| `startTitleMusic()` | YES | **NO** | Will fail on iOS |
| Spotify SDK `.connect()` | YES (needs unlocked context) | **NO** | Device won't register |
| YouTube IFrame | NO (autoplay: 0) | N/A | Works — requires manual play |
| HTML5 Audio preview | YES | **NO** (`.play().catch(() => {})`) | Silent failure |

---

## 9. Appendix: Rendering Pipeline

### Per-Frame Render Order (by depth)

| Depth | System | What | Per-Frame Cost |
|-------|--------|------|---------------|
| -10 to -3 | ParallaxSystem | 7 scrolling TileSprite layers + 1 static sky | 7 tilePositionX updates |
| -100 | ReflectionSystem | Puddle mask RenderTexture (hidden) | .clear() + 0-30 stamp draws |
| -0.507 to -0.5 | ReflectionSystem | 7 reflected parallax layers + reflected sky | 7 tilePositionX updates |
| -0.49 | ReflectionSystem | Object reflection RenderTexture | .clear() + 20-100 stamp draws |
| 0 | RoadSystem | Road TileSprite (with BitmapMask for puddle holes) | 1 tilePositionX update |
| 0-500 | ObstacleSystem | 30+ obstacle sprites (pooled) | Position + animation updates |
| 0-500 | PickupSystem | 5-8 pickup sprites (pooled) + glow | Position + bob animation |
| 0-500 | RocketSystem | 3-10 rocket sprites (pooled) | Position + animation |
| 50 | FXSystem | 20 speed line rectangles | Position + alpha modulation |
| 85 | ObstacleSystem | Lane warning circles | Dynamic create/destroy |
| 90 | FXSystem | Edge warning overlays (2 rects) | Alpha only |
| 150 | FXSystem | Flash overlay (death) | Alpha tween |
| 200-500 | PlayerSystem | Player sprite (single, perspective-scaled) | Position + animation |
| 210 | GameScene | Slash VFX sprite | Animation |
| 1300 | ProfileHud | Avatar + name | Position + alpha |
| 9999 | CRTPipeline | Post-processing shader (ALL pixels) | **24 texture lookups/px** |

### CRT Shader Breakdown

```glsl
// Per-pixel cost at 1920x1080:
Bloom:                 9 texture lookups (3x3 kernel)
Beam focus:            4 texture lookups (horizontal blur)
Chromatic aberration:  3 texture lookups (RGB split)
Scanlines:             8 sine() iterations
Phosphor mask:         Computed (no lookups)
Vignette + curvature:  Computed (no lookups)
Color grading:         Computed (no lookups)
----------------------------------------------
TOTAL:                ~24 texture lookups + 8 trig ops per pixel
At 1920x1080 @ 60fps: ~3 billion samples/sec
```

### RenderTexture Usage

| RT | Size | Clears/Frame | Draws/Frame | Purpose |
|----|------|-------------|-------------|---------|
| `maskRT` | 1920x1080 | 1 | 0-30 | Puddle mask (SLOW obstacles) |
| `objectRT` | 1920x1080 | 1 | 20-100 | Object reflections (player, cars, pickups, rockets, slash) |

Both use the **stamp sprite pattern**: reusable sprite at depth -200, alpha 0, temporarily set alpha 1 for RT.draw(), then back to 0. Zero allocations.

### Quality Tier System (PerfSystem)

| Tier | Trigger | FX Changes |
|------|---------|-----------|
| **High** | Default | All FX on, full CRT |
| **Medium** | FPS < 57 for 2s | Speed lines at 50%, CRT reduced |
| **Low** | FPS < 50 for 2s | No speed lines, CRT disabled (unclear if fully off) |

Upgrade: FPS > 58 for 5s. Cooldown: 10s between changes. Hysteresis prevents thrashing.

---

## Execution Priority Summary

> When ready to start, work through in this order:

```
PHASE 1 (Must ship)
  1. iOS audio unlock                    [~2 hours]
  2. Memory/VRAM budget (lazy loading)   [~4 hours]
  3. CRT shader mobile variant           [~3 hours]
  4. Spotify auth iOS redirect           [~2 hours]

PHASE 2 (Better experience)
  5. WMP touch support                   [~4 hours]
  6. ProfilePopup touch scroll           [~1 hour]
  7. Safe area insets                    [~1 hour]

OPTIMIZATION (After it works)
  Asset pipeline first (items 1-6)       [~8 hours]
  Runtime performance (items 7-10)       [~6 hours]
  Network/API (items 11-13)              [~3 hours]
  Build/bundle (items 14-16)             [~3 hours]
```

---

*Generated by Claude Code — 2026-02-20*
