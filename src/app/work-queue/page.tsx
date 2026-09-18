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
    return <p className="error-text">Could not load the work queue: {error.message}</p>;
  }

  return (
    <div>
      <h1>Work queue</h1>
      {(!duties || duties.length === 0) && (
        <p className="text-muted">Nothing in flight yet. Run the Input agent to see it here.</p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Duty</th>
            <th>State</th>
            <th>Opened</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {duties?.map((d) => (
            <tr key={d.id}>
              <td>{d.duty_type}</td>
              <td>{d.state}</td>
              <td>{new Date(d.opened_at).toLocaleString()}</td>
              <td>{d.due_at ? new Date(d.due_at).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
