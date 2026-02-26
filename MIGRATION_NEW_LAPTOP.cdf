@header project:"DP Moto" ver:0.00.17 fmt:CDF-GAMEDEV-1.0 updated:2026-02-21
  author:PC-Claude
  desc:"New laptop migration guide -- get project running on fresh Windows PC with Claude Code"
  src:MIGRATION_NEW_LAPTOP.md

# 1. Prerequisites / Install Checklist (Windows PC)

@note install in order -- some depend on earlier ones

## 1a. Git

@cfg git-install
  option-A: winget install Git.Git -> verify: git --version (expected: git version 2.x.x)
  option-B: GitHub Desktop from https://desktop.github.com/ (bundles own Git)
    sign in with GitHub account (MikeyHume)
    CLI git optional but recommended for Claude Code
  tip: GitHub Desktop clone/push/pull + Claude Code git CLI share same repo state

## 1b. Node.js + npm

@cfg node-install
  cmd: winget install OpenJS.NodeJS.LTS
  close+reopen terminal after install
  verify: node -v (expected v20.x.x or v22.x.x LTS), npm -v (expected 10.x.x+)

## 1c. VS Code

@cfg vscode-install
  cmd: winget install Microsoft.VisualStudioCode
  or: https://code.visualstudio.com/

## 1d. Claude Code (VS Code Extension)

@cfg claude-code-install
  1. Open VS Code
  2. Ctrl+Shift+X -> search "Claude Code" by Anthropic
  3. Install
  4. Sign in with Anthropic/Claude account
  5. Verify: open Claude Code panel (sidebar icon or Ctrl+Shift+P -> "Claude Code: Open")

## 1e. Supabase CLI

@cfg supabase-cli-install
  cmd: npm install -g supabase
  verify: npx supabase --version (expected 2.x.x)

## 1f. Auto-installed Tooling

@note project dev-deps handled by npm install: Vite (dev server + bundler)|TypeScript (compiler)|sharp (img processing)
@note no separate install needed

# 2. Repo Setup

## 2a. Clone

@cfg repo-clone
  github-desktop: File -> Clone Repository -> URL tab -> https://github.com/MikeyHume/hume-dp-death-ride.git
    local-path: C:\Users\mikey\Claude_Playground\dp_moto
  git-cli:
    cd C:\Users\mikey\Claude_Playground
    git clone git@github.com:MikeyHume/hume-dp-death-ride.git dp_moto
  note: SSH needs SSH key on new laptop. GitHub Desktop handles auth automatically
  https-alt: git clone https://github.com/MikeyHume/hume-dp-death-ride.git dp_moto

## 2b. Install deps

@cfg repo-deps
  cmd: cd C:\Users\mikey\Claude_Playground\dp_moto && npm install

## 2c. Start dev server

@cfg dev-server
  cmd: npm run dev
  expected: VITE v6.x.x ready -> Local: http://127.0.0.1:8081/

## 2d. Verify

@note open browser -> http://127.0.0.1:8081/ -> should see red BIOS boot screen with loading bar
@note black screen or errors -> check browser console (F12)

# 3. Env Vars & Secrets

## 3a. Local dev (.env.local)

@env VITE_SUPABASE_URL=https://wdaljqcoyhselitaxaeu.supabase.co
@env VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
@env VITE_SPOTIFY_CLIENT_ID=e20013b88ebc46018a93ab9c0489edd8
@env VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081/callback
@env SPOTIFY_CLIENT_SECRET=<your-spotify-client-secret>
@env YOUTUBE_API_KEY=<your-youtube-api-key>

@note where to find values: copy .env.local from old laptop (repo root)
  if can't access old machine:
    supabase-anon-key: Supabase Dashboard -> Project Settings -> API -> anon public key
    spotify-client-secret: Spotify Developer Dashboard -> app -> Settings
    youtube-api-key: Google Cloud Console -> APIs & Services -> Credentials

## 3b. Vercel (production)

@note these should already be set on Vercel servers -- verify at https://vercel.com -> project hume-dp-death-ride -> Settings -> Env Vars
@env VITE_SUPABASE_URL required:"https://wdaljqcoyhselitaxaeu.supabase.co"
@env VITE_SUPABASE_ANON_KEY required:"same as .env.local"
@env VITE_SPOTIFY_CLIENT_ID required:"e20013b88ebc46018a93ab9c0489edd8"
@note Vercel vars don't change when switching laptops -- stored on Vercel servers

