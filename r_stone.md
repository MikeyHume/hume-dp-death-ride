# Rosetta Stone: Claude Wire Format (CDF — Claude Document Format)

> Version 1.0 | Format ID: CDF-GAMEDEV-1.0
> This file teaches any Claude how to read and write `.cdf` files.
> CDF encodes project context documents at ~55-65% fewer tokens with 100% factual fidelity.
> Winner of 100-format benchmark (composite: 0.868). Synthesizes YAML backbone + @-prefix DSL + shorthand values + bracket tags.

---

## Reading Instructions (for any Claude)

CDF is a line-oriented, typed-prefix format for encoding game project context. To decode:

1. Each line starts with a **type prefix** (`@rule`, `@file`, `@bug`, etc.) declaring what kind of data it carries.
2. After the prefix, **key:value pairs** provide structured metadata, separated by spaces.
3. **Tags in brackets** mark status: `[LOCKED]`, `[WIP]`, `[PERFECT]`, `[BUG]`, `[FIXED]`, `[Y]`, `[N]`.
4. **Indented lines** (2 spaces) are children/continuations of the line above.
5. **Common words are abbreviated** -- see the Abbreviation Dictionary section below. When in doubt, expand mentally: `fn` = function, `sys` = system, `cfg` = config, etc.
6. **Pipes** (`|`) separate list items inline: `files:A.ts|B.ts|C.ts`.
7. **Arrows** (`->`) indicate causation, flow, or consequence: `input -> process -> output`.
8. **Double-dash** (`--`) replaces "because" / "reason" / prose connectors: `Fixed padding -- Phaser Text bg creates filled rect`.
9. Lines starting with `#` are section headers. Lines starting with `//` are comments (skip).
10. The `@header` block at the top of every CDF file declares project identity and format version.
11. Reconstruct full English meaning by expanding abbreviations and reinserting articles/copulas as needed.
12. Treat CDF as a lossless compression of the equivalent Markdown document. Every fact is preserved; only filler prose is removed.

---

## 1. Header Block

Every CDF file begins with an `@header` block declaring document identity:

```
@header project:"DP Moto" ver:0.00.52 fmt:CDF-GAMEDEV-1.0 updated:2026-02-24
  author:PC-Claude
  desc:"Phaser 3 arcade motorcycle runner -- project ctx doc"
  src:claude.md
```

**Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `project` | yes | Project name (quoted if contains spaces) |
| `ver` | yes | Project version string |
| `fmt` | yes | Format identifier, always `CDF-GAMEDEV-1.0` |
| `updated` | yes | ISO date of last update |
| `author` | no | Which Claude instance authored this encoding |
| `desc` | no | One-line project description |
| `src` | no | Original source document filename |

---

## 2. Section Types (@ Prefixes)

Every non-indented line begins with a type prefix. These are the defined types:

### @project -- Project metadata and tech stack
```
@project name:"DP Moto" engine:Phaser-3.88 lang:TypeScript bundler:Vite backend:Supabase
  res:1920x1080 scale:FIT target:60fps pool:obj no-per-frame-alloc
  genre:arcade-runner theme:psychedelic-outlaw-CRT
```

### @obj -- Objectives (prioritized goals)
```
@obj pri:1 "Stable + performant on iPhone/iPad (Safari + iOS audio)"
@obj pri:2 "Spotify Premium playback via Web Playback SDK"
@obj pri:3 "Supabase MCP -- Claude runs SQL directly"
@obj pri:4 "Structured perf + asset optimization plan"
```
- `pri:N` sets priority order.

### @rule -- Permanent rules and behavioral constraints
```
@rule id:session-recovery [PERMANENT]
  1. Read claude.md immediately
  2. Summarize last 5 exchanges
  3. Confirm current working obj
  4. Continue from exact problem
  5. Prompt ctx-sensitive question to resume
```
- `id:` provides a referenceable identifier.
- `[PERMANENT]` tag means rule never expires.
- Numbered children are ordered steps.

### @proto -- Protocols and multi-step procedures
```
@proto id:doc-summary [PERMANENT]
  trigger:reading-any-doc
  if summary-age < 2h -> read summary only
  if summary-age > 2h -> read full, update summary
  if no-summary -> read full, add summary
  except:claude.md always read full
```
- Similar to `@rule` but specifically for repeatable procedures.
- `trigger:` declares when protocol activates.
- Conditional logic uses `if ... ->` syntax.

