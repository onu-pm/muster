import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { runTaxAgent, type TaxDeclarationRow } from "@/lib/agents/tax-agent";

/**
 * POST /api/agents/tax
 * Triggers the Tax agent for one org's investment declarations.
 *
 * Body:
 * {
 *   "orgId": "uuid",
 *   "cycleLabel": "December 2026",
 *   "declarations": [
 *     {
 *       "personId": "uuid", "personName": "Priya Rao",
 *       "financialYear": "FY2025-26", "regime": "old",
 *       "landlordPan": "ABCDE1234F",
 *       "previousEmployerIncome": 0,
 *       "proofs": [
 *         { "category": "rent_receipts", "claimedAmount": 180000, "documentSummary": "Signed monthly rent receipts, Apr 2025-Mar 2026, landlord Ramesh Iyer, PAN on each receipt, ₹15,000/month." },
 *         { "category": "lic_ppf_elss", "claimedAmount": 50000, "documentSummary": "PPF passbook entry, Sept 2025, employee's own account." }
 *       ]
 *     }
 *   ]
 * }
 *
 * Heaviest season is December-February (declaration deadline); a lighter
 * monthly projection runs the rest of the year — same endpoint either way,
 * the volume of declarations[] just varies.
 */
export async function POST(req: NextRequest) {
  let body: { orgId?: string; cycleLabel?: string; declarations?: TaxDeclarationRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { orgId, cycleLabel, declarations } = body;
  if (!orgId || !cycleLabel || !Array.isArray(declarations)) {
    return NextResponse.json({ error: "orgId, cycleLabel and declarations[] are required." }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const result = await runTaxAgent(db, { orgId, cycleLabel, declarations });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[tax-agent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
