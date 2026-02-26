# Spotify Authorization — Tricks, Tips & Full Setup Guide

> **Purpose:** Everything a Claude (or developer) needs to get Spotify PKCE auth working in a browser-based game/app, on both mobile and desktop, deployed to Vercel. Written from hard-won experience — every gotcha in here bit us at least once.

---

## Architecture Overview

```
User clicks "Login to Spotify"
  |
  v
Browser builds authorize URL with PKCE challenge
  |
  v
Redirect to accounts.spotify.com/authorize
  |
  v
User logs in + authorizes scopes
  |
  v
Spotify redirects to YOUR_DOMAIN/callback?code=...&state=...
  |
  v
Callback page exchanges code for access_token (POST /api/token)
  |
  v
Token stored in localStorage, page redirects to "/"
  |
  v
Web Playback SDK uses token to register device + stream music
```

**No backend required.** The entire flow is client-side using PKCE (Proof Key for Code Exchange). No client secret is exposed in the browser.

---

## PKCE Flow — Step by Step

### 1. Generate PKCE values (before redirect)

```typescript
const verifier = generateVerifier();   // 64-char random string (crypto.getRandomValues)
const state = generateState();          // 16-char random string (CSRF protection)
const challenge = await challengeFromVerifier(verifier);  // SHA-256(verifier), base64url-encoded
```

Store `verifier` and `state` in **localStorage** (not sessionStorage — the callback may open in a different tab).

### 2. Build the authorize URL

```
https://accounts.spotify.com/authorize?
  response_type=code
  client_id=YOUR_CLIENT_ID
  redirect_uri=YOUR_REDIRECT_URI       <-- MUST exactly match Spotify Dashboard
  code_challenge_method=S256
  code_challenge=CHALLENGE_FROM_STEP_1
  state=STATE_FROM_STEP_1
  scope=streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state
```

### 3. Safari vs Chrome redirect behavior

**Safari (macOS + iOS + iPadOS):** `window.open()` is blocked after any `await` because Safari strictly revokes user-gesture context. iPadOS also sends a `Macintosh` User-Agent so mobile detection doesn't work.

**Solution:** Detect Safari and always redirect the main tab:
```typescript
const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent);
if (isSafari) {
  window.location.href = authorizeUrl;  // Redirect main tab
} else {
  window.open(authorizeUrl, '_blank');  // Open popup (Chrome/Firefox/Edge are lenient)
}
```

### 4. Handle the callback (/callback route)

The callback page receives `?code=...&state=...` from Spotify. It must:

1. Validate `state` matches what was stored (prevents CSRF)
2. Retrieve `verifier` from localStorage
3. POST to `https://accounts.spotify.com/api/token`:
   ```
   grant_type=authorization_code
   client_id=YOUR_CLIENT_ID
   code=CODE_FROM_URL
   redirect_uri=YOUR_REDIRECT_URI      <-- MUST match step 2 exactly
   code_verifier=VERIFIER_FROM_STEP_1
   ```
4. Store the response (`access_token`, `refresh_token`, `expires_in`) in localStorage
5. Try `window.close()` (works if opened via popup)
6. Fallback: `window.location.replace('/')` to go back to the app

**Important:** Set `sessionStorage.setItem('skip_bios', '1')` before redirecting home so any boot sequence doesn't replay after auth.

### 5. SPA routing for /callback

In a Vite SPA, there's no server-side routing. The `/callback` path serves `index.html`, and JavaScript checks `window.location.pathname === '/callback'` on load:

```typescript
// In main.ts — BEFORE starting the game
const wasCallback = await handleCallback();
if (wasCallback) return;  // Page is redirecting, don't boot the game
// ... start Phaser game
```

Vercel handles this automatically for SPAs (serves index.html for all routes).

---

## Vercel Deployment — The Gotchas

### Environment Variables

Vite inlines `VITE_*` env vars at **build time**. They're baked into the JS bundle. If they're not set in Vercel, they'll be `undefined` in the built code.

