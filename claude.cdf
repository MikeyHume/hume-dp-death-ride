@header project:"DP Moto" ver:0.00.52 fmt:CDF-GAMEDEV-1.0 updated:2026-02-24
  author:PC-Claude
  desc:"Phaser 3 arcade motorcycle runner -- authoritative recovery doc"
  src:claude.md

# Primary Objectives
@obj pri:1 "Stable + performant on iPhone/iPad (Safari + iOS audio)"
@obj pri:2 "Spotify Premium playback via Web Playback SDK"
@obj pri:3 "Supabase MCP -- Claude runs SQL directly"
@obj pri:4 "Structured perf + asset optimization plan"

# Session Recovery Rule
@rule id:session-recovery [PERMANENT]
  trigger:vscode-close|claude-crash|extension-restart|ctx-loss
  1. Read claude.md immediately
  2. Summarize last 5 exchanges
  3. Confirm cur working obj
  4. Continue from exact problem
  5. Prompt ctx-sensitive question to resume

# Locked-In Protection Proto
@rule id:locked-protection [PERMANENT]
  scope:every feat marked [LOCKED] in GAME_FLOW.md or Perfect Items tbl
  applies-to:all Claudes on any hume project touching this codebase
  1. Never alter locked code unless absolutely necessary for direct user req
  2. If must alter locked code:
    document WHAT + WHY in Changes Log
    test altered feat AND all feats sharing files
    testing 2x strict -- verify full flow twice, check regressions
    flag to Mikey: "I modified locked code in [file] for [reason]"
  3. Mikey can req changes to locked sections -- same 2x testing rule applies
  4. Ref GAME_FLOW.md for bug history of each locked phase
  5. Cross-Claude: P modifies locked code -> notify M via Slack. M modifies -> notify P. No surprise locked-code changes.

# Document Summary Proto
@proto id:doc-summary [PERMANENT]
  trigger:reading-any-doc
  fmt:"[SUMMARY updated: YYYY-MM-DD HH:MM]" block at top
  if summary-age < 2h -> read summary only
  if summary-age > 2h -> read full, update summary
  if no-summary -> read full, add summary
  except:claude.md always read full on session start
  applies-to:test JSON|plan files|script docs|comms files|MEMORY.md topics

# Spotify Integration Architecture
@cfg spotify-arch
  sdk:Web-Playback-SDK ("Playing on DP Moto")
  device-reg:Spotify-Connect
  playback:premium-only
  title-track:auto-plays-on-boot
  shuffle:programmatic via Spotify track IDs
  auth:PKCE
  redirect:"http://127.0.0.1:8081/callback"
  client-secret:recently-rotated
  local-token + Web-API:verified-working
  stream-rule:30+ seconds legitimate playback counts as stream
  policy:no artificial stream manipulation -- Spotify TOS compliant

# Supabase / Backend State
@cfg supabase-backend
  edge-fn:sync_music_catalog
  responsibilities:fetch Spotify artist catalog|batch album track pulls|YouTube matching|upsert music_tracks + music_artists
  prev-debugging:fixed "Invalid limit" API error|removed include_groups/market=US|switched album discovery to /search|defensive limit normalization|structured error accumulation|debug diagnostics
  synced-artists:see hume-music-catalog section
  mcp:enabled -- Claude runs SQL via mcp__supabase__execute_sql

# Hume Ecosystem -- Keys & Connections
// [PORTABLE] Copy into any new hume app/game for same Spotify+YT+Supabase+profile wiring

@key service:supabase [PORTABLE]
  ref:wdaljqcoyhselitaxaeu
  url:https://wdaljqcoyhselitaxaeu.supabase.co
  anon:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjI2MTQsImV4cCI6MjA4NjYzODYxNH0.6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4
  mcp-token:sbp_6013b20056fff94cd12dcf68413ebf9003242bad
  link-cmd:"npx supabase link --project-ref wdaljqcoyhselitaxaeu"
  tables:music_artists|music_tracks|user_favorites|user_playlists|user_playlist_tracks|leaderboard
  edge-fns:sync_music_catalog (catalog sync + YT match + popularity)

@key service:spotify [PORTABLE]
  client-id:e20013b88ebc46018a93ab9c0489edd8
  client-secret:c875811cee0d436c9df8e9b5e752984d
  redirect:"http://127.0.0.1:8081/callback"
  auth-flow:PKCE (no server needed)
  scopes:streaming|user-read-email|user-read-private|user-read-playback-state|user-modify-playback-state
  sdk:Web-Playback-SDK premium-only
  mode:dev limit:10 max on album endpoints
  note:/v1/albums?ids= batch returns 403 in dev-mode

@key service:youtube [PORTABLE]
  api-key:AIzaSyASulXrMXNOvseby4KxiGMZvPZNyy-8bS4
  api:YouTube-Data-API-v3
  used-for:channel video list pulls|search for track matching|WMP video companion

# Edge Fn Env Vars (Supabase dashboard -> Project Settings -> Edge Functions)
@env PROJECT_URL src:auto-supabase "Supabase project URL"
@env SERVICE_ROLE_KEY src:auto-supabase "Bypasses RLS for catalog writes"
@env SPOTIFY_CLIENT_ID src:same-as-client "Catalog sync search/fetch"
@env SPOTIFY_CLIENT_SECRET src:same-as-client "Client credentials token for server-side Spotify API"
@env YOUTUBE_API_KEY src:same-as-client "Auto-match tracks to YouTube videos"

