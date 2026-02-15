/**
 * Supabase profile persistence with cross-device sync via Spotify ID.
 *
 * Two paths:
 *   1) Anon (no Spotify): reads/writes the per-device `profiles` table (existing).
 *   2) Spotify connected: reads/writes `spotify_profiles` table keyed by Spotify user ID.
 *      This allows the same profile to load on any device where the user connects Spotify.
 *
 * Prerequisites (create manually in Supabase dashboard):
 *   TABLE profiles (
 *     user_id    uuid PRIMARY KEY REFERENCES auth.users(id),
 *     username   text NOT NULL DEFAULT 'ANON',
 *     avatar_url text,
 *     updated_at timestamptz DEFAULT now()
 *   );
 *   TABLE spotify_profiles (
 *     spotify_id   text PRIMARY KEY,
 *     display_name text NOT NULL DEFAULT 'ANON',
 *     avatar_url   text,
 *     updated_at   timestamptz NOT NULL DEFAULT now()
 *   );
 *   RLS on profiles: auth.uid() = user_id
 *   RLS on spotify_profiles: permissive for all authenticated users
 *   STORAGE bucket "avatars" — public, with INSERT/UPDATE policy for authenticated users.
 */

import { supabase } from '../supabaseClient';
import { ensureAnonUser } from './AuthSystem';
import { isConnected, getSpotifyUserId } from './SpotifyAuthSystem';

const NAME_MAX_LENGTH = 10;

export interface Profile {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

/** Cached Spotify ID for the current session, set during loadOrCreateProfile. */
let linkedSpotifyId: string | null = null;

/** Returns the linked Spotify ID if profile was loaded via Spotify path. */
export function getLinkedSpotifyId(): string | null {
  return linkedSpotifyId;
}

// ---------------------------------------------------------------------------
// Spotify profile helpers (spotify_profiles table)
// ---------------------------------------------------------------------------

async function loadOrCreateSpotifyProfile(spotifyId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('spotify_profiles')
    .select('spotify_id, display_name, avatar_url')
    .eq('spotify_id', spotifyId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return {
      user_id: data.spotify_id,
      username: data.display_name,
      avatar_url: data.avatar_url,
    };
  }

  // First time connecting Spotify — create row
  const { error: insertErr } = await supabase
    .from('spotify_profiles')
    .insert({ spotify_id: spotifyId, display_name: 'ANON', avatar_url: null });
  if (insertErr) throw insertErr;

  return { user_id: spotifyId, username: 'ANON', avatar_url: null };
}

async function updateSpotifyUsername(spotifyId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('spotify_profiles')
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq('spotify_id', spotifyId);
  if (error) throw error;
}

async function uploadSpotifyAvatar(spotifyId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `spotify_${spotifyId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: updateErr } = await supabase
    .from('spotify_profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('spotify_id', spotifyId);
  if (updateErr) throw updateErr;

  return publicUrl;
}

// ---------------------------------------------------------------------------
// Public API (routes to the correct table based on Spotify connection)
// ---------------------------------------------------------------------------

/** Load existing profile or create a default one.
 *  If Spotify is connected, uses spotify_profiles (cross-device).
 *  Otherwise uses per-device profiles table. */
export async function loadOrCreateProfile(): Promise<Profile> {
  // --- Spotify path ---
  if (isConnected()) {
    const spotifyId = await getSpotifyUserId();
    if (spotifyId) {
      linkedSpotifyId = spotifyId;
      const spotifyProfile = await loadOrCreateSpotifyProfile(spotifyId);

      // Merge local data UP if spotify profile is still default
      if (spotifyProfile.username === 'ANON' && !spotifyProfile.avatar_url) {
        try {
          const localProfile = await loadAnonProfile();
          if (localProfile && (localProfile.username !== 'ANON' || localProfile.avatar_url)) {
            // Push local name/avatar up to spotify_profiles
            if (localProfile.username !== 'ANON') {
              await updateSpotifyUsername(spotifyId, localProfile.username);
              spotifyProfile.username = localProfile.username;
            }
            if (localProfile.avatar_url) {
              await supabase
                .from('spotify_profiles')
                .update({ avatar_url: localProfile.avatar_url, updated_at: new Date().toISOString() })
                .eq('spotify_id', spotifyId);
              spotifyProfile.avatar_url = localProfile.avatar_url;
            }
          }
        } catch {
          // Merge failed — not critical, spotify profile is still valid
        }
      }

      return spotifyProfile;
    }
  }

  // --- Anon path (existing behavior) ---
  linkedSpotifyId = null;
  const userId = await ensureAnonUser();

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) return data as Profile;

  // First visit — insert default row
  const newProfile: Profile = { user_id: userId, username: 'ANON', avatar_url: null };
  const { error: insertErr } = await supabase.from('profiles').insert(newProfile);
  if (insertErr) throw insertErr;

  return newProfile;
}

/** Load anon profile without creating one (used for merge). */
async function loadAnonProfile(): Promise<Profile | null> {
  const userId = await ensureAnonUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

/** Sanitize + persist username. Routes to correct table. Returns the final saved value. */
export async function updateUsername(nameRaw: string): Promise<string> {
  let name = nameRaw.trim().toUpperCase().slice(0, NAME_MAX_LENGTH);
  if (name === '') name = 'ANON';

  if (linkedSpotifyId) {
    await updateSpotifyUsername(linkedSpotifyId, name);
    return name;
  }

  const userId = await ensureAnonUser();
  const { error } = await supabase
    .from('profiles')
    .update({ username: name, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw error;
  return name;
}

/** Upload avatar file to Supabase Storage and save the public URL. Routes to correct table. */
export async function uploadAvatarAndSave(file: File): Promise<string> {
  if (linkedSpotifyId) {
    return uploadSpotifyAvatar(linkedSpotifyId, file);
  }

  const userId = await ensureAnonUser();

  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (updateErr) throw updateErr;

  return publicUrl;
}
