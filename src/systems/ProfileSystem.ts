/**
 * Supabase profile persistence.
 *
 * Prerequisites (create manually in Supabase dashboard):
 *   TABLE profiles (
 *     user_id    uuid PRIMARY KEY REFERENCES auth.users(id),
 *     username   text NOT NULL DEFAULT 'ANON',
 *     avatar_url text,
 *     updated_at timestamptz DEFAULT now()
 *   );
 *   RLS: enable on profiles, allow users to SELECT/INSERT/UPDATE their own row
 *        (e.g. auth.uid() = user_id).
 *   STORAGE bucket "avatars" — public, with INSERT/UPDATE policy for authenticated users.
 */

import { supabase } from '../supabaseClient';
import { ensureAnonUser } from './AuthSystem';

const NAME_MAX_LENGTH = 10;

export interface Profile {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

/** Load existing profile or create a default one. */
export async function loadOrCreateProfile(): Promise<Profile> {
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

/** Sanitize + persist username. Returns the final saved value. */
export async function updateUsername(nameRaw: string): Promise<string> {
  const userId = await ensureAnonUser();

  let name = nameRaw.trim().toUpperCase().slice(0, NAME_MAX_LENGTH);
  if (name === '') name = 'ANON';

  const { error } = await supabase
    .from('profiles')
    .update({ username: name, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw error;
  return name;
}

/** Upload avatar file to Supabase Storage and save the public URL to the profile. */
export async function uploadAvatarAndSave(file: File): Promise<string> {
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
