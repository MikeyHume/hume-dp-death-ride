# DEPLOYS.md — DP Moto Build & Deploy Registry

> **Purpose:** Track every Vercel account, project, deploy target, and stable build checkpoint.
> Any Claude reading this should know exactly how to deploy, where each build lives, and how to revisit any milestone.

---

## Vercel Accounts

| Account | Owner | Team/Org Slug | Role |
|---------|-------|---------------|------|
| **Mikey (hume)** | Mikey | `mikeys-projects-3da45d99` | Primary — owns LIVE + original DEV project |
| **Artie** | Artie | `artie-9602s-projects` | Secondary — owns artie DEV project for external testing |

---

## Vercel Projects

### 1. `hume-dp-death-ride` (LIVE)

| Field | Value |
|-------|-------|
| Account | Mikey |
| URL | **https://hume-dp-death-ride.vercel.app** |
| GitHub repo | `MikeyHume/dp_moto_LIVE` (private, remote `live`) |
| Purpose | **Production.** Public-facing live build. Only deployed on Mikey's explicit command. |
| Deploy command | `npx vercel link --project hume-dp-death-ride --yes && npx vercel --prod --yes` |
| Post-deploy | `git push live main` (mirrors exact live state to dp_moto_LIVE repo) |
| Post-deploy relink | `npx vercel link --project dp-death-ride-dev-artie --yes` (return to default) |

> **RULE: NEVER deploy to LIVE unless Mikey explicitly says to.**

### 2. `dp-death-ride-dev` (Mikey's DEV)

| Field | Value |
|-------|-------|
| Account | Mikey |
| URL | **https://dp-death-ride-dev.vercel.app** |
| GitHub repo | `MikeyHume/hume-dp-death-ride` (private, remote `origin`) |
| Purpose | Mikey's dev/testing environment. Free to push for testing. |
| Deploy command | `npx vercel link --project dp-death-ride-dev --yes && npx vercel --prod --yes` |
| Post-deploy relink | `npx vercel link --project dp-death-ride-dev-artie --yes` (return to default) |
| Notes | When linking, CLI may prompt for which remote — select `origin` (hume-dp-death-ride.git) |

### 3. `dp-death-ride-dev-artie` (Artie's DEV) — **DEFAULT LINK**

| Field | Value |
|-------|-------|
| Account | Artie |
| URL | **https://dp-death-ride-dev-artie.vercel.app** |
| GitHub repo | Same codebase, pushed via CLI (not git-integrated) |
| Purpose | Artie's dev/testing environment. Currently the default linked project. |
| Deploy command | `npx vercel --prod --yes` (already linked, no relink needed) |
| Notes | This is the default link — after deploying to any other project, always relink back here. |

---

## Default Link Policy

The `.vercel/project.json` should always point to **`dp-death-ride-dev-artie`** as the default.
After deploying to Mikey's DEV or LIVE, always relink:
```
npx vercel link --project dp-death-ride-dev-artie --yes
```

---

## How to Deploy (Quick Reference)

### Deploy to Artie DEV (default — most common)
```bash
npx vercel --prod --yes
```

### Deploy to Mikey's DEV
```bash
npx vercel link --project dp-death-ride-dev --yes
npx vercel --prod --yes
npx vercel link --project dp-death-ride-dev-artie --yes   # relink default
```

### Deploy to LIVE (Mikey's explicit approval ONLY)
```bash
npx vercel link --project hume-dp-death-ride --yes
npx vercel --prod --yes
git push live main                                         # mirror to LIVE repo
npx vercel link --project dp-death-ride-dev-artie --yes   # relink default
```

---

## Git Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `https://github.com/MikeyHume/hume-dp-death-ride.git` | Main dev repo — all commits go here |
| `live` | `https://github.com/MikeyHume/dp_moto_LIVE.git` | Live mirror — always matches LIVE Vercel exactly |

---

## Spotify Redirect URIs by Deploy Target

