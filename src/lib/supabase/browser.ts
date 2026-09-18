import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser/client-side Supabase client, authenticated as the signed-in HR
 * user via the anon key. Row Level Security (org_members) decides what
 * this client can see — see supabase/migrations/0001_init_schema.sql.
 *
 * Uses @supabase/ssr's cookie-based client (not plain createClient) so the
 * session is readable by server components/routes via supabaseSession() in
 * lib/supabase/session.ts — that's what real sign-in requires.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anonKey);
}