# .env.local Template (for any new hume app)
@env VITE_SUPABASE_URL=https://wdaljqcoyhselitaxaeu.supabase.co
@env VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjI2MTQsImV4cCI6MjA4NjYzODYxNH0.6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4
@env VITE_SPOTIFY_CLIENT_ID=e20013b88ebc46018a93ab9c0489edd8
@env VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081/callback
@env SPOTIFY_CLIENT_SECRET=c875811cee0d436c9df8e9b5e752984d
@env YOUTUBE_API_KEY=AIzaSyASulXrMXNOvseby4KxiGMZvPZNyy-8bS4

# Connection Flow
@phase app-launch
  User launches app -> Spotify PKCE login (Client ID + Redirect URI)
  -> Web Playback SDK registers device ("Playing on DP Moto")
  -> PlaybackController reads music_tracks from Supabase
  -> Spotify plays track -> PlaybackController loads matching YT video in WMP
  -> User favorites/playlists stored in Supabase (user_favorites, user_playlists)
  -> sync_music_catalog edge fn keeps catalog fresh (Spotify -> DB <- YouTube)

# Hume Music Catalog
@cfg music-catalog audit-date:2026-02-20
  SPOTIFY_CLIENT_SECRET enables Spotify Search API via client credentials flow (no user login)
  YOUTUBE_API_KEY enables YouTube Data API v3 (channel video lists, search)
  with both keys Claude can: search Spotify for tracks/collabs|pull full YT channel video lists|cross-ref and fix

@art name:DEATHPIXIE spotify-id:5uzPIJDzWAujemRDKiJMRj tracks:79 yt-matched:77
  yt-channel:@DEATHPIXIEXX yt-id:UC2EAt-FHwwFN-H9stKlxwdg
  notes:2 tracks no YT anywhere (PROLOGUE, 44). Includes BLIND + NEW BLOOD collabs.
@art name:angelbaby spotify-id:6g4ZsQkAV0t8qDAYlB5QGr tracks:31 yt-matched:31
  yt-channel:none
  notes:All YT links manually matched. "choke" collab moved to twenty16.
@art name:kai.wav spotify-id:5IPEenyFaDk0FQkFbKG0dU tracks:10 yt-matched:10
  yt-channel:"@kai.wav" yt-id:UCHpg9UkjVo4O_1CN8LFmpVA
@art name:"lofi gma" spotify-id:4LgILYbU9dlASWbKjk4JE3 tracks:11 yt-matched:11
  yt-channel:@lofigma yt-id:UCMIt0uJnP4yZm56S9mgz2qw
  notes:Only 2 official videos; rest auto-matched from Topic channel
@art name:Pro6lema spotify-id:5bKEBKgPviDlk2xkZeTTBA tracks:28 yt-matched:28
  yt-channel:@pro6lemaaa yt-id:UCWpiU-rppVkJtiZ1n2L1d5g
  notes:GRIM REAPER collab stored under DEATHPIXIE
@art name:twenty16 spotify-id:13sZjhnPfCPkuD6HQT9XUN tracks:2 yt-matched:2
  yt-channel:topic-only yt-id:UCAZCSR0k5j-C7RoM3mOwOng
  notes:"choke" angelbaby collab reassigned here

@note catalog-totals:161 tracks, 159 with YouTube (98.8%)

# Catalog Audit Process
@proto id:catalog-audit
  1. Pull full Spotify catalog per artist via /v1/artists/{id}/albums?limit=10 (paginated) -> per-album /v1/albums/{id}/tracks
  2. Compare Spotify track IDs against music_tracks db -- find missing/extra
  3. Pull full YouTube channel videos via Data API (uploads playlist, paginated 50/page)
  4. Cross-ref: verify each db youtube_video_id matches correct video (original vs slowed/sped)
  5. Search YouTube API for tracks still missing YT matches
  6. Collabs often live under OTHER artist on Spotify -- search by track name

# Catalog Known Patterns
@note DEATHPIXIE releases: original + slowed & reverbed + sped up (sometimes + ultra slowed)
@note Each DEATHPIXIE variant has own Spotify track AND own YouTube video on @DEATHPIXIEXX
@note Pro6lema same pattern (original + slowed + sped + ultra slowed) but only uploads original to YT
@note Collabs appear under primary artist on Spotify -- must manually reassign spotify_artist_id
@note Edge fn sync_music_catalog misses collabs -- only searches by artist name
@note /v1/artists/{id}/albums works with limit:10 via client credentials (dev-mode limitation)

# Catalog Helper Scripts
@file audit_spotify.cjs path:scripts/audit_spotify.cjs "Pulls full Spotify catalog for all artists"
@file fetch_yt_channels.cjs path:scripts/fetch_yt_channels.cjs "Pulls all YouTube channel videos for all artists"

# Recent Conversation Summary (Last 5 Exchanges)
@conv slot:1 "WMP ctx menu not showing on right-click"
  cause:makeHTMLInvisible() stripped all HTML styling, no Phaser rendering for ctx menu
  fix:Added ctxTextsP/ctxSubTextsP Phaser text pools at depth d+4, full Win95-style rendering in syncPhaser (raised border, purple hover, etched separators, submenu)
  also:moved right-click handler from per-row elements to libraryList using hoverTrackIdx
@conv slot:2 "Add new artist to hume catalog"
  artist-id:4LgILYbU9dlASWbKjk4JE3 result:11 tracks fetched, 11 YT matches, 11 popularity scores. 3 tracks failed YT matching.
@conv slot:3 "Supabase MCP setup"
  user asked how to give Claude direct SQL access
  instructions:generate PAT at supabase.com/dashboard/account/tokens, run npx @anthropic-ai/claude-code mcp add supabase
