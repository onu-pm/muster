import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { dutyTypeLabel } from "@/lib/duty-labels";

export const dynamic = "force-dynamic";

const DUTY_TYPES = ["payroll_input_pack", "salary_structure_review", "tax_declaration_review", "rules_setup"];
const DUTY_STATES = ["open", "in_progress", "blocked", "closed"];

/**
 * Screen 2 — Work queue. Every duty instance in flight: what stage it's
 * at, who it's about, what it's waiting on, the deadline. Filterable by
 * duty type, state, and date range (plain GET-form query params — no
 * client JS needed, same as the rest of this screen). Reads through the
 * signed-in user's own session, so Row Level Security scopes this to
 * their organisation automatically.
 */
export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: { dutyType?: string; state?: string; from?: string; to?: string };
}) {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  let query = db
    .from("duty_instances")
    .select("id, duty_type, state, opened_at, due_at, org_id")
    .order("opened_at", { ascending: false })
    .limit(50);
  if (searchParams.dutyType) query = query.eq("duty_type", searchParams.dutyType);
  if (searchParams.state) query = query.eq("state", searchParams.state);
  if (searchParams.from) query = query.gte("opened_at", searchParams.from);
  if (searchParams.to) query = query.lte("opened_at", `${searchParams.to}T23:59:59`);

  const { data: duties, error } = await query;
  if (error) {
    return <p className="error-text">Could not load the work queue: {error.message}</p>;
  }

  const dutyIds = (duties ?? []).map((d) => d.id);

  // "Who it's about" — every capability call an agent makes logs personId
  // in its step input when the work is person-specific (see logStep call
  // sites across the agents); rules_setup duties have none, correctly,
  // since a proposed rule isn't about one person.
  const peopleByDuty = new Map<string, Set<string>>();
  if (dutyIds.length > 0) {
    const { data: steps } = await db.from("steps").select("duty_instance_id, input").in("duty_instance_id", dutyIds);
    for (const s of steps ?? []) {
      const personId = (s.input as Record<string, unknown> | null)?.personId;
      if (typeof personId !== "string") continue;
      const set = peopleByDuty.get(s.duty_instance_id as string) ?? new Set<string>();
      set.add(personId);
      peopleByDuty.set(s.duty_instance_id as string, set);
    }
  }
  const allPersonIds = [...new Set([...peopleByDuty.values()].flatMap((s) => [...s]))];
  const nameByPersonId = new Map<string, string>();
  if (allPersonIds.length > 0) {
    const { data: people } = await db.from("people").select("id, full_name").in("id", allPersonIds);
    for (const p of people ?? []) nameByPersonId.set(p.id as string, p.full_name as string);
  }

  // "What it's waiting on" — open exceptions under this duty, the same
  // thing that keeps a duty 'blocked' (every agent's own doc comment: it
  // never auto-closes past a human review).
  const openExceptionsByDuty = new Map<string, number>();
  if (dutyIds.length > 0) {
    const { data: exceptions } = await db
      .from("exceptions")
      .select("duty_instance_id")
      .in("duty_instance_id", dutyIds)
      .eq("status", "open");
    for (const e of exceptions ?? []) {
      const id = e.duty_instance_id as string;
      openExceptionsByDuty.set(id, (openExceptionsByDuty.get(id) ?? 0) + 1);
    }
  }

  function whoItsAbout(dutyId: string, dutyType: string): string {
    const ids = peopleByDuty.get(dutyId);
    if (!ids || ids.size === 0) return dutyType === "rules_setup" ? "Company-wide" : "—";
    if (ids.size === 1) return nameByPersonId.get([...ids][0]) ?? "1 person";
    return `${ids.size} people`;
  }

  function whatItsWaitingOn(dutyId: string, state: string): string {
    const openCount = openExceptionsByDuty.get(dutyId) ?? 0;
    if (openCount > 0) return `${openCount} exception${openCount === 1 ? "" : "s"} on the desk`;
    if (state === "blocked") return "Your direct approval";
    if (state === "closed") return "Nothing — closed";
    return "Still processing";
  }

  return (
    <div>
      <h1>Work queue</h1>

      <form method="GET" className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Duty type
          </div>
          <select name="dutyType" defaultValue={searchParams.dutyType ?? ""} className="field">
            <option value="">All</option>
            {DUTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {dutyTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            State
          </div>
          <select name="state" defaultValue={searchParams.state ?? ""} className="field">
            <option value="">All</option>
            {DUTY_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
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
        {(searchParams.dutyType || searchParams.state || searchParams.from || searchParams.to) && (
          <a className="btn" href="/work-queue">
            Clear
          </a>
        )}
      </form>

      {(!duties || duties.length === 0) && (
        <p className="text-muted" style={{ marginTop: 16 }}>
          Nothing matches those filters.
        </p>
      )}
      {duties && duties.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Duty</th>
              <th>Who it's about</th>
              <th>State</th>
              <th>What it's waiting on</th>
              <th>Opened</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {duties.map((d) => (
              <tr key={d.id}>
                <td>{dutyTypeLabel(d.duty_type)}</td>
                <td>{whoItsAbout(d.id, d.duty_type)}</td>
                <td>{d.state}</td>
                <td>{whatItsWaitingOn(d.id, d.state)}</td>
                <td>{new Date(d.opened_at).toLocaleString()}</td>
                <td>{d.due_at ? new Date(d.due_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
