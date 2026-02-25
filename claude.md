# CLAUDE.md — DP Moto

> **This file is the authoritative recovery document for this project.**
> It must preserve context across VS Code restarts, Claude crashes, or memory resets.

---

## Primary Objectives
1. Make the game fully stable and performant on iPhone and iPad (Safari + iOS audio restrictions).
2. Ensure Spotify Premium playback works reliably via Web Playback SDK.
3. Enable Supabase MCP so Claude can run SQL directly instead of manual copy/paste.
4. After stability, execute a structured performance and asset optimization plan.

---

## Session Recovery Rule (Permanent)

Every time VS Code closes, Claude Code crashes, the extension restarts, or session context is lost, Claude must:

1. Read `claude.md` immediately.
2. Summarize the last 5 exchanges.
3. Confirm current working objective.
4. Continue from the exact problem being solved.
5. Prompt the user with a context-sensitive question to resume precisely where we left off.

This rule is mandatory for all future restarts.

---

## Locked-In Protection Protocol (Permanent)

Every feature marked **[LOCKED]** in `GAME_FLOW.md` or listed in the **Perfect Items** table is protected code. This applies to **all Claudes** working on any hume project that touches this codebase.

1. **Never alter locked code** unless absolutely necessary to fulfill a direct user request.
2. **If you must alter locked code:**
   - Document WHAT you changed and WHY in the Changes Log below
   - Test the altered feature AND all features that share files with it
   - Testing must be **2x as strict** — verify the full flow twice, check for regressions
   - Flag the change to Mikey: "I modified locked code in [file] for [reason]"
3. **Mikey can request changes** to locked sections — but the same 2x testing rule applies.
4. **Reference `GAME_FLOW.md`** for the bug history of each locked phase — know what broke before so you don't repeat it.
5. **Cross-Claude awareness:** If P (PC Claude) modifies locked code, notify M (MacClaude) via Slack with the change details. If M modifies locked code, notify P the same way. Neither Claude should learn about locked-code changes by surprise.

---

## Document Summary Protocol (All Documents — Permanent)

Every document in this project (and all hume projects) follows a summary-first pattern to save context window space and reading time.

### How It Works

1. **Every document** should have a `[SUMMARY]` block at the very top, formatted like this:
   ```
   [SUMMARY updated: 2026-02-23 17:45]
   One-paragraph description of what this document contains and its purpose.
   Key sections: list of major sections and what's in each.
   Last major change: what was most recently modified.
   [/SUMMARY]
   ```

2. **When reading any document:**
   - If `[SUMMARY]` tag exists and timestamp is < 2 hours old → read ONLY the summary. Skip the full document unless you need something specific from it.
   - If `[SUMMARY]` tag exists but timestamp is > 2 hours old → read the full document, then update the summary with a new timestamp.
   - If NO `[SUMMARY]` tag exists → read the full document, then add a summary at the top.

3. **When you DO read a full document** (because summary was stale or missing):
   - Update/create the `[SUMMARY]` block with current timestamp.
   - Make the summary comprehensive enough that any Claude reading it knows exactly what's in the document — they should be able to decide "what I need is here, I should dig deeper" or "not here, move on" just from the summary.

4. **Exception:** CLAUDE.md itself is always read in full on session start (per Session Recovery Rule above). But other project documents (test manifests, config files, plans, scripts) should use this protocol.

This protocol applies to: test JSON files, plan files, script documentation, comms files, MEMORY.md topic files, and any other document regularly read across sessions.

---

## Spotify Integration Architecture

- Using Spotify Web Playback SDK (Spotify app shows "Playing on DP Moto").
- Playback device registers via Spotify Connect.
- Premium-only full playback.
- Title track auto-plays on boot.
- Game shuffles tracks programmatically via Spotify track IDs.
- PKCE authorization flow implemented.
- Redirect URI corrected to 127.0.0.1:8081/callback.
- Spotify client secret was recently rotated.
- Local token + Web API calls verified working.
- 30+ seconds of legitimate playback via Web Playback SDK should count as a stream.
- No artificial stream manipulation. All playback must remain compliant with Spotify policies.

---

## Supabase / Backend State

- Edge function: `sync_music_catalog`
- Responsibilities: fetch Spotify artist catalog, batch album track pulls, YouTube matching, upsert into `music_tracks` and `music_artists`
- Previous debugging: fixed "Invalid limit" API error, removed `include_groups`/`market=US`, switched album discovery to `/search` endpoint, defensive limit normalization, structured error accumulation, debug diagnostics
- Synced artists: see Hume Music Catalog below
- Supabase MCP: enabled, Claude can run SQL directly via `mcp__supabase__execute_sql`

---

## Hume Ecosystem — Keys & Connections

> **Portable section.** Copy this into any new hume app/game to instantly wire up the same Spotify playback, YouTube companion, Supabase backend, and user profile system. All apps share one Supabase project and one Spotify app — one ecosystem.

### Supabase (shared backend for all hume apps)

| What | Value |
|------|-------|
| Project ref | `wdaljqcoyhselitaxaeu` |
| API URL | `https://wdaljqcoyhselitaxaeu.supabase.co` |
| Anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjI2MTQsImV4cCI6MjA4NjYzODYxNH0.6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4` |
| MCP access token | `sbp_6013b20056fff94cd12dcf68413ebf9003242bad` (in `.mcp.json`) |
| Link command | `npx supabase link --project-ref wdaljqcoyhselitaxaeu` |
| Tables | `music_artists`, `music_tracks`, `user_favorites`, `user_playlists`, `user_playlist_tracks`, `leaderboard` |
| Edge functions | `sync_music_catalog` (catalog sync + YT match + popularity) |

### Spotify (user-facing playback + catalog API)

| What | Value |
|------|-------|
| Client ID | `e20013b88ebc46018a93ab9c0489edd8` |
| Client secret | `c875811cee0d436c9df8e9b5e752984d` |
| Redirect URI (dev) | `http://127.0.0.1:8081/callback` |
| Auth flow | PKCE (no server needed) |
| Scopes | `streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state` |
| SDK | Web Playback SDK (Premium required for full playback) |
| App mode | Dev mode — `limit=10` max on album endpoints, `/v1/albums?ids=` batch returns 403 |

