/**
 * Spotify Authorization Code + PKCE flow (no backend, no client secret).
 *
 * Prerequisites:
 *   1) Create a Spotify Developer App at https://developer.spotify.com/dashboard
 *   2) Add redirect URI: https://<your-vercel-site>.vercel.app/callback
 *   3) Set env var VITE_SPOTIFY_CLIENT_ID in Vercel
 */

import {
  generateVerifier,
  generateState,
  challengeFromVerifier,
  buildAuthorizeUrl,
  exchangeCodeForToken,
} from '../util/spotifyPkce';

const STORAGE_KEY = 'spotify_auth';
const SESSION_VERIFIER = 'spotify_verifier';
const SESSION_STATE = 'spotify_state';
const SCOPE = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';

export interface SpotifyAuth {
  access_token: string;
  token_type: string;
  expires_at: number;
  scope: string;
  refresh_token?: string;
}

function getClientId(): string | null {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  return id && id.length > 0 ? id : null;
}

function getRedirectUri(): string {
  return window.location.origin + '/callback';
}

/**
 * Kick off the Spotify PKCE login flow in a new tab.
 * Returns a Promise that resolves to true when auth completes,
 * or false on timeout / popup blocked fallback.
 */
export async function startLogin(): Promise<boolean> {
  const clientId = getClientId();
  if (!clientId) {
    console.warn('SpotifyAuthSystem: VITE_SPOTIFY_CLIENT_ID not set, cannot login');
    return false;
  }

  const verifier = generateVerifier();
  const state = generateState();
  const challenge = await challengeFromVerifier(verifier);

  // Use localStorage (not sessionStorage) so the new tab can read them
  localStorage.setItem(SESSION_VERIFIER, verifier);
  localStorage.setItem(SESSION_STATE, state);

  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: getRedirectUri(),
    scope: SCOPE,
    state,
    challenge,
  });

  const popup = window.open(url, '_blank');
  if (!popup) {
    // Popup blocked — fall back to same-page navigation
    window.location.href = url;
    return false;
  }

  // Wait for the callback tab to write the token to localStorage
  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(pollId);
      clearTimeout(timeoutId);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        cleanup();
        resolve(true);
      }
    };
    window.addEventListener('storage', onStorage);

    // Poll as backup — some browsers don't fire storage for same-origin popups
    const pollId = setInterval(() => {
      if (isConnected()) {
        cleanup();
        resolve(true);
      }
    }, 500);

    // Timeout after 5 minutes
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 5 * 60 * 1000);
  });
}

/**
 * Handle the /callback redirect from Spotify.
 * Returns true if we were on the callback page (and will redirect to "/").
 * Returns false if this is not a callback — caller should proceed normally.
 */
export async function handleCallback(): Promise<boolean> {
  if (window.location.pathname !== '/callback') return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    console.error('Spotify auth error:', error);
    window.location.replace('/');
    return true;
  }

  if (!code || !state) {
    console.error('SpotifyAuthSystem: missing code or state on /callback');
    window.location.replace('/');
    return true;
  }

  const savedState = localStorage.getItem(SESSION_STATE);
  if (state !== savedState) {
    console.error('SpotifyAuthSystem: state mismatch (possible CSRF)');
    window.location.replace('/');
    return true;
  }

  const verifier = localStorage.getItem(SESSION_VERIFIER);
  if (!verifier) {
    console.error('SpotifyAuthSystem: missing verifier in localStorage');
    window.location.replace('/');
    return true;
  }

  const clientId = getClientId();
  if (!clientId) {
    console.error('SpotifyAuthSystem: VITE_SPOTIFY_CLIENT_ID not set');
    window.location.replace('/');
    return true;
  }

  try {
    const tokens = await exchangeCodeForToken({
      clientId,
      code,
      redirectUri: getRedirectUri(),
      verifier,
    });

    const auth: SpotifyAuth = {
      access_token: tokens.access_token,
      token_type: tokens.token_type,
      expires_at: Date.now() + tokens.expires_in * 1000,
      scope: tokens.scope,
      refresh_token: tokens.refresh_token,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } catch (err) {
    console.error('SpotifyAuthSystem: token exchange failed', err);
  }

  // Clean up PKCE temporaries
  localStorage.removeItem(SESSION_VERIFIER);
  localStorage.removeItem(SESSION_STATE);

  // Try to close this tab (works when opened via window.open)
  try { window.close(); } catch {}
  // Fallback: if window.close() didn't work, redirect home
  setTimeout(() => window.location.replace('/'), 300);
  return true;
}

/** Check if we have a non-expired Spotify token. */
export function isConnected(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const auth: SpotifyAuth = JSON.parse(raw);
    return auth.expires_at > Date.now();
  } catch {
    return false;
  }
}

/** Get the stored auth data (or null if missing/expired). */
export function getAuth(): SpotifyAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const auth: SpotifyAuth = JSON.parse(raw);
    if (auth.expires_at <= Date.now()) return null;
    return auth;
  } catch {
    return null;
  }
}

/** Get a valid access token string, or null. */
export function getAccessToken(): string | null {
  const auth = getAuth();
  return auth ? auth.access_token : null;
}

/** localStorage key for persisted Spotify user ID. */
const SPOTIFY_USER_ID_KEY = 'spotify_user_id';

/** In-memory cache (populated from localStorage or /v1/me fetch). */
let cachedSpotifyUserId: string | null =
  localStorage.getItem(SPOTIFY_USER_ID_KEY);

/**
 * Get the Spotify user ID for the connected account.
 * Returns from localStorage cache first, falls back to /v1/me fetch.
 * Result is persisted to localStorage so it survives page reloads.
 */
export async function getSpotifyUserId(): Promise<string | null> {
  if (cachedSpotifyUserId) return cachedSpotifyUserId;
  const token = getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const id: string | null = data.id ?? null;
    if (id) {
      cachedSpotifyUserId = id;
      localStorage.setItem(SPOTIFY_USER_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Clear all Spotify auth state (localStorage + in-memory cache). */
export function disconnect(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SESSION_VERIFIER);
  localStorage.removeItem(SESSION_STATE);
  localStorage.removeItem(SPOTIFY_USER_ID_KEY);
  cachedSpotifyUserId = null;
}

/** Check if the connected Spotify account is Premium. Returns false on any error. */
export async function checkPremium(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    // Cache the user ID while we're at it
    if (data.id) {
      cachedSpotifyUserId = data.id;
      localStorage.setItem(SPOTIFY_USER_ID_KEY, data.id);
    }
    return data.product === 'premium';
  } catch {
    return false;
  }
}
