import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runInputAgent, type InputAgentRow } from "@/lib/agents/input-agent";

/**
 * POST /api/agents/input
 * Triggers the Input agent for one org's payroll cycle.
 *
 * Body:
 * {
 *   "orgId": "uuid",
 *   "cycleLabel": "September 2026",
 *   "rows": [
 *     { "personId": "uuid", "personName": "Priya Rao", "attendanceDays": 22, "leaveDays": 21 }
 *   ]
 * }
 *
 * This is Wave 1 — the reconciliation half of the Input agent only.
 * Pursuing contributors for inputs (capabilities/pursue.ts) is stubbed
 * until a WhatsApp BSP account exists; wire it in without touching this
 * route once it does.
 */
export async function POST(req: NextRequest) {
  let body: { orgId?: string; cycleLabel?: string; rows?: InputAgentRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { orgId, cycleLabel, rows } = body;
  if (!orgId || !cycleLabel || !Array.isArray(rows)) {
    return NextResponse.json({ error: "orgId, cycleLabel and rows[] are required." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const result = await runInputAgent(db, { orgId, cycleLabel, rows });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[input-agent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
