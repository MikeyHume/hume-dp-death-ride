# DP Moto — New Laptop Migration Guide

> **Purpose:** Get this project running on a fresh Windows PC laptop with full Claude Code power, zero surprises.
> **Last updated:** 2026-02-21 · ver 0.00.17

---

## 1. Prerequisites / Install Checklist (Windows PC)

Install these **in order** — some depend on earlier ones.

### 1a. Git

**Option A — Git CLI:**
```powershell
winget install Git.Git
```
Verify:
```powershell
git --version
# Expected: git version 2.x.x
```

**Option B — GitHub Desktop** (you already use this):
- Download from https://desktop.github.com/ if not installed
- Sign in with your GitHub account (`MikeyHume`)
- GitHub Desktop bundles its own Git — CLI git is optional but recommended for Claude Code

> **Tip:** If you use GitHub Desktop for clone/push/pull, Claude Code can still run `git` CLI commands alongside it. They share the same repo state.

### 1b. Node.js + npm

```powershell
winget install OpenJS.NodeJS.LTS
```
Close and reopen your terminal after install, then verify:
```powershell
node -v
# Expected: v20.x.x or v22.x.x (LTS)
npm -v
# Expected: 10.x.x+
```

### 1c. VS Code

```powershell
winget install Microsoft.VisualStudioCode
```
Or download from https://code.visualstudio.com/

### 1d. Claude Code (VS Code Extension)

1. Open VS Code
2. `Ctrl+Shift+X` → search **"Claude Code"** by Anthropic
3. Install it
4. It will prompt you to sign in — use your existing Anthropic/Claude account
5. Verify: open the Claude Code panel (click the Claude icon in the sidebar or `Ctrl+Shift+P` → "Claude Code: Open")

### 1e. Supabase CLI

```powershell
npm install -g supabase
```
Verify:
```powershell
npx supabase --version
# Expected: 2.x.x
```

### 1f. Tooling that installs automatically

These are project dev-dependencies — `npm install` handles them:
- **Vite** (dev server + bundler)
- **TypeScript** (compiler)
- **sharp** (image processing)

No separate install needed.

---

## 2. Repo Setup

### 2a. Clone the repo

**With GitHub Desktop:**
1. File → Clone Repository
2. URL tab → paste: `https://github.com/MikeyHume/hume-dp-death-ride.git`
3. Choose local path (e.g., `C:\Users\mikey\Claude_Playground\dp_moto`)
4. Click Clone

**With Git CLI:**
```powershell
cd C:\Users\mikey\Claude_Playground
git clone git@github.com:MikeyHume/hume-dp-death-ride.git dp_moto
cd dp_moto
```

> **Note:** If using SSH (`git@github.com:...`), you need an SSH key on the new laptop. GitHub Desktop handles auth automatically via your GitHub login. If you prefer HTTPS:
> ```powershell
> git clone https://github.com/MikeyHume/hume-dp-death-ride.git dp_moto
> ```

### 2b. Install dependencies

```powershell
cd C:\Users\mikey\Claude_Playground\dp_moto
npm install
```

### 2c. Start the dev server

```powershell
npm run dev
```

Expected output:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://127.0.0.1:8081/
```

### 2d. Verify it's running

Open a browser → go to `http://127.0.0.1:8081/`

You should see the red BIOS boot screen with the loading bar. If you see a black screen or errors, check the browser console (`F12`).

---

## 3. Environment Variables & Secrets

### 3a. Local development (`.env.local`)

Create a file called `.env.local` in the project root with these variables:

```
VITE_SUPABASE_URL=https://wdaljqcoyhselitaxaeu.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_SPOTIFY_CLIENT_ID=e20013b88ebc46018a93ab9c0489edd8
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081/callback
SPOTIFY_CLIENT_SECRET=<your-spotify-client-secret>
YOUTUBE_API_KEY=<your-youtube-api-key>
```

> **Where to find the values:** Copy `.env.local` from the old laptop. It's in the repo root. If you can't access the old machine, pull the values from:
> - **Supabase anon key:** Supabase Dashboard → Project Settings → API → `anon` `public` key
> - **Spotify client secret:** Spotify Developer Dashboard → your app → Settings
> - **YouTube API key:** Google Cloud Console → APIs & Services → Credentials

### 3b. Vercel (production)

