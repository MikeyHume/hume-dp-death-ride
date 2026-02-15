/**
 * Deterministic UUID v5 (SHA-1 based, RFC 4122).
 *
 * Given the same namespace + name, produces the identical UUID on every
 * device / browser — no server round-trip needed.
 *
 * We use a custom namespace UUID specific to this app so that
 * spotify_user_id "abc123" always maps to the same profiles.user_id.
 */

// App-specific namespace (generated once, never changes).
// Any valid UUID works; this one is unique to dp_moto.
const APP_NAMESPACE = 'f47ac10b-58cc-4372-a567-0d02b2c3d479';

/** Parse a UUID string into 16 bytes. */
function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Format 16 bytes as a UUID string. */
function formatUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Compute a UUID v5 from a name string using the app namespace.
 * Uses the Web Crypto API (SubtleCrypto.digest) for SHA-1.
 */
export async function uuidV5(name: string): Promise<string> {
  const namespaceBytes = parseUuid(APP_NAMESPACE);
  const nameBytes = new TextEncoder().encode(name);

  // Concatenate namespace + name
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes, 0);
  data.set(nameBytes, namespaceBytes.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hash = new Uint8Array(hashBuffer);

  // Take first 16 bytes of SHA-1 hash and set version + variant bits
  const uuid = new Uint8Array(16);
  uuid.set(hash.subarray(0, 16));

  // Version 5 (0101xxxx in byte 6)
  uuid[6] = (uuid[6] & 0x0f) | 0x50;
  // Variant 10xxxxxx in byte 8
  uuid[8] = (uuid[8] & 0x3f) | 0x80;

  return formatUuid(uuid);
}
