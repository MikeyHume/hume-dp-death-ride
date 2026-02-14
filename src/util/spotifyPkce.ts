/** Spotify Authorization Code + PKCE helpers (no backend, no client secret). */

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** Generate a cryptographically random code verifier (64 chars, base64url-safe). */
export function generateVerifier(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return base64url(array);
}

/** Generate a random state string for CSRF protection. */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64url(array);
}

/** Derive a SHA-256 code challenge from a verifier (base64url-encoded). */
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(new Uint8Array(digest));
}

/** Build the full Spotify /authorize URL. */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  challenge: string;
}): string {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: params.challenge,
    state: params.state,
    scope: params.scope,
  });
  return `${AUTHORIZE_URL}?${qs.toString()}`;
}

/** Exchange an authorization code for tokens via Spotify's token endpoint (PKCE, no secret). */
export async function exchangeCodeForToken(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

// --- Helpers ---

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