@conv slot:4 "Col resize/reorder fixes"
  fix:handleColResize + col reorder target detection now use libHeaderRow.getBoundingClientRect() instead of libraryList rect minus thumbnail width
  why:col fractions match actual col area after thumbnail + padding + scrollbar offsets
@conv slot:5 "Scrollbar and library ui polish"
  built:scrollbar drag|momentum scroll|GeometryMask clipping|hover/selection states|col divider grab|hdr alignment
  carried forward into this session

# Immediate Next Steps
@next pri:1 "Fix hue-shift bg bug -- solid color block instead of transparent tinted layers"
@next pri:2 "Implement hume third music src"
@next pri:3 "Ask ctx-sensitive question to resume"

# Planned Feature: hume Third Music Src (TOS-Compliant Local Audio)
@plan "hume third music source" status:approved prereq:"Fix hue-shift bg bug"
  why:Spotify+YT TOS prohibit syncing streamed audio to gameplay visuals. Beat data, course data, rhythm mode all sync to music. Need third src ("hume") playing local audio, auto-switching on music sync.
  add 'hume' to MusicSource type ('youtube'|'spotify'|'hume')
  TOS rule: beat sync / rhythm mode -> auto-switch to hume src
  when hume active -> Spotify+YT fully stopped (no bg streaming)
  audio-path:public/assets/audio/music/Rythem_Songs/{spotifyTrackId}.mp3
  src-masters:"D:\hume music\Music" -- fuzzy-match to catalog, keep smallest per track (prefer MP3)
  flag tracks with >5s duration mismatch for reprocessing
  debug music src text: 18px -> 72px, bold
  getPlaybackPosition() via audio.currentTime (most accurate of all 3 srcs)
  @plan.phase 1 "Offline scripts" create:scripts/match_local_audio.py|scripts/copy_local_audio.py
    fuzzy match, copy/convert
  @plan.phase 2 "HumePlayerSys" create:src/systems/HumePlayerSystem.ts|src/config/humeManifest.ts
    HTML5 Audio, mirrors SpotifyPlayerSystem API + static track ID set
  @plan.phase 3 "MusicPlayer integration" modify:src/systems/MusicPlayer.ts
    add hume src type, route 11 playback methods, switchToHume/switchFromHume
  @plan.phase 4 "WMPPopup" modify:src/ui/WMPPopup.ts
    src type + ui updates
  @plan.phase 5 "GameScene" modify:src/scenes/GameScene.ts
    auto-switch to hume on rhythm mode entry/track change, switch back on exit
  @plan.phase 6 "Debug text" 72px bold
  @plan.phase 7 "Tuning" modify:src/config/tuning.ts
    add MUSIC_VOL_HUME:1.0

# Philosophy
@philosophy "Player feel first" -- every sys serves what plr feels. Wrong feel = wrong implementation regardless of correct code.
@philosophy "Speed is vibe" -- fast, aggressive, immediate. Min boot-to-gameplay, instant death-to-retry. No friction.
@philosophy "Tinkering" -- every look/feel/timing value in tuning.ts as named constant. pos, scale, rot, color, text, timing. Never hardcode magic nums.
@philosophy "Juice matters" -- shake, spd lines, flashes, reflections, CRT fx = core arcade cabinet identity, not extras.
@philosophy "Simplicity > cleverness" -- 3 similar lines beat premature abstraction. Straightforward solutions preferred.

# Mikey's Request Format
@request-format
  [CHANGE] what to add/change
  [PROTECT] what NOT to touch (protect at all costs)
  [GOAL] overall goal -- Claude gets creative within constraints
  default-protect:all [PERFECT] items + recent happy feats

# Rules -- ALWAYS
@rule id:always-tuning [PERMANENT] "Include easy-to-edit floated vars in tuning.ts for pos, scale, rot, color, custom text for anything added"
@rule id:always-name-vars [PERMANENT] "Name tuning vars clearly -- purpose obvious at glance"
@rule id:always-pos-scale-rot [PERMANENT] "Include pos, scale, rot values -- Mikey likes to move things after creation"
@rule id:always-read-first [PERMANENT] "Read file before editing"
@rule id:always-protect-perfect [PERMANENT] "Protect perfect items from changes"
@rule id:always-scan-vocab [PERMANENT] "Scan claude.md for [Y] entries with color:red -> update to color:green + correct status"
@rule id:always-update-before-compact [PERMANENT] "Update claude.md with session changes (Changes Log, Major Bugs, General Notes, Problem Tracker) before any compaction"

# Rules -- NEVER
@rule id:never-break-working [PERMANENT] "NEVER break working feat to implement/progress new feat"
@rule id:never-countdown-tracks [PERMANENT] "NEVER start YouTube playlist with tracks GZwNZU7AviA or EkPDn519DFs (match countdown audio)"
@rule id:never-same-spotify [PERMANENT] "NEVER start Spotify with same track as last session"
@rule id:never-commit-unasked [PERMANENT] "NEVER commit without explicit user req"
@rule id:never-music-reactive-normal [PERMANENT] "NEVER implement music-reactive feats in Normal Mode -- see spotify-reactivity-rule"

