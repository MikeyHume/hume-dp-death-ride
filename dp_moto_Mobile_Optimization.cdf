@header project:"DP Moto" ver:0.00.52 fmt:CDF-GAMEDEV-1.0 updated:2026-02-24
  author:PC-Claude
  desc:"Mobile ship + optimization plan -- iPhone/iPad analysis + prioritized roadmap"
  src:dp_moto_Mobile_Optimization.md
  status:read-only-research (no code changes made)
  generated:2026-02-20

# 1. Architecture Overview

@project engine:Phaser-3.90 renderer:WebGL-only res:1920x1080 scale:FIT dom-overlay:enabled
  build:Vite-6.3.1 lang:TypeScript-5.7.2 phaser-code-split:separate-chunk
  backend:Supabase (Postgres + Edge Fns) -- anon auth, ldr, music catalog
  audio:4-paths (Phaser Sound | Web Audio API | Spotify SDK | YouTube IFrame)
  deploy:Vercel (static) SPA-fallback via vercel.json
  assets:~548MB total -- 200+ images, 14 audio files, 3 custom fonts

@flow boot-seq
  index.html (BIOS overlay)
  -> main.ts (Phaser cfg, Spotify cb check)
  -> BootScene.preload() -- loads ALL assets (~3s)
  -> BootScene.create() -- builds 100+ anims, generates tex, loads fonts
  -> GameScene.create() -- wires all sys, enters TITLE state
  -> User input -> Tutorial -> Countdown -> Gameplay

@tbl key-file-map
  row area:Core-boot files:main.ts|BootScene.ts|index.html size:Small
  row area:Game-hub files:GameScene.ts size:~158KB
  row area:Config files:tuning.ts|crtTuning.ts|gameMode.ts size:Small
  row area:Audio files:AudioSystem.ts|MusicPlayer.ts|SpotifyPlayerSystem.ts|SpotifyAuthSystem.ts size:Medium
  row area:Rendering files:ParallaxSystem.ts|ReflectionSystem.ts|FXSystem.ts|CRTPipeline.ts size:Medium
  row area:Gameplay files:PlayerSystem.ts|ObstacleSystem.ts|RocketSystem.ts|ShieldSystem.ts size:Medium
  row area:UI files:WMPPopup.ts (3000+ lines)|ProfileHud.ts|ProfilePopup.ts|DisconnectModal.ts size:Large
  row area:Backend files:AuthSystem.ts|LeaderboardService.ts|MusicCatalogService.ts|supabaseClient.ts size:Small

# 2. What Already Works on Mobile

@feat "Dual-pointer touch input" [WIP] -- left half = steer + boost, right half = attack + rocket
@feat "Tap vs hold detection" [WIP] -- 180ms threshold separates taps from holds
@feat "Mobile cursor" [WIP] -- green triangle on left edge (replaces mouse cursor)
@feat "Landscape lock overlay" [WIP] -- dark overlay + "Rotate your device" in portrait
@note detectMobileLike() + isiOS() in device.ts
@note webglcontextlost / webglcontextrestored listeners in main.ts
@note Viewport meta: viewport-fit=cover, user-scalable=no, maximum-scale=1.0
@note GPU power hint: powerPreference:'low-power' on mobile devices
@note Quality auto-downgrade: PerfSystem drops High -> Medium -> Low based on FPS
@note Phaser Scale.FIT maintains 16:9 aspect ratio on any screen size

# 3. Mobile Ship Plan

## Phase 1: Must-Fix (game won't run without these)

### 1. iOS Audio Unlock Ritual