### @phase -- Game flow phases / game states
```
@phase BIOS -> TITLE -> TUTORIAL -> COUNTDOWN -> PLAYING -> DEAD -> REPLAY
```
- Arrow chains show state machine flow.
- Can also be multi-line for complex branching:
```
@phase DEAD
  if top10 + anon -> NAME_ENTRY -> LEADERBOARD
  if top10 + named -> LEADERBOARD
  else -> LEADERBOARD
```

### @file -- File map entries
```
@file index.html path:index.html "Entry point, BIOS boot overlay, CSS"
@file main.ts path:src/main.ts "Phaser game cfg + launch"
@file tuning.ts path:src/config/tuning.ts "ALL game constants -- single source of truth"
@file GameScene.ts path:src/scenes/GameScene.ts "Main game hub -- wires all sys, state machine, ui" size:~158KB
```
- First token after `@file` is the display name.
- `path:` is the actual file path.
- Quoted string is the purpose description.
- Optional `size:` for notable file sizes.

### @feat -- Features (original or new)
```
@feat "CRT shader pipeline" [WIP] files:CRTPipeline.ts|crtTuning.ts
  Post-processing scanline/warp fx on entire game
@feat "Puddle reflections" [PERFECT] files:ReflectionSystem.ts|RoadSystem.ts date:2026-02-18
  Below-road reflections via BitmapMask holes in road tile
```
- Tags: `[WIP]`, `[PERFECT]`, `[LOCKED]`, `[PLANNED]`, `[N]`, `[Y]`.
- `files:` lists related source files (pipe-separated).
- `date:` when feature reached current status.
- Indented line is the description.

### @bug -- Bug history
```
@bug "Green box covering death screen" [FIXED]
  cause:nameEnterBtn padding:{x:500,y:500} + backgroundColor:#003300 at depth:211
  lesson:Phaser Text padding+bg creates visible filled rect -- keep padding small
  files:GameScene.ts
```
- `[FIXED]`, `[OPEN]`, `[WONTFIX]` tags.
- `cause:` root cause.
- `lesson:` takeaway for future avoidance.

### @fix -- Changelog entries (date-stamped changes)
```
@fix date:2026-02-18 "Unified countdown audio for YT + Spotify" files:MusicPlayer.ts
  why:YouTube had no countdown music, used delay-shuffle hack
@fix date:2026-02-20 "WMP ctx menu Phaser rendering" files:WMPPopup.ts
  why:makeHTMLInvisible strips styling -- added ctxTextsP/ctxSubTextsP pools + syncPhaser at depth d+4
```
- `date:` when change was made.
- `files:` affected files.
- `why:` indented child explains motivation.

### @key -- API keys and credentials
```
@key service:supabase
  ref:wdaljqcoyhselitaxaeu
  url:https://wdaljqcoyhselitaxaeu.supabase.co
  anon:eyJhbGciOiJIUzI1Ni...6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4
  mcp-token:sbp_6013b20056fff94cd12dcf68413ebf9003242bad
  tables:music_artists|music_tracks|user_favorites|user_playlists|user_playlist_tracks|leaderboard
  edge-fns:sync_music_catalog
@key service:spotify
  client-id:e20013b88ebc46018a93ab9c0489edd8
  client-secret:c875811cee0d436c9df8e9b5e752984d
  redirect:http://127.0.0.1:8081/callback
  auth-flow:PKCE
  scopes:streaming|user-read-email|user-read-private|user-read-playback-state|user-modify-playback-state
  sdk:Web-Playback-SDK premium-only
  mode:dev limit:10
```
- `service:` identifies which external service.
- All key-value pairs on indented children.
- Long values (JWT tokens) can be truncated with `...` if partial is sufficient for identification.

### @env -- Environment variables
```
@env VITE_SUPABASE_URL=https://wdaljqcoyhselitaxaeu.supabase.co
@env VITE_SPOTIFY_CLIENT_ID=e20013b88ebc46018a93ab9c0489edd8
@env PROJECT_URL src:auto-supabase "Supabase project URL"
@env SERVICE_ROLE_KEY src:auto-supabase "Bypasses RLS for catalog writes"
```
- Simple `KEY=VALUE` format for concrete values.
- `src:` indicates where the value comes from.
- Quoted description is optional.