# Spotify Music Reactivity Rule
@rule id:spotify-reactivity [PERMANENT]
  scope:ALL hume games/apps using Spotify -- Spotify TOS compliance
  Normal-Mode: Spotify (Premium) or YouTube (fallback) playback
    generates legitimate streams/views for artists
    NO music-reactive elements -- nothing reacts to BPM|beat timing|energy levels|frequency bands|onset detection|any audio analysis
    ALLOWED: static visual theming from album art (metadata-driven, not audio-reactive)
    ALLOWED: ui updates on track change (thumbnail, title, artist name) -- evt-driven
    NOT-ALLOWED: sky pulsing to beat|obs spawning on beat|spd changes synced to drops|bloom driven by bass|anything requiring audio temporal characteristics
  Rhythm-Mode: self-hosted audio only. No Spotify, no YouTube.
    full music reactivity: sky pulsing|beat-synced spawning|BPM-driven gameplay|frequency-band visuals|dominant color phasing to beat
    uses pre-computed beat data from scripts/analyze_audio.py (librosa multi-band spectral analysis)
    audio self-hosted (not streamed from third-party)
    all beat data + energy maps derived from self-hosted audio
  Claude-responsibility:
    evaluate whether requested feat is music-reactive
    if music-reactive -> Rhythm Mode only, warn Mikey before implementing
    if ambiguous -> ask: "Does this need to react to audio in real-time, or driven by static metadata?"
    violation examples: "pulse bg to bass"|"spawn obs on beat"|"speed up during drops"|"match intensity to energy level"

# Vocabulary
@vocab "fine tune" [Y] "Adjust numeric values in tuning.ts for exact look/feel through iteration"
@vocab "juice" [Y] "Visual+audio feedback -- shake, flashes, particles, sound pops"
@vocab "vibe coding" [Y] "Mikey describes intent, Claude implements, rapid iteration on tuning values"
@vocab "perfect" [Y] "Feature exactly as desired -- lock down, protect from changes"
@vocab "broke" [Y] "Feature that was working now visually/functionally wrong"

# Recycled Code -- Included
// Features loaded from claude_TEMPLATE.md at project start. None -- first project.

# Recycled Code -- Added (new feats developed during project)
// Mikey changes [N] to [Y] to approve. Approved feats added to claude_TEMPLATE.md.
@feat "CRT Shader" [N] files:CRTPipeline.ts|crtTuning.ts
  Post-processing CRT scanline/warp pipeline
@feat "BIOS Boot Screen" [N] files:index.html|BootScene.ts
  Retro BIOS boot seq with loading bar and jittering [ENTER] prompt
@feat "Music Player (YT + Spotify)" [N] files:MusicPlayer.ts
  Dual-src music plr with thumbnail, track title, shuffle, mute, crossfade
@feat "Parallax Background" [N] files:ParallaxSystem.ts
  Multi-layer scrolling parallax with depth-sorted tile spr
@feat "Puddle Reflections" [N] files:ReflectionSystem.ts|RoadSystem.ts
  Below-road reflections visible through puddle-shaped holes in road mask
@feat "Supabase Leaderboard" [N] files:LeaderboardService.ts|LeaderboardSystem.ts
  Weekly global ldr with Supabase backend, top 10 display
@feat "Spotify Auth (PKCE)" [N] files:SpotifyAuthSystem.ts|spotifyPkce.ts
  OAuth2 PKCE flow for Spotify Premium playback
@feat "Profile System" [N] files:ProfileSystem.ts|ProfileHud.ts|ProfilePopup.ts
  Avatar + display name from Spotify/Google, profile popup with stats
@feat "Tutorial Overlay" [N] files:GameScene.ts
  Multi-page tutorial with skip btn and slide nav
@feat "Music Catalog Sync" [N] files:sync_music_catalog/index.ts|MusicCatalogService.ts
  Supabase Edge Fn syncs Spotify artist catalogs + auto-matches YouTube videos
@feat "WMP Library Tab" [N] files:WMPPopup.ts
  Library tab in WMP popup showing synced catalog tracks with YT match status
@feat "PlaybackController" [N] files:PlaybackController.ts
  Catalog-aware Spotify<->YouTube bridge for WMP video companion

// Templates root folder: not yet created. Set up when first feat approved.

# Brief
@ref file:brief_TEMPLATE.md "Read FIRST before any project brief"
@ref file:"DP Moto Brief.txt" path:"c:\Users\mikey\Claude_Playground\dp_moto\DP Moto Brief.txt"

# Project Overview
@project name:"DP Moto" engine:Phaser-3.88 lang:TypeScript bundler:Vite backend:Supabase
  res:1920x1080 scale:FIT target:60fps pool:obj no-per-frame-alloc
  genre:arcade-motorcycle-runner
  desc:"Lone biker blasts left-to-right across barren highway, weaving vertically to dodge obs while managing spd via Space tapping. Short intense runs (30-90s), instant restarts, score-chasing. Modern indie coin-op cabinet vibe with CRT shader, psychedelic/rock/outlaw aesthetic."

