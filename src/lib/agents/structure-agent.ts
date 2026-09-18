import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { llmClient, MODEL_JUDGMENT } from "@/lib/llm/client";
import { checkWageDefinition, computeArrears, type SalaryStructure } from "@/lib/capabilities/wage-test";
import { logStep, openException } from "@/lib/capabilities/execute";

export interface StructureRevisionRow {
  personId: string;
  personName: string;
  reason: string; // e.g. 'promotion', 'annual revision', 'correction'
  effectiveFrom: string; // ISO date — may be retrospective
  newStructure: SalaryStructure;
  previousStructure?: SalaryStructure | null; // falls back to people.salary_structure if omitted
}

export interface LoanRow {
  personId: string;
  personName: string;
  kind: "loan" | "advance";
  principal: number;
  installmentsTotal: number;
  startedOn: string; // ISO date
}

export interface StructureAgentResult {
  dutyInstanceId: string;
  revisionsProcessed: number;
  wageTestBreaches: number;
  loansCreated: number;
}

function isEmptyStructure(s: SalaryStructure | null | undefined): boolean {
  return !s || Object.keys(s).length === 0;
}

/**
 * The Structure agent (Wave 1, payroll team).
 *
 * Owns: salary structures and anything that changes them — CTC modelling,
 * the 50% wage-definition test, revisions and promotions, arrears, and
 * loan/advance schedules.
 *
 * The 50% test and arrear recomputation (capabilities/wage-test.ts) are
 * plain arithmetic — no LLM involved. A model is spent only once a
 * structure has already failed the test deterministically, to propose how
 * to fix the split; that proposal is never applied automatically, it lands
 * on the exception desk like every other judgment call in this codebase.
 * This is a genuinely hard judgment (a statutory-compliance correction, not
 * a routine explanation), so it's routed to MODEL_JUDGMENT, not
 * MODEL_ROUTINE.
 *
 * Every revision — whether it passes the test or not — is written to
 * `salary_revisions` (insert-only history) and folded into
 * `people.salary_structure`, which stays the statutory spine's current
 * state. Loans/advances get a schedule computed the same deterministic way.
 */
