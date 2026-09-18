import { createClient } from "@supabase/supabase-js";

/**
 * Browser/client-side Supabase client, authenticated as the logged-in HR
 * user via the anon key. Row Level Security (org_members) decides what
 * this client can see — see supabase/migrations/0001_init_schema.sql.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey);
}
