@header project:"DP Moto" ver:0.00.52 fmt:CDF-GAMEDEV-1.0 updated:2026-02-24
  author:PC-Claude
  desc:"Game flow ref -- every phase from page load to restart"
  src:GAME_FLOW.md

// Reading rules:
// [LOCKED] = working perfectly, protected from changes. 2x testing if modified.
// [WIP] = still being iterated, no protection guarantees.
// Phases ordered by plr experience.

# Phase 0: Page Load + Vite Bootstrap

@phase id:0 "Page Load + Vite Bootstrap" [LOCKED]
  files:index.html|src/main.ts|src/config/gameMode.ts|src/util/device.ts|src/phaserShim.ts
  Browser loads index.html -> Phaser 3.90 via CDN <script> (not Vite-bundled)
  main.ts detects device profile, inits test mode if ?test=1, creates Phaser Game instance
  GameScene + CRT pipelines loaded via dynamic imports (separate chunks)
  @note CDN Phaser load + phaserShim.ts re-export -- avoids Vite pre-bundling crash on iOS
  @note Dynamic import splits GameScene (351KB) into separate chunk -- initial payload ~226KB
  @note Device profile detection: 12 iPhone fingerprints, 5 iPads, Android fallbacks, 5 tiers
  @note ?simulate=<slug> URL param overrides device profile for testing
  @note ?test=1 enables Robot Pilot test mode (autoDismissBios, skipTutorial, fastCountdown)
  inputs:none (page loading)

@bug "iOS Safari crash within 1s" [FIXED] phase:0
  cause:Vite pre-bundled Phaser module crashes iPhone Xs Safari
  fix:Load Phaser 3.90 via CDN <script> tag, phaserShim.ts re-exports window.Phaser
  files:index.html|src/phaserShim.ts
  date:v0.00.41

@bug "Initial payload too large (591KB)" [FIXED] phase:0
  cause:All JS in single bundle
  fix:Dynamic import GameScene + CRT/Water/DamageFlash pipelines as separate chunks
  BootScene waits for window.__gameSceneReady flag
  files:src/main.ts|src/scenes/BootScene.ts
  date:v0.00.45

@bug "iPhone 12 Mini crash at 4s with HUD" [FIXED] phase:0
  cause:?hud=1 vision HUD too heavy on 4GB device
  fix:Guard HUD init with device tier check
  files:src/main.ts (lines 42-49)
  date:v0.00.49

# Phase 1: BIOS Boot Screen

@phase id:1 "BIOS Boot Screen" [LOCKED]
  files:index.html (lines 1-860)|src/scenes/BootScene.ts
  Full-screen BIOS boot overlay (HTML/CSS) shows retro POST-style text, loading bar, jittering [ENTER] prompt
  3 CDN audio files (bootup, beep, click) begin playing
  BootScene preload runs in bg loading 150+ game assets
  @note Loading bar anim fills over ~2s
  @note [ENTER] prompt jitters via CSS bios-jitter anim with --bios-jitter-amount + --bios-jitter-speed vars
  @note Right-justified [ENTER] aligned with loading bar right edge
  @note BIOS text uses same jitter vars as enter prompt (unified)
  @note Boot audio plays from CDN (no Vite bundling)
  inputs:Mouse click OR Space/Enter key dismisses BIOS overlay

@bug "CSS anim overriding scale" [FIXED] phase:1
  cause:bios-jitter keyframes transform:translateY replaces element transform:scale every frame
  fix:Include scale(var(--bios-enter-scale)) alongside translateY in keyframe
  files:index.html CSS
  date:2026-02-18

@bug "[ENTER] prompt not right-justified" [FIXED] phase:1
  cause:Default alignment
  fix:Right-justify to match loading bar right edge
  files:index.html
  date:2026-02-18

# Phase 1.5: Swipe-to-Fullscreen (Phones Only)

@phase id:1.5 "Swipe-to-Fullscreen" [LOCKED]
  files:index.html (lines 633-682, 750-751, 1082)
  After BIOS dismissal on phone devices (not tablet/desktop/test mode) -> "SWIPE UP" overlay
  Scroll spacer extends page for Safari address bar hide on swipe-up
  window.__swipeLock = true blocks all title input until swipe completes
  User swipes up -> Safari chrome hides -> overlay disappears after 300ms delay
  @note Only triggers on phone device tiers (not tablet, not desktop)
  @note __swipeLock flag prevents accidental game start during swipe
  @note 300ms delay after scroll ensures Safari chrome fully hidden before enabling input
  @note Arrow anim provides clear visual instruction
  @note Scroll spacer div creates enough page height for Safari swipe-up gesture
  inputs:Swipe-up gesture (scroll evt)