@bug "iOS audio unlock missing" pri:CRITICAL [OPEN] confidence:high
  iOS Safari requires user gesture (tap/click) to create/resume AudioContext
  4 separate audio paths -- none have explicit iOS unlock pattern
  AudioSystem.start() creates AudioContext but doesn't call .resume()
  startTitleMusic() in MusicPlayer has zero gesture guard
  Spotify Web Playback SDK needs unlocked AudioContext to register as device
  Phaser sound sys uses Web Audio backend but relies on implicit gesture propagation
  files-to-change:
    src/systems/AudioSystem.ts -- add explicit AudioContext.resume() in start(), add isUnlocked() check
    src/systems/MusicPlayer.ts -- gate startTitleMusic() behind audio unlock confirmation
    src/scenes/GameScene.ts -- ensure gesture -> AudioContext.resume() -> audioSystem.start() chain at ~line 1752
    src/main.ts -- consider adding Phaser audio:{disableWebAudio:false, context:sharedContext} to cfg
  validate:
    1. iPhone Safari, fresh page load (no prior interaction)
    2. Tap through BIOS overlay -> confirm boot sounds play
    3. First game input -> confirm title music starts
    4. Enter gameplay -> confirm engine SFX, slash sounds, pickup sounds all work
    5. If Spotify connected -> confirm playback registers + audio comes through
  failure-modes:
    Silent audio on first play (most common)
    Spotify SDK device never registers (shows "no device" in Spotify app)
    Countdown music plays but gameplay audio doesn't
    Engine sound starts but slash/impact Web Audio synthesis fails

### 2. Memory / VRAM Budget

@bug "VRAM budget exceeds iOS limit" pri:CRITICAL [OPEN] confidence:high
  iOS Safari enforces ~250MB WebGL tex limit
  All assets loaded upfront in BootScene.preload(). Total disk:~548MB. Estimated VRAM:400-500MB -- ~2x iOS limit.
  @tbl biggest-offenders
    row "Cutscene frames (pre_start)" cnt:46-PNG at:1920x1080 disk:~60MB vram:~380MB
    row "Tutorial frames (controls)" cnt:29-JPG at:1920x1080 disk:~25MB vram:~240MB
    row "Title seq (start_loop + start_play)" cnt:52-JPG at:1920x1080 disk:~39MB vram:~430MB
    row "Car spr sheets" cnt:20-PNG at:4-6MB-each disk:~100MB vram:~200MB
    row "Plr spr sheets" cnt:6-PNG (16+11+8.5+5.5+4.6+...MB) disk:~47MB vram:~160MB
    row "TOTAL" disk:~548MB vram:~1.4GB
  @note VRAM estimates assume RGBA decompression. Actual depends on GPU tex fmt.
  files-to-change:
    src/scenes/BootScene.ts -- split preload into phases: essentials first, cutscenes/tutorial on-demand
    src/scenes/GameScene.ts -- load cutscene tex before playing, destroy after
    public/assets/ -- convert PNG -> WebP, downscale for mobile, or replace frame seqs with video
  validate:
    1. Safari Web Inspector -> Memory tab -> watch "Images" during gameplay
    2. Target: stay under 200MB GPU memory on iPad
    3. If WebGL ctx lost during play -> memory exceeded
    4. Test on oldest target iPad (A10 Fusion = iPad 7th gen)
  failure-modes:WebGL ctx lost -> black screen | Safari tab crashes silently | 30+ second load times on cellular

### 3. CRT Shader GPU Budget

@bug "CRT shader too heavy for mobile GPU" pri:HIGH [OPEN] confidence:medium
  CRT post-processing shader (CRTPipeline.ts) does 24 tex lookups per pixel per frame
  @tbl crt-cost
    row fx:Bloom samples:9 (3x3 kernel)
    row fx:Beam-focus samples:4
    row fx:Chromatic-aberration samples:3
    row fx:Scanlines samples:8 iterations
    row fx:TOTAL samples:~24
  At 1920x1080 @ 60fps = ~3 billion tex samples/sec. Fine on desktop, brutal on mobile GPU.
  files-to-change:
    src/fx/CRTPipeline.ts -- create mobile variant: skip bloom + beam focus (saves 13 samples/px)
    src/config/crtTuning.ts -- add mobile preset with reduced values
    src/systems/PerfSystem.ts -- ensure "Low" tier fully disables CRT (currently unclear)
    src/main.ts -- consider half-res rendering on mobile (960x540)
  validate:
    1. Safari Web Inspector -> GPU timeline during gameplay
    2. Toggle CRT on/off, measure FPS delta
    3. Target: 60fps with CRT on iPad Air (A14), 60fps without CRT on iPad 7th gen
  failure-modes:Sustained <30fps | GPU thermal throttling (smooth 30s then frame drops) | Heavy battery drain