### YouTube (companion video + catalog matching)

| What | Value |
|------|-------|
| API key | `AIzaSyASulXrMXNOvseby4KxiGMZvPZNyy-8bS4` |
| API | YouTube Data API v3 |
| Used for | Channel video list pulls, search for track matching, WMP video companion |

### Edge Function Env Vars (set in Supabase dashboard → Project Settings → Edge Functions)

| Var | Source | Purpose |
|-----|--------|---------|
| `PROJECT_URL` | Auto-set by Supabase | Supabase project URL |
| `SERVICE_ROLE_KEY` | Auto-set by Supabase | Bypasses RLS for catalog writes |
| `SPOTIFY_CLIENT_ID` | Same as client app | Catalog sync search/fetch |
| `SPOTIFY_CLIENT_SECRET` | Same as client app | Client credentials token for server-side Spotify API |
| `YOUTUBE_API_KEY` | Same as client app | Auto-match tracks to YouTube videos |

### `.env.local` Template (for any new hume app)

```
VITE_SUPABASE_URL=https://wdaljqcoyhselitaxaeu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjI2MTQsImV4cCI6MjA4NjYzODYxNH0.6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4
VITE_SPOTIFY_CLIENT_ID=e20013b88ebc46018a93ab9c0489edd8
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081/callback
SPOTIFY_CLIENT_SECRET=c875811cee0d436c9df8e9b5e752984d
YOUTUBE_API_KEY=AIzaSyASulXrMXNOvseby4KxiGMZvPZNyy-8bS4
```

### How It All Connects

```
User launches app
  → Spotify PKCE login (Client ID + Redirect URI)
  → Web Playback SDK registers device ("Playing on DP Moto")
  → PlaybackController reads music_tracks from Supabase
  → Spotify plays track → PlaybackController loads matching YouTube video in WMP
  → User favorites/playlists stored in Supabase (user_favorites, user_playlists)
  → sync_music_catalog edge function keeps catalog fresh (Spotify → DB ← YouTube)
```

---

## Hume Music Catalog

**Last full audit: 2026-02-20**

### API Keys (in `.env.local`)
- `SPOTIFY_CLIENT_SECRET` — enables Spotify Search API via client credentials flow (no user login needed)
- `YOUTUBE_API_KEY` — enables YouTube Data API v3 (channel video lists, search)
- With both keys Claude can independently: search Spotify for tracks/collabs, pull full YT channel video lists, cross-reference and fix everything

### Artist Roster

| Artist | Spotify ID | DB Tracks | YT Matched | YT Channel | Notes |
|--------|-----------|-----------|------------|------------|-------|
| DEATHPIXIE | `5uzPIJDzWAujemRDKiJMRj` | 79 | 77 | `@DEATHPIXIEXX` (`UC2EAt-FHwwFN-H9stKlxwdg`) | 2 tracks have no YT video anywhere (PROLOGUE, 44). Includes BLIND + NEW BLOOD collabs. |
| angelbaby | `6g4ZsQkAV0t8qDAYlB5QGr` | 31 | 31 | No official channel found | All YT links manually matched. "choke" collab moved to twenty16. |
| kai.wav | `5IPEenyFaDk0FQkFbKG0dU` | 10 | 10 | `@kai.wav🌊` (`UCHpg9UkjVo4O_1CN8LFmpVA`) | |
| lofi gma | `4LgILYbU9dlASWbKjk4JE3` | 11 | 11 | `@lofigma` (`UCMIt0uJnP4yZm56S9mgz2qw`) | Only 2 official videos; rest auto-matched from Topic channel |
| Pro6lema | `5bKEBKgPviDlk2xkZeTTBA` | 28 | 28 | `@pro6lemaaa` (`UCWpiU-rppVkJtiZ1n2L1d5g`) | GRIM REAPER collab stored under DEATHPIXIE |
| twenty16 | `13sZjhnPfCPkuD6HQT9XUN` | 2 | 2 | Topic channel only (`UCAZCSR0k5j-C7RoM3mOwOng`) | "choke" is angelbaby collab reassigned here |

**Totals: 161 tracks, 159 with YouTube (98.8%)**

### Audit Process
1. Pull full Spotify catalog per artist via `/v1/artists/{id}/albums?limit=10` (paginated) → per-album `/v1/albums/{id}/tracks`
2. Compare Spotify track IDs against `music_tracks` DB — find missing/extra
3. Pull full YouTube channel videos via Data API (uploads playlist, paginated 50/page)
4. Cross-reference: verify each DB `youtube_video_id` matches the correct video (original vs slowed/sped)
5. Search YouTube API for any tracks still missing YT matches
6. Collabs often live under the OTHER artist on Spotify — search by track name to find them

### Known Patterns
- DEATHPIXIE releases most songs as: original + slowed & reverbed + sped up (sometimes + ultra slowed)
- Each variant has its own Spotify track AND its own YouTube video on `@DEATHPIXIEXX`
- Pro6lema does the same pattern (original + slowed + sped + ultra slowed) but only uploads the original to YT
- Collabs appear under the primary artist on Spotify — must manually reassign `spotify_artist_id` to show under the featured artist
- Edge function `sync_music_catalog` misses collabs because it only searches by artist name
- The `/v1/artists/{id}/albums` endpoint works with `limit=10` via client credentials (same dev-mode limitation as edge function)

### Helper Scripts
- `scripts/audit_spotify.cjs` — pulls full Spotify catalog for all artists
- `scripts/fetch_yt_channels.cjs` — pulls all YouTube channel videos for all artists

---

## Recent Conversation Summary (Last 5 Exchanges)

1. **WMP context menu not showing on right-click** — Root cause: `makeHTMLInvisible()` stripped all HTML styling, and no Phaser rendering existed for the context menu. Fixed by adding `ctxTextsP`/`ctxSubTextsP` Phaser text pools at depth d+4, full Win95-style rendering in `syncPhaser` (raised border, purple hover, etched separators, submenu). Also moved right-click handler from individual HTML row elements to `libraryList` using `hoverTrackIdx`.

