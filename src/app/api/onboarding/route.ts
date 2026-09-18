import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseSession } from "@/lib/supabase/session";

/**
 * POST /api/onboarding
 * Creates a new organisation and makes the signed-in user its first member.
 * Runs through the service-role client (same posture as every other write
 * in this codebase) but only after reading the caller's own session — it
 * never trusts a userId from the request body.
 *
 * Body: { "orgName": string }
 */
export async function POST(req: NextRequest) {
  const session = await supabaseSession();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const orgName = body?.orgName?.trim();
  if (!orgName) {
    return NextResponse.json({ error: "orgName is required." }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: org, error: orgError } = await db
    .from("organisations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const { error: memberError } = await db
    .from("org_members")
    .insert({ org_id: org.id, user_id: user.id, role: "hr_admin" });
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ orgId: org.id });
}