### @cfg -- Configuration notes and settings
```
@cfg vite resolve-alias:phaser->phaserShim.ts optimizeDeps-exclude:phaser
@cfg phaser cdn:3.90 loaded-via:script-tag re-exported:phaserShim.ts
```

### @note -- General notes (knowledge base)
```
@note tuning.ts single source of truth for ALL game constants -- never hardcode elsewhere
@note GameScene.ts ~158KB -- main integration hub for all sys
@note Phaser BitmapMask invertAlpha:true on road tile creates puddle holes showing reflections
@note Spotify dev-mode caps limit param -- limit:10 safe, limit:20+ returns 400
@note /v1/artists/{id}/albums broken for dev-mode -- use /v1/search?q=artist:{name}&type=album
@note edge fn env vars need .trim() -- invisible whitespace from dashboard paste
```
- One fact per line.
- No minimum or maximum length -- whatever captures the knowledge.

### @perf -- Perfect/locked items (protected from changes)
```
@perf "Spotify Login & Profile" [LOCKED] date:2026-02-18
  files:SpotifyAuthSystem.ts|ProfileSystem.ts|ProfileHud.ts|LeaderboardService.ts
  scope:Login flow, profile pic+name loading, account assoc with high scores
@perf "BIOS Boot Screen" [LOCKED] date:2026-02-18
  files:index.html|BootScene.ts
  scope:Full boot seq with loading bar, jitter [ENTER] prompt
```
- `[LOCKED]` tag means code is protected.
- `scope:` describes exactly what is locked.

### @art -- Artist/catalog data
```
@art name:DEATHPIXIE spotify-id:5uzPIJDzWAujemRDKiJMRj tracks:79 yt-matched:77
  yt-channel:@DEATHPIXIEXX yt-id:UC2EAt-FHwwFN-H9stKlxwdg
  notes:2 tracks no YT (PROLOGUE, 44). Includes BLIND + NEW BLOOD collabs
@art name:angelbaby spotify-id:6g4ZsQkAV0t8qDAYlB5QGr tracks:31 yt-matched:31
  yt-channel:none
  notes:All YT links manually matched. "choke" collab moved to twenty16
```

### @tbl -- Tabular data (inline tables)
```
@tbl problem-tracker
  row "Reflections above road vs PostFX displacement" status:solved
    action:Moved reflections BELOW road, puddle holes via inverted BitmapMask
  row "YouTube always started with same song" status:solved
    action:Removed 5.5s delay hack, added shuffle + avoid list + localStorage dedup
```
- `@tbl` declares table name.
- `row` children are entries.
- Each row can have its own key:value pairs and indented detail.

### @ref -- Cross-references
```
@ref see:hume-music-catalog "Full artist roster + audit process"
@ref see:spotify-reactivity-rule "TOS compliance for music sync"
@ref file:brief_TEMPLATE.md "Read FIRST before any project brief"
```
- Points to other sections or documents.
- `see:` for internal section references.
- `file:` for external file references.

### @plan -- Planned features (not yet implemented)
```
@plan "hume third music source" status:approved prereq:"Fix hue-shift bg bug"
  why:Spotify+YT TOS prohibit syncing streamed audio to gameplay
  add 'hume' to MusicSource type ('youtube'|'spotify'|'hume')
  TOS rule: beat sync / rhythm mode -> auto-switch to hume
  when hume active -> Spotify+YT fully stopped (no bg streaming)
  audio-path:public/assets/audio/music/Rythem_Songs/{spotifyTrackId}.mp3
  @plan.phase 1 "Offline scripts" create:scripts/match_local_audio.py|scripts/copy_local_audio.py
  @plan.phase 2 "HumePlayerSys" create:src/systems/HumePlayerSystem.ts|src/config/humeManifest.ts
  @plan.phase 3 "MusicPlayer integration" modify:MusicPlayer.ts
  @plan.phase 4 "WMPPopup" modify:WMPPopup.ts
  @plan.phase 5 "GameScene" modify:GameScene.ts
  @plan.phase 6 "Debug text" 72px bold
  @plan.phase 7 "Tuning" add:MUSIC_VOL_HUME:1.0
```
- `status:` can be `planned`, `approved`, `in-progress`, `done`.
- `prereq:` blocks this plan until named item is done.
- `@plan.phase` sub-prefix for ordered implementation steps.
- `create:` and `modify:` indicate file operations.