@bug "Swipe overlay blocks all title clicks" [FIXED] phase:1.5
  cause:No input gate during swipe phase
  fix:Added __swipeLock check in updateTitle() (GameScene.ts:2286) to ignore clicks while swipe overlay active
  files:GameScene.ts|index.html
  date:v0.00.71

# Phase 2: BootScene Asset Loading

@phase id:2 "BootScene Asset Loading" [WIP]
  files:src/scenes/BootScene.ts
  BootScene preload() loads 150+ assets: spr, spritesheets, audio, tex
  Mobile devices get compressed _mobile suffix variants
  Lite mode (phone-low) skips heavy spritesheets (~88MB VRAM savings)
  Failed assets retry with 500ms/1000ms exponential backoff -> magenta placeholder tex
  Procedural tex generated for missing lite-mode assets
  why-wip:liteMode asset gates still being tuned per device tier
  why-wip:Mobile road/railing tex copies recently added (v0.00.72)
  why-wip:VRAM budgets per tier not finalized -- default-avatar at 3300x3300 (41.5MB VRAM) needs crushing
  @note Road + railing: real tex with nearest-neighbor downscaled mobile copies (road_mobile.jpg 2048x91, railing_dark_mobile.jpg 2048x11)
  @note Retry sys with exponential backoff for failed assets
  @note Magenta placeholder fallback for persistently failed assets
  @note Anim definitions: title-loop (27 frames), title-start (25 frames), countdown sheet

@bug "Grey road/railing on mobile" [FIXED] phase:2
  cause:liteMode replaced road + railing with procedural grey tex (256x128 grey road, 256x8 grey railing)
  fix:Load real tex via _mobile suffix nearest-neighbor downscaled copies
  files:BootScene.ts (lines 164-166)
  date:v0.00.72

@bug "VRAM budget exceeded on 4GB phones" [FIXED] phase:2
  cause:Full spritesheets loaded on all devices
  fix:Lite mode skips attack/start/powered/speedup/rocket-launch sheets
  files:BootScene.ts|main.ts (lines 23-28)
  date:v0.00.45

# Phase 3: Title Screen

@phase id:3 "Title Screen" [LOCKED]
  files:src/scenes/GameScene.ts (lines 2277-2313 -- updateTitle())|src/systems/ParallaxSystem.ts|src/systems/MusicPlayer.ts|src/ui/ProfileHud.ts
  BIOS overlay fades out (1.3s anim), boot audio vol fades to 0 (500ms)
  Title screen: animated title loop (27 frames, desktop) or static frame (mobile)
  Parallax bg scrolls. Music plr ui top-right. Profile HUD top-left. Game modes btn bottom-left.
  @note Title anim loop plays smoothly on desktop, static frame on mobile (perf)
  @note Parallax bg visible + scrolling
  @note Music plr ui at half-size on mobile (MUSIC_UI_SCALE = 0.5), top-right anchored
  @note Profile HUD shows avatar + name (Spotify) or default
  @note __swipeLock check prevents input during swipe phase on phones
  @note Clicking non-ui area enters Tutorial
  inputs:Click anywhere (except ui) -> Tutorial | Profile HUD avatar click -> Profile Popup | Music plr interactions | Game modes btn hover -> yellow highlight

@bug "Queued inputs from BIOS triggering gameplay" [FIXED] phase:3
  cause:Keyboard/click inputs from BIOS dismiss still in queue when title loaded
  fix:Drain all input queues before processing title input (GameScene.ts:2297-2299)
  date:2026-02-18

@bug "Green triangle cursor visible during title on mobile" [FIXED] phase:3
  cause:Mobile cursor (InputSystem green triangle) started visible
  fix:Cursor starts hidden (setVisible(false)), only shown in enterStarting()
  files:InputSystem.ts|GameScene.ts
  date:v0.00.72

# Phase 4: Tutorial

