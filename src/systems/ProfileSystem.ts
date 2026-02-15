/**
 * Supabase profile persistence keyed by Spotify user ID.
 *
 * Two modes:
 *   1) Not connected to Spotify → pure local (no DB calls).
 *   2) Spotify connected        → reads/writes `profiles` table via spotify_user_id.
 *
 * Table schema (already exists — do NOT modify):
 *   profiles (
 *     user_id              uuid PRIMARY KEY,
 *     username             text,
 *     avatar_url           text,
 *     spotify_connected    boolean,
 *     spotify_user_id      text UNIQUE,
 *     spotify_display_name text,
 *     updated_at           timestamptz
 *   )
 *
 * user_id is a deterministic UUID v5 computed from spotify_user_id,
 * so the same Spotify account always maps to the same row on every device.
 *
 * No Supabase Auth is used. Identity is purely spotify_user_id.
 * Storage bucket "avatars" — public.
 */

import { supabase } from '../supabaseClient';
import { isConnected, getSpotifyUserId } from './SpotifyAuthSystem';
import { uuidV5 } from '../util/uuid5';

const NAME_MAX_LENGTH = 10;

export interface Profile {
  spotify_user_id: string;
  username: string;
  avatar_url: string | null;
}

/** Cached Spotify ID for the current session. */
let linkedSpotifyId: string | null = null;

/** Returns the linked Spotify ID if profile was loaded via Spotify path. */
export function getLinkedSpotifyId(): string | null {
  return linkedSpotifyId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load existing profile or create/upsert a default one.
 * If Spotify is connected → upsert into profiles, then load username + avatar_url.
 * Otherwise → return local-only defaults (no DB).
 */
export async function loadOrCreateProfile(): Promise<Profile> {
  if (!isConnected()) {
    linkedSpotifyId = null;
    return { spotify_user_id: '', username: 'ANON', avatar_url: null };
  }

  const spotifyId = await getSpotifyUserId();
  if (!spotifyId || typeof spotifyId !== 'string') {
    linkedSpotifyId = null;
    console.warn('ProfileSystem: no spotify user id, using local defaults');
    return { spotify_user_id: '', username: 'ANON', avatar_url: null };
  }

  linkedSpotifyId = spotifyId;

  // Deterministic UUID from spotify_user_id — same on every device.
  const userId = await uuidV5(spotifyId);

  // Upsert — creates the row if it doesn't exist, no-ops if it does.
  // Only sets spotify_connected; never overwrites existing username/avatar_url.
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, spotify_user_id: spotifyId, spotify_connected: true },
      { onConflict: 'spotify_user_id' }
    );
  if (upsertErr) {
    console.warn('ProfileSystem: upsert failed', upsertErr);
  }

  // Load the full row (maybeSingle — 0 rows is valid on first login if upsert failed)
  const { data, error } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('spotify_user_id', spotifyId)
    .maybeSingle();

  if (error) {
    console.warn('ProfileSystem: failed to load profile', error);
    return { spotify_user_id: spotifyId, username: 'ANON', avatar_url: null };
  }

  // avatar_url stores a storage path — resolve to a public URL with cache-bust
  let avatarPublicUrl: string | null = null;
  if (data?.avatar_url) {
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.avatar_url);
    avatarPublicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
  }

  return {
    spotify_user_id: spotifyId,
    username: data?.username || 'ANON',
    avatar_url: avatarPublicUrl,
  };
}

/** Sanitize + persist username. Only writes to DB when Spotify-connected. */
export async function updateUsername(nameRaw: string): Promise<string> {
  let name = nameRaw.trim().toUpperCase().slice(0, NAME_MAX_LENGTH);
  if (name === '') name = 'ANON';

  if (linkedSpotifyId) {
    const { error } = await supabase
      .from('profiles')
      .update({ username: name })
      .eq('spotify_user_id', linkedSpotifyId);
    if (error) console.warn('ProfileSystem: failed to update username', error);
  }

  return name;
}

/**
 * Upload avatar file to Supabase Storage and save the storage path.
 * Only works when Spotify-connected (returns null otherwise).
 * Stores the path (not public URL) in profiles.avatar_url.
 * Returns the resolved public URL for immediate display.
 */
export async function uploadAvatarAndSave(file: File): Promise<string | null> {
  if (!linkedSpotifyId) return null;

  const path = `${linkedSpotifyId}/avatar.png`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw uploadErr;

  // Store the storage path (not the full public URL)
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: path })
    .eq('spotify_user_id', linkedSpotifyId);
  if (updateErr) throw updateErr;

  // Return a public URL with cache-bust for immediate display
  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}
