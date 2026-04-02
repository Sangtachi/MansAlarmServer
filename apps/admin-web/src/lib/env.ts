export const adminEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
};

export function hasSupabaseEnv() {
  return Boolean(adminEnv.supabaseUrl && adminEnv.supabaseAnonKey);
}
