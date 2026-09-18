import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { isTeamEnabled, PAYROLL_TEAM_KEY } from "@/lib/teams";
import { describeDuty, currentCycleLabel } from "@/lib/duty-labels";
import { RunCycle } from "./run-cycle";

export const dynamic = "force-dynamic";

/**
 * Screen 1 — Team. Holly's home: what she owns in one line, what she's
 * working on right now, what she's handled this month, and one button to
 * run a cycle. This is the default landing page once a team is enabled
 * (see page.tsx's redirect logic) — someone who's never seen the
 * architecture doc should understand what they're looking at here within
 * five seconds.
 */
export default async function TeamPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const enabled = await isTeamEnabled(db, org!.orgId, PAYROLL_TEAM_KEY);
  if (!enabled) {
    redirect("/dashboard");
  }

  const { data: activeDuties } = await db
    .from("duty_instances")
    .select("id, duty_type, state, opened_at")
    .eq("org_id", org!.orgId)
    .neq("state", "closed")
    .order("opened_at", { ascending: false })
    .limit(10);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfMonthIso = startOfMonth.toISOString();

  const { count: cyclesRun } = await db
    .from("duty_instances")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org!.orgId)
    .gte("opened_at", startOfMonthIso);

  const { count: exceptionsResolved } = await db
    .from("exceptions")
    .select("id, duty_instances!inner(org_id)", { count: "exact", head: true })
    .eq("duty_instances.org_id", org!.orgId)
    .eq("status", "resolved")
    .gte("resolved_at", startOfMonthIso);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Holly</h1>
        <p className="text-muted" style={{ margin: 0 }}>
          Runs Payroll &amp; Compliance — reconciles attendance, keeps salary structures and tax declarations
          statutory-compliant, and puts anything she's not certain about on your exception desk.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="tag">This month</div>
          <p style={{ margin: "8px 0 0", fontSize: 28, fontFamily: "var(--font-display)" }}>{cyclesRun ?? 0}</p>
          <p className="text-muted" style={{ margin: 0 }}>
            cycles run
          </p>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="tag">This month</div>
          <p style={{ margin: "8px 0 0", fontSize: 28, fontFamily: "var(--font-display)" }}>
            {exceptionsResolved ?? 0}
          </p>
          <p className="text-muted" style={{ margin: 0 }}>
            exceptions resolved
          </p>
        </div>
      </div>

      <h2>Working on right now</h2>
      {(!activeDuties || activeDuties.length === 0) && (
        <p className="text-muted">Nothing in flight. Run a cycle below to get started.</p>
      )}
      <div className="card-list" style={{ marginBottom: 24 }}>
        {activeDuties?.map((d) => (
          <div key={d.id} className="card">
            {describeDuty({ dutyType: d.duty_type, state: d.state, openedAt: d.opened_at })}
          </div>
        ))}
      </div>

      <RunCycle orgId={org!.orgId} cycleLabel={currentCycleLabel()} />
    </div>
  );
}
