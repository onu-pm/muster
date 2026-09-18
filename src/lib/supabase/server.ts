import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, authenticated with the service_role key.
 * This bypasses Row Level Security — it is how the agents read and write
 * the Brain. Never import this file from a client component, and never
 * ship SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in .env.local (see .env.example)."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js's fetch Data Cache otherwise intercepts these requests even on
    // routes marked `force-dynamic` — the Brain must always be read live.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