@phase id:4 "Tutorial" [LOCKED]
  files:src/scenes/GameScene.ts (lines 2796-3009 -- enterTutorial(), updateTutorial())
  Multi-page tutorial overlay: controls, obstacles, rage
  Each section fades in -> waits Space/Enter -> fades out
  Desktop gets intro-to-tutorial cutscene (27-frame anim) before controls page
  Skip btn pulses (min/max scale anim) in corner -> click skips to countdown with red flash + instant fade-to-black
  @note Tutorial phases: controls_wait -> controls_fade -> obstacles_in -> obstacles_wait -> obstacles_fade -> rage_in -> rage_wait -> rage_black
  @note Skip btn pulse anim with SKIP_BTN_PULSE_MIN/SKIP_BTN_PULSE_MAX tuning
  @note Test mode (TEST_MODE.skipTutorial) bypasses directly to enterStarting()
  @note Intro cutscene plays on desktop only (skipped on mobile for perf)
  @note Game inputs (spd tap, attack, rocket) drained every frame to prevent queuing
  inputs:Space/Enter -> advance page | Skip btn click -> instant skip to countdown | All game inputs drained

@bug "Skip btn pulse not visible" [FIXED] phase:4
  cause:Missing pulse anim on skip btn
  fix:Added SKIP_BTN_PULSE_MIN/SKIP_BTN_PULSE_MAX constants with scale oscillation
  files:GameScene.ts (lines 50-52)
  date:2026-02-18

# Phase 5: Countdown + Skip

@phase id:5 "Countdown + Skip" [LOCKED]
  files:src/scenes/GameScene.ts (lines 3011-3053 -- enterStarting(), lines 2532-2655 -- updateStarting())|src/systems/MusicPlayer.ts|src/config/tuning.ts
  enterStarting() sets state STARTING. Mobile cursor (green triangle) shown.
  Black overlay visible. Numbers 5,4,3,2 animate in seq (scale 0.5->1, alpha 1->0, ease-out cubic)
  Countdown music plays (hell_girl_countdown.mp3) for both Spotify + YouTube sources
  When "2" finishes: music plr revealed, pre-start cutscene plays (46 frames, desktop only)
  Any input at any point -> instant skip -> stops countdown audio -> startGame()
  @note Countdown numbers 5->2 (no "1", transitions to gameplay)
  @note Countdown phases: delay -> animate -> (repeat per num) -> cutscene -> done
  @note Any input = instant skip (click, tap, keyboard key)
  @note musicPlayer.skipCountdownAudio() + musicPlayer.revealForGameplay() on skip
  @note Test mode fastCountdown injects tap on next frame for instant skip
  @note Spawn grace timer set on skip to prevent instant death
  inputs:Any click/tap/keyboard key -> skip countdown immediately

@bug "YouTube had no countdown music" [FIXED] phase:5
  cause:YouTube used delay-shuffle hack instead of actual countdown audio
  fix:Unified countdown audio (hell_girl_countdown.mp3) for both YT + Spotify sources
  files:MusicPlayer.ts
  date:2026-02-18

@bug "Countdown skip didn't restore music ui" [FIXED] phase:5
  cause:musicPlayer.revealForGameplay() not called on skip path
  fix:Explicitly call reveal + skip audio on any input
  files:GameScene.ts (lines 2560-2561)
  date:2026-02-18

@bug "Same first song every session" [FIXED] phase:5
  cause:No dedup of first track
  fix:Added first-track dedup via localStorage in both MusicPlayer + SpotifyPlayerSystem
  files:MusicPlayer.ts|SpotifyPlayerSystem.ts
  date:2026-02-18

# Phase 6: Gameplay (PLAYING)

@phase id:6 "Gameplay (PLAYING)" [WIP]
  files:src/scenes/GameScene.ts (lines 3309-3380 -- startGame(), lines 3400+ -- updatePlaying())|src/systems/PlayerSystem.ts|src/systems/ObstacleSystem.ts|src/systems/ScoreSystem.ts|src/systems/DifficultySystem.ts|src/systems/RoadSystem.ts|src/systems/ParallaxSystem.ts|src/systems/InputSystem.ts|src/systems/FXSystem.ts|src/systems/AudioSystem.ts|src/systems/PickupSystem.ts|src/systems/RocketSystem.ts|src/systems/ShieldSystem.ts
  startGame() sets state PLAYING. Crosshair mode enabled.
  All game sys running: road scrolling, parallax, plr movement (Y follows mouse/touch), spd tap (Space/tap)
  Obstacles spawning (CRASH/SLOW/CAR types), col detection, scoring (distance + spd multiplier)
  Diff ramp (0->1 over 120s), pickups (ammo, shield), rockets, slash attack (F key)
  FX (spd lines, shake, flash), audio (engine loop, impacts). Reflections visible (except phone-low). Music playing.
  why-wip:Ongoing mobile optimization
  why-wip:CAR_COUNT_MOBILE currently 0 (needs per-device tuning)
  why-wip:Reflection sys disabled on phone tiers (reflectionSystem nullable, gated by !GAME_MODE.mobileMode)
  why-wip:Touch input still being refined. Perf varies across device tiers.
  inputs:Mouse Y / Touch Y -> plr follows pos | Space (desktop) / Tap (mobile) -> spd tap | F key (desktop) -> katana slash | Right-click (desktop) -> rockets (if ammo)

