import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runStructureAgent, type StructureRevisionRow, type LoanRow } from "@/lib/agents/structure-agent";

/**
 * POST /api/agents/structure
 * Triggers the Structure agent for one org's salary-structure changes and/or
 * loan/advance schedules.
 *
 * Body:
 * {
 *   "orgId": "uuid",
 *   "cycleLabel": "September 2026",
 *   "revisions": [
 *     {
 *       "personId": "uuid", "personName": "Priya Rao", "reason": "promotion",
 *       "effectiveFrom": "2026-09-01",
 *       "newStructure": { "basic": 40000, "da": 5000, "hra": 15000, "specialAllowance": 10000 }
 *     }
 *   ],
 *   "loans": [
 *     { "personId": "uuid", "personName": "Priya Rao", "kind": "advance", "principal": 12000, "installmentsTotal": 4, "startedOn": "2026-09-01" }
 *   ]
 * }
 *
 * Either array may be omitted or empty — including both at once, e.g. a
 * cycle with nothing to revise. The 50% wage-definition test and
 * arrear recomputation never call an LLM (capabilities/wage-test.ts) — a
 * model is spent only once a structure has already failed that test, to
 * propose a correction, exactly like the Input agent only spends a call on
 * explaining an already-detected reconciliation delta.
 */
export async function POST(req: NextRequest) {
  let body: { orgId?: string; cycleLabel?: string; revisions?: StructureRevisionRow[]; loans?: LoanRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { orgId, cycleLabel, revisions = [], loans = [] } = body;
  if (!orgId || !cycleLabel) {
    return NextResponse.json({ error: "orgId and cycleLabel are required." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const result = await runStructureAgent(db, { orgId, cycleLabel, revisions, loans });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[structure-agent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
