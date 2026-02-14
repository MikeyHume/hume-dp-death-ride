import { supabase } from '../supabaseClient';

export async function ensureAnonUser(): Promise<string> {
  // Check for an existing session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log('Existing session found:', session.user.id);
    return session.user.id;
  }

  // No session — sign in anonymously
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Anonymous sign-in failed:', error.message);
    throw error;
  }

  console.log('Anonymous user created:', data.user!.id);
  return data.user!.id;
}
