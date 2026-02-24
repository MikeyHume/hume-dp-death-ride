import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _instance: SupabaseClient | null = null;

/** Lazy-initialized Supabase client.
 *  Defers createClient() until first property access, avoiding TDZ errors
 *  when this module is in a dynamically-imported chunk. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_instance) {
      const url = import.meta.env.VITE_SUPABASE_URL as string;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      _instance = createClient(url, key);
    }
    const value = Reflect.get(_instance, prop, receiver);
    return typeof value === 'function' ? value.bind(_instance) : value;
  },
});
