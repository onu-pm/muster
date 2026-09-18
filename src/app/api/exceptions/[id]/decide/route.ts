import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { supabaseSession, currentOrg } from "@/lib/supabase/session";

/**
 * POST /api/exceptions/:id/decide
 * The exception desk's one action. Records a Decision and, in the SAME
 * request, writes whatever that decision should produce next:
 *
 * - Most exceptions (kind = 'lop_discrepancy' and similar): a correction
 *   note becomes a Fact — the correction loop is a foreign key, not a
 *   background job (see the schema decisions in the Muster doc).
 * - kind = 'proposed_rule' (rules-setup-agent.ts): approving or
 *   correcting writes a CONFIRMED row into `rules` instead — this is
 *   company-specific calculation configuration, not a learned pattern
 *   about how the company behaves, so it belongs in a different store.
 *   Rejecting discards the candidate; nothing is written.
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

  // A decision is a human acting for a specific org — trust the session for
  // who's asking, not just whatever orgId the client happened to send.
  const session = await supabaseSession();
  const org = await currentOrg(session);
  if (!org || org.orgId !== body.orgId) {
    return NextResponse.json({ error: "Not signed in as a member of this organisation." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: exception, error: exceptionError } = await db
    .from("exceptions")
    .select("kind, payload")
    .eq("id", exceptionId)
    .single();
  if (exceptionError) {
    return NextResponse.json({ error: exceptionError.message }, { status: 500 });
  }

  // Postgres function would be cleaner for true atomicity; a v1 slice does
  // the writes in sequence and reports clearly if a later one fails,
  // rather than pretending a client-side transaction exists.
  const { data: decision, error: decisionError } = await db
    .from("decisions")
    .insert({
      exception_id: exceptionId,
      human_user_id: org.userId,
      outcome: body.outcome,
      correction_note: body.correctionNote ?? null,
    })
    .select("id")
    .single();
  if (decisionError) {
    return NextResponse.json({ error: decisionError.message }, { status: 500 });
  }

  await db.from("exceptions").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", exceptionId);

  if (exception.kind === "proposed_rule") {
    if (body.outcome === "approved" || body.outcome === "corrected") {
      const payload = (exception.payload ?? {}) as {
        label?: string;
        scope?: "statutory" | "policy";
        jurisdiction?: string;
        ruleKey?: string | null;
        definition?: Record<string, unknown>;
      };
      const source = body.correctionNote
        ? `Company calculation sheet, corrected by a human: ${body.correctionNote}`
        : "Company calculation sheet, confirmed as proposed";

      const { error: ruleError } = await db.from("rules").insert({
        org_id: body.orgId,
        scope: payload.scope ?? "policy",
        jurisdiction: payload.jurisdiction ?? "IN-national",
        effective_from: new Date().toISOString().slice(0, 10),
        rule_key: payload.ruleKey ?? null,
        label: payload.label ?? null,
        definition: payload.definition ?? {},
        source,
        confirmed: true,
        confirmed_at: new Date().toISOString(),
      });
      if (ruleError) {
        return NextResponse.json(
          { warning: "Decision recorded, but writing the rule failed: " + ruleError.message, decisionId: decision.id },
          { status: 207 }
        );
      }
    }
    // "rejected": the candidate is simply discarded — nothing written to `rules`.
    return NextResponse.json({ decisionId: decision.id });
  }

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