2. **Add new artist to hume catalog** — User provided Spotify URL `4LgILYbU9dlASWbKjk4JE3`. Ran edge function sync with `dryRun:false` — 11 tracks fetched, 11 YouTube matches, 11 popularity scores updated. 3 tracks failed YT matching.

3. **Supabase MCP setup** — User asked how to give Claude direct SQL access. Provided instructions: generate Personal Access Token at supabase.com/dashboard/account/tokens, run `npx @anthropic-ai/claude-code mcp add supabase` command.

4. **Column resize/reorder fixes** — Fixed `handleColResize` and column reorder target detection to use `libHeaderRow.getBoundingClientRect()` instead of `libraryList` rect minus thumbnail width, so column fractions match actual column area after thumbnail + padding + scrollbar offsets.

5. **Scrollbar and library UI polish** — Previous session built: scrollbar drag, momentum scroll, GeometryMask clipping, hover/selection states, column divider grab, header alignment. Carried forward into this session.

---

## Immediate Next Step After Restart

1. Fix hue-shift background bug (solid color block instead of transparent tinted layers).
2. Implement "hume" third music source (see Planned Feature below).
3. Ask a context-sensitive question to resume where we paused.

---

## Planned Feature: "hume" Third Music Source (TOS-Compliant Local Audio)

**Status:** Plan approved, not yet implemented. Fix hue-shift bug first.

### Why
Spotify and YouTube TOS prohibit syncing streamed audio to gameplay visuals. Beat data, course data, and rhythm mode all sync to music. Need a third source ("hume") playing local audio files, auto-switching whenever any music sync occurs.

### Key Requirements
- Add `'hume'` to `MusicSource` type (`'youtube' | 'spotify' | 'hume'`)
- **TOS rule**: any beat sync / rhythm mode → auto-switch to hume source
- When hume active, Spotify + YouTube must be **fully stopped** (no background streaming)
- Local audio files at `public/assets/audio/music/Rythem_Songs/{spotifyTrackId}.mp3`
- Source masters at `D:\hume music\Music` — fuzzy-match to catalog, keep smallest per track (prefer MP3)
- Flag tracks with >5s duration mismatch for reprocessing
- Debug music source text: 18px → 72px, bold
- `getPlaybackPosition()` works via `audio.currentTime` (most accurate of all three sources)

### Implementation Phases
1. **Offline scripts** — `scripts/match_local_audio.py` + `scripts/copy_local_audio.py` (fuzzy match, copy/convert)
2. **HumePlayerSystem** — `src/systems/HumePlayerSystem.ts` (HTML5 Audio, mirrors SpotifyPlayerSystem API) + `src/config/humeManifest.ts` (static track ID set)
3. **MusicPlayer integration** — Add hume source type, route 11 playback methods, switchToHume/switchFromHume
4. **WMPPopup** — Source type + UI updates
5. **GameScene** — Auto-switch to hume on rhythm mode entry/track change, switch back on exit
6. **Debug text** — 72px bold
7. **Tuning** — `MUSIC_VOL_HUME: 1.0`

### Files to Create
- `scripts/match_local_audio.py`, `scripts/copy_local_audio.py`
- `src/systems/HumePlayerSystem.ts`, `src/config/humeManifest.ts`

### Files to Modify
- `src/systems/MusicPlayer.ts` (type + routing + switching)
- `src/ui/WMPPopup.ts` (source type + UI)
- `src/scenes/GameScene.ts` (rhythm auto-switch, debug text)
- `src/config/tuning.ts` (MUSIC_VOL_HUME)

---

## CSS

<style>
  .vocab-new    { color: cyan; }
  .vocab-ok     { color: green; }
  .status-new   { color: orange; }
  .status-worse { color: red; }
  .status-less  { color: yellow; }
  .status-solved { color: limegreen; }
  .status-perfect { color: gold; }
</style>

---

## Philosophy

### Philosophy
- **Player feel comes first.** Every system exists to serve what the player feels. If it doesn't feel right, the implementation is wrong regardless of whether the code is correct.
- **Speed is a vibe.** The game should feel fast, aggressive, and immediate. Boot to gameplay should be as short as possible. Death to retry should be instant. No friction between the player and the action.
- **Tinkering is part of the process.** Every value that affects look, feel, or timing should be an easy-to-edit variable in `tuning.ts`. Position, scale, rotation, color, text, timing — all of it. Claude should always surface these as named constants, never hardcode magic numbers.
- **Juice matters.** Screen shake, speed lines, flashes, reflections, CRT effects — these aren't extras, they're core to the arcade cabinet identity.
- **Simplicity over cleverness.** Prefer straightforward solutions. Don't over-abstract. Three similar lines beat a premature utility function.

### Mikey's Request Format

Mikey's requests follow this structure:
1. **[CHANGE]** — what to add or change
2. **[PROTECT]** — what NOT to touch or break by any means (protect at all costs, it works the way he wants)
3. **[GOAL]** — the overall goal, so Claude can get creative achieving the change while protecting everything that works

Claude must always parse requests through this lens: implement the change, safeguard the protected items, and find creative solutions that serve the goal without breaking what's already good.

**Default [PROTECT]:** If Mikey doesn't specify a [PROTECT], assume all "Perfect Items" (see table below) and any recent features he seems happy with are implicitly protected.

### Rules

**ALWAYS:**
- ALWAYS include easy-to-edit floated variables (in `tuning.ts`) for position, scale, rotation, color, and custom text for anything added to the game
- ALWAYS name tuning variables clearly so their purpose is obvious at a glance
- ALWAYS include values for position, scale, and rotation since Mikey likes to move things around after creation
- ALWAYS read a file before editing it
- ALWAYS protect "perfect" items from changes
- ALWAYS scan `claude.md` for `[Y]` entries that still have `color:red` and update them to `color:green` + correct status label when reading the file
- ALWAYS update `claude.md` with session changes (Changes Log, Major Bugs, General Notes, Problem Tracker) before any compaction — manual (`/compact`) or automatic

