import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Capability: Execute. Write a record and log the step that produced it.
 * Every capability call an agent makes goes through a Step row — this is
 * the audit trail (see `steps` in the schema).
 */
export async function logStep(
  db: SupabaseClient,
  args: {
    dutyInstanceId: string;
    capability: "pursue" | "verify" | "execute" | "submit" | "reconcile" | "explain";
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  }
) {
  const { error } = await db.from("steps").insert({
    duty_instance_id: args.dutyInstanceId,
    capability: args.capability,
    input: args.input,
    output: args.output,
  });
  if (error) throw error;
}

export async function openException(
  db: SupabaseClient,
  args: {
    dutyInstanceId: string;
    kind: string;
    conclusion: string;
    confidence: number;
    /** Structured detail beyond the free-text conclusion — e.g. a
     * proposed rule's definition (rules-setup-agent.ts). Optional so
     * every existing call site is unaffected; defaults to {} in the
     * schema (0005_calculation_rules.sql). */
    payload?: Record<string, unknown>;
  }
) {
  const { error } = await db.from("exceptions").insert({
    duty_instance_id: args.dutyInstanceId,
    kind: args.kind,
    conclusion: args.conclusion,
    confidence: args.confidence,
    ...(args.payload ? { payload: args.payload } : {}),
  });
  if (error) throw error;
}
