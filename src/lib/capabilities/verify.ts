import type { SupabaseClient } from "@supabase/supabase-js";

export type VerifyOutcome = "accepted" | "rejected" | "flagged";

export interface VerifyResult {
  outcome: VerifyOutcome;
  confidence: number; // 0..1
  reason: string;
  extractedFields?: Record<string, unknown>;
  ruleId?: string;
}

/**
 * Capability: Verify. Judge an artifact against a rule and write the
 * verdict. Verdicts are insert-only — a re-check writes a NEW row, never
 * an update, so History always shows what was believed and when.
 */
export async function verify(
  db: SupabaseClient,
  args: { artifactId: string } & VerifyResult
) {
  const { error } = await db.from("verdicts").insert({
    artifact_id: args.artifactId,
    outcome: args.outcome,
    confidence: args.confidence,
    rule_id: args.ruleId ?? null,
    extracted_fields: args.extractedFields ?? {},
    reason: args.reason,
  });
  if (error) throw error;
}
