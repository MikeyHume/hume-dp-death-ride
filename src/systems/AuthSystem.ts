import { supabase } from '../supabaseClient';

let cachedAuthUserId: string | null = null;

export async function ensureAnonUser(): Promise<string> {
  // Check for an existing session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    cachedAuthUserId = session.user.id;
    console.log('Existing session found:', session.user.id);
    return session.user.id;
  }

  // No session — sign in anonymously
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Anonymous sign-in failed:', error.message);
    throw error;
  }

  cachedAuthUserId = data.user!.id;
  console.log('Anonymous user created:', data.user!.id);
  return data.user!.id;
}

/** Synchronous getter for the auth user ID (available after ensureAnonUser resolves). */
export function getAuthUserId(): string | null {
  return cachedAuthUserId;
}