# Phase 7: Dying Sequence

@phase id:7 "Dying Sequence" [LOCKED]
  files:src/scenes/GameScene.ts (lines 4697-4768 -- enterDead(), lines 4549-4695 -- updateDying())|src/systems/FXSystem.ts|src/systems/AudioSystem.ts
  Col detected -> enterDead() -> state = DYING
  Death juice: screen shake + white flash + explosion SFX + engine silenced
  Explosion spr plays at plr pos
  Death anim state machine: ramp (white overlay 0->peak, quadratic ease-in, ~200ms) -> snap (peak->full white, ~100ms) -> hold (full white ~300ms, prepare score/ldr data, determine name entry vs auto-submit) -> fade (white->transparent, ~400ms, reveal death screen)
  During hold: if profile named -> auto-submit score | if anon + top10 -> prepare name entry ui | if anon + outside top10 -> show ldr only
  @note Smooth 4-phase death anim (ramp -> snap -> hold -> fade)
  @note deathGen counter invalidates stale async ldr fetches
  @note Auto-submit for named profiles (Spotify login -> instant ldr display)
  @note Anon top-10 detection for name entry routing
  @note Music plr collapses to thumbnail-only (compact mode)
  @note All debug overlays, reflections, mobile cursors hidden during death
  inputs:None (frozen during anim)

@bug "Green box covering death screen" [FIXED] phase:7
  cause:nameEnterBtn Phaser Text padding:{x:500,y:500} + bg:#003300 at depth:211
  fix:Reduced padding to small values
  files:GameScene.ts
  date:2026-02-18

@bug "Death overlay not reaching white" [FIXED] phase:7
  cause:Linear interpolation too slow
  fix:Quadratic ease-in formula for ramp phase
  files:GameScene.ts (line 4556)
  date:2026-02-18

# Phase 8: Name Entry (Anon + Top 10 Only)

@phase id:8 "Name Entry" [LOCKED]
  files:src/scenes/GameScene.ts (lines 4770-4820 -- visuals + keyboard activation, lines 5098-5162 -- updateNameEntry(), submit logic)|src/systems/LeaderboardService.ts|src/systems/LeaderboardSystem.ts
  If death phase determines anon + top10 score -> name entry ui shown
  enteredName = '', cursor blinks. Keyboard: Enter submits, Backspace deletes, alphanumeric adds (max 10 chars)
  "NEW HIGH SCORE!" title rainbow-cycles. On submit: score sent to local ldr + Supabase global ldr
  Updated top 10 fetched. Transitions to DEAD state with submitted name highlighted in rainbow.
  @note Rainbow-cycling "NEW HIGH SCORE!" title (80ms cycle)
  @note Spd taps consumed during name entry (prevent restart queue)
  @note Empty name warning: "No name? Press ENTER to submit anon"
  @note Dual submit: local ldr + Supabase global
  @note deathGen invalidation prevents stale data display
  inputs:Keyboard: Enter (submit) | Backspace (delete) | alphanumeric (add char) | Name btn click: submit | max 10 chars (NAME_MAX_LENGTH)

# Phase 9: Death Screen / Leaderboard

@phase id:9 "Death Screen / Leaderboard" [LOCKED]
  files:src/scenes/GameScene.ts (lines 4831-5090 -- prepareDeathScreenVisuals(), lines 5164-5186 -- updateDead())|src/systems/LeaderboardSystem.ts|src/systems/LeaderboardService.ts
  Ldr display populated from global (Supabase) or local fallback data
  Top 3 entries: large font (1.5x), avatar circle + medal ring. Rows 4-10: normal font.
  Cur plr row highlighted with rainbow-cycling colors. Score + time displayed.
  0.5s input delay prevents accidental restart. Spd tap -> startGame() (instant restart -> Phase 6)
  @note Top 3 with avatar circles + medal rings
  @note Rainbow-cycling highlight for cur plr row
  @note 0.5s input delay prevents accidental restart
  @note Spd tap = instant restart (no title screen required)
  @note Profile HUD avatar click still opens popup during death screen
  inputs:Space / Spd tap -> restart game (after 0.5s delay) | Profile HUD click -> opens profile popup | Music plr interactions: normal

