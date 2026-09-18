import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { RulesSetupForm } from "./rules-setup-form";

export const dynamic = "force-dynamic";

/**
 * The one-time "give Holly your own calculation sheet" screen — not one
 * of the original six from the build doc, added for a company whose data
 * source doesn't compute payroll itself (unlike Remote.com) and needs
 * Structure/Tax to work from rules the company states directly, or a
 * company that wants to override one default statutory figure. See
 * rules-setup-agent.ts for the reasoning; this page is just the form.
 *
 * What comes out of a submit here isn't live — every rule it finds lands
 * on the exception desk as a `proposed_rule` for a human to confirm,
 * exactly like any other judgment call this product makes.
 */
export default async function RulesSetupPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);
  if (!org) {
    const {
      data: { user },
    } = await db.auth.getUser();
    redirect(user ? "/onboarding" : "/sign-in");
  }

  return (
    <div>
      <h1>Give Holly your calculation rules</h1>
      <p className="text-muted" style={{ maxWidth: 640 }}>
        Paste a PT slab table, a CTC breakup, a rounding convention — anything that determines a number on a
        payslip. Holly pulls out every discrete rule she can find and puts each one on the exception desk for you to
        confirm, correct or reject before it's used. Nothing here is invented — if the sheet doesn't say it clearly,
        she leaves it out rather than guess.
      </p>
      <RulesSetupForm orgId={org!.orgId} />
    </div>
  );
}