### 4. Spotify Auth on iOS Safari

@bug "Spotify auth popup broken on iOS" pri:HIGH [OPEN] confidence:high
  window.open() notoriously broken on iOS Safari
  Popups blocked by default
  Even if allowed, popup loses focus + may not return properly
  Game state not preserved if same-page redirect used instead
  Also: stored refresh_token never used -- access token expires after ~1hr with no renewal
  files-to-change:
    src/systems/SpotifyAuthSystem.ts -- detect iOS -> use same-page redirect instead of popup. Save game state to sessionStorage. Implement refresh_token usage.
    src/main.ts -- after cb, restore game state from sessionStorage
  validate:
    1. iPhone Safari -> tap "Sign in with Spotify" -> complete auth -> returns to game with state intact
    2. Leave game open 1+ hours -> Spotify playback continues (token refreshed)
    3. Kill Safari, reopen -> session restored from localStorage
  failure-modes:Blank page after auth redirect (game state lost) | Playback stops after 1hr (token expired, no refresh) | Popup blocked silently

## Phase 2: Should-Fix (degraded but usable without these)

### 5. Touch-Friendly WMP Popup

@bug "WMP popup entirely mouse-centric" pri:MEDIUM [OPEN]
  @tbl wmp-mobile-gaps
    row feature:Window-drag desktop:Mouse-on-titlebar mobile:Broken
    row feature:Window-resize desktop:Mouse-on-edges mobile:Broken
    row feature:Context-menu desktop:Right-click mobile:No-alternative
    row feature:Library-scroll desktop:Mousewheel mobile:No-touch-scroll
    row feature:Col-resize desktop:Mouse-drag-divider mobile:Broken
    row feature:Col-reorder desktop:Mouse-drag-hdr mobile:Broken
  files-to-change:
    src/ui/WMPPopup.ts -- add long-press (500ms) as right-click alternative, touch drag/swipe for scrolling, consider mobile-specific full-screen layout
  validate:iPad Safari -> open WMP -> scroll library by swiping, long-press track to see ctx menu | All ctx menu actions accessible via long-press

### 6. ProfilePopup Touch Scroll

@bug "ProfilePopup scroll only responds to mousewheel" pri:LOW [OPEN]
  files:src/ui/ProfilePopup.ts -- add touchstart/touchmove/touchend listeners

### 7. Safe Area Insets (iPhone Notch / Dynamic Island)

@bug "No safe area inset offsets applied" pri:LOW-MEDIUM [OPEN]
  viewport-fit=cover set but no env(safe-area-inset-*) CSS offsets applied
  HUD at pos (40,40) may be clipped by notch/Dynamic Island in landscape
  files:index.html (CSS)|ProfileHud.ts (positioning)|GameScene.ts (HUD layout)

## Phase 3: Nice-to-Have (Polish)

### 8. Touch Target Sizes

@note Apple min recommended touch target: 44x44pt. Many ui btns (music controls, tab btns, window close) smaller. Increase hit areas on mobile.

### 9. Haptic Feedback

@note iOS supports haptics via webkit. Could add subtle vibration on obstacle hit, slash, death -- adds to arcade feel.

### 10. PWA Manifest & Service Worker

@note No manifest.json or service worker. Adding would: allow "Add to Home Screen" on iOS | cache assets for instant reload | enable offline fallback screen.

# 4. Optimization Plan

@note Execute AFTER game works on mobile. Ordered by impact vs effort.

## Tier 1: Asset Pipeline (Highest Impact)

@perf.opt id:1 "Replace frame seqs with video" savings:~300MB-disk,~1GB-VRAM effort:Medium
  125+ individual 1920x1080 JPGs for cutscenes/tutorials/title -> H.264 MP4
  files:BootScene.ts|GameScene.ts|public/assets/cutscenes/|tutorial/|start/