## 3c. Supabase Edge Fn Secrets

@note stored in Supabase dashboard, not in repo
@note path: https://supabase.com/dashboard -> project wdaljqcoyhselitaxaeu -> Edge Functions -> Secrets
@env SPOTIFY_CLIENT_SECRET purpose:"Spotify API auth for catalog sync"
@env YOUTUBE_API_KEY purpose:"YouTube Data API for video matching"

## 3d. Claude Code MCP (Supabase direct SQL)

@cfg mcp-setup
  .mcp.json in repo root contains Supabase MCP cfg with Personal Access Token
  if token expired or need new:
    1. https://supabase.com/dashboard/account/tokens -> generate new token
    2. update .mcp.json:
      mcpServers.supabase.type:stdio
      mcpServers.supabase.command:npx
      mcpServers.supabase.args: -y|@supabase/mcp-server-supabase@latest|--access-token|<your-new-token>

## 3e. Common Gotchas

@tbl env-gotchas
  row "Missing .env.local" symptom:"black screen, console errors about undefined Supabase URL" fix:"create file per 3a"
  row "Spotify redirect URI mismatch" symptom:"login popup error after Spotify auth" fix:"Spotify Dashboard must have http://127.0.0.1:8081/callback in Redirect URIs"
  row "Invisible whitespace in env vars" symptom:"Supabase or Spotify calls fail with auth errors" fix:"check trailing spaces/tabs in .env.local, apply .trim()"
  row "Wrong port" symptom:"redirect URI fails, page doesn't load" fix:"Vite cfg for port 8081 (vite.config.ts). Don't change or all redirect URIs break"
  row "Edge fn secrets not set" symptom:"sync_music_catalog returns 500" fix:"set SPOTIFY_CLIENT_SECRET + YOUTUBE_API_KEY in Supabase Dashboard -> Edge Functions -> Secrets"

# 4. Spotify

## 4a. Redirect URIs

@cfg spotify-redirects
  path: https://developer.spotify.com/dashboard -> app -> Settings -> Redirect URIs
  required: http://127.0.0.1:8081/callback (local dev)
  required: https://<your-vercel-domain>/callback (production)

## 4b. Sanity Check Login Flow

@proto id:spotify-sanity-check
  1. Start dev server: npm run dev
  2. Open http://127.0.0.1:8081/
  3. Go through BIOS -> game loads
  4. Click profile/Spotify login btn
  5. Spotify popup -> authorize -> popup closes -> profile pic + name loads
  6. Music plays via Spotify Web Playback SDK ("Playing on DP Moto" in Spotify app)

## 4c. If Client Secret Rotated

@note client secret used in TWO places:
  1. .env.local -> SPOTIFY_CLIENT_SECRET (local edge fn testing)
  2. Supabase Dashboard -> Edge Functions -> Secrets -> SPOTIFY_CLIENT_SECRET
@note update BOTH. Browser-side PKCE flow does NOT use client secret (only client ID)

# 5. Supabase

## 5a. Confirm Project Connection

@cfg supabase-link
  cmd: npx supabase link --project-ref wdaljqcoyhselitaxaeu
  may prompt for access token -> generate at https://supabase.com/dashboard/account/tokens

## 5b. Deploy Edge Fn

@cfg edge-fn-deploy
  cmd: npx supabase functions deploy sync_music_catalog --project-ref wdaljqcoyhselitaxaeu

## 5c. Test Edge Fn

@note PowerShell test cmd:
  headers: Authorization="Bearer <ANON_KEY>"|Content-Type=application/json|apikey=<ANON_KEY>
  body: {"artistIds":["5uzPIJDzWAujemRDKiJMRj"],"dryRun":true}
  url: https://wdaljqcoyhselitaxaeu.supabase.co/functions/v1/sync_music_catalog
  expected: JSON res with track counts + diagnostics (dry run = no writes)

## 5d. Confirm Tables and Data

@note if Claude Code has MCP access (.mcp.json cfg) -> ask Claude: "List all tables in public schema" or "SELECT count(*) FROM music_tracks"
@note or Supabase Dashboard -> Table Editor:
  music_artists -- should have 2+ rows
  music_tracks -- should have 20+ rows
  leaderboard -- weekly scores
  user_favorites|user_playlists|user_playlist_tracks -- user data

# 6. Git + Deployment

## 6a. Confirm Remote