# File Map
@file index.html path:index.html "Entry point, BIOS boot overlay, CSS"
@file main.ts path:src/main.ts "Phaser game cfg + launch"
@file tuning.ts path:src/config/tuning.ts "ALL game constants -- single src of truth"
@file crtTuning.ts path:src/config/crtTuning.ts "CRT shader params"
@file gameMode.ts path:src/config/gameMode.ts "GameState enum (TITLE, STARTING, PLAYING, DEAD)"
@file BootScene.ts path:src/scenes/BootScene.ts "Asset loading, tex generation, boot seq"
@file GameScene.ts path:src/scenes/GameScene.ts "Main game hub -- wires all sys, state machine, ui" size:~158KB
@file InputSystem.ts path:src/systems/InputSystem.ts "Mouse Y, keyboard, touch, attack input"
@file PlayerSystem.ts path:src/systems/PlayerSystem.ts "Plr movement, Y follow, X impulse/friction, lane scaling"
@file RoadSystem.ts path:src/systems/RoadSystem.ts "Scrolling road TileSprite, lane highlights"
@file ObstacleSystem.ts path:src/systems/ObstacleSystem.ts "Obs pool, CRASH/SLOW/CAR types, AABB col, spawning"
@file DifficultySystem.ts path:src/systems/DifficultySystem.ts "Timer-based 0-1 diff ramp"
@file ScoreSystem.ts path:src/systems/ScoreSystem.ts "Distance + spd multiplier scoring"
@file FXSystem.ts path:src/systems/FXSystem.ts "Spd lines, screen flash, shake, edge warnings"
@file AudioSystem.ts path:src/systems/AudioSystem.ts "SFX playback, engine loop, impact sounds"
@file MusicPlayer.ts path:src/systems/MusicPlayer.ts "Dual YT/Spotify plr, countdown audio, crossfade, ui"
@file SpotifyAuthSystem.ts path:src/systems/SpotifyAuthSystem.ts "Spotify OAuth2 PKCE flow"
@file SpotifyPlayerSystem.ts path:src/systems/SpotifyPlayerSystem.ts "Spotify Web Playback SDK wrapper"
@file ParallaxSystem.ts path:src/systems/ParallaxSystem.ts "Multi-layer scrolling bg (sky, buildings, railing)"
@file ReflectionSystem.ts path:src/systems/ReflectionSystem.ts "Puddle reflections -- below-road layers + road mask"
@file PickupSystem.ts path:src/systems/PickupSystem.ts "Collectible pickups (ammo, shield potions) with hover anim"
@file ShieldSystem.ts path:src/systems/ShieldSystem.ts "Shield orb visual + dmg absorption"
@file RocketSystem.ts path:src/systems/RocketSystem.ts "Rocket projectile firing + flight"
@file TimeDilationSystem.ts path:src/systems/TimeDilationSystem.ts "Slow-mo fx on obs destruction"
@file LeaderboardSystem.ts path:src/systems/LeaderboardSystem.ts "localStorage weekly ldr"
@file LeaderboardService.ts path:src/systems/LeaderboardService.ts "Supabase global ldr API"
@file ProfileSystem.ts path:src/systems/ProfileSystem.ts "User profile (avatar, name) from Spotify/Google"
@file AuthSystem.ts path:src/systems/AuthSystem.ts "Auth state management"
@file PerfSystem.ts path:src/systems/PerfSystem.ts "FPS counter, perf monitoring"
@file OrientationOverlay.ts path:src/systems/OrientationOverlay.ts "Mobile landscape-lock overlay"
@file CRTPipeline.ts path:src/fx/CRTPipeline.ts "WebGL CRT post-processing shader"
@file ProfileHud.ts path:src/ui/ProfileHud.ts "In-game profile avatar + name display"
@file ProfilePopup.ts path:src/ui/ProfilePopup.ts "Expandable profile card with stats"
@file DisconnectModal.ts path:src/ui/DisconnectModal.ts "Spotify disconnect confirmation modal"
@file rng.ts path:src/util/rng.ts "Seeded RNG (mulberry32)"
@file time.ts path:src/util/time.ts "getCurrentWeekKey() -- ISO week str"
@file device.ts path:src/util/device.ts "Device/platform detection"
@file spotifyPkce.ts path:src/util/spotifyPkce.ts "PKCE challenge generation"
@file uuid5.ts path:src/util/uuid5.ts "UUID v5 generation"
@file MusicCatalogService.ts path:src/systems/MusicCatalogService.ts "Reads synced track/artist data from Supabase"
@file TrackMappingService.ts path:src/systems/TrackMappingService.ts "Manual YT mapping, sync trigger"
@file PlaybackController.ts path:src/systems/PlaybackController.ts "Catalog-aware Spotify<->YouTube bridge"
@file trackMap.ts path:src/config/trackMap.ts "Static track mapping (legacy, replaced by catalog)"
@file WMPPopup.ts path:src/ui/WMPPopup.ts "Win95 WMP popup with Now Playing + Library tabs"
@file supabaseClient.ts path:src/supabaseClient.ts "Supabase client init"
@file supabase_leaderboard.sql path:supabase_leaderboard.sql "DB schema for global ldr"
@file supabase_music.sql path:supabase_music.sql "DB schema for music catalog"
@file supabase_favorites.sql path:supabase_favorites.sql "DB schema for user favorites"
@file supabase_playlists.sql path:supabase_playlists.sql "DB schema for user playlists + playlist tracks"
@file supabase_popularity.sql path:supabase_popularity.sql "ALTER TABLE: add popularity col to music_tracks"
@file sync_music_catalog path:supabase/functions/sync_music_catalog/index.ts "Edge fn: Spotify catalog sync + YT auto-match + popularity"

# Feature List -- Original (from Brief)
@feat "Core movement" [LOCKED] "Mouse Y control, space tapping for spd, X impulse/friction"
@feat "Road sys" [LOCKED] "Scrolling TileSprite road, lane highlights"
@feat "Obstacle sys" [LOCKED] "CRASH (instant death), SLOW (spd penalty) types with obj pooling"
@feat "Difficulty ramp" [LOCKED] "Timer-based 0-1 over 120s, controls spawn rate + density"
@feat "Score sys" [LOCKED] "Distance + spd multiplier"
@feat "Weekly seed" [LOCKED] "Seeded RNG from ISO week, deterministic obs patterns"
@feat "Local ldr" [LOCKED] "localStorage top 10 per week"
@feat "Katana slash" [LOCKED] "F key, short active window + cooldown, destroys obs"
@feat "Juice pass" [LOCKED] "Spd lines, cam shake, screen flash, edge warnings"
@feat "Audio" [LOCKED] "Engine loop, impact sounds, SFX"

