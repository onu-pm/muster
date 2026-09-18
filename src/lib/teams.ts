import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYROLL_TEAM_KEY = "payroll_compliance";

/** Whether an org has a given team (by key) turned on — see org_teams. */
export async function isTeamEnabled(db: SupabaseClient, orgId: string, teamKey: string): Promise<boolean> {
  const { data: team } = await db.from("teams").select("id").eq("key", teamKey).maybeSingle();
  if (!team) return false;

  const { data: enablement } = await db
    .from("org_teams")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("team_id", team.id)
    .maybeSingle();

  return !!enablement?.enabled;
}