**Required env vars on Vercel:**

| Variable | Example Value | Purpose |
|----------|--------------|---------|
| `VITE_SPOTIFY_CLIENT_ID` | `e20013b88ebc46018a93ab9c0489edd8` | Sent to Spotify in authorize + token exchange |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://your-app.vercel.app/callback` | Must match Spotify Dashboard exactly |

**Optional but recommended:**

| Variable | Example Value | Purpose |
|----------|--------------|---------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | If using Supabase for profiles/leaderboard |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anonymous access |

### THE #1 GOTCHA: Trailing Newlines in Env Vars

**This is what broke us for hours.** When setting env vars via CLI:

```bash
# BAD — echo adds a trailing \n character
echo "e20013b88ebc46018a93ab9c0489edd8" | npx vercel env add VITE_SPOTIFY_CLIENT_ID production

# GOOD — printf does NOT add trailing \n
printf 'e20013b88ebc46018a93ab9c0489edd8' | npx vercel env add VITE_SPOTIFY_CLIENT_ID production
```

The trailing `\n` gets baked into the JS bundle. Spotify receives `client_id=e20013b88ebc46018a93ab9c0489edd8\n` and returns `invalid_client` because the ID doesn't match.

**Always use `printf`, never `echo`, when piping values to `vercel env add`.**

**How to verify:** After deploying, fetch the built JS bundle and search for your client ID. Check for any `\n` or whitespace after the value:
```bash
curl -s https://your-app.vercel.app/assets/index-XXXX.js | grep -o 'e20013b[^"]*'
```

### Multiple Deploy URLs

Each Vercel project gets its own URL (e.g., `app-dev.vercel.app`, `app-live.vercel.app`). Each needs:

1. Its own `VITE_SPOTIFY_REDIRECT_URI` env var pointing to itself
2. Its own callback URL registered in the Spotify Dashboard
3. Its own `VITE_SPOTIFY_CLIENT_ID` (same value, but set without `\n`)

**OR:** Set `VITE_SPOTIFY_REDIRECT_URI` on all deploys to point to ONE domain's callback. After auth, users land on that domain. Simpler but users end up on a different URL than where they started.

### Redirect URI Code Pattern

```typescript
function getRedirectUri(): string {
  const envUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined;
  return envUri && envUri.length > 0 ? envUri : window.location.origin + '/callback';
}
```

The fallback (`window.location.origin + '/callback'`) works if `VITE_SPOTIFY_REDIRECT_URI` is not set, but only if that exact URL is registered in Spotify Dashboard.

---

## Spotify Developer Dashboard Setup

### 1. Create the App

1. Go to https://developer.spotify.com/dashboard
2. Create App
3. App name: whatever you want
4. App description: whatever you want
5. **Redirect URIs:** Add ALL callback URLs you'll ever use:
   - `http://127.0.0.1:8081/callback` (local dev)
   - `https://your-dev-app.vercel.app/callback`
   - `https://your-live-app.vercel.app/callback`
   - Any LAN IP callbacks for mobile testing: `https://192.168.x.x:8081/callback`
6. APIs used: Web API, Web Playback SDK
7. Save

### 2. Dev Mode vs Extended Quota Mode

**Dev Mode (default):**
- Up to 5 users can authenticate (must be added to User Management)
- The app OWNER can always authenticate without being in the list
- Good enough for development and small testing

**Extended Quota Mode:**
- Unlimited users
- Requires 250,000 MAU + registered business (as of May 2025)
- Submit via Dashboard: App → Settings → Request Extension

**For most indie projects:** Dev mode is sufficient. The app owner + 5 added users can test everything. If you need more users, you'll need to apply for extended quota.

### 3. User Management (Dev Mode)

Dashboard → Your App → Settings → User Management

Add users by their **Spotify account email** (not their login email if different). Users can check their Spotify email at https://account.spotify.com → Account → Email.