These should already be set. To verify:
1. Go to https://vercel.com → project `hume-dp-death-ride` → Settings → Environment Variables
2. Confirm these exist:

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Yes | `https://wdaljqcoyhselitaxaeu.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Same as `.env.local` |
| `VITE_SPOTIFY_CLIENT_ID` | Yes | `e20013b88ebc46018a93ab9c0489edd8` |

> Vercel vars don't change when you switch laptops — they're stored on Vercel's servers.

### 3c. Supabase Edge Function Secrets

These are stored in the Supabase dashboard, not in your repo:
1. Go to https://supabase.com/dashboard → project `wdaljqcoyhselitaxaeu`
2. Edge Functions → Secrets
3. Confirm these exist:

| Secret | Purpose |
|--------|---------|
| `SPOTIFY_CLIENT_SECRET` | Spotify API auth for catalog sync |
| `YOUTUBE_API_KEY` | YouTube Data API for video matching |

### 3d. Claude Code MCP (Supabase direct SQL access)

The file `.mcp.json` in the repo root contains the Supabase MCP config with a Personal Access Token. If this token has expired or you need a new one:

1. Go to https://supabase.com/dashboard/account/tokens
2. Generate a new Personal Access Token
3. Update `.mcp.json`:
```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "<your-new-token>"
      ],
      "env": {}
    }
  }
}
```

### 3e. Common Gotchas

| Gotcha | Symptom | Fix |
|--------|---------|-----|
| Missing `.env.local` | Black screen, console errors about undefined Supabase URL | Create the file per 3a above |
| Spotify redirect URI mismatch | Login popup shows error after Spotify auth | Spotify Dashboard must have `http://127.0.0.1:8081/callback` in Redirect URIs |
| Invisible whitespace in env vars | Supabase or Spotify calls fail with auth errors | Open `.env.local` in VS Code, check for trailing spaces/tabs. Apply `.trim()` if in doubt |
| Wrong port | Redirect URI fails, page doesn't load | Vite is configured for port 8081 (`vite.config.ts`). Don't change it or all redirect URIs break |
| Edge function secrets not set | `sync_music_catalog` returns 500 | Set `SPOTIFY_CLIENT_SECRET` and `YOUTUBE_API_KEY` in Supabase Dashboard → Edge Functions → Secrets |

---

## 4. Spotify

### 4a. Redirect URIs

Go to https://developer.spotify.com/dashboard → select your app → Settings → Redirect URIs.

These must exist:
- `http://127.0.0.1:8081/callback` (local dev)
- `https://<your-vercel-domain>/callback` (production)

### 4b. Sanity Check Login Flow

1. Start dev server: `npm run dev`
2. Open `http://127.0.0.1:8081/`
3. Go through BIOS → game loads
4. Click the profile/Spotify login button
5. Spotify popup should appear → authorize → popup closes → profile pic + name loads
6. Music should play via Spotify Web Playback SDK ("Playing on DP Moto" in Spotify app)

### 4c. If You Rotated the Client Secret

The client secret is used in **two places**:
1. `.env.local` → `SPOTIFY_CLIENT_SECRET` (for local edge function testing)
2. Supabase Dashboard → Edge Functions → Secrets → `SPOTIFY_CLIENT_SECRET`

Update **both**. The browser-side PKCE flow does NOT use the client secret (only the client ID).

---

## 5. Supabase

### 5a. Confirm Project Connection

```powershell
npx supabase link --project-ref wdaljqcoyhselitaxaeu
```

It may prompt for your Supabase access token. If so, generate one at https://supabase.com/dashboard/account/tokens

### 5b. Deploy the Edge Function

```powershell
npx supabase functions deploy sync_music_catalog --project-ref wdaljqcoyhselitaxaeu
```

### 5c. Test the Edge Function

Replace `<ANON_KEY>` with your actual anon key from `.env.local`:

```powershell
$headers = @{
  "Authorization" = "Bearer <ANON_KEY>"
  "Content-Type" = "application/json"
  "apikey" = "<ANON_KEY>"
}
$body = '{"artistIds":["5uzPIJDzWAujemRDKiJMRj"],"dryRun":true}'
Invoke-RestMethod -Uri "https://wdaljqcoyhselitaxaeu.supabase.co/functions/v1/sync_music_catalog" -Method POST -Headers $headers -Body $body
```

Expected: JSON response with track counts and diagnostics (dry run = no writes).

### 5d. Confirm Tables and Data

If Claude Code has MCP access (`.mcp.json` is configured), just ask Claude:
> "List all tables in the public schema"
> "SELECT count(*) FROM music_tracks"

Or go to Supabase Dashboard → Table Editor and check:
- `music_artists` — should have 2+ rows
- `music_tracks` — should have 20+ rows
- `leaderboard` — weekly scores
- `user_favorites`, `user_playlists`, `user_playlist_tracks` — user data

---

## 6. Git + Deployment

### 6a. Confirm Remote

**GitHub Desktop:** Repository → Repository Settings → Remote should show `MikeyHume/hume-dp-death-ride`