# Feature List -- New (added during development)
@feat "CRT shader pipeline" "Post-processing scanline/warp fx on entire game"
@feat "BIOS boot screen" "Retro boot seq with loading bar, [ENTER] prompt, jitter anim"
@feat "Parallax bg" "8-layer scrolling (sky, far buildings, close buildings, railing)"
@feat "Puddle reflection sys" "Reflections below road, visible through puddle-shaped BitmapMask holes"
@feat "Object reflections" "Plr, obs, cars, pickups, slash VFX reflected with proper pivots"
@feat "Dual music plr" "YouTube + Spotify with thumbnail, track title, shuffle, prev/next/mute"
@feat "Countdown audio sys" "Plays countdown music before playlist starts (both srcs)"
@feat "Spotify auth" "OAuth2 PKCE flow for Premium playback"
@feat "Profile sys" "Avatar + display name from Spotify/Google auth"
@feat "Profile popup" "Expandable card with plr stats"
@feat "Supabase global ldr" "Weekly top 10, avatar support, anon + named entries"
@feat "CAR obs type" "Oncoming traffic with per-lane scaling"
@feat "Pickup sys" "Ammo crates, shield potions with hover anim"
@feat "Rocket launcher" "Alt weapon with projectile sys, spr sheet anim"
@feat "Shield sys" "Dmg absorption orb with visual indicator"
@feat "Time dilation" "Slow-mo fx on obs destruction"
@feat "Tutorial overlay" "Multi-page how-to-play with skip btn pulse anim"
@feat "Countdown skip" "Any input during countdown instantly starts gameplay"
@feat "Death flow" "Anon plrs only see name entry for top 10, otherwise straight to ldr"

# Changes Log
@fix date:2026-02-18 "Unified countdown audio for YT + Spotify" files:MusicPlayer.ts
  why:YouTube had no countdown music, used delay-shuffle hack
@fix date:2026-02-18 "Added YT/Spotify first-track dedup" files:MusicPlayer.ts|SpotifyPlayerSystem.ts
  why:Same first song every session felt repetitive
@fix date:2026-02-18 "Made countdown skippable + skip countdown audio" files:GameScene.ts|MusicPlayer.ts
  why:Plr should get to gameplay ASAP on input
@fix date:2026-02-18 "Anon death flow -- top 10 only gets name entry" files:GameScene.ts
  why:No point asking for name if score won't be recorded
@fix date:2026-02-18 "Slash VFX reflection with angle negation" files:ReflectionSystem.ts|GameScene.ts|tuning.ts
  why:Katana slash should appear in puddle reflections
@fix date:2026-02-18 "Fixed death screen green box" files:GameScene.ts
  why:nameEnterBtn had padding {x:500,y:500} covering screen
@fix date:2026-02-18 "Fixed avatar ring gap in ProfilePopup" files:ProfilePopup.ts
  why:Phaser strokes center on edge -- radius off by half stroke width
@fix date:2026-02-18 "Right-justified boot [ENTER] prompt" files:index.html
  why:Alignment with loading bar right edge
@fix date:2026-02-18 "Fixed enter text scale (CSS anim override)" files:index.html
  why:bios-jitter anim replacing transform:scale
@fix date:2026-02-18 "Skip btn pulse anim" files:GameScene.ts
  why:Tutorial skip should pulse when not hovered
@fix date:2026-02-18 "Added ProfileHud avatar stroke tuning vars" files:ProfileHud.ts
  why:Stroke was hardcoded -- Mikey wanted to thicken it
@fix date:2026-02-18 "Added add-pic-icon overlay to ProfilePopup avatar" files:ProfilePopup.ts|BootScene.ts
  why:Visual indicator that avatar clickable to upload
@fix date:2026-02-18 "Unified BIOS [ENTER] jitter with rest of boot text" files:index.html
  why:enter-jitter now uses same --bios-jitter-amount and --bios-jitter-speed vars
@fix date:2026-02-18 "Fixed ProfileHud stroke flash during transitions" files:ProfileHud.ts
  why:AVATAR_STROKE_ALPHA was 2 -- alpha > 1 causes stroke to stay visible while container fades

@fix date:2026-02-19 "Music catalog infrastructure (5 phases)" files:supabase_music.sql|sync_music_catalog/index.ts|MusicCatalogService.ts|TrackMappingService.ts|PlaybackController.ts|WMPPopup.ts|MusicPlayer.ts|SpotifyPlayerSystem.ts
  why:WMP showed black video when Spotify active -- needed catalog-based Spotify<->YouTube matching
@fix date:2026-02-19 "Edge fn: switched from /albums to /search endpoint" files:sync_music_catalog/index.ts
  why:Spotify dev-mode apps return 400 "Invalid limit" on /artists/{id}/albums
@fix date:2026-02-19 "Edge fn: per-album track fetch (not batch)" files:sync_music_catalog/index.ts
  why:/v1/albums?ids=... returns 403 in dev-mode apps
@fix date:2026-02-19 "Added trackId to SpotifyTrackInfo" files:SpotifyPlayerSystem.ts
  why:PlaybackController needs Spotify track ID for catalog lookup
@fix date:2026-02-19 "WMP: catalog-aware YT companion loading" files:MusicPlayer.ts
  why:Uses catalog video ID instead of YT search when match exists
@fix date:2026-02-19 "WMP: Library tab with track list + scroll" files:WMPPopup.ts
  why:Browse synced catalog with YT match status indicators

@fix date:2026-02-20 "Predefined playlists (Phase 1)" files:WMPPopup.ts|MusicCatalogService.ts
  why:Playlists tab showed empty -- wired getDisplayTracks + getPlaylistTracks for Title Track, Ride or Die, this is hume