**Common mistake:** Adding the wrong email. If someone signs up for Spotify with Google, their Spotify email might be different from the Google email they use to log in.

### 4. Scopes

| Scope | Required For |
|-------|-------------|
| `streaming` | Web Playback SDK (playing music in browser) |
| `user-read-email` | Getting user's email for profile |
| `user-read-private` | Checking if user has Premium (`data.product === 'premium'`) |
| `user-read-playback-state` | Reading current playback device/track |
| `user-modify-playback-state` | Play, pause, skip, shuffle, seek |

All are needed for a full music playback integration. Premium is required for Web Playback SDK streaming.

---

## HTTPS Requirements

### Desktop

- `http://localhost` and `http://127.0.0.1` work without HTTPS (OAuth spec localhost exception)
- Any other domain requires HTTPS

### Mobile (LAN testing)

- iOS Safari **refuses** self-signed HTTPS certs — no "proceed anyway" option
- Android Chrome shows a warning but lets you proceed
- **Solutions for iOS LAN testing:**
  1. Use Vercel deploy instead (real HTTPS, valid cert) — **recommended**
  2. Install a CA root certificate on the device (complex, often fails)
  3. Use a tunnel (ngrok, cloudflared) to get a real HTTPS URL

### Vite HTTPS Config (for local LAN testing)

```typescript
// vite.config.ts — make HTTPS conditional so Vercel builds don't fail
server: {
  host: '0.0.0.0',
  port: 8081,
  ...(() => {
    const keyPath = path.join(__dirname, 'certs', 'key.pem');
    const certPath = path.join(__dirname, 'certs', 'cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { https: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } };
    }
    return {};
  })(),
}
```

**Critical:** Guard with `fs.existsSync()` — Vercel builds will fail if cert files don't exist and you try to read them unconditionally.

---

## Token Management

### Storage

```typescript
interface SpotifyAuth {
  access_token: string;
  token_type: string;
  expires_at: number;       // Date.now() + expires_in * 1000
  scope: string;
  refresh_token?: string;
}

localStorage.setItem('spotify_auth', JSON.stringify(auth));
```

### Checking Connection

```typescript
function isConnected(): boolean {
  const raw = localStorage.getItem('spotify_auth');
  if (!raw) return false;
  const auth = JSON.parse(raw);
  return auth.expires_at > Date.now();
}
```

### Premium Check

```typescript
async function checkPremium(): Promise<boolean> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.product === 'premium';
}
```

### Disconnect

Clear all auth state:
```typescript
localStorage.removeItem('spotify_auth');
localStorage.removeItem('spotify_verifier');
localStorage.removeItem('spotify_state');
localStorage.removeItem('spotify_user_id');
```

---

## Web Playback SDK

### Loading

```typescript
const script = document.createElement('script');
script.src = 'https://sdk.scdn.co/spotify-player.js';
document.head.appendChild(script);

window.onSpotifyWebPlaybackSDKReady = () => {
  const player = new Spotify.Player({
    name: 'Your App Name',
    getOAuthToken: (cb) => cb(getAccessToken()),
    volume: 0.5,
  });

  player.addListener('ready', ({ device_id }) => {
    // Save device_id — needed for all playback API calls
  });

  player.connect();
};
```

### Playing Music