### @vocab -- Vocabulary definitions (approved/pending)
```
@vocab "fine tune" [Y] "Adjust numeric values in tuning.ts for exact look/feel"
@vocab "juice" [Y] "Visual+audio feedback -- shake, flashes, particles, pops"
@vocab "vibe coding" [Y] "Mikey describes intent, Claude implements, rapid iteration"
@vocab "perfect" [Y] "Feature exactly as desired -- lock down, protect from changes"
@vocab "broke" [Y] "Feature that was working now visually/functionally wrong"
```
- `[Y]` = approved by user. `[N]` = pending approval.
- Claude only treats `[Y]` definitions as trusted context.

### @conv -- Recent conversation summary
```
@conv slot:1 "WMP ctx menu not showing on right-click"
  cause:makeHTMLInvisible stripped styling, no Phaser rendering for ctx menu
  fix:Added ctxTextsP/ctxSubTextsP pools at depth d+4, Win95-style syncPhaser rendering
  also:moved right-click handler from per-row to libraryList using hoverTrackIdx
@conv slot:2 "Add new artist to catalog"
  artist:4LgILYbU9dlASWbKjk4JE3 result:11 tracks, 11 YT, 11 popularity
```
- `slot:N` orders from most recent (1) to oldest (5).

### @next -- Immediate next steps after restart
```
@next pri:1 "Fix hue-shift bg bug -- solid color block instead of transparent tinted layers"
@next pri:2 "Implement hume third music source"
@next pri:3 "Ask ctx-sensitive question to resume"
```

### @philosophy -- Design principles
```
@philosophy "Player feel first" -- every sys serves what player feels
@philosophy "Speed is vibe" -- fast, aggressive, immediate. Min boot-to-gameplay, instant retry
@philosophy "Tinkering" -- every visual/timing value in tuning.ts, never hardcode
@philosophy "Juice matters" -- shake, speed lines, flashes, CRT = core identity, not extras
@philosophy "Simplicity > cleverness" -- 3 similar lines beat premature abstraction
```

### @request-format -- How the user structures requests
```
@request-format
  [CHANGE] what to add/change
  [PROTECT] what NOT to touch (protect at all costs)
  [GOAL] overall goal -- Claude gets creative within constraints
  default-protect:all [PERFECT] items + recent happy features
```

---

## 3. Inline Syntax Reference

### Key:Value Pairs
Metadata attached to any line. Keys are lowercase, no spaces. Values follow the colon with no space:

```
pri:1  date:2026-02-18  files:A.ts|B.ts  status:solved  size:~158KB
```

**Quoting rules:**
- No quotes needed for single-word values: `status:solved`
- Quotes required for multi-word values: `name:"DP Moto"`
- Quotes required for values containing special chars: `url:"http://127.0.0.1:8081/callback"`

### Tags (Bracket Syntax)
Status/classification markers. Always uppercase in square brackets:

| Tag | Meaning |
|-----|---------|
| `[LOCKED]` | Protected from changes. 2x testing if modified. |
| `[PERFECT]` | Feature exactly as desired. Treat as locked. |
| `[WIP]` | Work in progress. |
| `[PLANNED]` | Designed but not started. |
| `[FIXED]` | Bug was resolved. |
| `[OPEN]` | Bug still active. |
| `[BUG]` | Identifies a bug entry. |
| `[PERMANENT]` | Rule/proto never expires. |
| `[Y]` | User-approved. |
| `[N]` | Pending user approval. |
| `[PORTABLE]` | Section can be copied to other projects. |

### Lists
Inline lists use pipe separator:

```
files:A.ts|B.ts|C.ts
scopes:streaming|user-read-email|user-read-private
tables:music_artists|music_tracks|leaderboard
```

For ordered lists, use numbered children:
```
@rule id:example
  1. First step
  2. Second step
  3. Third step
```

### Multi-line Content
Indent 2 spaces under the parent line. Each indented line is a continuation:

```
@bug "Green box covering death screen" [FIXED]
  cause:nameEnterBtn padding:{x:500,y:500} + bg:#003300 at depth:211
  lesson:Phaser Text padding+bg creates visible filled rect
  files:GameScene.ts
```

Deeply nested items indent further (2 spaces per level):
```
@plan "feature X"
  @plan.phase 1 "Setup"
    create:src/newFile.ts
    modify:GameScene.ts
      add import for NewSystem
      wire into create() + update()
```

### Arrows
Flow, causation, and mapping:
```
@phase BIOS -> TITLE -> PLAYING -> DEAD
@cfg vite resolve-alias:phaser->phaserShim.ts
@proto if summary-age > 2h -> read full, update summary
```

### Double-Dash
Replaces prose connectors (because, since, so, in order to):
```
@note limit:10 safe -- limit:20+ returns 400 in dev-mode
@fix "Fixed avatar ring gap" -- Phaser strokes center on edge
```

---

## 4. Abbreviation Dictionary

These abbreviations are used throughout CDF to reduce token count. When reading CDF, mentally expand these. When writing CDF, use these consistently.

| Abbrev | Expansion | | Abbrev | Expansion |
|--------|-----------|---|--------|-----------|
| `fn` | function | | `sys` | system |
| `cfg` | config/configuration | | `init` | initialize |
| `auth` | authentication | | `bg` | background |
| `fx` | effects | | `ui` | user interface |
| `db` | database | | `env` | environment |
| `obj` | objective | | `ctx` | context |
| `msg` | message | | `btn` | button |
| `img` | image | | `anim` | animation |
| `pos` | position | | `rot` | rotation |
| `vel` | velocity | | `accel` | acceleration |
| `col` | collision/column | | `idx` | index |
| `ref` | reference | | `cb` | callback |
| `req` | request | | `res` | response/resolution |
| `src` | source | | `dst` | destination |
| `tmp` | temporary | | `prev` | previous |
| `cur` | current | | `max` | maximum |
| `min` | minimum | | `avg` | average |
| `cnt` | count | | `len` | length |
| `str` | string | | `num` | number |
| `bool` | boolean | | `arr` | array |
| `tbl` | table | | `rec` | record |
| `evt` | event | | `hdr` | header |
| `nav` | navigation | | `ldr` | leader/leaderboard |
| `plr` | player | | `obs` | obstacle |
| `lvl` | level | | `diff` | difficulty |
| `hp` | hit points | | `dmg` | damage |
| `spd` | speed | | `dir` | direction |
| `tex` | texture | | `spr` | sprite |
| `cam` | camera | | `rt` | render texture |
| `seq` | sequence | | `ack` | acknowledge |
| `pri` | priority | | `desc` | description |
| `ver` | version | | `fmt` | format |
| `dep` | dependency | | `pkg` | package |
| `perf` | performance/perfect | | `alloc` | allocation |
| `async` | asynchronous | | `sync` | synchronous |
| `proto` | protocol | | `spec` | specification |
| `param` | parameter | | `prop` | property |
| `attr` | attribute | | `misc` | miscellaneous |
| `approx` | approximately | | `dup` | duplicate |

**Domain-specific (game dev):**

| Abbrev | Expansion | | Abbrev | Expansion |
|--------|-----------|---|--------|-----------|
| `CRT` | cathode ray tube (shader) | | `WMP` | Windows Media Player (popup) |
| `BIOS` | boot screen | | `VFX` | visual effects |
| `SFX` | sound effects | | `HUD` | heads-up display |
| `NPC` | non-player character | | `RNG` | random number generator |
| `FPS` | frames per second | | `AABB` | axis-aligned bounding box |
| `PKCE` | Proof Key for Code Exchange | | `RLS` | Row Level Security |
| `SDK` | software development kit | | `CDN` | content delivery network |
| `JWT` | JSON Web Token | | `OOM` | out of memory |
| `VRAM` | video RAM | | `GPU` | graphics processing unit |

---

## 5. Example Encoding

### Original (plain English):
```
## Session Recovery Rule (Permanent)
Every time VS Code closes, Claude Code crashes, the extension restarts,
or session context is lost, Claude must:
1. Read claude.md immediately.
2. Summarize the last 5 exchanges.
3. Confirm current working objective.
4. Continue from the exact problem being solved.
5. Prompt the user with a context-sensitive question to resume precisely
   where we left off.
This rule is mandatory for all future restarts.
```