**Git CLI:**
```powershell
git remote -v
# Expected:
# origin  git@github.com:MikeyHume/hume-dp-death-ride.git (fetch)
# origin  git@github.com:MikeyHume/hume-dp-death-ride.git (push)
```

### 6b. Test Push

Make a trivial change (e.g., bump the version in `index.html`), commit, push.

**GitHub Desktop:** Commit in the UI → Push Origin

**Git CLI:**
```powershell
git add index.html
git commit -m "test push from new laptop"
git push origin main
```

### 6c. Vercel Auto-Deploy

Pushes to `main` trigger Vercel auto-deploy. Check:
1. https://vercel.com → project → Deployments
2. Latest deployment should appear within ~60 seconds of push
3. Status should go from "Building" → "Ready"

### 6d. Post-Deploy Smoke Test

After Vercel shows "Ready":
1. Hard-refresh the production URL (`Ctrl+Shift+R`)
2. BIOS screen loads with correct version number
3. Game boots through to title screen
4. Spotify login works (popup, auth, profile loads)
5. Music plays
6. Leaderboard shows scores
7. WMP popup opens with Library tab

---

## 7. Claude Code Continuity

### 7a. Open Claude Code

1. Open VS Code
2. Open the `dp_moto` folder (`File → Open Folder`)
3. Click the Claude Code icon in the sidebar (or `Ctrl+Shift+P` → "Claude Code: Open")
4. Claude Code will automatically detect `CLAUDE.md` in the project root and load it

### 7b. First Message to Claude on the New Laptop

Paste this as your first message:

```
I just migrated this project to a new laptop. Read claude.md and MIGRATION_NEW_LAPTOP.md, then:
1. Summarize where we left off
2. Confirm you have MCP access to Supabase (try listing tables)
3. Ask me one question to pick up exactly where we paused
```

### 7c. Recovery Ritual (if Claude ever loses context)

If VS Code crashes, the extension restarts, or Claude seems to have forgotten everything:

1. Claude will automatically re-read `CLAUDE.md` (it's loaded on every session start)
2. If needed, tell Claude: `read claude.md and resume`
3. Claude's recovery protocol (defined in `CLAUDE.md` § Session Recovery Rule):
   - Read `claude.md`
   - Summarize last 5 exchanges
   - Confirm current working objective
   - Continue from the exact problem being solved
   - Ask a context-sensitive question to resume

### 7d. Key Context Files Claude Reads

| File | Purpose | Auto-loaded? |
|------|---------|-------------|
| `CLAUDE.md` | Master project doc — architecture, rules, perfect items, changes log | Yes (always) |
| `CHANGES_SINCE_PUSH.md` | What changed since last git push | No — read on request |
| `UPDATE_HISTORY.md` | Full chronological update history | No — read on request |
| `MIGRATION_NEW_LAPTOP.md` | This document | No — read on request |
| `.mcp.json` | Supabase MCP config (auto-detected by Claude Code) | Auto-detected |

---

## 8. Green Light Checklist

Run through this list. Every box must pass before you abandon remote desktop.

```
[ ] Git installed and working (git --version)
[ ] Node + npm installed (node -v, npm -v)
[ ] VS Code installed with Claude Code extension
[ ] Repo cloned and on 'main' branch
[ ] npm install completed without errors
[ ] .env.local exists with all 6 variables
[ ] npm run dev starts on http://127.0.0.1:8081/
[ ] BIOS screen loads in browser
[ ] Game boots through to title/gameplay
[ ] Spotify login works (popup → auth → profile loads)
[ ] Music plays (Spotify or YouTube)
[ ] Claude Code opens and responds in VS Code
[ ] Claude reads CLAUDE.md and knows the project context
[ ] Claude can list Supabase tables (MCP working)
[ ] Git push works (GitHub Desktop or CLI)
[ ] Vercel auto-deploys on push
[ ] Production site loads after deploy (hard refresh)
```

**All green? You're done. Close Parsec and enjoy the speed.**

---

## Quick Reference Card

| What | Value |
|------|-------|
| Dev server | `http://127.0.0.1:8081/` |
| Dev command | `npm run dev` |
| Build command | `npm run build` |
| Git remote | `git@github.com:MikeyHume/hume-dp-death-ride.git` |
| Supabase project | `wdaljqcoyhselitaxaeu` |
| Supabase dashboard | https://supabase.com/dashboard/project/wdaljqcoyhselitaxaeu |
| Spotify dashboard | https://developer.spotify.com/dashboard |
| Vercel project | `hume-dp-death-ride` |
| Vercel dashboard | https://vercel.com |
| Current version | `ver 0.00.17` |
