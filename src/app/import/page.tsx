import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { currentCycleLabel } from "@/lib/duty-labels";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

/**
 * Generic CSV import — the "next move" for any customer without an EOR
 * account like Remote.com (see README's connectors section). Uploads a
 * CSV of attendance/leave rows, maps its columns once, and feeds the
 * result into the Input agent through the exact same route and row shape
 * Remote.com data already uses — this is another SOURCE for the same
 * pipeline, not a new one.
 */
export default async function ImportPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  const { data: people } = await db.from("people").select("id, full_name").order("full_name");

  return (
    <div>
      <h1>Import attendance &amp; leave</h1>
      <p className="text-muted" style={{ maxWidth: 640 }}>
        Upload a CSV export from any attendance/HRIS system — one row per person per cycle. Map its columns once,
        check the preview, then send it to Holly exactly as she'd take a Remote.com sync.
      </p>
      <ImportForm orgId={org!.orgId} cycleLabel={currentCycleLabel()} people={people ?? []} />
    </div>
  );
}