@fix date:2026-02-20 "Win95 ctx menu (Phase 2)" files:WMPPopup.ts
  why:Right-click on Library/Artists rows for Copy, Favorite, Play in Spotify, Get info, Add to playlist
@fix date:2026-02-20 "Favorites sys (Phase 3)" files:WMPPopup.ts|supabase_favorites.sql
  why:Supabase-backed per-user favorites with optimistic ui + rollback
@fix date:2026-02-20 "Custom playlists (Phase 4)" files:WMPPopup.ts|supabase_playlists.sql
  why:Supabase-backed user playlists -- create via "+", inline rename, add/remove/paste tracks, delete
@fix date:2026-02-20 "Ctx menu submenu (Phase 4)" files:WMPPopup.ts
  why:"Add to playlist" submenu shows custom playlists, sidebar right-click for rename/delete
@fix date:2026-02-20 "Popularity col + edge fn (Phase 5)" files:supabase_popularity.sql|sync_music_catalog/index.ts
  why:Added popularity col to music_tracks, edge fn fetches Spotify popularity scores during sync
@fix date:2026-02-20 "Fixed broken comment block in WMPPopup" files:WMPPopup.ts
  why:Lines 387-389 had uncommented obj literals from partial comment-out, breaking class parsing
@fix date:2026-02-20 "WMP ctx menu Phaser rendering" files:WMPPopup.ts
  why:makeHTMLInvisible strips styling -- added ctxTextsP/ctxSubTextsP pools + syncPhaser at depth d+4
@fix date:2026-02-20 "Right-click handler moved to libraryList" files:WMPPopup.ts
  why:Per-row contextmenu handlers didn't work with scroll -- moved to libraryList using hoverTrackIdx
@fix date:2026-02-20 "Col resize/reorder width fix" files:WMPPopup.ts
  why:handleColResize + reorder target detection used wrong width -- switched to libHeaderRow rect
@fix date:2026-02-20 "Synced new artist 4LgILYbU9dlASWbKjk4JE3" files:edge-fn-invocation
  why:Added second artist to catalog -- 11 tracks, 11 YT matches, 11 popularity scores

# Major Bugs
@bug "Green box covering death screen" [FIXED]
  cause:nameEnterBtn Phaser Text had padding:{x:500,y:500} + backgroundColor:#003300 at depth:211 covering everything below
  lesson:Phaser Text padding+bg creates visible filled rect -- keep padding small or don't use backgroundColor
  files:GameScene.ts
@bug "CSS anim overriding scale" [FIXED]
  cause:bios-jitter keyframes transform:translateY replaces element transform:scale every frame
  lesson:CSS anims replace entire transform prop -- combine all transforms in keyframe
  files:index.html
@bug "Avatar ring gap" [FIXED]
  cause:Phaser strokes center on shape edge (half inside, half outside). Ring radius was AVATAR_RADIUS + AVATAR_RING_WIDTH instead of + AVATAR_RING_WIDTH / 2
  lesson:Always account for Phaser stroke centering: offset by half stroke width
  files:ProfilePopup.ts
@bug "ProfileHud stroke flash on transitions" [FIXED]
  cause:AVATAR_STROKE_ALPHA = 2 -- Phaser multiplies child alpha by container alpha during tweens. Alpha > 1 means stroke stays fully visible while rest fades
  lesson:Never set Phaser alpha > 1 on objects inside containers that get alpha-tweened
  files:ProfileHud.ts

# Problem Tracker
@tbl problem-tracker
  row "Reflections above road interfered with PostFX displacement" status:solved
    action:Moved reflections BELOW road, cut puddle holes via inverted BitmapMask on road tile. Displacement PostFX now independent of masking.
  row "YouTube always started with same song" status:solved
    action:Removed 5.5s delay hack, added shuffle + avoid list + localStorage dedup
  row "Death screen avatars appeared large after ProfilePopup fix" status:solved
    action:Investigation showed death screen uses separate constants (DLB_T3_AVATAR_R=30) -- always that size, hidden by green box bug