@bug "Avatar ring gap on death screen" [FIXED] phase:9
  cause:Phaser draws strokes centered on shape edge (half inside/half outside). Ring radius was AVATAR_RADIUS + AVATAR_RING_WIDTH instead of + AVATAR_RING_WIDTH / 2
  fix:Offset radius by half stroke width
  files:ProfilePopup.ts|GameScene.ts
  date:2026-02-18

@bug "ProfileHud stroke flash during transitions" [FIXED] phase:9
  cause:AVATAR_STROKE_ALPHA = 2 -- Phaser multiplies child alpha by container alpha during tweens. Alpha > 1 -> stroke stays visible during fades
  fix:Never set alpha > 1 on objects inside containers that get alpha-tweened
  files:ProfileHud.ts
  date:2026-02-18

@bug "Death screen avatars appeared large" [FIXED] phase:9
  cause:Separate constants (DLB_T3_AVATAR_R=30) -- always that size, hidden by green box bug
  resolution:Not a bug, expected behavior
  date:2026-02-18

# Phase 10: Return to Title

@phase id:10 "Return to Title" [LOCKED]
  files:src/scenes/GameScene.ts (lines 2657-2756 -- returnToTitle())
  From DEAD state, spd tap -> startGame() resets + starts new run (-> Phase 6)
  returnToTitle(): state -> TITLE, crosshair off, all timers/phases reset
  All HUD overlays hidden (death container, name entry, ldr entries)
  All game objects hidden (plr, obstacles, pickups, rockets, fx)
  Rhythm mode cleared, road/parallax/sky made visible, title anim started
  @note Comprehensive cleanup of all game state
  @note All overlays + containers properly hidden
  @note Rhythm mode state fully cleared
  @note Road/parallax/sky sys restored to title state
  @note Title loop anim restarted (desktop) or static frame shown (mobile)
  @note Green triangle cursor hidden during title
  inputs:Title screen input resumes (see Phase 3)

@bug "Leftover tutorial ui visible after restart" [FIXED] phase:10
  cause:Tutorial containers not hidden in cleanup
  fix:Comprehensive cleanup in returnToTitle() resets all tutorial, countdown, death phases to 'done'
  files:GameScene.ts (lines 2664-2756)
  date:2026-02-18

# Quick Reference: State Machine

@flow GameState
  TITLE -> Phase 3 (Title screen)
  SONG_SELECT -> (Rhythm mode playlist/diff -- future)
  TUTORIAL -> Phase 4 (Multi-page tutorial)
  STARTING -> Phase 5 (Countdown 5->2)
  PLAYING -> Phase 6 (Gameplay loop)
  DYING -> Phase 7 (Death anim)
  NAME_ENTRY -> Phase 8 (Anon top-10 name prompt)
  DEAD -> Phase 9 (Ldr display)
  flow:0 -> 1 -> 1.5 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8? -> 9 -> 6 (restart) or 10 -> 3 (title)

# Status Summary

@tbl phase-status
  row phase:0 "Page Load + Vite Bootstrap" [LOCKED] note:"Verified iPhone Xs + 12 Mini"
  row phase:1 "BIOS Boot Screen" [LOCKED] date:2026-02-18
  row phase:1.5 "Swipe-to-Fullscreen" [LOCKED] date:2026-02-24
  row phase:2 "BootScene Asset Loading" [WIP]
  row phase:3 "Title Screen" [LOCKED] note:"Part of Full Game Flow"
  row phase:4 "Tutorial" [LOCKED] note:"Part of Full Game Flow"
  row phase:5 "Countdown + Skip" [LOCKED] date:2026-02-18
  row phase:6 "Gameplay (PLAYING)" [WIP]
  row phase:7 "Dying Sequence" [LOCKED] note:"Part of Transition Animations"
  row phase:8 "Name Entry" [LOCKED] note:"Part of High Score Screen"
  row phase:9 "Death/Leaderboard" [LOCKED] date:2026-02-18
  row phase:10 "Return to Title" [LOCKED] note:"Part of Full Game Flow"