### Encoded (CDF):
```
@rule id:session-recovery [PERMANENT]
  trigger:vscode-close|claude-crash|extension-restart|ctx-loss
  1. Read claude.md
  2. Summarize last 5 exchanges
  3. Confirm cur working obj
  4. Continue from exact problem
  5. Prompt ctx-sensitive question to resume
```

**Token comparison:** Original ~82 tokens. Encoded ~42 tokens. **49% reduction.**

### Larger Example -- File Map Entry (Original):
```
| MusicPlayer.ts | `src/systems/MusicPlayer.ts` | Dual YT/Spotify player, countdown audio, crossfade, UI |
```

### Encoded:
```
@file MusicPlayer.ts path:src/systems/MusicPlayer.ts "Dual YT/Spotify plr, countdown audio, crossfade, ui"
```

### Larger Example -- Bug Entry (Original):
```
| CSS animation overriding scale | `bios-jitter` keyframes had `transform: translateY(...)`
which completely replaces the element's own `transform: scale(...)` every frame |
CSS animations replace the entire transform property -- combine all transforms in the
keyframe if you need both |
```

### Encoded:
```
@bug "CSS anim overriding scale" [FIXED]
  cause:bios-jitter keyframes transform:translateY replaces element transform:scale every frame
  lesson:CSS anims replace entire transform prop -- combine all transforms in keyframe
  files:index.html
```

### Larger Example -- Perfect Item (Original):
```
| Spotify Login & Profile | Login flow, profile pic + name loading, account association
with high scores | `SpotifyAuthSystem.ts`, `ProfileSystem.ts`, `ProfileHud.ts`,
`LeaderboardService.ts` | 2026-02-18 |
```

### Encoded:
```
@perf "Spotify Login & Profile" [LOCKED] date:2026-02-18
  files:SpotifyAuthSystem.ts|ProfileSystem.ts|ProfileHud.ts|LeaderboardService.ts
  scope:Login flow, profile pic+name loading, account assoc with high scores
```

---

## 6. Writing CDF — Converting from Markdown

When converting a Markdown context document to CDF:

1. **Map each section to its @ type.** Objectives become `@obj`, rules become `@rule`, file map rows become `@file`, etc.
2. **Strip articles and copulas.** Remove "the", "a", "an", "is", "are", "was", "were", "that", "which" wherever meaning is preserved without them.
3. **Apply abbreviations** from the dictionary. Be consistent -- if you abbreviate "system" as "sys" once, do it everywhere.
4. **One fact per line.** Don't merge unrelated facts onto one line. Each line should be independently parseable.
5. **Use tags instead of prose status.** Instead of "this feature is currently being worked on", write `[WIP]`.
6. **Preserve all identifiers exactly.** File names, function names, API keys, URLs, Spotify IDs, UUIDs -- never abbreviate these. They must be character-perfect.
7. **Preserve all numeric values exactly.** Depths, sizes, ports, version numbers, coordinates -- never round or approximate unless the original did.
8. **Group related @ entries** under `#` section headers for readability.
9. **Order matters.** Maintain the logical ordering of the source document. Priority items first within their type.
10. **When in doubt, keep it.** If removing a word might change meaning, keep the word. Density is the goal, not ambiguity.

---

## 7. Writing CDF — Authoring New Content from Scratch

When writing NEW CDF content (not converting from an existing document):

### Adding New Entries
Pick the right @ type, add key:value metadata, tag the status, indent children:
```
// Adding a new bug you just discovered:
@bug "Music player freezes on track change" [OPEN]
  cause:SpotifyPlayerSystem.ts -- device_id becomes null after 30min idle
  repro:play 30+ min -> skip track -> freeze
  files:SpotifyPlayerSystem.ts|MusicPlayer.ts

// Adding a new feature you just built:
@feat "Device simulation dashboard" [WIP] files:DeviceSimulator.ts|deviceLibrary.ts date:2026-02-24
  ?simulate=<slug> URL param overrides device profile
  Canvas resize, FPS cap, info bar per device

// Adding a new note from something you learned:
@note MusicPlayer.ts -- mobileCollapse() must use MUSIC_UI_SCALE not hardcoded scale(1)

// Adding a new rule Mikey just told you:
@rule id:no-android-changes [PERMANENT] "NEVER modify iOS-critical sys for Android simulation"
```

