import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/**
 * Screen 5 — Org Brain, read-only. What Holly currently believes about
 * this company: Structure (entities/locations), Rules (statutory +
 * confirmed policy — unconfirmed candidates live on the exception desk,
 * not here), Calendar (deadlines), Learned Facts, each with its own
 * evidence. Editing is the spec's stated end state but a separate,
 * later piece of work — a trustworthy read view has to exist first.
 */
export default async function OrgBrainPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: entities } = await db
    .from("entities")
    .select("id, legal_name, pan, tan, pf_code, esi_code, locations(id, address, state, pt_applicable, esi_applicable)")
    .order("legal_name");

  const { data: rules } = await db
    .from("rules")
    .select("id, label, scope, jurisdiction, rule_key, definition, source, effective_from, effective_to")
    .eq("confirmed", true)
    .order("effective_from", { ascending: false });

  const { data: deadlines } = await db
    .from("deadlines")
    .select("id, date, recurrence, owner, status")
    .order("date");

  const { data: facts } = await db
    .from("facts")
    .select("id, statement, evidence, created_at")
    .eq("confirmed", true)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>Org Brain</h1>
      <p className="text-muted">
        Everything Holly currently believes about this company — read-only for now. Structure, Rules, Calendar and
        Learned Facts, each sourced straight from what's confirmed.
      </p>

      <h2>Structure</h2>
      {(!entities || entities.length === 0) && <p className="text-muted">No entities on file yet.</p>}
      <div className="card-list">
        {entities?.map((e: any) => (
          <div key={e.id} className="card">
            <strong>{e.legal_name}</strong>
            <p className="text-muted" style={{ fontSize: 13, margin: "4px 0" }}>
              PAN: {e.pan ?? "—"} · TAN: {e.tan ?? "—"} · PF code: {e.pf_code ?? "—"} · ESI code: {e.esi_code ?? "—"}
            </p>
            {e.locations?.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {e.locations.map((l: any) => (
                  <li key={l.id} className="text-muted" style={{ fontSize: 13 }}>
                    {l.state}
                    {l.address ? ` — ${l.address}` : ""} (PT {l.pt_applicable ? "applicable" : "not applicable"}, ESI{" "}
                    {l.esi_applicable ? "applicable" : "not applicable"})
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Rules</h2>
      <p className="text-muted" style={{ fontSize: 13 }}>
        Confirmed only — a candidate a human hasn't reviewed yet lives on the exception desk, not here.
      </p>
      {(!rules || rules.length === 0) && <p className="text-muted">No confirmed rules yet.</p>}
      <div className="card-list">
        {rules?.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{r.label ?? "Untitled rule"}</strong>
              <span className="tag">
                {r.scope} · {r.jurisdiction}
              </span>
            </div>
            {r.rule_key && (
              <p className="text-muted" style={{ fontSize: 13, margin: "4px 0" }}>
                Applies to: {r.rule_key === "wage_definition" ? "Structure's wage test" : "Tax's proof caps"}
              </p>
            )}
            <p className="text-muted" style={{ fontSize: 13, margin: "4px 0" }}>
              Evidence: {r.source}
            </p>
            <p className="text-muted" style={{ fontSize: 13, margin: "4px 0" }}>
              {JSON.stringify(r.definition)}
            </p>
            <p className="text-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              Effective {r.effective_from}
              {r.effective_to ? ` – ${r.effective_to}` : " (open-ended)"}
            </p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Calendar</h2>
      {(!deadlines || deadlines.length === 0) && <p className="text-muted">No deadlines on file yet.</p>}
      <div className="card-list">
        {deadlines?.map((d) => (
          <div key={d.id} className="card">
            <strong>{d.date}</strong>
            <span className="tag" style={{ marginLeft: 8 }}>
              {d.status}
            </span>
            <p className="text-muted" style={{ fontSize: 13, margin: "4px 0" }}>
              {d.recurrence ? `Recurs ${d.recurrence}` : "One-off"} · Owner: {d.owner ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Learned Facts</h2>
      {(!facts || facts.length === 0) && <p className="text-muted">No confirmed facts yet.</p>}
      <div className="card-list">
        {facts?.map((f) => (
          <div key={f.id} className="card">
            <p style={{ margin: 0 }}>{f.statement}</p>
            <p className="text-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
              Evidence: {JSON.stringify(f.evidence)}
            </p>
            <p className="text-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
              Learned {new Date(f.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