**NEVER:**
- NEVER break a working feature to implement or progress a new feature
- NEVER start YouTube playlist with tracks `GZwNZU7AviA` or `EkPDn519DFs` (they match the countdown audio)
- NEVER start Spotify with the same track as the last session
- NEVER commit without explicit user request
- NEVER implement music-reactive features in Normal Mode — see **Spotify Music Reactivity Rule** below

---

### Spotify Music Reactivity Rule (ALL HUME GAMES — PERMANENT)

> **This rule applies to every hume game/app that uses Spotify. It exists to comply with Spotify's Terms of Service.**

All hume games have two modes:

**Normal Mode** — Spotify (Premium) or YouTube (fallback) playback.
- Playback generates legitimate streams/views for artists.
- **NO music-reactive elements.** Nothing may react to BPM, beat timing, energy levels, frequency bands, onset detection, or any audio analysis data.
- **Allowed:** Static visual theming based on album art (e.g., sky tint matching dominant color of the current track's Spotify thumbnail). This is metadata-driven, not audio-reactive.
- **Allowed:** UI updates on track change (thumbnail, title, artist name). This is event-driven, not audio-reactive.
- **NOT allowed:** Sky pulsing to the beat, obstacles spawning on beat, speed changes synced to drops, building bloom driven by bass, anything that requires knowing the audio's temporal characteristics.

**Rhythm Mode** — Self-hosted audio files only. No Spotify, no YouTube.
- Full music reactivity: sky pulsing, beat-synced spawning, BPM-driven gameplay, frequency-band-driven visuals, dominant color phasing to the beat, etc.
- Uses pre-computed beat data from `scripts/analyze_audio.py` (librosa multi-band spectral analysis).
- Audio files are self-hosted (not streamed from any third-party service).
- All beat data, energy maps, and audio analysis are derived from self-hosted audio, not from Spotify or YouTube.

**Claude's responsibility:**
- When Mikey requests a feature, evaluate whether it is music-reactive.
- If it is, it belongs in Rhythm Mode only. Warn Mikey before implementing.
- If it's ambiguous, ask: "Does this need to react to the audio in real-time, or is it driven by static metadata (album art, track title, etc.)?"
- Examples of violations to flag: "pulse the background to the bass", "spawn obstacles on the beat", "speed up during drops", "match intensity to energy level" — these are all Rhythm Mode only.

### Vocabulary
> **How this works:** Mikey only needs to change `[N]` to `[Y]` to approve.
> Claude will update colors and status labels automatically next time it reads this file.
> Claude should ONLY treat `[Y]` definitions as trusted context.

<div style="color:green"><b>fine tune</b> <code>[Y]</code><br>Adjust specific numeric values (usually in tuning.ts) to get the look/feel exactly right through iteration — <b>APPROVED</b></div>

<div style="color:green"><b>juice</b> <code>[Y]</code><br>Visual and audio feedback that makes interactions feel satisfying — screen shake, flashes, particles, sound pops — <b>APPROVED</b></div>

<div style="color:green"><b>vibe coding</b> <code>[Y]</code><br>Collaborative development style where Mikey describes intent/feel and Claude implements, with rapid iteration on tuning values — <b>APPROVED</b></div>

<div style="color:green"><b>perfect</b> <code>[Y]</code><br>Feature is exactly as desired — lock it down and protect from changes — <b>APPROVED</b></div>

<div style="color:green"><b>broke</b> <code>[Y]</code><br>A feature that was working is now visually or functionally wrong — <b>APPROVED</b></div>

<!-- Approved example: -->
<!-- <div style="color:green"><b>word</b> <code>[Y]</code><br>Approved definition here — <b>APPROVED</b></div> -->

---

## Recycled Code

### Included
> Features loaded from `claude_TEMPLATE.md` at project start. These are tested, approved templates cloned into this project as independent working copies. Only features from the template appear here.

*None — this is the first project. Future projects will list template features here.*

### Added
> New features developed during this project. Mikey only needs to change `[N]` to `[Y]` to approve.
> Claude will update colors and status labels automatically next time it reads this file.
> Approved features get added to `claude_TEMPLATE.md` for future projects. They stay here too — they belong to the project they were built in.
>
> Every change should map to a feature. If an existing feature is improved, update the template version too.

<div style="color:red"><b>CRT Shader</b> <code>[N]</code><br>Post-processing CRT scanline/warp pipeline — <b>WIP</b></div>

<div style="color:red"><b>BIOS Boot Screen</b> <code>[N]</code><br>Retro BIOS boot sequence with loading bar and jittering [ENTER] prompt — <b>WIP</b></div>

<div style="color:red"><b>Music Player (YT + Spotify)</b> <code>[N]</code><br>Dual-source music player with thumbnail, track title, shuffle, mute, crossfade — <b>WIP</b></div>

<div style="color:red"><b>Parallax Background</b> <code>[N]</code><br>Multi-layer scrolling parallax with depth-sorted tile sprites — <b>WIP</b></div>

<div style="color:red"><b>Puddle Reflections</b> <code>[N]</code><br>Below-road reflections visible through puddle-shaped holes in road mask — <b>WIP</b></div>

<div style="color:red"><b>Supabase Leaderboard</b> <code>[N]</code><br>Weekly global leaderboard with Supabase backend, top 10 display — <b>WIP</b></div>

<div style="color:red"><b>Spotify Auth (PKCE)</b> <code>[N]</code><br>OAuth2 PKCE flow for Spotify Premium playback — <b>WIP</b></div>

<div style="color:red"><b>Profile System</b> <code>[N]</code><br>Avatar + display name from Spotify/Google, profile popup with stats — <b>WIP</b></div>

<div style="color:red"><b>Tutorial Overlay</b> <code>[N]</code><br>Multi-page tutorial with skip button and slide navigation — <b>WIP</b></div>

<div style="color:red"><b>Music Catalog Sync</b> <code>[N]</code><br>Supabase Edge Function syncs Spotify artist catalogs + auto-matches YouTube videos — <b>WIP</b></div>

<div style="color:red"><b>WMP Library Tab</b> <code>[N]</code><br>Library tab in WMP popup showing synced catalog tracks with YT match status — <b>WIP</b></div>

<div style="color:red"><b>PlaybackController</b> <code>[N]</code><br>Catalog-aware Spotify↔YouTube bridge for WMP video companion — <b>WIP</b></div>

<!-- Approved example: -->
<!-- <div style="color:green"><b>Feature Name</b> <code>[Y]</code><br>Description — <b>Approved</b></div> -->

### Templates Root Folder
*Not yet created. Will be set up when first feature is approved.*

---

## Brief

### Brief Template Location
File: `brief_TEMPLATE.md` — Read this FIRST before reading any project brief.

### Project Brief
File: `DP Moto Brief.txt` — Located at: `c:\Users\mikey\Claude_Playground\dp_moto\DP Moto Brief.txt`

---

## Context

### Project Overview
**DP Moto** is a Phaser 3 arcade motorcycle runner. A lone biker blasts left-to-right across a barren highway, weaving vertically to dodge obstacles while managing speed via Space tapping. Short intense runs (30-90s), instant restarts, score-chasing focused. Modern indie coin-op cabinet vibe with a CRT shader, psychedelic/rock/outlaw aesthetic.

**Tech:** Phaser 3.88, TypeScript, Vite, Supabase (leaderboard backend)
**Resolution:** 1920x1080, Scale.FIT
**Target:** 60 FPS, object pooling, no per-frame allocations

### File Map

| File | Location | Purpose |
|------|----------|---------|
| index.html | `index.html` | Entry point, BIOS boot overlay, CSS |
| main.ts | `src/main.ts` | Phaser game config and launch |
| tuning.ts | `src/config/tuning.ts` | ALL game constants centralized — single source of truth |
| crtTuning.ts | `src/config/crtTuning.ts` | CRT shader parameters |
| gameMode.ts | `src/config/gameMode.ts` | GameState enum (TITLE, STARTING, PLAYING, DEAD) |
| BootScene.ts | `src/scenes/BootScene.ts` | Asset loading, texture generation, boot sequence |
| GameScene.ts | `src/scenes/GameScene.ts` | Main game hub — wires all systems, state machine, UI |
| InputSystem.ts | `src/systems/InputSystem.ts` | Mouse Y, keyboard, touch, attack input |
| PlayerSystem.ts | `src/systems/PlayerSystem.ts` | Player movement, Y follow, X impulse/friction, lane scaling |
| RoadSystem.ts | `src/systems/RoadSystem.ts` | Scrolling road TileSprite, lane highlights |
| ObstacleSystem.ts | `src/systems/ObstacleSystem.ts` | Obstacle pool, CRASH/SLOW/CAR types, AABB collision, spawning |
| DifficultySystem.ts | `src/systems/DifficultySystem.ts` | Timer-based 0-1 difficulty ramp |
| ScoreSystem.ts | `src/systems/ScoreSystem.ts` | Distance + speed multiplier scoring |
| FXSystem.ts | `src/systems/FXSystem.ts` | Speed lines, screen flash, shake, edge warnings |
| AudioSystem.ts | `src/systems/AudioSystem.ts` | SFX playback, engine loop, impact sounds |
| MusicPlayer.ts | `src/systems/MusicPlayer.ts` | Dual YT/Spotify player, countdown audio, crossfade, UI |
| SpotifyAuthSystem.ts | `src/systems/SpotifyAuthSystem.ts` | Spotify OAuth2 PKCE flow |
| SpotifyPlayerSystem.ts | `src/systems/SpotifyPlayerSystem.ts` | Spotify Web Playback SDK wrapper |
| ParallaxSystem.ts | `src/systems/ParallaxSystem.ts` | Multi-layer scrolling background (sky, buildings, railing) |
| ReflectionSystem.ts | `src/systems/ReflectionSystem.ts` | Puddle reflections — below-road layers + road mask |
| PickupSystem.ts | `src/systems/PickupSystem.ts` | Collectible pickups (ammo, shield potions) with hover animation |
| ShieldSystem.ts | `src/systems/ShieldSystem.ts` | Shield orb visual + damage absorption |
| RocketSystem.ts | `src/systems/RocketSystem.ts` | Rocket projectile firing and flight |
| TimeDilationSystem.ts | `src/systems/TimeDilationSystem.ts` | Slow-mo effect on obstacle destruction |
| LeaderboardSystem.ts | `src/systems/LeaderboardSystem.ts` | localStorage weekly leaderboard |
| LeaderboardService.ts | `src/systems/LeaderboardService.ts` | Supabase global leaderboard API |
| ProfileSystem.ts | `src/systems/ProfileSystem.ts` | User profile (avatar, name) from Spotify/Google |
| AuthSystem.ts | `src/systems/AuthSystem.ts` | Auth state management |
| PerfSystem.ts | `src/systems/PerfSystem.ts` | FPS counter, performance monitoring |
| OrientationOverlay.ts | `src/systems/OrientationOverlay.ts` | Mobile landscape-lock overlay |
| CRTPipeline.ts | `src/fx/CRTPipeline.ts` | WebGL CRT post-processing shader |
| ProfileHud.ts | `src/ui/ProfileHud.ts` | In-game profile avatar + name display |
| ProfilePopup.ts | `src/ui/ProfilePopup.ts` | Expandable profile card with stats |
| DisconnectModal.ts | `src/ui/DisconnectModal.ts` | Spotify disconnect confirmation modal |
| rng.ts | `src/util/rng.ts` | Seeded RNG (mulberry32) |
| time.ts | `src/util/time.ts` | getCurrentWeekKey() — ISO week string |
| device.ts | `src/util/device.ts` | Device/platform detection |
| spotifyPkce.ts | `src/util/spotifyPkce.ts` | PKCE challenge generation |
| uuid5.ts | `src/util/uuid5.ts` | UUID v5 generation |
| MusicCatalogService.ts | `src/systems/MusicCatalogService.ts` | Reads synced track/artist data from Supabase |
| TrackMappingService.ts | `src/systems/TrackMappingService.ts` | Manual YT mapping, sync trigger |
| PlaybackController.ts | `src/systems/PlaybackController.ts` | Catalog-aware Spotify↔YouTube bridge |
| trackMap.ts | `src/config/trackMap.ts` | Static track mapping (legacy, replaced by catalog) |
| WMPPopup.ts | `src/ui/WMPPopup.ts` | Win95 WMP popup with Now Playing + Library tabs |
| supabaseClient.ts | `src/supabaseClient.ts` | Supabase client init |
| supabase_leaderboard.sql | `supabase_leaderboard.sql` | Database schema for global leaderboard |
| supabase_music.sql | `supabase_music.sql` | Database schema for music catalog |
| supabase_favorites.sql | `supabase_favorites.sql` | Database schema for user favorites |
| supabase_playlists.sql | `supabase_playlists.sql` | Database schema for user playlists + playlist tracks |
| supabase_popularity.sql | `supabase_popularity.sql` | ALTER TABLE: add popularity column to music_tracks |
| sync_music_catalog | `supabase/functions/sync_music_catalog/index.ts` | Edge function: Spotify catalog sync + YT auto-match + popularity |

### Feature List

#### Original Features (from Brief)
- Core movement — mouse Y control, space tapping for speed, X impulse/friction
- Road system — scrolling TileSprite road, lane highlights
- Obstacle system — CRASH (instant death), SLOW (speed penalty) types with object pooling
- Difficulty ramp — timer-based 0-1 over 120s, controls spawn rate and density
- Score system — distance + speed multiplier
- Weekly seed — seeded RNG from ISO week, deterministic obstacle patterns
- Local leaderboard — localStorage top 10 per week
- Katana slash — F key, short active window + cooldown, destroys obstacles
- Juice pass — speed lines, camera shake, screen flash, edge warnings
- Audio — engine loop, impact sounds, SFX

#### New Features (added during development)
- CRT shader pipeline — post-processing scanline/warp effect on entire game
- BIOS boot screen — retro boot sequence with loading bar, [ENTER] prompt, jitter animation
- Parallax background — 8-layer scrolling (sky, far buildings, close buildings, railing)
- Puddle reflection system — reflections below road, visible through puddle-shaped BitmapMask holes
- Object reflections — player, obstacles, cars, pickups, slash VFX reflected with proper pivots
- Dual music player — YouTube + Spotify with thumbnail, track title, shuffle, prev/next/mute
- Countdown audio system — plays countdown music before playlist starts (both sources)
- Spotify auth — OAuth2 PKCE flow for Premium playback
- Profile system — avatar + display name from Spotify/Google auth
- Profile popup — expandable card with player stats
- Supabase global leaderboard — weekly top 10, avatar support, anon + named entries
- CAR obstacle type — oncoming traffic with per-lane scaling
- Pickup system — ammo crates, shield potions with hover animation
- Rocket launcher — alt weapon with projectile system, sprite sheet animation
- Shield system — damage absorption orb with visual indicator
- Time dilation — slow-mo effect on obstacle destruction
- Tutorial overlay — multi-page how-to-play with skip button pulse animation
- Countdown skip — any input during countdown instantly starts gameplay
- Death flow — anon players only see name entry for top 10, otherwise straight to leaderboard

### Changes Log

| Date | What Changed | Why | Files Affected |
|------|-------------|-----|----------------|
| 2026-02-18 | Unified countdown audio for YT + Spotify | YouTube had no countdown music and used a delay-shuffle hack | `MusicPlayer.ts` |
| 2026-02-18 | Added YT/Spotify first-track deduplication | Same first song every session felt repetitive | `MusicPlayer.ts`, `SpotifyPlayerSystem.ts` |
| 2026-02-18 | Made countdown skippable + skip countdown audio | Player should get to gameplay ASAP on input | `GameScene.ts`, `MusicPlayer.ts` |
| 2026-02-18 | Anon death flow — top 10 only gets name entry | No point asking for name if score won't be recorded | `GameScene.ts` |
| 2026-02-18 | Slash VFX reflection with angle negation | Katana slash should appear in puddle reflections | `ReflectionSystem.ts`, `GameScene.ts`, `tuning.ts` |
| 2026-02-18 | Fixed death screen green box | nameEnterBtn had padding {x:500,y:500} covering the screen | `GameScene.ts` |
| 2026-02-18 | Fixed avatar ring gap in ProfilePopup | Phaser strokes center on edge — radius was off by half stroke width | `ProfilePopup.ts` |
| 2026-02-18 | Right-justified boot [ENTER] prompt | Alignment with loading bar right edge | `index.html` |
| 2026-02-18 | Fixed enter text scale (CSS animation override) | bios-jitter animation was replacing transform:scale | `index.html` |
| 2026-02-18 | Skip button pulse animation | Tutorial skip should pulse when not hovered | `GameScene.ts` |
| 2026-02-18 | Added ProfileHud avatar stroke tuning vars | Stroke was hardcoded — Mikey wanted to thicken it | `ProfileHud.ts` |
| 2026-02-18 | Added add-pic-icon overlay to ProfilePopup avatar | Visual indicator that avatar is clickable to upload | `ProfilePopup.ts`, `BootScene.ts` |
| 2026-02-18 | Unified BIOS [ENTER] jitter with rest of boot text | enter-jitter now uses same `--bios-jitter-amount` and `--bios-jitter-speed` vars | `index.html` |
| 2026-02-18 | Fixed ProfileHud stroke flash during transitions | AVATAR_STROKE_ALPHA was 2 — alpha > 1 causes stroke to stay visible while container fades | `ProfileHud.ts` |

| 2026-02-19 | Music catalog infrastructure (5 phases) | WMP showed black video when Spotify active — needed catalog-based Spotify↔YouTube matching | `supabase_music.sql`, `sync_music_catalog/index.ts`, `MusicCatalogService.ts`, `TrackMappingService.ts`, `PlaybackController.ts`, `WMPPopup.ts`, `MusicPlayer.ts`, `SpotifyPlayerSystem.ts` |
| 2026-02-19 | Edge function: switched from /albums to /search endpoint | Spotify dev-mode apps return 400 "Invalid limit" on /artists/{id}/albums | `sync_music_catalog/index.ts` |
| 2026-02-19 | Edge function: per-album track fetch (not batch) | /v1/albums?ids=... returns 403 in dev-mode apps | `sync_music_catalog/index.ts` |
| 2026-02-19 | Added `trackId` to SpotifyTrackInfo | PlaybackController needs Spotify track ID for catalog lookup | `SpotifyPlayerSystem.ts` |
| 2026-02-19 | WMP: catalog-aware YT companion loading | Uses catalog video ID instead of YT search when match exists | `MusicPlayer.ts` |
| 2026-02-19 | WMP: Library tab with track list + scroll | Browse synced catalog with YT match status indicators | `WMPPopup.ts` |

| 2026-02-20 | Predefined playlists (Phase 1) | Playlists tab showed empty — wired getDisplayTracks + getPlaylistTracks for Title Track, Ride or Die, this is hume | `WMPPopup.ts`, `MusicCatalogService.ts` |
| 2026-02-20 | Win95 context menu (Phase 2) | Right-click on Library/Artists rows for Copy, Favorite, Play in Spotify, Get info, Add to playlist | `WMPPopup.ts` |
| 2026-02-20 | Favorites system (Phase 3) | Supabase-backed per-user favorites with optimistic UI + rollback | `WMPPopup.ts`, `supabase_favorites.sql` |
| 2026-02-20 | Custom playlists (Phase 4) | Supabase-backed user playlists — create via "+", inline rename, add/remove/paste tracks, delete | `WMPPopup.ts`, `supabase_playlists.sql` |
| 2026-02-20 | Context menu submenu (Phase 4) | "Add to playlist ▸" shows submenu of custom playlists, sidebar right-click for rename/delete | `WMPPopup.ts` |
| 2026-02-20 | Popularity column + edge function (Phase 5) | Added popularity column to music_tracks, edge function fetches Spotify popularity scores during sync | `supabase_popularity.sql`, `sync_music_catalog/index.ts` |
| 2026-02-20 | Fixed broken comment block in WMPPopup | Lines 387-389 had uncommented object literals from a partial comment-out, breaking class parsing | `WMPPopup.ts` |
| 2026-02-20 | WMP context menu Phaser rendering | Context menu HTML was invisible (makeHTMLInvisible strips styling) — added ctxTextsP/ctxSubTextsP pools + syncPhaser rendering at depth d+4 | `WMPPopup.ts` |
| 2026-02-20 | Right-click handler moved to libraryList | Per-row contextmenu handlers didn't work with scroll — moved to libraryList using hoverTrackIdx like left-click | `WMPPopup.ts` |
| 2026-02-20 | Column resize/reorder width fix | handleColResize and reorder target detection used wrong width — switched to libHeaderRow rect | `WMPPopup.ts` |
| 2026-02-20 | Synced new artist 4LgILYbU9dlASWbKjk4JE3 | Added second artist to catalog — 11 tracks, 11 YT matches, 11 popularity scores | edge function invocation |

### Major Bugs

| Bug | Root Cause | Lesson Learned |
|-----|-----------|----------------|
| Green box covering death screen | `nameEnterBtn` Phaser Text had `padding: {x:500, y:500}` with `backgroundColor: '#003300'` at depth 211, covering everything below | Phaser Text padding + backgroundColor creates a visible filled rectangle — keep padding small or don't use backgroundColor |
| CSS animation overriding scale | `bios-jitter` keyframes had `transform: translateY(...)` which completely replaces the element's own `transform: scale(...)` every frame | CSS animations replace the entire transform property — combine all transforms in the keyframe if you need both |
| Avatar ring gap | Phaser draws strokes centered on the shape edge (half inside, half outside). Ring radius was `AVATAR_RADIUS + AVATAR_RING_WIDTH` instead of `+ AVATAR_RING_WIDTH / 2` | Always account for Phaser stroke centering: offset by half the stroke width |
| ProfileHud stroke flash on transitions | `AVATAR_STROKE_ALPHA = 2` — Phaser multiplies child alpha by container alpha during tweens. Alpha > 1 means stroke stays fully visible while rest fades | Never set Phaser alpha > 1 on objects inside containers that get alpha-tweened |

### Problem Tracker

| Problem | Status | Action Log |
|---------|--------|-----------|
| Reflections above road interfered with PostFX displacement | <span class="status-solved">solved</span> | Moved reflections BELOW road, cut puddle holes via inverted BitmapMask on road tile. Displacement PostFX is now independent of masking. |
| YouTube always started with same song | <span class="status-solved">solved</span> | Removed 5.5s delay hack, added shuffle + avoid list + localStorage dedup |
| Death screen avatars appeared large after ProfilePopup fix | <span class="status-solved">solved</span> | Investigation showed death screen uses separate constants (`DLB_T3_AVATAR_R=30`) — they were always that size, just hidden by the green box bug |

### General Notes
- `tuning.ts` is the single source of truth for ALL game constants — never hardcode values elsewhere
- The countdown audio file (`hell_girl_countdown.mp3`) is the same song as YouTube tracks `GZwNZU7AviA` and `EkPDn519DFs` — never play them back to back
- Death screen leaderboard uses its own avatar constants (`DLB_T3_AVATAR_R`, `DLB_T3_AVATAR_STROKE`) separate from `ProfilePopup.ts` constants
- `GameScene.ts` is very large (~158KB) — it's the main integration hub for all systems
- `ObstacleSystem.ts` handles CRASH, SLOW, and CAR types with different collision behaviors
- The reflection system uses a stamp pattern: set texture/flip/position on a reusable sprite, alpha=1, RT.draw(), alpha=0
- Phaser BitmapMask with `invertAlpha = true` on the road tile creates puddle holes showing reflections underneath
- `countdownMusic` field in MusicPlayer is shared between Spotify and YouTube paths — only one source is active at a time
- ProfileHud has local tuning constants at top of file (not in `tuning.ts`) — `AVATAR_STROKE_WIDTH`, `AVATAR_STROKE_COLOR`, `AVATAR_STROKE_ALPHA`
- ProfilePopup has `avatarOverlay` (black circle, 20% opacity) + `avatarAddIcon` (add_pic_icon.png) layered on avatar — only visible when Spotify connected
- ProfilePopup avatar upload: click avatar → `openFilePicker()` → `onFileSelected()` → `uploadAvatarAndSave()` to Supabase Storage. Also applies locally via canvas circle crop
- BIOS boot [ENTER] prompt: `enter-jitter` keyframe must include `scale(var(--bios-enter-scale))` alongside `translateY` to avoid CSS animation overriding the scale
- Never set Phaser object alpha > 1 inside containers that get alpha-tweened — it causes the object to stay visible during fade transitions
- ALWAYS update `claude.md` with session changes before compaction (manual or auto) so context is preserved
- Spotify dev-mode apps cap `limit` param well below documented max — `limit=10` is safe, `limit=20+` returns 400
- `/v1/artists/{id}/albums` is broken for dev-mode Spotify apps — use `/v1/search?q=artist:{name}&type=album` instead
- `/v1/albums?ids=...` batch endpoint returns 403 in dev-mode — fetch individually via `/v1/albums/{id}/tracks`
- Edge function env vars need `.trim()` to guard against invisible whitespace from dashboard paste
- Supabase project ref: `wdaljqcoyhselitaxaeu` — link before deploy: `npx supabase link --project-ref wdaljqcoyhselitaxaeu`
- `MusicCatalogService.ts` has 5-minute cache; call `clearCatalogCache()` after sync
- `PlaybackController` does async catalog lookup — falls back to YT search if no match
- WMP Library tab uses pool of `WMP_LIB_ROWS` (10) Phaser text objects, scrolled via mousewheel
- `SpotifyTrackInfo` now includes `trackId` field for catalog lookups
- WMP Playlists tab: 4 predefined (Title Track, Ride or Die, this is hume, Favorites) + user-created custom playlists
- "this is hume" playlist: groups by artist, takes top 5 per artist sorted by `popularity` field from Supabase
- Favorites + custom playlists use `auth.uid()` UUID via `ensureAnonUser()` — same pattern as leaderboard
- Custom playlists stored in `user_playlists` + `user_playlist_tracks` with CASCADE delete
- Context menu submenu uses pool of `WMP_CTX_SUBMENU_MAX` (10) items with 150ms hide timeout to prevent flicker
- Sidebar rows support right-click (rename/delete) and double-click (inline rename) for custom playlists
- Edge function `sync_music_catalog` Step 3: fetches Spotify popularity in batches of 10, falls back to individual on 403
- `/v1/tracks?ids=...` batch endpoint works in dev-mode (unlike `/v1/albums?ids=...` which returns 403)

### <span class="status-perfect">Perfect Items</span>

| Item | What's Perfect | Related Files | Date |
|------|---------------|---------------|------|
| Spotify Login & Profile | Login flow, profile pic + name loading, account association with high scores | `SpotifyAuthSystem.ts`, `ProfileSystem.ts`, `ProfileHud.ts`, `LeaderboardService.ts` | 2026-02-18 |
| BIOS Boot Screen | Full boot sequence with loading bar, jitter [ENTER] prompt | `index.html`, `BootScene.ts` | 2026-02-18 |
| Full Game Flow | BIOS → Title → Tutorial → Countdown → Gameplay Loop → High Score → Replay | `BootScene.ts`, `GameScene.ts` | 2026-02-18 |
| Profile Popup | Expandable profile card with stats and avatar ring | `ProfilePopup.ts`, `ProfileHud.ts` | 2026-02-18 |
| High Score Screen | Leaderboard display and name entry logic (anon top-10 only) | `GameScene.ts`, `LeaderboardService.ts`, `LeaderboardSystem.ts` | 2026-02-18 |
| Countdown + Skip | Countdown sequence and ability to skip it instantly | `GameScene.ts`, `MusicPlayer.ts` | 2026-02-18 |
| Music Player | Dual-source player UI, source switching, thumbnail, track title | `MusicPlayer.ts` | 2026-02-18 |
| Spotify Playback | Everything related to Spotify integration and playback | `SpotifyPlayerSystem.ts`, `SpotifyAuthSystem.ts`, `MusicPlayer.ts`, `spotifyPkce.ts` | 2026-02-18 |
| Reflections | Puddle reflections below road with BitmapMask holes | `ReflectionSystem.ts`, `RoadSystem.ts` | 2026-02-18 |
| Parallax Background | Multi-layer scrolling background with depth sorting | `ParallaxSystem.ts` | 2026-02-18 |
| CRT Filter | Post-processing CRT scanline/warp shader | `CRTPipeline.ts`, `crtTuning.ts` | 2026-02-18 |
| Transition Animations | All screen transition animations throughout the game flow | `GameScene.ts` | 2026-02-18 |
| CRT Hover Proxy System | Proxy objects outside Phaser pass hover state through CRT filter to in-game objects | `GameScene.ts`, `MusicPlayer.ts`, `ProfileHud.ts` | 2026-02-18 |
| Swipe-to-Fullscreen | 3-phase mobile flow: BIOS auto-dismiss → solid black "SWIPE UP" overlay (blocks all input except vertical swipe) → Safari chrome hides → page locks position:static + overflow:hidden → controls unlock. Body stays position:static (NOT fixed) so Safari doesn't re-show chrome. Game canvas gets pointer-events:none during swipe. 300ms unlock delay drains queued taps. | `index.html` (CSS #swipe-overlay, showSwipeOverlay/hideSwipeOverlay/onSwipeScroll, dismissOverlay trigger), `GameScene.ts` (__swipeLock checks at keyboard handler, updateTitle, handleScreenTap) | 2026-02-24 |
| liteMode (All Phones) | ALL phone tiers skip heavy animation spritesheets (~88MB VRAM savings). Prevents OOM crash on 4GB devices (iPhone 12 Mini, Xs). BootScene generates procedural textures for skipped assets. | `src/main.ts` (GAME_MODE.liteMode), `src/scenes/BootScene.ts` (lite gates), `src/util/device.ts` (isPhoneTier) | 2026-02-24 |