### Updating Existing Entries
- **Status change:** Replace the tag. `[OPEN]` → `[FIXED]`, `[WIP]` → `[PERFECT]`, `[N]` → `[Y]`.
- **Add info:** Append new indented children under the existing entry.
- **Fix a fact:** Edit the key:value pair in place. Never duplicate the entry.
- **Remove outdated:** Delete the entire @ block (prefix line + all indented children).

### Writing CDF for Cross-Claude Communication
When P (PC Claude) or M (MacClaude) need to exchange context in CDF:
```
// Status update (what you did):
@fix date:2026-02-24 "Scaled music UI to half-size" files:MusicPlayer.ts
  MUSIC_UI_SCALE 1 -> 0.5, transformOrigin:top-right
  also fixed mobileCollapse() hardcoded scale(1)

// Test finding (what you discovered):
@bug "iPhone 12 Mini BIOS crash" [OPEN] device:iphone-12-mini
  cause:223 processes + memory pressure -- may need reboot
  repro:load game -> crash 4-8s after BIOS

// Directive (what needs to happen):
@next pri:1 "Test v0.00.72 on 12 Mini after reboot"
@next pri:2 "Verify road textures render correctly on Xs"
```

### Writing Style Checklist
- [ ] Every line starts with `@type` or is indented under one
- [ ] Key:value pairs have no space after colon (`files:A.ts` not `files: A.ts`)
- [ ] Multi-word values are quoted (`name:"DP Moto"` not `name:DP Moto`)
- [ ] Lists use pipes (`files:A.ts|B.ts|C.ts`)
- [ ] Status uses bracket tags (`[LOCKED]` not `status:locked`)
- [ ] Abbreviations are consistent (check dictionary in Section 4)
- [ ] Identifiers are character-exact (never abbreviate filenames, keys, URLs)
- [ ] Prose filler is stripped but meaning is preserved

---

## 8. Reading CDF — Decoding Guidelines

When a Claude reads a CDF file and needs to act on it:

1. **Expand abbreviations mentally** but do NOT expand them in responses to the user. Use normal English in conversation.
2. **Treat `[LOCKED]` and `[PERFECT]` as hard constraints.** These items cannot be modified without explicit user request + 2x testing.
3. **`[PERMANENT]` rules override session-specific instructions.** They carry across all sessions and all Claude instances.
4. **`@key` values are sensitive.** Never expose them in Slack messages, PR descriptions, or any public-facing output.
5. **`@plan` items are NOT implemented.** Do not reference planned features as if they exist in the codebase.
6. **`@conv` entries provide session continuity.** Use slot:1 (most recent) to resume where the last session left off.
7. **`@next` entries are the immediate todo list.** Start here after session recovery.
8. **Cross-reference `@perf` items before any edit.** If your edit touches files listed in a `@perf` entry, that edit requires heightened care.

### Reading Strategy (Fast Context Load)
When you first open a CDF file, read in this order for fastest context acquisition:
1. `@header` — what project, what version, when was this last updated?
2. `@obj` — what are we trying to accomplish?
3. `@rule [PERMANENT]` — what must I never violate?
4. `@perf [LOCKED]` — what must I never break?
5. `@next` — what should I do right now?
6. `@conv` — what happened recently?
7. Everything else — deep context as needed.

### Answering Questions from CDF
When the user asks a question and you need to find the answer in a CDF file:
- **"What file handles X?"** → scan `@file` entries
- **"Is feature Y working?"** → check `@perf` and `@feat` tags
- **"What broke before?"** → scan `@bug` entries
- **"What are the API keys?"** → scan `@key` entries
- **"What changed recently?"** → scan `@fix` entries by date
- **"What's the rule about X?"** → scan `@rule` entries by id or content

---

## 9. Format Extension Rules

CDF is designed to grow. To add new @ types:

1. **Choose a short, self-documenting prefix** from the game dev domain.
2. **Document it** by adding a subsection to Section 2 of this file.
3. **Follow existing patterns:** type prefix, then key:value pairs, then tags, then indented children.
4. **Use sub-prefixes** for hierarchical types: `@plan.phase`, `@art.collab`, `@tbl.row`.
5. **Never redefine existing prefixes.** If `@feat` means "feature", it always means "feature".