```typescript
// Play a specific track
await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
});

// Play a playlist with shuffle
await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=${deviceId}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
});
await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
});
```

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | Client ID has trailing `\n` from `echo` | Use `printf` instead of `echo` when setting env vars |
| `invalid_client` | Redirect URI not registered in Spotify Dashboard | Add exact callback URL to Dashboard → Redirect URIs |
| `invalid_client` | User not in Dev Mode allowlist | Add user's Spotify email to User Management |
| `invalid_redirect_uri` | Redirect URI mismatch (even one char) | Ensure `VITE_SPOTIFY_REDIRECT_URI` matches Dashboard exactly |
| Spotify button does nothing | `VITE_SPOTIFY_CLIENT_ID` not set on Vercel | `printf 'YOUR_ID' \| npx vercel env add VITE_SPOTIFY_CLIENT_ID production` |
| `window.open()` blocked on Safari | Safari revokes user-gesture context after `await` | Detect Safari, redirect main tab instead of opening popup |
| Token exchange fails silently | Missing `code_verifier` in localStorage | Use localStorage (not sessionStorage) for PKCE values |
| Auth works on desktop but not mobile | Self-signed cert rejected by iOS Safari | Deploy to Vercel for real HTTPS |
| Login works but playback fails | User doesn't have Spotify Premium | Check `data.product === 'premium'` via `/v1/me` |

---

## File Reference (dp_moto implementation)

| File | Purpose |
|------|---------|
| `src/systems/SpotifyAuthSystem.ts` | PKCE flow orchestration, token management, login/logout |
| `src/util/spotifyPkce.ts` | Cryptographic helpers (verifier, challenge, state generation) |
| `src/systems/SpotifyPlayerSystem.ts` | Web Playback SDK wrapper, device registration, playback control |
| `src/systems/MusicPlayer.ts` | Dual YouTube/Spotify player, source switching, UI |
| `src/ui/ProfileHud.ts` | In-game profile avatar + sign-in prompt |
| `src/ui/ProfilePopup.ts` | Profile card with Spotify login button |
| `src/ui/DisconnectModal.ts` | Spotify disconnect confirmation dialog |
| `src/systems/ProfileSystem.ts` | User profile data from Spotify/Google |
| `vite.config.ts` | HTTPS config (conditional for Vercel compatibility) |

---

## Checklist: Setting Up Spotify Auth on a New Deploy

1. [ ] Create Spotify Developer App at https://developer.spotify.com/dashboard
2. [ ] Note your **Client ID** (never expose Client Secret in frontend)
3. [ ] Add redirect URI: `https://YOUR-APP.vercel.app/callback`
4. [ ] Set Vercel env vars (use `printf`, NOT `echo`):
   ```bash
   printf 'YOUR_CLIENT_ID' | npx vercel env add VITE_SPOTIFY_CLIENT_ID production
   printf 'https://YOUR-APP.vercel.app/callback' | npx vercel env add VITE_SPOTIFY_REDIRECT_URI production
   ```
5. [ ] Deploy: `npx vercel --prod --yes`
6. [ ] Verify built JS has clean values (no `\n`): fetch the JS bundle and grep for client ID
7. [ ] Add your Spotify email to User Management (Dev Mode)
8. [ ] Test on desktop browser first
9. [ ] Test on mobile (use Vercel URL, not LAN IP, for iOS)
10. [ ] Confirm Premium status for Web Playback SDK streaming

---

## Lessons Learned (The Hard Way)

1. **`echo` adds `\n`. `printf` doesn't.** This one thing cost us hours. Always use `printf` for env var values.
2. **Spotify error messages lie.** `invalid_client` can mean: wrong client ID, unregistered redirect URI, user not in allowlist, OR trailing whitespace in credentials. Don't trust the error name — verify each piece independently.
3. **iOS Safari is the strictest browser.** No self-signed certs, no `window.open()` after async, no exceptions. Design for Safari first, everything else is easier.
4. **Dev Mode ≠ broken.** Dev mode works fine — the app owner can always log in. The 5-user limit only matters for other people testing your app.
5. **Each Vercel project is a separate world.** Different URL = different redirect URI = different env vars = different Spotify Dashboard entry. Don't assume one project's config carries over.
6. **Test the built bundle, not just the source.** Env vars get inlined at build time. If you change them, you must redeploy. Fetch the deployed JS and verify the values are what you expect.
7. **MacClaude + WebDriver = X-ray vision.** Having a second Claude inspect the actual network requests on a real device found the `\n` issue that was invisible from reading code alone.
