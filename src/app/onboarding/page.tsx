import { redirect } from "next/navigation";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

/**
 * Screen 0c — Onboarding. A signed-in user with no organisation yet lands
 * here first. One field: name it, and they become its first hr_admin
 * (see /api/onboarding).
 */
export default async function OnboardingPage() {
  const db = await supabaseSession();
  const org = await currentOrg(db);

  if (org) {
    redirect("/dashboard");
  }

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h1>Name your organisation</h1>
      <p className="text-muted">This is the workspace your AI teams will operate in.</p>
      <OnboardingForm />
    </div>
  );
}
