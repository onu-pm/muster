import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runRulesSetupAgent } from "@/lib/agents/rules-setup-agent";

/**
 * POST /api/agents/rules-setup
 *
 * The one-time "give Holly our own calculation sheet" setup — for a
 * company whose data source doesn't compute payroll itself (unlike
 * Remote.com), or that wants to override a default statutory figure with
 * their own. See rules-setup-agent.ts for the full reasoning.
 *
 * Body:
 * {
 *   "orgId": "uuid",
 *   "jurisdiction": "IN-KA",
 *   "sheetText": "<pasted calculation sheet — CSV, a pasted table, or
 *                  plain description of PT slabs / CTC breakup / rounding>"
 * }
 *
 * Every rule extracted lands on the exception desk as a `proposed_rule`
 * — nothing is live until a human confirms it there
 * (see /api/exceptions/[id]/decide).
 */
export async function POST(req: NextRequest) {
  let body: { orgId?: string; jurisdiction?: string; sheetText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { orgId, jurisdiction, sheetText } = body;
  if (!orgId || !jurisdiction || !sheetText?.trim()) {
    return NextResponse.json({ error: "orgId, jurisdiction and sheetText are required." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const result = await runRulesSetupAgent(db, { orgId, jurisdiction, sheetText });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[rules-setup-agent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
