import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { DecideButtons } from "./decide-buttons";

export const dynamic = "force-dynamic";

/**
 * Screen 3 — Exception desk. The most important screen in the product.
 * Everything needing a human decision: what the agent concluded, its
 * confidence, and one action that both resolves the exception and writes
 * a Fact when the human corrects it — the correction loop, made real.
 *
 * Reads through the signed-in user's own session (not supabaseAdmin), so
 * Row Level Security scopes this to their organisation automatically.
 */
export default async function ExceptionDeskPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: exceptions, error } = await db
    .from("exceptions")
    .select(
      "id, kind, conclusion, confidence, status, opened_at, payload, duty_instance_id, duty_instances(org_id, duty_type)"
    )
    .eq("status", "open")
    .order("opened_at", { ascending: true })
    .limit(50);

  if (error) {
    return <p className="error-text">Could not load the exception desk: {error.message}</p>;
  }

  return (
    <div>
      <h1>Exception desk</h1>
      {(!exceptions || exceptions.length === 0) && <p className="text-muted">Clear. Nothing waiting on a decision.</p>}
      <div className="card-list">
        {exceptions?.map((e: any) => {
          const payload = e.payload ?? {};
          const isProposedRule = e.kind === "proposed_rule";
          const subject = payload.personName ?? (isProposedRule ? "Company-wide calculation rule" : null);
          const evidence = payload.evidence ?? (isProposedRule ? payload.definition : null);
          const ruleApplied =
            payload.ruleApplied ??
            (isProposedRule ? `${payload.scope ?? "policy"} rule, ${payload.jurisdiction ?? "—"}` : null);

          return (
            <div key={e.id} className="card">
              <div className="tag">{e.kind}</div>
              {subject && (
                <div style={{ fontWeight: 600, marginTop: 8 }}>{subject}</div>
              )}
              <p style={{ margin: "8px 0" }}>{e.conclusion}</p>
              {evidence && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>What was found:</strong>{" "}
                  {Object.entries(evidence)
                    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                    .join(" · ")}
                </div>
              )}
              {ruleApplied && (
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  <strong>Rule applied:</strong> {ruleApplied}
                </div>
              )}
              <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Confidence: {(e.confidence * 100).toFixed(0)}%
              </div>
              <DecideButtons exceptionId={e.id} orgId={e.duty_instances?.org_id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
