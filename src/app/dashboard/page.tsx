import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { EnableTeamButton } from "./enable-team-button";

export const dynamic = "force-dynamic";

/**
 * Screen 1 — Dashboard. The team picker: every AI team on the platform,
 * which ones this org has turned on, and a way into the ones that are
 * enabled. Payroll & Compliance is the only 'available' team right now —
 * everything else in `teams` is a real future row, not a placeholder.
 */
export default async function DashboardPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);

  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: teams, error: teamsError } = await db
    .from("teams")
    .select("id, key, name, description, status")
    .order("name");

  const { data: enablement } = await db.from("org_teams").select("team_id, enabled").eq("org_id", org!.orgId);

  const enabledTeamIds = new Set((enablement ?? []).filter((e) => e.enabled).map((e) => e.team_id));

  if (teamsError) {
    return <p className="error-text">Could not load the team catalog: {teamsError.message}</p>;
  }

  return (
    <div>
      <h1>{org!.orgName}</h1>
      <p className="text-muted">Choose a team to enable or enter.</p>
      <div className="card-list">
        {teams?.map((team) => {
          const enabled = enabledTeamIds.has(team.id);
          const comingSoon = team.status === "coming_soon";
          return (
            <div key={team.id} className={`card${comingSoon ? " card-muted" : ""}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{team.name}</strong>
                {comingSoon && <span className="tag">Coming soon</span>}
              </div>
              <p style={{ margin: "8px 0" }} className={comingSoon ? "" : "text-muted"}>
                {team.description}
              </p>
              {!comingSoon &&
                (enabled ? <a href="/work-queue">Enter workspace →</a> : <EnableTeamButton teamKey={team.key} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