export async function runStructureAgent(
  db: SupabaseClient,
  args: {
    orgId: string;
    cycleLabel: string;
    revisions?: StructureRevisionRow[];
    loans?: LoanRow[];
  }
): Promise<StructureAgentResult> {
  const { orgId, cycleLabel, revisions = [], loans = [] } = args;

  // 1. Open the duty instance for this review.
  const { data: duty, error: dutyError } = await db
    .from("duty_instances")
    .insert({ org_id: orgId, duty_type: "salary_structure_review", state: "in_progress" })
    .select("id")
    .single();
  if (dutyError) throw dutyError;
  const dutyInstanceId = duty.id as string;

  // 2. Pull each referenced person's current structure, to diff arrears
  //    against and to fall back on when a row doesn't supply its own.
  const personIds = [...new Set(revisions.map((r) => r.personId))];
  const currentStructures = new Map<string, SalaryStructure>();
  if (personIds.length > 0) {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id, salary_structure")
      .in("id", personIds);
    if (peopleError) throw peopleError;
    for (const p of people ?? []) {
      currentStructures.set(p.id as string, (p.salary_structure ?? {}) as SalaryStructure);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const anthropic = llmClient();
  let wageTestBreaches = 0;

  // 3. Each revision: run the wage test and arrear recomputation (plain
  //    code), record the history, keep the person's current structure in
  //    sync, and spend a judgment call only on a breach.
  for (const row of revisions) {
    const fetched = currentStructures.get(row.personId);
    const previousStructure = row.previousStructure ?? (isEmptyStructure(fetched) ? null : fetched) ?? null;

    const test = checkWageDefinition(row.newStructure);
    const arrearAmount = computeArrears({
      previousStructure,
      newStructure: row.newStructure,
      effectiveFrom: row.effectiveFrom,
      asOf: today,
    });

    await logStep(db, {
      dutyInstanceId,
      capability: "reconcile",
      input: {
        personId: row.personId,
        newStructure: row.newStructure,
        previousStructure,
        effectiveFrom: row.effectiveFrom,
      },
      output: { ...test, arrearAmount },
    });

    const { error: revisionError } = await db.from("salary_revisions").insert({
      org_id: orgId,
      person_id: row.personId,
      duty_instance_id: dutyInstanceId,
      reason: row.reason,
      previous_structure: previousStructure,
      new_structure: row.newStructure,
      effective_from: row.effectiveFrom,
      basic_wage: test.basicWage,
      gross_wage: test.grossWage,
      wage_test_ratio: test.ratio,
      wage_test_passed: test.passed,
      arrear_amount: arrearAmount,
    });
    if (revisionError) throw revisionError;

    const { error: peopleUpdateError } = await db
      .from("people")
      .update({ salary_structure: row.newStructure, updated_at: new Date().toISOString() })
      .eq("id", row.personId);
    if (peopleUpdateError) throw peopleUpdateError;

    if (!test.passed) {
      wageTestBreaches += 1;

      const prompt = `You are the Structure agent on an HR payroll team. A salary structure for
${row.personName} (cycle: ${cycleLabel}) fails the statutory 50%
wage-definition test: basic pay plus dearness allowance must be at least
half of gross pay.

Structure: ${JSON.stringify(row.newStructure)}
Basic + DA: ${test.basicWage}
Gross: ${test.grossWage}
Ratio: ${(test.ratio * 100).toFixed(1)}%

Propose a corrected split of the SAME gross total that meets the 50% rule
— which non-wage components (e.g. special allowance) to reduce and by how
much, moved into basic or DA. Reply with ONLY a JSON object, no other text:
{"correction": string | null, "confidence": number}
- "correction": one or two sentences with the specific reallocation, or
  null if the structure doesn't give you enough to propose one safely.
- "confidence": 0 to 1. Use null and low confidence rather than guess.`;

      const response = await anthropic.messages.create({
        model: MODEL_JUDGMENT,
        // Generous headroom: this provider route gives Sonnet extended
        // thinking on harder prompts like this one, and thinking tokens
        // count against max_tokens — too tight a budget truncates the
        // answer before the JSON is written, which silently reads back as
        // "no explanation" (see the max_tokens=300 case in the build notes).
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      let parsed: { correction: string | null; confidence: number } = {
        correction: null,
        confidence: 0,
      };
      try {
        parsed = JSON.parse(text);
      } catch {
        // Model didn't return clean JSON — treat as unproposed, never guess.
        parsed = { correction: null, confidence: 0 };
      }

      await logStep(db, {
        dutyInstanceId,
        capability: "explain",
        input: { personId: row.personId, ratio: test.ratio },
        output: parsed,
      });

      await openException(db, {
        dutyInstanceId,
        kind: "wage_definition_breach",
        conclusion:
          parsed.correction ??
          `${row.personName}: basic + DA is ${(test.ratio * 100).toFixed(1)}% of gross, below the statutory 50% minimum.`,
        confidence: parsed.confidence,
      });
    }
  }

  // 4. Loans/advances: the schedule is arithmetic, not judgment — no LLM.
  let loansCreated = 0;
  for (const loan of loans) {
    const installmentAmount = Number((loan.principal / loan.installmentsTotal).toFixed(2));

    const { error: loanError } = await db.from("loans").insert({
      org_id: orgId,
      person_id: loan.personId,
      duty_instance_id: dutyInstanceId,
      kind: loan.kind,
      principal: loan.principal,
      installment_amount: installmentAmount,
      installments_total: loan.installmentsTotal,
      outstanding: loan.principal,
      started_on: loan.startedOn,
    });
    if (loanError) throw loanError;

    await logStep(db, {
      dutyInstanceId,
      capability: "execute",
      input: {
        personId: loan.personId,
        kind: loan.kind,
        principal: loan.principal,
        installmentsTotal: loan.installmentsTotal,
      },
      output: { installmentAmount },
    });

    loansCreated += 1;
  }

  // 5. Same posture as the Input agent: a structure review never
  //    auto-closes. It moves to 'blocked' to wait on the exception desk (or
  //    a direct approval if there were none).
  await db.from("duty_instances").update({ state: "blocked" }).eq("id", dutyInstanceId);

  return {
    dutyInstanceId,
    revisionsProcessed: revisions.length,
    wageTestBreaches,
    loansCreated,
  };
}
