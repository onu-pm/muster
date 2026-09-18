import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dutyTypeLabel } from "@/lib/duty-labels";
import { ExportCsvButton } from "./export-csv-button";

export const dynamic = "force-dynamic";

interface HistoryEvent {
  at: string;
  personId: string | null;
  personName: string | null;
  dutyType: string;
  kind: "step" | "decision";
  label: string; // what was done
  ruleApplied: string | null;
  outcome: string;
  approver: string | null; // only for decisions
}

/**
 * Screen 6 — History. Every step an agent took and every decision a human
 * made, in one chronological list — "show me everything that happened for
 * this employee in September" answerable from this screen alone, per the
 * spec. Read-only.
 *
 * Steps and decisions are different granularity (many steps per duty, one
 * decision per exception) with no single table to select from, so this
 * fetches each org-scoped set separately (via the org's own duty_instance
 * ids — avoids a fragile multi-level embedded-filter query) and merges
 * them client-side by timestamp, rather than trying to force one query to
 * do both jobs.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { personId?: string; from?: string; to?: string };
}) {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: people } = await db.from("people").select("id, full_name").order("full_name");
  const nameByPersonId = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  const { data: duties } = await db.from("duty_instances").select("id, duty_type").limit(500);
  const dutyIds = (duties ?? []).map((d) => d.id as string);
  const dutyTypeById = new Map((duties ?? []).map((d) => [d.id as string, d.duty_type as string]));

  const events: HistoryEvent[] = [];

  if (dutyIds.length > 0) {
    let stepsQuery = db
      .from("steps")
      .select("id, capability, input, output, at, duty_instance_id")
      .in("duty_instance_id", dutyIds)
      .order("at", { ascending: false })
      .limit(300);
    if (searchParams.from) stepsQuery = stepsQuery.gte("at", searchParams.from);
    if (searchParams.to) stepsQuery = stepsQuery.lte("at", `${searchParams.to}T23:59:59`);
    const { data: steps } = await stepsQuery;

    for (const s of steps ?? []) {
      const input = (s.input as Record<string, unknown>) ?? {};
      const output = (s.output as Record<string, unknown>) ?? {};
      const personId = typeof input.personId === "string" ? input.personId : null;
      events.push({
        at: s.at as string,
        personId,
        personName: personId ? nameByPersonId.get(personId) ?? null : null,
        dutyType: dutyTypeById.get(s.duty_instance_id as string) ?? "",
        kind: "step",
        label: `${s.capability} — ${dutyTypeLabel(dutyTypeById.get(s.duty_instance_id as string) ?? "")}`,
        ruleApplied: typeof input.ruleApplied === "string" ? input.ruleApplied : null,
        outcome: summarizeOutput(output),
        approver: null,
      });
    }

    const { data: exceptions } = await db
      .from("exceptions")
      .select("id, kind, payload, duty_instance_id")
      .in("duty_instance_id", dutyIds);
    const exceptionById = new Map((exceptions ?? []).map((e) => [e.id as string, e]));
    const exceptionIds = (exceptions ?? []).map((e) => e.id as string);

    if (exceptionIds.length > 0) {
      let decisionsQuery = db
        .from("decisions")
        .select("id, outcome, correction_note, human_user_id, at, exception_id")
        .in("exception_id", exceptionIds)
        .order("at", { ascending: false })
        .limit(300);
      if (searchParams.from) decisionsQuery = decisionsQuery.gte("at", searchParams.from);
      if (searchParams.to) decisionsQuery = decisionsQuery.lte("at", `${searchParams.to}T23:59:59`);
      const { data: decisions } = await decisionsQuery;

      // Approver emails: not a table join — auth.users isn't reachable
      // through RLS-scoped org tables, only the admin API can resolve a
      // user id to an email. One lookup per unique decider, not per row.
      const uniqueUserIds = [...new Set((decisions ?? []).map((d) => d.human_user_id as string).filter(Boolean))];
      const emailByUserId = new Map<string, string>();
      if (uniqueUserIds.length > 0) {
        const admin = supabaseAdmin();
        for (const userId of uniqueUserIds) {
          const { data } = await admin.auth.admin.getUserById(userId);
          if (data.user?.email) emailByUserId.set(userId, data.user.email);
        }
      }

      for (const d of decisions ?? []) {
        const exception = exceptionById.get(d.exception_id as string);
        const payload = (exception?.payload as Record<string, unknown>) ?? {};
        const personId = typeof payload.personId === "string" ? payload.personId : null;
        events.push({
          at: d.at as string,
          personId,
          personName: personId ? nameByPersonId.get(personId) ?? (payload.personName as string) ?? null : null,
          dutyType: dutyTypeById.get(exception?.duty_instance_id as string) ?? "",
          kind: "decision",
          label: `Decision on ${exception?.kind ?? "exception"}`,
          ruleApplied: typeof payload.ruleApplied === "string" ? payload.ruleApplied : null,
          outcome: d.outcome as string,
          approver: d.human_user_id ? emailByUserId.get(d.human_user_id as string) ?? "Another team member" : null,
        });
      }
    }
  }

  const filtered = events
    .filter((e) => !searchParams.personId || e.personId === searchParams.personId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div>
      <h1>History</h1>
      <p className="text-muted">Every step an agent took and every decision a human made — read-only.</p>

      <form method="GET" className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Person
          </div>
          <select name="personId" defaultValue={searchParams.personId ?? ""} className="field">
            <option value="">Everyone</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            From
          </div>
          <input type="date" name="from" defaultValue={searchParams.from ?? ""} className="field" />
        </label>
        <label>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            To
          </div>
          <input type="date" name="to" defaultValue={searchParams.to ?? ""} className="field" />
        </label>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        {(searchParams.personId || searchParams.from || searchParams.to) && (
          <a className="btn" href="/history">
            Clear
          </a>
        )}
        <ExportCsvButton events={filtered} />
      </form>

      {filtered.length === 0 && (
        <p className="text-muted" style={{ marginTop: 16 }}>
          Nothing matches those filters.
        </p>
      )}
      {filtered.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What was done</th>
              <th>Rule applied</th>
              <th>Outcome</th>
              <th>Approver</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td>{e.personName ?? "—"}</td>
                <td>{e.label}</td>
                <td>{e.ruleApplied ?? "—"}</td>
                <td>{e.outcome}</td>
                <td>{e.approver ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function summarizeOutput(output: Record<string, unknown>): string {
  const parts = Object.entries(output)
    .filter(([, v]) => typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.slice(0, 3).join(", ") || "—";
}