@cfg git-remote
  github-desktop: Repository -> Repository Settings -> Remote should show MikeyHume/hume-dp-death-ride
  git-cli: git remote -v
    expected: origin git@github.com:MikeyHume/hume-dp-death-ride.git (fetch/push)

## 6b. Test Push

@note make trivial change (e.g. bump ver in index.html), commit, push
  github-desktop: Commit in UI -> Push Origin
  git-cli: git add index.html && git commit -m "test push from new laptop" && git push origin main

## 6c. Vercel Auto-Deploy

@note pushes to main trigger Vercel auto-deploy
  check: https://vercel.com -> project -> Deployments
  latest deployment appears within ~60s of push
  status: Building -> Ready

## 6d. Post-Deploy Smoke Test

@proto id:post-deploy-smoke
  after Vercel shows Ready:
  1. Hard-refresh production URL (Ctrl+Shift+R)
  2. BIOS screen loads with correct ver num
  3. Game boots through to title screen
  4. Spotify login works (popup|auth|profile loads)
  5. Music plays
  6. Ldr shows scores
  7. WMP popup opens with Library tab

# 7. Claude Code Continuity

## 7a. Open Claude Code

@note Open VS Code -> open dp_moto folder -> click Claude Code sidebar icon
@note Claude Code auto-detects CLAUDE.md in project root and loads it

## 7b. First Msg to Claude on New Laptop

@note paste this as first msg:
  "I just migrated this project to a new laptop. Read claude.md and MIGRATION_NEW_LAPTOP.md, then:
  1. Summarize where we left off
  2. Confirm you have MCP access to Supabase (try listing tables)
  3. Ask me one question to pick up exactly where we paused"

## 7c. Recovery Ritual

@note if VS Code crashes|extension restarts|Claude loses ctx:
  Claude auto re-reads CLAUDE.md (loaded on every session start)
  if needed, tell Claude: "read claude.md and resume"
  recovery proto (in CLAUDE.md Session Recovery Rule):
    read claude.md -> summarize last 5 exchanges -> confirm cur obj -> continue from exact problem -> ask ctx-sensitive question

## 7d. Key Ctx Files

@tbl claude-ctx-files
  row file:CLAUDE.md purpose:"Master project doc -- architecture|rules|perfect items|changes log" autoloaded:yes(always)
  row file:CHANGES_SINCE_PUSH.md purpose:"What changed since last git push" autoloaded:no
  row file:UPDATE_HISTORY.md purpose:"Full chronological update history" autoloaded:no
  row file:MIGRATION_NEW_LAPTOP.md purpose:"This document" autoloaded:no
  row file:.mcp.json purpose:"Supabase MCP cfg (auto-detected by Claude Code)" autoloaded:auto-detected

# 8. Green Light Checklist

@proto id:green-light-checklist
  every box must pass before abandoning remote desktop:
  [ ] Git installed and working (git --version)
  [ ] Node + npm installed (node -v, npm -v)
  [ ] VS Code installed with Claude Code extension
  [ ] Repo cloned and on 'main' branch
  [ ] npm install completed without errors
  [ ] .env.local exists with all 6 vars
  [ ] npm run dev starts on http://127.0.0.1:8081/
  [ ] BIOS screen loads in browser
  [ ] Game boots through to title/gameplay
  [ ] Spotify login works (popup -> auth -> profile loads)
  [ ] Music plays (Spotify or YouTube)
  [ ] Claude Code opens and responds in VS Code
  [ ] Claude reads CLAUDE.md and knows project ctx
  [ ] Claude can list Supabase tables (MCP working)
  [ ] Git push works (GitHub Desktop or CLI)
  [ ] Vercel auto-deploys on push
  [ ] Production site loads after deploy (hard refresh)
  all-green: done. Close Parsec and enjoy the spd.

# Quick Reference Card

@tbl quick-ref
  row "Dev server" val:"http://127.0.0.1:8081/"
  row "Dev cmd" val:"npm run dev"
  row "Build cmd" val:"npm run build"
  row "Git remote" val:"git@github.com:MikeyHume/hume-dp-death-ride.git"
  row "Supabase project" val:wdaljqcoyhselitaxaeu
  row "Supabase dashboard" val:"https://supabase.com/dashboard/project/wdaljqcoyhselitaxaeu"
  row "Spotify dashboard" val:"https://developer.spotify.com/dashboard"
  row "Vercel project" val:hume-dp-death-ride
  row "Vercel dashboard" val:"https://vercel.com"
  row "Current ver" val:0.00.17
