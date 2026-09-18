import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { llmClient, MODEL_ROUTINE } from "@/lib/llm/client";
import { reconcile, type ReconcileRow } from "@/lib/capabilities/reconcile";
import { logStep, openException } from "@/lib/capabilities/execute";

export interface InputAgentRow {
  personId: string;
  personName: string;
  attendanceDays: number; // from the attendance system / sign-off
  leaveDays: number; // from the leave ledger
}

export interface InputAgentResult {
  dutyInstanceId: string;
  rowsProcessed: number;
  explainedAutomatically: number;
  exceptionsOpened: number;
}

const EXPLAIN_CONFIDENCE_THRESHOLD = 0.8;

/**
 * The Input agent (Wave 1, first of the eight payroll agents).
 *
 * Owns: everything that must arrive before cutoff — here, the attendance-
 * vs-leave reconciliation that produces one LOP figure per employee.
 *
 * How it works: `reconcile` (plain code, capabilities/reconcile.ts) finds
 * every discrepancy deterministically — no LLM involved in the arithmetic.
 * For each discrepancy, a single Haiku call is asked whether the learned
 * facts already on file explain it. If yes and confident, that's logged as
 * an explained Step. If no — or not confident — it becomes an Exception,
 * because per the build doc: "flags every discrepancy rather than guessing."
 *
 * This is deliberately not a multi-turn tool-calling loop. A structured,
 * one-call-per-discrepancy design is easier to test and to reason about
 * than an agentic loop, and it's what "plain code, LLM only for the
 * judgment part" means in practice — see the architectural rule in the
 * Muster doc.
 */
export async function runInputAgent(
  db: SupabaseClient,
  args: { orgId: string; cycleLabel: string; rows: InputAgentRow[] }
): Promise<InputAgentResult> {
  const { orgId, cycleLabel, rows } = args;

  // 1. Open (or reuse) the duty instance for this cycle.
  const { data: duty, error: dutyError } = await db
    .from("duty_instances")
    .insert({ org_id: orgId, duty_type: "payroll_input_pack", state: "in_progress" })
    .select("id")
    .single();
  if (dutyError) throw dutyError;
  const dutyInstanceId = duty.id as string;

  // 2. Pull confirmed learned facts for this org — the context that makes
  //    the judgment call better than a generic model would give cold.
  const { data: facts, error: factsError } = await db
    .from("facts")
    .select("statement, evidence")
    .eq("org_id", orgId)
    .eq("confirmed", true)
    .limit(30);
  if (factsError) throw factsError;

  // 3. Reconcile — plain arithmetic, no model call.
  const reconcileRows: ReconcileRow[] = rows.map((r) => ({
    personId: r.personId,
    personName: r.personName,
    a: r.attendanceDays,
    b: r.leaveDays,
    label: `${cycleLabel} attendance vs leave`,
  }));
  const differences = reconcile(reconcileRows, () => null); // explanation filled in below, per-row

  let explainedAutomatically = 0;
  let exceptionsOpened = 0;

  // 4. For each discrepancy, one judgment call.
  const anthropic = llmClient();
  for (const diff of differences) {
    const relevantFacts = (facts ?? [])
      .map((f) => `- ${f.statement}`)
      .join("\n");

    const prompt = `You are the Input agent on an HR payroll team. An attendance-vs-leave
reconciliation found a discrepancy for one employee this cycle: ${cycleLabel}.

Employee: ${diff.personName}
Attendance-system days: ${diff.actual}
Leave-ledger days: ${diff.expected}
Delta: ${diff.delta} day(s)

Facts already confirmed about this company:
${relevantFacts || "(none on file yet)"}

Do the confirmed facts plausibly explain this specific delta? Reply with
ONLY a JSON object, no other text: {"explanation": string | null, "confidence": number}
- "explanation": a one-sentence reason if the facts explain it, else null.
- "confidence": 0 to 1. Use null and low confidence rather than guess.`;

    const response = await anthropic.messages.create({
      model: MODEL_ROUTINE,
      // Generous headroom: this model spends tokens on thinking before the
      // answer, and thinking tokens count against max_tokens — too tight a
      // budget truncates the reply before the JSON is written, which
      // silently reads back as "no explanation" (see structure-agent.ts).
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: { explanation: string | null; confidence: number } = {
      explanation: null,
      confidence: 0,
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Model didn't return clean JSON — treat as unexplained, never guess.
      parsed = { explanation: null, confidence: 0 };
    }

    const explained =
      parsed.explanation !== null && parsed.confidence >= EXPLAIN_CONFIDENCE_THRESHOLD;

    await logStep(db, {
      dutyInstanceId,
      capability: "reconcile",
      input: { personId: diff.personId, actual: diff.actual, expected: diff.expected },
      output: { explained, ...parsed },
    });

    if (explained) {
      explainedAutomatically += 1;
    } else {
      await openException(db, {
        dutyInstanceId,
        kind: "lop_discrepancy",
        conclusion:
          parsed.explanation ??
          `${diff.personName}: ${diff.delta} day delta between attendance and leave records, no confirmed fact explains it.`,
        confidence: parsed.confidence,
      });
      exceptionsOpened += 1;
    }
  }

  // 5. The pack itself always needs human approval before payroll — per the
  //    build doc, this duty does not auto-close. It moves to 'blocked' to
  //    wait on the exception desk (or a direct approval if there were none).
  await db.from("duty_instances").update({ state: "blocked" }).eq("id", dutyInstanceId);

  return {
    dutyInstanceId,
    rowsProcessed: rows.length,
    explainedAutomatically,
    exceptionsOpened,
  };
}