@perf.opt id:2 "WebP spr sheets" savings:30-40%-file-size effort:Low
  Convert all PNG spr sheets to WebP with fallback
  files:All public/assets/*.png
@perf.opt id:3 "Atlas car spr" savings:fewer-GPU-state-switches effort:Medium
  20 separate tex -> 2-3 combined atlases
  files:BootScene.ts|ObstacleSystem.ts|public/assets/cars/
@perf.opt id:4 "Mobile asset variants" savings:75%-VRAM-reduction effort:Medium
  Serve 960x540 assets on mobile
  files:BootScene.ts|device.ts
@perf.opt id:5 "Delete WAV dup" savings:22MB effort:Trivial
  red malibu 1.5.wav (22MB) alongside MP3 of same track
  files:public/assets/audio/music/
@perf.opt id:6 "Compress SFX" savings:~50%-audio-size effort:Low
  Reduce MP3 bitrate to 96kbps for short sound fx
  files:public/assets/audio/sfx/

## Tier 2: Runtime Performance

@perf.opt id:7 "Mobile CRT variant" impact:55%-fewer-tex-lookups effort:Medium
  Skip bloom (9 samples) + beam focus (4 samples)
  files:CRTPipeline.ts|crtTuning.ts
@perf.opt id:8 "Half-res rendering on mobile" impact:4x-fewer-pixels-shaded effort:Medium
  Internal res 960x540, CRT upscales
  files:main.ts|CRTPipeline.ts
@perf.opt id:9 "Lazy-load cutscene/tutorial tex" impact:~200MB-VRAM-freed-during-gameplay effort:Medium
  Load on entry, destroy on exit
  files:BootScene.ts|GameScene.ts
@perf.opt id:10 "Reflection sys LOD" impact:fewer-RT.draw()-calls/frame effort:Low
  Skip obj RT draws on Low quality tier
  files:ReflectionSystem.ts|PerfSystem.ts

## Tier 3: Network / API

@perf.opt id:11 "Spotify token refresh" impact:prevents-1hr-playback-death effort:Low
  Use stored refresh_token before expiry
  files:SpotifyAuthSystem.ts
@perf.opt id:12 "Network retry with backoff" impact:resilience-on-flaky-mobile-data effort:Low
  Ldr + catalog fetches
  files:LeaderboardService.ts|MusicCatalogService.ts
@perf.opt id:13 "Batch Supabase queries" impact:fewer-round-trips-on-boot effort:Medium
  Profile + ldr + favorites in one RPC
  files:AuthSystem.ts|LeaderboardService.ts

## Tier 4: Build / Bundle

@perf.opt id:14 "Verify Brotli/gzip on Vercel" impact:~70%-JS-transfer-reduction effort:Trivial
  files:vercel.json / Vercel dashboard
@perf.opt id:15 "Lazy-load WMPPopup" impact:~50KB-less-initial-bundle effort:Low
  Dynamic import on music menu click
  files:GameScene.ts|WMPPopup.ts
@perf.opt id:16 "PWA service worker" impact:instant-reload,offline-shell effort:Medium
  Cache assets after first load
  create:sw.js|manifest.json

# 5. Metrics & Validation

@tbl metrics
  row metric:FPS-sustained tool:PerfSystem+Safari-GPU-Timeline desktop-target:60fps mobile-target:"60fps iPad Air / 30fps iPad 7th gen"
  row metric:VRAM-usage tool:Safari-Web-Inspector-Memory desktop-target:<500MB mobile-target:<250MB
  row metric:JS-heap tool:Safari-Web-Inspector-Timelines desktop-target:<200MB mobile-target:<150MB
  row metric:Initial-page-load tool:Lighthouse/WebPageTest desktop-target:<3s mobile-target:"<5s on 4G"
  row metric:Time-to-interactive tool:Safari-Timeline-First-Input desktop-target:<3s mobile-target:<4s
  row metric:JS-bundle-gzipped tool:npx-vite-bundle-visualizer mobile-target:<400KB
  row metric:Audio-latency tool:Manual-stopwatch desktop-target:<50ms mobile-target:<100ms
  row metric:Asset-transfer-size tool:Network-tab mobile-target:"<50MB first load"

## Testing Checklist (iPhone + iPad)

@tbl test-audio
  row "BIOS boot sounds play after first tap" status:pending
  row "Title music starts after first game input" status:pending
  row "Countdown audio plays with volume" status:pending
  row "Engine SFX modulates with spd during gameplay" status:pending
  row "Katana slash + impact sounds work (Web Audio synthesis)" status:pending
  row "Spotify playback starts (if Premium connected)" status:pending
  row "YouTube fallback works (if Spotify unavailable)" status:pending
  row "Volume controls affect both sources" status:pending
  row "Tab switch -> return doesn't break audio ctx" status:pending

@tbl test-input
  row "Touch left side -> bike moves up/down" status:pending
  row "Tap left side -> spd boost" status:pending
  row "Tap right side -> katana slash" status:pending
  row "Hold right side (1s) -> rocket fires" status:pending
  row "No phantom inputs or stuck states" status:pending

@tbl test-display
  row "Game fills screen in landscape (no black bars beyond letterbox)" status:pending
  row "Portrait -> landscape overlay appears -> rotate -> game shows" status:pending
  row "No ui clipped by notch/Dynamic Island" status:pending
  row "CRT shader renders without artifacts" status:pending
  row "Custom cursor not visible (touch mode uses green triangle)" status:pending

@tbl test-flow
  row "BIOS -> Title -> Tutorial -> Countdown -> Gameplay -> Death -> Ldr -> Retry" status:pending
  row "Spotify login works (redirect, not popup) + returns to game" status:pending
  row "Profile popup opens/closes" status:pending
  row "WMP popup opens (even if not fully touch-friendly yet)" status:pending

@tbl test-stability
  row "5 min continuous gameplay without crash" status:pending
  row "Tab away 30s -> return -> game recovers" status:pending
  row "WebGL ctx not lost during normal play" status:pending
  row "No Safari tab crash under memory pressure" status:pending

# 6. Top 10 Risks / Unknowns

@tbl risks
  row id:1 "Actual VRAM usage on iOS" why:"Can't run Safari Web Inspector remotely" question:"Can you open Safari Web Inspector on connected iPhone/iPad and check Memory -> Images during gameplay?"
  row id:2 "CRT shader FPS on target iPads" why:"No device testing possible" question:"What's oldest iPad/iPhone you want to support? (A10? A12? A14?)"
  row id:3 "Spotify redirect URI for production" why:".env.local has 127.0.0.1:8081" question:"What domain registered in Spotify developer dashboard for production?"
  row id:4 "Exact asset file sizes" why:"Estimated from names, didn't run du" question:"Can I run du -sh public/assets/* to get actual sizes?"
  row id:5 "Vercel compression status" why:"Didn't check Vercel dashboard" question:"Is Brotli/gzip enabled on Vercel for static assets?"
  row id:6 "iOS WebGL ctx loss frequency" why:"Handler exists but recovery unclear" question:"Have you seen black screens or crashes on iOS during testing?"
  row id:7 "Spotify Web Playback SDK on iOS" why:"SDK docs say iOS not officially supported" question:"Have you tested Spotify playback on iPhone Safari? Does it register as Connect device?"
  row id:8 "YouTube IFrame behavior on iOS" why:"playsinline=1 set but iOS may override" question:"Does YouTube video play inline in WMP popup on iPhone, or go fullscreen?"
  row id:9 "Touch input feel" why:"Dual-pointer sys exists but may feel wrong" question:"Have you playtested touch controls on actual phone? How does steering feel?"
  row id:10 "Cur deploy state" why:"vercel.json exists but unclear if live" question:"Is game currently deployed anywhere, or still local-only?"

# 7. Appendix: Full Asset Inventory

## Directory Breakdown

@tbl assets-audio-music
  row file:hell_girl_countdown.mp3 "Countdown chime"
  row file:"red malibu - deathpixie.mp3" "Title track (MP3)"
  row file:"red malibu 1.5.wav" "Title track (WAV -- DUPLICATE, delete)"

@tbl assets-audio-sfx
  row file:old_bootup.mp3 "BIOS startup sound"
  row file:"bios complete loading.mp3" "BIOS complete chime"
  row file:"mouse click.mp3" "UI click"
  row file:"mouse hover.mp3" "UI hover"
  row file:"motorcycle engine.mp3" "Engine loop (continuous)"
  row file:explode.mp3 "Obstacle explosion"
  row file:rocket_fire.mp3 "Rocket launch"
  row file:obstacle_kill.mp3 "Obstacle destroy"
  row file:ammo_pickup.mp3 "Ammo crate pickup"
  row file:potion_pickup.mp3 "Shield pickup"
  row file:potion_used.mp3 "Shield activate"

@tbl assets-background
  row file:sky.jpg "Static sky layer"
  row file:buildings_back_row_dark.png "Parallax back row"
  row file:buildings_Front_row_dark.png "Parallax front row"
  row file:big_buildings_v03.png "Parallax big buildings"
  row file:railing_dark.jpg "Road railing"
  row file:railing_v2.png "Railing alternate"
  row file:road.jpg "Scrolling road TileSprite"
  row file:"puddle example.png" "Puddle reflection mask"

@tbl assets-player
  row file:dp_start.png "Start anim (7x2, 14 frames)"
  row file:dp_moto_v03.png "Ride loop (9 frames)"
  row file:dp_attack.png "Katana slash (5x4+1, 21 frames)"
  row file:dp_powered_up.png "Powered mode (6x3, 18 frames)"
  row file:dp_speed_up.png "Spd boost (16x4, 64 frames)"
  row file:dp_rocket_lancher_v2.png "Rocket launcher (5x4, 20 frames)"

@tbl assets-cars
  row files:car_001.png...car_020.png cnt:20 "Each: 59 anim frames"

@tbl assets-col
  row file:COL_rocket.png "Rocket collect (4x5, 19 frames)"
  row file:COL_shield.png "Shield collect (4x5, 19 frames)"
  row file:COL_hit.png "Hit impact (4x5, 19 frames)"

@tbl assets-vfx
  row file:vfx_explosion.png "Explosion spr sheet"
  row file:slash.png "Slash VFX (8 frames)"

@tbl assets-pickups
  row file:"rocket pickup.png" "Rocket ammo (hover anim)"
  row file:rocket_Projectile.png "Rocket flight"
  row file:shield_pickup.png "Shield potion (hover anim)"
  row file:rocket_icon.png "HUD: ammo indicator"
  row file:rocket_empty_icon.png "HUD: empty ammo"
  row file:shield_icon.png "HUD: shield indicator"
  row file:shield_empty_icon.png "HUD: empty shield"

@tbl assets-obstacles
  row file:road_barrier_01.png "Crash barrier"
  row file:road_barrier_01_reflection_alt.png "Reflection tex"

@tbl assets-start
  row file:countdown.png "Countdown digits (3x2, 6 frames)"
  row dir:start_loop/ "Title anim (27 JPG, 1920x1080)"
  row dir:start_play/ "Title-to-play transition (25 JPG, 1920x1080)"

@tbl assets-cutscenes
  row dir:pre_start/v02/ "Pre-gameplay (46 PNG, 1920x1080)"
  row dir:intro_to_tut/v3/ "Title-to-tutorial (27 JPG, 1920x1080)"

@tbl assets-tutorial
  row file:how_to_play_v2.jpg "Tutorial title card"
  row file:skip_v02.png "Skip btn"
  row dir:tut_v2/rules_v2.jpg "Rules page"
  row dir:tut_v2/rage_v2/ "Rage mechanic (4 JPG)"
  row dir:controls_v4/ "Controls anim (29 JPG, 1920x1080)"

@tbl assets-misc
  row file:dp_anon_pic.jpg "Default avatar"
  row file:alagard.ttf "Retro game font"
  row file:"Early GameBoy.ttf" "LCD font"
  row file:"Retro Gaming.ttf" "Arcade font"
  row file:cursor.png "Custom cursor shape"
  row file:crosshair.png "Gameplay crosshair"
  row file:spotify_text_logo_.png "Spotify branding"
  row file:sign_in.png "Spotify sign-in btn"
  row file:"music menu.png" "Music menu btn"
  row file:skip.png "Skip btn"
  row file:unmuted.png/muted.png "Volume icons"
  row file:add_pic_icon.png "Avatar upload indicator"
  row file:insta.png "Instagram icon"

## Heaviest Assets (Top Optimization Targets)

@tbl heaviest-assets
  row "Title seq (52 frames)" disk:~39MB vram:~430MB opt:"Replace with H.264 video"
  row "Pre-start cutscene (46 frames)" disk:~60MB vram:~380MB opt:"Replace with H.264 video"
  row "Tutorial controls (29 frames)" disk:~25MB vram:~240MB opt:"Replace with H.264 video or lazy-load"
  row "Intro-to-tutorial (27 frames)" disk:~15MB vram:~220MB opt:"Replace with H.264 video"
  row "Car spr sheets (20 files)" disk:~100MB vram:~200MB opt:"Atlas into 2-3 sheets, WebP"
  row "Plr dp_speed_up.png" disk:~16MB vram:~50MB opt:"WebP, or 2x downscale on mobile"
  row "Plr dp_powered_up.png" disk:~11MB vram:~35MB opt:WebP
  row "Plr dp_attack.png" disk:~8.5MB vram:~25MB opt:WebP
  row "COL anims (3 files)" disk:~20MB vram:~60MB opt:WebP
  row "red malibu 1.5.wav" disk:~22MB opt:"Delete (MP3 dup exists)"

# 8. Appendix: Audio System Deep-Dive

## Four Audio Paths

@flow audio-paths
  User Gesture (first tap) ->
    1. Phaser Sound Sys (engine loop, SFX, countdown) -- uses Web Audio API backend
    2. Web Audio API direct (slash, impact synthesis) -- AudioContext created in AudioSystem.start()
    3. Spotify Web Playback SDK (Premium playback) -- loads sdk.scdn.co/spotify-player.js
    4. YouTube IFrame API (fallback playback) -- loads youtube.com/iframe_api

## iOS Gesture Requirement Chain

@flow ios-audio-chain
  BIOS overlay click/tap
  -> Boot audio plays (HTML5 Audio with 3 fallback attempts)
  -> First game input (Space/tap) at GameScene line ~1752
  -> AudioSystem.start() creates AudioContext -- NEEDS .resume() CALL
  -> Engine sample starts (Phaser sound)
  -> Title music starts (MusicPlayer) -- NEEDS GESTURE GUARD
  -> Countdown audio (Phaser sound)
  -> Spotify SDK / YouTube playback

## Current Gaps

@tbl audio-gaps
  row component:AudioContext-creation requires-gesture:YES has-guard:"NO .resume()" ios-risk:"May stay in suspended state"
  row component:Phaser-sound-playback requires-gesture:"YES (first play)" has-guard:Implicit-only ios-risk:"May fail silently"
  row component:startTitleMusic() requires-gesture:YES has-guard:NO ios-risk:"Will fail on iOS"
  row component:Spotify-SDK-.connect() requires-gesture:"YES (needs unlocked ctx)" has-guard:NO ios-risk:"Device won't register"
  row component:YouTube-IFrame requires-gesture:"NO (autoplay:0)" has-guard:N/A ios-risk:"Works -- requires manual play"
  row component:HTML5-Audio-preview requires-gesture:YES has-guard:"NO (.play().catch(()=>{}))" ios-risk:"Silent failure"

# 9. Appendix: Rendering Pipeline

## Per-Frame Render Order (by depth)

@tbl render-order
  row depth:-10to-3 sys:ParallaxSystem what:"7 scrolling TileSprite layers + 1 static sky" cost:"7 tilePositionX updates"
  row depth:-100 sys:ReflectionSystem what:"Puddle mask RT (hidden)" cost:".clear() + 0-30 stamp draws"
  row depth:-0.507to-0.5 sys:ReflectionSystem what:"7 reflected parallax layers + reflected sky" cost:"7 tilePositionX updates"
  row depth:-0.49 sys:ReflectionSystem what:"Object reflection RT" cost:".clear() + 20-100 stamp draws"
  row depth:0 sys:RoadSystem what:"Road TileSprite (with BitmapMask for puddle holes)" cost:"1 tilePositionX update"
  row depth:0-500 sys:ObstacleSystem what:"30+ obstacle spr (pooled)" cost:"Pos + anim updates"
  row depth:0-500 sys:PickupSystem what:"5-8 pickup spr (pooled) + glow" cost:"Pos + bob anim"
  row depth:0-500 sys:RocketSystem what:"3-10 rocket spr (pooled)" cost:"Pos + anim"
  row depth:50 sys:FXSystem what:"20 spd line rects" cost:"Pos + alpha modulation"
  row depth:85 sys:ObstacleSystem what:"Lane warning circles" cost:"Dynamic create/destroy"
  row depth:90 sys:FXSystem what:"Edge warning overlays (2 rects)" cost:"Alpha only"
  row depth:150 sys:FXSystem what:"Flash overlay (death)" cost:"Alpha tween"
  row depth:200-500 sys:PlayerSystem what:"Plr spr (single, perspective-scaled)" cost:"Pos + anim"
  row depth:210 sys:GameScene what:"Slash VFX spr" cost:Animation
  row depth:1300 sys:ProfileHud what:"Avatar + name" cost:"Pos + alpha"
  row depth:9999 sys:CRTPipeline what:"Post-processing shader (ALL pixels)" cost:"24 tex lookups/px"

## CRT Shader Breakdown

@note CRT per-pixel cost at 1920x1080:
  Bloom: 9 tex lookups (3x3 kernel)
  Beam focus: 4 tex lookups (horizontal blur)
  Chromatic aberration: 3 tex lookups (RGB split)
  Scanlines: 8 sine() iterations
  Phosphor mask: computed (no lookups)
  Vignette + curvature: computed (no lookups)
  Color grading: computed (no lookups)
  TOTAL: ~24 tex lookups + 8 trig ops per pixel
  At 1920x1080 @ 60fps: ~3 billion samples/sec

## RenderTexture Usage

@tbl rt-usage
  row rt:maskRT size:1920x1080 clears:1/frame draws:0-30/frame purpose:"Puddle mask (SLOW obstacles)"
  row rt:objectRT size:1920x1080 clears:1/frame draws:20-100/frame purpose:"Obj reflections (plr, cars, pickups, rockets, slash)"
@note Both use stamp spr pattern: reusable spr at depth -200, alpha 0, tmp set alpha 1 for RT.draw(), then back to 0. Zero alloc.

## Quality Tier System (PerfSystem)

@tbl quality-tiers
  row tier:High trigger:Default fx:"All FX on, full CRT"
  row tier:Medium trigger:"FPS < 57 for 2s" fx:"Spd lines at 50%, CRT reduced"
  row tier:Low trigger:"FPS < 50 for 2s" fx:"No spd lines, CRT disabled (unclear if fully off)"
@note Upgrade: FPS > 58 for 5s. Cooldown: 10s between changes. Hysteresis prevents thrashing.

# Execution Priority Summary

@plan "Mobile Ship + Optimization" status:approved
  @plan.phase 1 "Must ship" est:~11hrs
    1. iOS audio unlock [~2hrs]
    2. Memory/VRAM budget (lazy loading) [~4hrs]
    3. CRT shader mobile variant [~3hrs]
    4. Spotify auth iOS redirect [~2hrs]
  @plan.phase 2 "Better experience" est:~6hrs
    5. WMP touch support [~4hrs]
    6. ProfilePopup touch scroll [~1hr]
    7. Safe area insets [~1hr]
  @plan.phase 3 "Optimization (after it works)"
    Asset pipeline first (items 1-6) [~8hrs]
    Runtime perf (items 7-10) [~6hrs]
    Network/API (items 11-13) [~3hrs]
    Build/bundle (items 14-16) [~3hrs]