Each deploy URL needs its own redirect URI registered in the [Spotify Dashboard](https://developer.spotify.com/dashboard):

| Deploy | Redirect URI | Status |
|--------|-------------|--------|
| Local dev | `http://127.0.0.1:8081/callback` | Registered, working |
| Artie DEV | `https://dp-death-ride-dev-artie.vercel.app/callback` | Needs registration |
| Mikey DEV | `https://dp-death-ride-dev.vercel.app/callback` | Registered |
| LIVE | `https://hume-dp-death-ride.vercel.app/callback` | Registered |

> **Note:** Spotify auth will fail with `invalid_client` if the redirect URI for the deploy isn't registered. Check the Spotify Dashboard app settings if auth breaks on a new deploy target.

---

## Version History (Git Reference)

Version format: `MAJOR.MINOR.PATCH` (set in `index.html` line ~621: `var verNum = '...'`)
- **PATCH**: Bump every code change for testing. No commit needed.
- **MINOR**: Bump on push/commit (Mikey says to push). Reset PATCH to 0.
- **MAJOR**: Bump on major milestone (Mikey says "version up"). Reset MINOR + PATCH.

### Key Commits (for git archaeology)

| Version | Commit | Date | Summary |
|---------|--------|------|---------|
| v0.01.07 | `285453f` | 2026-02-25 | Remove game modes UI + countdown audio fix + mobile cutscenes |
| v0.00.99 | `eff275a` | 2026-02-25 | Mobile loading overlay + road spritesheets + reflection fixes + intro cutscene |
| v0.00.72 | `a0e18e6` | 2026-02-24 | Music UI half-size + mobile road/railing textures + cursor fix |
| v0.00.71 | `a613243` | 2026-02-24 | Swipe-to-fullscreen + liteMode all phones + BIOS fallback |
| v0.00.56 | `6f5a35f` | 2026-02-24 | iOS Safari fullscreen maximization (7 techniques) |
| v0.00.50 | `0e0a7a0` | 2026-02-23 | iOS Safari fix (CDN Phaser) + vision system + device profiles + debug HUD |
| v0.00.39 | `acf5a30` | 2026-02-23 | HTTP dev server + iPhone UDID targeting + one-command Mac startup |
| v0.00.37 | `2f4a428` | 2026-02-23 | Autonomous test infrastructure + hume music system |
| — | `b760432` | 2026-02-21 | Pre-mobile checkpoint (desktop feature-complete) |
| — | `d2bf981` | 2026-02-20 | Music system v0.1 (WMP, catalog, playlists) |
| — | `b58f552` | 2026-02-18 | Puddle reflections + BitmapMask |
| — | `5d17e60` | 2026-02-14 | First Vercel deploy ever |
| — | `e781e85` | 2026-02-14 | Initial commit |

To restore any version: `git checkout <commit-hash>`

---

---

## Demo Builds (Curated — Added by Mikey's Request Only)

> **These are permanent, playable snapshots.** Each has a persistent Vercel URL that never changes — even after new deploys go to the main alias. Use these to revisit how the game looked/felt at a specific milestone, compare before/after, or pull reference from an older approach.
>
> **Rule:** Only Mikey adds entries here. Claude never adds demo builds on its own.

---

### DEMO #1 — "First Real Demo"

| Field | Value |
|-------|-------|
| Persistent URL | **https://dp-death-ride-dev-artie-e7kjsnfo3-artie-9602s-projects.vercel.app** |
| Version | `v0.01.07` |
| Commit | `285453f` |
| Date tagged | 2026-02-26 |
| Deployed from | Artie DEV |
| Git source | `main` branch at `285453f` |

**What's in this build:**
- Full game flow: BIOS boot -> title animation -> tutorial -> countdown -> gameplay -> death -> high score -> replay
- Mobile cutscene support (pre-start sequences)
- Countdown audio unified across YouTube + Spotify sources
- Game modes selector removed (was causing confusion)
- Swipe-to-fullscreen on iOS Safari
- liteMode for all phones (skips heavy spritesheets, prevents OOM)
- Dual music player (YouTube + Spotify Premium)
- CRT shader, parallax backgrounds, puddle reflections
- Spotify PKCE auth + profile system
- Supabase global leaderboard
- WMP popup with Library, Playlists, Favorites tabs

**What's NOT in this build (added after):**
- Action button PNGs (boost, rocket, slash icons)
- Slider knob tracking player Y
- Bottom-right quadrant accelerate zone (was full right half)
- High score screen 3x text + mobile keyboard
- Title reveal overlay + staged UI fade choreography
- Doubled CRT scanlines (540 -> 1080)
- Avatar z-order fix for anon profile pic

---

*Next demo will be added here when Mikey requests it.*

---

## Current Working State (Uncommitted)

| Field | Value |
|-------|-------|
| Version in code | `v0.01.32` |
| Base commit | `285453f` (v0.01.07) |
| Last deploy | Artie DEV (2026-02-26) |
| Working on | Gameplay UI polish: action buttons, slider knob, high score 3x scale, mobile keyboard, staged title reveal overlay, UI fade choreography, avatar z-order fix, green cursor disabled |

### What's changed since last commit (v0.01.07):
- Action buttons (boost, rocket, slash) with PNG icons
- Slider bar + slider knob tracking player Y position
- Player Y bounds adjusted (higher ceiling, bottom inset)
- Accelerate zone changed to bottom-right quadrant only
- CRT scanline density doubled (540 -> 1080)
- High score screen text/buttons 3x size + mobile keyboard input
- Black title reveal overlay with staged fade sequence
- All UI elements fade in/out with coordinated timing
- Profile HUD avatar z-order fix (gray circle no longer covers anon pic)
- Green triangle cursor disabled (replaced by slider knob)

---

## How to Find a Specific Build

### By version number
Search the git log:
```bash
git log --oneline --all | grep "v0.00.50"
```

### By date
```bash
git log --after="2026-02-23" --before="2026-02-24" --oneline
```

### By feature
```bash
git log --oneline --all | grep -i "reflection"
```

### Restore a build temporarily
```bash
git stash                    # save current work
git checkout <commit-hash>   # go to that build
# ... test / review ...
git checkout main            # return to current
git stash pop                # restore work
```

### Deploy a specific old build
```bash
git stash
git checkout <commit-hash>
npx vercel --prod --yes      # deploys that exact state
git checkout main
git stash pop
npx vercel --prod --yes      # redeploy current
```

---

## Maintenance Rules

1. **After every commit**, add an entry to the Version History section if it's a meaningful milestone.
2. **Mark `[STABLE BUILD]`** when a build is confirmed working across desktop + mobile (or just desktop for early builds).
3. **Always note which deploy targets** received each build.
4. **Keep the "Current Working State" section updated** with uncommitted changes so any Claude picking up the session knows what's in-flight.
5. **Spotify redirect URIs** — whenever a new deploy target is created, register its `/callback` URL in the Spotify Dashboard or auth will fail.
6. **P (PC Claude) owns all deploys.** M (MacClaude) never pushes or deploys.
