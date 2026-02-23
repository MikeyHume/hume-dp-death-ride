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
  // crypto.subtle is only available in secure contexts (HTTPS, localhost, 127.0.0.1).
  // On LAN IPs like http://192.168.x.x it's undefined — use pure-JS SHA-256 fallback.
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return base64url(new Uint8Array(digest));
  }
  return base64url(sha256Sync(encoded));
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

// --- Pure-JS SHA-256 fallback (for non-secure contexts where crypto.subtle is unavailable) ---

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Sync(data: Uint8Array): Uint8Array {
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = (55 - msgLen % 64 + 64) % 64;
  const totalLen = msgLen + 1 + padLen + 8;
  const msg = new Uint8Array(totalLen);
  msg.set(data);
  msg[msgLen] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(totalLen - 4, bitLen, false);

  let h0 = 0x6a09e667 | 0, h1 = 0xbb67ae85 | 0, h2 = 0x3c6ef372 | 0, h3 = 0xa54ff53a | 0;
  let h4 = 0x510e527f | 0, h5 = 0x9b05688c | 0, h6 = 0x1f83d9ab | 0, h7 = 0x5be0cd19 | 0;
  const w = new Int32Array(64);

  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0, false); ov.setUint32(4, h1, false);
  ov.setUint32(8, h2, false); ov.setUint32(12, h3, false);
  ov.setUint32(16, h4, false); ov.setUint32(20, h5, false);
  ov.setUint32(24, h6, false); ov.setUint32(28, h7, false);
  return out;
}
