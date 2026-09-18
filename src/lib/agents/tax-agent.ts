import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { llmClient, MODEL_ROUTINE } from "@/lib/llm/client";
import { computeAnnualTax, NEW_REGIME_STANDARD_DEDUCTION, type Regime } from "@/lib/capabilities/tax-rates";
import { PROOF_CATEGORY_RULES, checkDeterministic, type ProofCategory } from "@/lib/capabilities/proof-rules";
import { logStep, openException } from "@/lib/capabilities/execute";
import { verify } from "@/lib/capabilities/verify";

// Old-regime standard deduction — unchanged since its introduction in 2018.
// Not independently re-verified this pass, unlike the new-regime figures in
// capabilities/tax-rates.ts; check before relying on it for a real filing.
const OLD_REGIME_STANDARD_DEDUCTION = 50000;
const VERIFY_CONFIDENCE_THRESHOLD = 0.8;
const SHARED_80C_CAP = 150000;

export interface ProofItem {
  category: ProofCategory;
  claimedAmount: number;
  // Stands in for an actual document/OCR pipeline, which doesn't exist yet
  // — same convention as the Input agent taking attendance numbers
  // directly rather than parsing a real attendance sheet.
  documentSummary: string;
}

export interface TaxDeclarationRow {
  personId: string;
  personName: string;
  financialYear: string; // e.g. 'FY2025-26'
  regime: Regime;
  landlordPan?: string | null;
  previousEmployerIncome?: number | null;
  proofs: ProofItem[];
}

export interface TaxAgentResult {
  dutyInstanceId: string;
  declarationsProcessed: number;
  proofsVerified: number;
  proofsRejected: number;
  exceptionsOpened: number;
}

/**
 * The Tax agent (Wave 1, payroll team).
 *
 * Owns: regime elections, investment declarations, proof collection and
 * verification, monthly TDS projection, year-end true-up, Form 16,
 * previous-employer income. This slice covers the declaration →
 * verification → monthly TDS projection loop — the richest verification
 * work in the team. Year-end true-up and Form 16 generation aren't built
 * yet (see the README's "what's deliberately not here" section).
 *
 * The TDS projection is plain arithmetic (capabilities/tax-rates.ts) — no
 * LLM call. Before any document is even considered, two structured checks
 * run in code (capabilities/proof-rules.ts): is this category eligible
 * under the elected regime, and — for rent above the statutory threshold —
 * is there a landlord PAN on file. Only proofs that pass both get a model
 * call, one per document, judging whether it actually satisfies its
 * category's rule — the same one-call-per-discrepancy shape as the Input
 * agent, using the existing artifacts/verdicts pairing (capabilities/
 * verify.ts) that's existed since the schema's first migration.
 */