### Reserved for Future Use
| Prefix | Intended Purpose |
|--------|-----------------|
| `@test` | Test scenarios and assertions |
| `@deploy` | Deployment configs and procedures |
| `@perf-metric` | Performance benchmarks and targets |
| `@asset` | Game asset manifest (sprites, audio, textures) |
| `@shader` | Shader pipeline descriptions |
| `@flow` | Complex state machine definitions |
| `@agent` | Multi-agent coordination rules |
| `@device` | Device profiles and compatibility |
| `@migration` | Database migration tracking |

---

## 10. CDF Workflow (How Mikey and Claudes Work Together)

CDF is the **master format** for all Claude-facing context documents. Mikey reads and edits plain English. Claudes read and edit CDF natively. Here's how they stay in sync:

### 10KB Threshold Rule
- **Over 10KB** → CDF. Benchmark shows 8-16% char savings on prose-heavy docs.
- **Under 10KB** → Stay as plain .md. CDF's `@header` + type prefixes cost more than prose stripping saves.

### What Gets CDF-Encoded (over 10KB)
- `claude.md` (47KB → 40KB, -15.7%)
- `GAME_FLOW.md` (21KB → 19KB, -8.5%)
- `dp_moto_Mobile_Optimization.md` (31KB → 28KB, -11.9%)
- `MIGRATION_NEW_LAPTOP.md` (14KB → 12KB, -14.0%)
- `MEMORY.md` (16KB → 15KB, -3.8%)
- Any new Claude-facing doc that grows past 10KB

### What Stays as Plain Markdown (under 10KB)
- `PLAN.md`, `BUG_REPORT.md`, `CHANGES_SINCE_PUSH.md`, `UPDATE_HISTORY.md`
- Small memory topic files: `ux_flow_status.md`, `device-optimization.md`, `vision-protocol.md`
- Templates: `brief_TEMPLATE.md`, `claude_TEMPLATE.md`

### What NEVER Gets CDF-Encoded (regardless of size)
- Gameplay code (TypeScript, HTML, CSS)
- Game assets or textures
- Build configs (vite.config, package.json)
- Any file the game requires to run

### The Editing Workflow

**When Mikey wants to see or edit a doc:**
1. Claude generates a **fresh plain English copy** from the current CDF master
2. Mikey reads, edits, and approves changes
3. Claude isolates the changed section(s) and updates **only those sections** in the CDF
4. The plain English copy is deleted (temporary — CDF is the master)

**When Claude needs to make changes:**
1. Claude edits the CDF directly (Claudes read CDF natively)
2. No need to regenerate the English version unless Mikey asks to see it

**When Mikey says "show me claude.md" or "let me see the rules":**
1. Claude reads the CDF and produces an up-to-date plain English version
2. Mikey reviews and makes changes or says "done"
3. Claude syncs changes back to CDF, deletes the temporary English copy

### Section-Level Editing
CDF is designed for surgical edits. Each `@` block is independent:
- To update one bug: find the `@bug` line + its indented children, replace just that block
- To add a new note: append a new `@note` line in the right section
- To mark a feature as perfect: change `[WIP]` to `[PERFECT]` on the `@feat` line

Claude should **never rewrite the entire CDF** for a single change. Isolate the section, edit it, done.

### Current State
- `claude.md` — original plain English (kept as reference)
- `claude.cdf` — CDF master (Claudes read this)
- `GAME_FLOW.md` — plain English (for Mikey, not yet CDF-encoded)
- `r_stone.md` — this file (always plain English — it's the decoder ring)

---

## 11. Validation Checklist

Before considering a CDF encoding complete, verify:

- [ ] Every `@key` credential from the source document is present and character-exact
- [ ] Every `@file` from the source file map is accounted for
- [ ] Every `@perf` / `[LOCKED]` item from the source is preserved
- [ ] Every `@rule` tagged `[PERMANENT]` from the source is included
- [ ] All `@note` entries preserve the specific technical detail (not just the gist)
- [ ] `@header` block is present with correct version and date
- [ ] No identifiers (filenames, function names, IDs, URLs) have been abbreviated or altered
- [ ] A Claude reading only this CDF could reconstruct the full working context of the project
