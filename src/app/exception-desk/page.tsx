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
    .select("id, kind, conclusion, confidence, status, opened_at, duty_instance_id, duty_instances(org_id)")
    .eq("status", "open")
    .order("opened_at", { ascending: true })
    .limit(50);

  if (error) {
    return <p style={{ color: "crimson" }}>Could not load the exception desk: {error.message}</p>;
  }

  return (
    <div>
      <h1>Exception desk</h1>
      {(!exceptions || exceptions.length === 0) && <p>Clear. Nothing waiting on a decision.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {exceptions?.map((e: any) => (
          <div key={e.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase" }}>{e.kind}</div>
            <p style={{ margin: "8px 0" }}>{e.conclusion}</p>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Confidence: {(e.confidence * 100).toFixed(0)}%
            </div>
            <DecideButtons exceptionId={e.id} orgId={e.duty_instances?.org_id} />
          </div>
        ))}
      </div>
    </div>
  );
}
