import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runInputAgent, type InputAgentRow } from "@/lib/agents/input-agent";
import { buildRemoteAttendanceRows } from "@/lib/connectors/remote-sync";
import { remoteConfigured } from "@/lib/connectors/remote";
import { currentCycleRange } from "@/lib/duty-labels";

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
 * If `rows` is empty AND REMOTE_API_TOKEN is set, this pulls real rows
 * from Remote.com for the current cycle instead of reconciling nothing —
 * see lib/connectors/remote-sync.ts for exactly what "attendance" and
 * "leave" mean when Remote is the source. Pass rows explicitly (as the
 * README's curl example does) to bypass Remote and test by hand.
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
    let effectiveRows = rows;
    if (effectiveRows.length === 0 && remoteConfigured()) {
      const { start, end } = currentCycleRange();
      effectiveRows = await buildRemoteAttendanceRows({ cycleStart: start, cycleEnd: end });
    }

    const db = supabaseAdmin();
    const result = await runInputAgent(db, { orgId, cycleLabel, rows: effectiveRows });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[input-agent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
