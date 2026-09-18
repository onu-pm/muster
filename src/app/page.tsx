import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { isTeamEnabled, PAYROLL_TEAM_KEY } from "@/lib/teams";

/**
 * The default landing page: signed out -> sign in; signed in with no org
 * yet -> onboarding; signed in with Payroll & Compliance enabled ->
 * Holly's Team screen; otherwise -> the team picker to enable one.
 */
export default async function Home() {
  const db = await supabaseSession();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in");

  const org = await currentOrg(db);
  if (!org) redirect("/onboarding");

  const enabled = await isTeamEnabled(db, org.orgId, PAYROLL_TEAM_KEY);
  redirect(enabled ? "/team" : "/dashboard");
}
