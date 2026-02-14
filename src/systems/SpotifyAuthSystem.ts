/**
 * Spotify Authorization Code + PKCE flow (no backend, no client secret).
 *
 * Prerequisites:
 *   1) Create a Spotify Developer App at https://developer.spotify.com/dashboard
 *   2) Add redirect URI: https://<your-netlify-site>.netlify.app/callback
 *   3) Set env var VITE_SPOTIFY_CLIENT_ID in Netlify
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
const SCOPE = 'user-read-email user-read-private';

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

/** Kick off the Spotify PKCE login flow (navigates away from the page). */
export async function startLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) {
    console.warn('SpotifyAuthSystem: VITE_SPOTIFY_CLIENT_ID not set, cannot login');
    return;
  }

  const verifier = generateVerifier();
  const state = generateState();
  const challenge = await challengeFromVerifier(verifier);

  sessionStorage.setItem(SESSION_VERIFIER, verifier);
  sessionStorage.setItem(SESSION_STATE, state);

  const url = buildAuthorizeUrl({
    clientId,
    redirectUri: getRedirectUri(),
    scope: SCOPE,
    state,
    challenge,
  });

  window.location.href = url;
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

  const savedState = sessionStorage.getItem(SESSION_STATE);
  if (state !== savedState) {
    console.error('SpotifyAuthSystem: state mismatch (possible CSRF)');
    window.location.replace('/');
    return true;
  }

  const verifier = sessionStorage.getItem(SESSION_VERIFIER);
  if (!verifier) {
    console.error('SpotifyAuthSystem: missing verifier in sessionStorage');
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

  // Clean up session
  sessionStorage.removeItem(SESSION_VERIFIER);
  sessionStorage.removeItem(SESSION_STATE);

  window.location.replace('/');
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
