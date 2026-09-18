import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";

/**
 * POST /api/teams/:key/enable
 * Turns an available team on for the signed-in user's organisation. Reads
 * the org from the caller's own session (via currentOrg) rather than
 * trusting anything in the request body — the same posture as onboarding.
 */
export async function POST(_req: NextRequest, { params }: { params: { key: string } }) {
  const session = await supabaseSession();
  const org = await currentOrg(session);
  if (!org) {
    return NextResponse.json({ error: "Not signed in, or no organisation yet." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: team, error: teamError } = await db
    .from("teams")
    .select("id, status")
    .eq("key", params.key)
    .single();
  if (teamError || !team) {
    return NextResponse.json({ error: "No such team." }, { status: 404 });
  }
  if (team.status !== "available") {
    return NextResponse.json({ error: "This team isn't available yet." }, { status: 400 });
  }

  const { error: enableError } = await db
    .from("org_teams")
    .upsert({ org_id: org.orgId, team_id: team.id, enabled: true }, { onConflict: "org_id,team_id" });
  if (enableError) {
    return NextResponse.json({ error: enableError.message }, { status: 500 });
  }

  return NextResponse.json({ enabled: true });
}
