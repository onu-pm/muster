import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server Component / Route Handler client bound to the request's cookies —
 * reads the signed-in user's own session, so queries made through it
 * respect Row Level Security (unlike supabaseAdmin, which bypasses it).
 * This is what every page that shows a specific org's data should read
 * through, now that sign-in is real.
 */
export async function supabaseSession() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — middleware already
          // refreshes the session cookie, so this is safe to ignore.
        }
      },
    },
  });
}

export interface CurrentOrg {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
}

/**
 * The signed-in user's organisation — the one thing almost every protected
 * page needs before it can query anything else. Null means: no session, or
 * a session with no org yet (send them to /sign-in or /onboarding).
 */
export async function currentOrg(db: SupabaseClient): Promise<CurrentOrg | null> {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: membership } = await db
    .from("org_members")
    .select("org_id, organisations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const org = membership.organisations as unknown as { name: string } | null;

  return {
    userId: user.id,
    email: user.email ?? null,
    orgId: membership.org_id as string,
    orgName: org?.name ?? "",
  };
}
