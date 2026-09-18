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
    return <p style={{ color: "crimson" }}>Could not load the team catalog: {teamsError.message}</p>;
  }

  return (
    <div>
      <h1>{org!.orgName}</h1>
      <p style={{ color: "#666" }}>Choose a team to enable or enter.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {teams?.map((team) => {
          const enabled = enabledTeamIds.has(team.id);
          const comingSoon = team.status === "coming_soon";
          return (
            <div
              key={team.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 16,
                background: comingSoon ? "#f2f2f3" : "#fff",
                opacity: comingSoon ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{team.name}</strong>
                {comingSoon && <span style={{ fontSize: 12, color: "#888" }}>COMING SOON</span>}
              </div>
              <p style={{ margin: "8px 0", color: "#555" }}>{team.description}</p>
              {!comingSoon &&
                (enabled ? (
                  <a href="/work-queue">Enter workspace →</a>
                ) : (
                  <EnableTeamButton teamKey={team.key} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