# General Notes
@note tuning.ts single src of truth for ALL game constants -- never hardcode elsewhere
@note countdown audio (hell_girl_countdown.mp3) same song as YT tracks GZwNZU7AviA and EkPDn519DFs -- never play back to back
@note death screen ldr uses own avatar constants (DLB_T3_AVATAR_R, DLB_T3_AVATAR_STROKE) separate from ProfilePopup.ts
@note GameScene.ts ~158KB -- main integration hub for all sys
@note ObstacleSystem.ts handles CRASH, SLOW, CAR types with different col behaviors
@note reflection sys uses stamp pattern: set tex/flip/pos on reusable spr, alpha=1, RT.draw(), alpha=0
@note Phaser BitmapMask invertAlpha:true on road tile creates puddle holes showing reflections underneath
@note countdownMusic field in MusicPlayer shared between Spotify + YouTube paths -- only one src active at a time
@note ProfileHud has local tuning constants at top of file (not in tuning.ts) -- AVATAR_STROKE_WIDTH, AVATAR_STROKE_COLOR, AVATAR_STROKE_ALPHA
@note ProfilePopup has avatarOverlay (black circle 20% opacity) + avatarAddIcon (add_pic_icon.png) layered on avatar -- only visible when Spotify connected
@note ProfilePopup avatar upload: click avatar -> openFilePicker() -> onFileSelected() -> uploadAvatarAndSave() to Supabase Storage. Also applies locally via canvas circle crop
@note BIOS boot [ENTER] prompt: enter-jitter keyframe must include scale(var(--bios-enter-scale)) alongside translateY to avoid CSS anim overriding scale
@note Never set Phaser obj alpha > 1 inside containers that get alpha-tweened -- causes obj to stay visible during fade transitions
@note ALWAYS update claude.md with session changes before compaction (manual or auto) so ctx preserved
@note Spotify dev-mode caps limit param well below documented max -- limit:10 safe, limit:20+ returns 400
@note /v1/artists/{id}/albums broken for dev-mode Spotify apps -- use /v1/search?q=artist:{name}&type=album
@note /v1/albums?ids=... batch endpoint returns 403 in dev-mode -- fetch individually via /v1/albums/{id}/tracks
@note edge fn env vars need .trim() -- invisible whitespace from dashboard paste
@note Supabase project ref:wdaljqcoyhselitaxaeu -- link before deploy: npx supabase link --project-ref wdaljqcoyhselitaxaeu
@note MusicCatalogService.ts has 5-min cache; call clearCatalogCache() after sync
@note PlaybackController does async catalog lookup -- falls back to YT search if no match
@note WMP Library tab uses pool of WMP_LIB_ROWS (10) Phaser text objects, scrolled via mousewheel
@note SpotifyTrackInfo now includes trackId field for catalog lookups
@note WMP Playlists tab: 4 predefined (Title Track, Ride or Die, this is hume, Favorites) + user-created custom playlists
@note "this is hume" playlist: groups by artist, takes top 5 per artist sorted by popularity field from Supabase
@note Favorites + custom playlists use auth.uid() UUID via ensureAnonUser() -- same pattern as ldr
@note Custom playlists stored in user_playlists + user_playlist_tracks with CASCADE delete
@note Ctx menu submenu uses pool of WMP_CTX_SUBMENU_MAX (10) items with 150ms hide timeout to prevent flicker
@note Sidebar rows support right-click (rename/delete) + double-click (inline rename) for custom playlists
@note Edge fn sync_music_catalog Step 3: fetches Spotify popularity in batches of 10, falls back to individual on 403
@note /v1/tracks?ids=... batch endpoint works in dev-mode (unlike /v1/albums?ids=... which returns 403)

# Perfect Items
@perf "Spotify Login & Profile" [LOCKED] date:2026-02-18
  files:SpotifyAuthSystem.ts|ProfileSystem.ts|ProfileHud.ts|LeaderboardService.ts
  scope:Login flow, profile pic+name loading, account assoc with high scores
@perf "BIOS Boot Screen" [LOCKED] date:2026-02-18
  files:index.html|BootScene.ts
  scope:Full boot seq with loading bar, jitter [ENTER] prompt
@perf "Full Game Flow" [LOCKED] date:2026-02-18
  files:BootScene.ts|GameScene.ts
  scope:BIOS -> Title -> Tutorial -> Countdown -> Gameplay Loop -> High Score -> Replay
@perf "Profile Popup" [LOCKED] date:2026-02-18
  files:ProfilePopup.ts|ProfileHud.ts
  scope:Expandable profile card with stats and avatar ring
@perf "High Score Screen" [LOCKED] date:2026-02-18
  files:GameScene.ts|LeaderboardService.ts|LeaderboardSystem.ts
  scope:Ldr display and name entry logic (anon top-10 only)
@perf "Countdown + Skip" [LOCKED] date:2026-02-18
  files:GameScene.ts|MusicPlayer.ts
  scope:Countdown seq and ability to skip instantly
@perf "Music Player" [LOCKED] date:2026-02-18
  files:MusicPlayer.ts
  scope:Dual-src plr ui, src switching, thumbnail, track title
@perf "Spotify Playback" [LOCKED] date:2026-02-18
  files:SpotifyPlayerSystem.ts|SpotifyAuthSystem.ts|MusicPlayer.ts|spotifyPkce.ts
  scope:Everything related to Spotify integration and playback
@perf "Reflections" [LOCKED] date:2026-02-18
  files:ReflectionSystem.ts|RoadSystem.ts
  scope:Puddle reflections below road with BitmapMask holes
@perf "Parallax Background" [LOCKED] date:2026-02-18
  files:ParallaxSystem.ts
  scope:Multi-layer scrolling bg with depth sorting
@perf "CRT Filter" [LOCKED] date:2026-02-18
  files:CRTPipeline.ts|crtTuning.ts
  scope:Post-processing CRT scanline/warp shader
@perf "Transition Animations" [LOCKED] date:2026-02-18
  files:GameScene.ts
  scope:All screen transition anims throughout game flow
@perf "CRT Hover Proxy System" [LOCKED] date:2026-02-18
  files:GameScene.ts|MusicPlayer.ts|ProfileHud.ts
  scope:Proxy objects outside Phaser pass hover state through CRT filter to in-game objects
@perf "Swipe-to-Fullscreen" [LOCKED] date:2026-02-24
  files:index.html|GameScene.ts
  scope:3-phase mobile flow: BIOS auto-dismiss -> solid black "SWIPE UP" overlay (blocks all input except vertical swipe) -> Safari chrome hides -> page locks position:static + overflow:hidden -> controls unlock. Body stays position:static (NOT fixed) so Safari doesn't re-show chrome. Game canvas gets pointer-events:none during swipe. 300ms unlock delay drains queued taps.
@perf "liteMode (All Phones)" [LOCKED] date:2026-02-24
  files:src/main.ts|src/scenes/BootScene.ts|src/util/device.ts
  scope:ALL phone tiers skip heavy anim spritesheets (~88MB VRAM savings). Prevents OOM crash on 4GB devices (iPhone 12 Mini, Xs). BootScene generates procedural tex for skipped assets.