export async function runTaxAgent(
  db: SupabaseClient,
  args: { orgId: string; cycleLabel: string; declarations: TaxDeclarationRow[] }
): Promise<TaxAgentResult> {
  const { orgId, cycleLabel, declarations } = args;

  // 1. Open the duty instance for this review.
  const { data: duty, error: dutyError } = await db
    .from("duty_instances")
    .insert({ org_id: orgId, duty_type: "tax_declaration_review", state: "in_progress" })
    .select("id")
    .single();
  if (dutyError) throw dutyError;
  const dutyInstanceId = duty.id as string;

  // 2. Pull each referenced person's current gross (annualised) to project
  //    TDS against.
  const personIds = [...new Set(declarations.map((d) => d.personId))];
  const annualGrossByPerson = new Map<string, number>();
  if (personIds.length > 0) {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id, salary_structure")
      .in("id", personIds);
    if (peopleError) throw peopleError;
    for (const p of people ?? []) {
      const structure = (p.salary_structure ?? {}) as Record<string, number>;
      const monthlyGross = Object.values(structure).reduce((sum, v) => sum + (v || 0), 0);
      annualGrossByPerson.set(p.id as string, monthlyGross * 12);
    }
  }

  const anthropic = llmClient();
  let proofsVerified = 0;
  let proofsRejected = 0;
  let exceptionsOpened = 0;

  for (const decl of declarations) {
    const declared: Partial<Record<ProofCategory, number>> = {};
    const verified: Partial<Record<ProofCategory, number>> = {};

    for (const proof of decl.proofs) {
      const rule = PROOF_CATEGORY_RULES[proof.category];
      declared[proof.category] = (declared[proof.category] ?? 0) + proof.claimedAmount;

      // 3. Structured checks first — regime eligibility, landlord PAN.
      //    Plain code, no model call, and never a guess: a failure here
      //    goes straight to the exception desk.
      const gate = checkDeterministic({
        category: proof.category,
        regime: decl.regime,
        claimedAmount: proof.claimedAmount,
        landlordPan: decl.landlordPan,
      });

      await logStep(db, {
        dutyInstanceId,
        capability: "reconcile",
        input: { personId: decl.personId, category: proof.category, claimedAmount: proof.claimedAmount },
        output: { deterministicGatePassed: gate.passed, reason: gate.reason },
      });

      if (!gate.passed) {
        await openException(db, {
          dutyInstanceId,
          kind: "declaration_proof_ineligible",
          conclusion: `${decl.personName}: ${gate.reason}`,
          confidence: 1, // certain, deterministic finding — not a guess
        });
        exceptionsOpened += 1;
        proofsRejected += 1;
        continue;
      }

      // 4. One artifact row per proof document, so the existing Verify
      //    capability (artifacts + insert-only verdicts) can judge it —
      //    exactly what that pairing was built for.
      const { data: artifact, error: artifactError } = await db
        .from("artifacts")
        .insert({
          duty_instance_id: dutyInstanceId,
          person_id: decl.personId,
          type: proof.category,
          source: "declaration_upload",
        })
        .select("id")
        .single();
      if (artifactError) throw artifactError;

      const prompt = `You are the Tax agent on an HR payroll team, verifying one investment-
declaration proof document for ${decl.personName} (${decl.financialYear}).

Category: ${rule.label} (${rule.section})
What a valid proof must show: ${rule.rule}
Claimed amount: ₹${proof.claimedAmount.toLocaleString("en-IN")}${
        rule.cap ? ` (statutory cap: ₹${rule.cap.toLocaleString("en-IN")})` : ""
      }

Document content:
"""
${proof.documentSummary}
"""

Does this document satisfy the category's rule for the claimed amount and
financial year? Reply with ONLY a JSON object, no other text:
{"outcome": "accepted" | "rejected" | "flagged", "confidence": number, "reason": string}
- "accepted": the document clearly satisfies the rule.
- "rejected": the document clearly does not (wrong period, wrong name, missing required detail).
- "flagged": genuinely ambiguous — say why in "reason".
- "confidence": 0 to 1. Use low confidence rather than guess.`;

      const response = await anthropic.messages.create({
        model: MODEL_ROUTINE,
        // See structure-agent.ts — this provider spends tokens on thinking
        // before the answer, and too tight a budget truncates the JSON.
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      let parsed: { outcome: "accepted" | "rejected" | "flagged"; confidence: number; reason: string } = {
        outcome: "flagged",
        confidence: 0,
        reason: "Model did not return a parseable judgment.",
      };
      try {
        parsed = JSON.parse(text);
      } catch {
        // Keep the safe default above — never guess.
      }

      await verify(db, {
        artifactId: artifact.id as string,
        outcome: parsed.outcome,
        confidence: parsed.confidence,
        reason: parsed.reason,
        extractedFields: { category: proof.category, claimedAmount: proof.claimedAmount },
      });

      await logStep(db, {
        dutyInstanceId,
        capability: "verify",
        input: { personId: decl.personId, category: proof.category, artifactId: artifact.id },
        output: parsed,
      });

      const accepted = parsed.outcome === "accepted" && parsed.confidence >= VERIFY_CONFIDENCE_THRESHOLD;
      if (accepted) {
        proofsVerified += 1;
        verified[proof.category] = (verified[proof.category] ?? 0) + proof.claimedAmount;
      } else {
        proofsRejected += 1;
        await openException(db, {
          dutyInstanceId,
          kind: "declaration_proof_unverified",
          conclusion: `${decl.personName}: ${rule.label} proof — ${parsed.reason}`,
          confidence: parsed.confidence,
        });
        exceptionsOpened += 1;
      }
    }

    // 5. Statutory caps — each category's own, then the Section 80C cap
    //    shared between lic_ppf_elss and home_loan_principal. Arithmetic,
    //    not judgment.
    for (const category of Object.keys(verified) as ProofCategory[]) {
      const cap = PROOF_CATEGORY_RULES[category].cap;
      if (cap && verified[category]! > cap) {
        verified[category] = cap;
      }
    }
    const sharedTotal = (verified.lic_ppf_elss ?? 0) + (verified.home_loan_principal ?? 0);
    if (sharedTotal > SHARED_80C_CAP) {
      const scale = SHARED_80C_CAP / sharedTotal;
      if (verified.lic_ppf_elss) verified.lic_ppf_elss = Math.round(verified.lic_ppf_elss * scale);
      if (verified.home_loan_principal) verified.home_loan_principal = Math.round(verified.home_loan_principal * scale);
    }

    // 6. Monthly TDS projection — plain arithmetic.
    const totalExemptions = Object.values(verified).reduce((sum, v) => sum + (v ?? 0), 0);
    const annualGross = (annualGrossByPerson.get(decl.personId) ?? 0) + (decl.previousEmployerIncome ?? 0);
    const standardDeduction = decl.regime === "new" ? NEW_REGIME_STANDARD_DEDUCTION : OLD_REGIME_STANDARD_DEDUCTION;
    const taxableIncome = Math.max(
      0,
      annualGross - standardDeduction - (decl.regime === "old" ? totalExemptions : 0)
    );
    const annualTax = computeAnnualTax(taxableIncome, decl.regime);
    const monthlyTds = Math.round(annualTax / 12);

    await logStep(db, {
      dutyInstanceId,
      capability: "reconcile",
      input: { personId: decl.personId, regime: decl.regime, annualGross, totalExemptions },
      output: { taxableIncome, annualTax, monthlyTds },
    });

    const { error: upsertError } = await db.from("tax_declarations").upsert(
      {
        org_id: orgId,
        person_id: decl.personId,
        duty_instance_id: dutyInstanceId,
        financial_year: decl.financialYear,
        regime: decl.regime,
        declared,
        landlord_pan: decl.landlordPan ?? null,
        previous_employer_income: decl.previousEmployerIncome ?? null,
        verified_exemptions: verified,
        monthly_tds: monthlyTds,
        status: "verified",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "person_id,financial_year" }
    );
    if (upsertError) throw upsertError;
  }

  // 7. Same posture as Input/Structure: never auto-closes, waits on the
  //    exception desk (or a direct approval if there were none).
  await db.from("duty_instances").update({ state: "blocked" }).eq("id", dutyInstanceId);

  return {
    dutyInstanceId,
    declarationsProcessed: declarations.length,
    proofsVerified,
    proofsRejected,
    exceptionsOpened,
  };
}
