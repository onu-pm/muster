import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

/**
 * Screen 2 — Work queue. Every duty instance in flight: what stage it's
 * at, what it's waiting on, the deadline. Reads through the signed-in
 * user's own session (not supabaseAdmin), so Row Level Security scopes
 * this to their organisation automatically — no manual org_id filter
 * needed, RLS does it.
 */
export default async function WorkQueuePage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: duties, error } = await db
    .from("duty_instances")
    .select("id, duty_type, state, opened_at, due_at, org_id")
    .order("opened_at", { ascending: false })
    .limit(50);

  if (error) {
    return <p style={{ color: "crimson" }}>Could not load the work queue: {error.message}</p>;
  }

  return (
    <div>
      <h1>Work queue</h1>
      {(!duties || duties.length === 0) && <p>Nothing in flight yet. Run the Input agent to see it here.</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: 8 }}>Duty</th>
            <th style={{ padding: 8 }}>State</th>
            <th style={{ padding: 8 }}>Opened</th>
            <th style={{ padding: 8 }}>Due</th>
          </tr>
        </thead>
        <tbody>
          {duties?.map((d) => (
            <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{d.duty_type}</td>
              <td style={{ padding: 8 }}>{d.state}</td>
              <td style={{ padding: 8 }}>{new Date(d.opened_at).toLocaleString()}</td>
              <td style={{ padding: 8 }}>{d.due_at ? new Date(d.due_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
