import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/exceptions/:id/decide
 * The exception desk's one action. Records a Decision and, in the SAME
 * transaction, writes or reinforces a Fact — the correction loop is a
 * foreign key, not a background job (see the schema decisions in the
 * Muster doc).
 *
 * Body: { "outcome": "approved" | "rejected" | "corrected",
 *         "correctionNote": "what it got wrong, in the human's words",
 *         "orgId": "uuid" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const exceptionId = params.id;
  const body = await req.json().catch(() => null);
  if (!body?.outcome || !body?.orgId) {
    return NextResponse.json({ error: "outcome and orgId are required." }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Postgres function would be cleaner for true atomicity; a v1 slice does
  // the two writes in sequence and reports clearly if the second fails,
  // rather than pretending a client-side transaction exists.
  const { data: decision, error: decisionError } = await db
    .from("decisions")
    .insert({
      exception_id: exceptionId,
      outcome: body.outcome,
      correction_note: body.correctionNote ?? null,
    })
    .select("id")
    .single();
  if (decisionError) {
    return NextResponse.json({ error: decisionError.message }, { status: 500 });
  }

  await db.from("exceptions").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", exceptionId);

  if (body.correctionNote) {
    const { error: factError } = await db.from("facts").insert({
      org_id: body.orgId,
      statement: body.correctionNote,
      evidence: [{ from_decision: decision.id, at: new Date().toISOString() }],
      confirmed: true,
      created_from_decision: decision.id,
    });
    if (factError) {
      return NextResponse.json(
        { warning: "Decision recorded, but writing the fact failed: " + factError.message, decisionId: decision.id },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ decisionId: decision.id });
}
