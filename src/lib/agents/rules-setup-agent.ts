import type { SupabaseClient } from "@supabase/supabase-js";
import { llmClient, callJudgmentModel, MODEL_JUDGMENT } from "@/lib/llm/client";
import { logStep, openException } from "@/lib/capabilities/execute";
import { parseWageDefinitionOverride, parseProofCategoryCapOverride } from "@/lib/capabilities/rules-lookup";

/** Re-validates a self-tagged rule_key against its required shape before
 * it's shown as "wired" on the exception desk — the model claiming a key
 * doesn't make the definition actually match it, and rules-lookup.ts will
 * independently re-check this anyway at consumption time regardless. */
function validateRuleKey(ruleKey: string | null | undefined, definition: unknown): string | null {
  if (ruleKey === "wage_definition" && parseWageDefinitionOverride(definition)) return ruleKey;
  if (ruleKey === "proof_category_cap" && parseProofCategoryCapOverride(definition)) return ruleKey;
  return null;
}

export interface RulesSetupResult {
  dutyInstanceId: string;
  candidatesProposed: number;
}

/**
 * The one-time "give Holly your own calculation sheet" setup — the answer
 * to "what if a company's data doesn't come from a source that already
 * computes payroll (like Remote.com), and instead I want to hand Holly
 * our own jurisdiction/company rules once and have her work from those."
 *
 * `rules` (schema 0001) was always meant for this — "statutory rules
 * seeded from our library; policy rules from their documents and
 * confirmed" — but nothing wrote to it until now. This agent reads
 * whatever a company pastes or uploads (a CTC breakup, a state's PT
 * slabs, a rounding convention, anything they'd otherwise hand a new
 * payroll hire on day one), asks one model call to pull out DISCRETE,
 * literal rule candidates — never invented, only what's actually there —
 * and puts each one on the exception desk as a `proposed_rule` for a
 * human to confirm, correct or reject. Nothing in `rules` is `confirmed`
 * (and therefore nothing is live) until a person has looked at it — same
 * posture as a Fact, and for the same reason: this is company-specific
 * configuration a mistake in which reaches every payslip, not a judgment
 * call worth trusting to one model pass.
 *
 * Consumption: structure-agent.ts and tax-agent.ts now read confirmed
 * rules back out (capabilities/rules-lookup.ts), but only for a small,
 * closed set of rule_keys they already know how to validate —
 * 'wage_definition' (Structure) and 'proof_category_cap' (Tax). Extraction
 * tags a candidate with one of these ONLY when the sheet maps onto it
 * unambiguously; everything else still lands on the exception desk and,
 * once confirmed, still lives in `rules` for a human to read — it's just
 * not wired to a calculation. Widening that set is future work, one
 * capability at a time, not all at once, so each one stays testable.
 */
export async function runRulesSetupAgent(
  db: SupabaseClient,
  args: { orgId: string; jurisdiction: string; sheetText: string }
): Promise<RulesSetupResult> {
  const { orgId, jurisdiction, sheetText } = args;

  const { data: duty, error: dutyError } = await db
    .from("duty_instances")
    .insert({ org_id: orgId, duty_type: "rules_setup", state: "in_progress" })
    .select("id")
    .single();
  if (dutyError) throw dutyError;
  const dutyInstanceId = duty.id as string;

  const prompt = `You are helping set up an HR/payroll AI team's rule book for one company.
Below is a calculation sheet they pasted — it might describe salary
components (basic/HRA/allowance percentages), statutory slabs (PT, ESI,
EPF), rounding conventions, leave-to-LOP conversion, or anything else
that determines a number on a payslip.

Default jurisdiction for anything not otherwise specified: ${jurisdiction}

Extract every DISCRETE, LITERAL rule you can find. Do not invent a rule
that isn't actually stated, do not fill in a plausible-sounding number
that wasn't given, and do not merge two different rules into one. If the
sheet is ambiguous about something, extract what IS clear and leave the
unclear part out rather than guessing at it.

Calculation sheet:
"""
${sheetText}
"""

Two kinds of rule are wired to an actual calculation right now — tag a
candidate with the matching rule_key ONLY when it clearly is one of
these, using EXACTLY this definition shape:

- "wage_definition": overrides the statutory 50% basic+DA test.
  definition: {"baseComponents": ["basic","da"], "minRatio": 0.5}
- "proof_category_cap": overrides one income-tax proof category's cap.
  definition: {"category": one of rent_receipts | lic_ppf_elss |
  home_loan_principal | home_loan_interest | medical_insurance | nps |
  lta, "cap": number}

Everything else — PT slabs, CTC breakup percentages, rounding
conventions, anything not one of the two shapes above — still gets
extracted and put on the exception desk for the record, just with
rule_key omitted (null). Do not force a rule into one of these two keys
if it doesn't actually match; leave rule_key out instead.

Reply with ONLY a JSON array, no other text. Each element:
{
  "label": "short human name, e.g. 'Karnataka PT slabs'",
  "scope": "statutory" | "policy",
  "jurisdiction": "e.g. IN-KA, or the default above if the sheet doesn't say",
  "rule_key": "wage_definition" | "proof_category_cap" | null,
  "definition": { ...structured shape fitting this specific rule, or the
    exact shape above if rule_key is set... },
  "confidence": 0 to 1 — 1 only if the sheet stated this unambiguously
}
Return an empty array if nothing extractable is found — never guess to
produce output.`;

  const anthropic = llmClient();
  // parsing a whole sheet correctly matters more than cost here. Same
  // callJudgmentModel guard as every other agent (see input-agent.ts) —
  // a rate limit or transient error here returns null instead of
  // throwing, so it reads back as zero candidates, not a 500.
  const text = await callJudgmentModel(anthropic, { model: MODEL_JUDGMENT, maxTokens: 2000, prompt });

  let candidates: Array<{
    label: string;
    scope: "statutory" | "policy";
    jurisdiction: string;
    rule_key?: string | null;
    definition: Record<string, unknown>;
    confidence: number;
  }> = [];
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) candidates = parsed;
    } catch {
      // Model didn't return clean JSON — zero candidates, never guess.
    }
  }

  await logStep(db, {
    dutyInstanceId,
    capability: "explain",
    input: { jurisdiction, sheetLength: sheetText.length },
    output: { candidatesFound: candidates.length },
  });

  for (const candidate of candidates) {
    if (!candidate?.label || !candidate?.definition) continue;
    const ruleKey = validateRuleKey(candidate.rule_key, candidate.definition);
    await openException(db, {
      dutyInstanceId,
      kind: "proposed_rule",
      conclusion: `Proposed rule — ${candidate.label} (${candidate.scope ?? "policy"}, ${candidate.jurisdiction ?? jurisdiction})${
        ruleKey ? ` — will apply to ${ruleKey === "wage_definition" ? "Structure's wage test" : "Tax's proof caps"} once confirmed` : ""
      }`,
      confidence: typeof candidate.confidence === "number" ? candidate.confidence : 0.5,
      payload: {
        label: candidate.label,
        scope: candidate.scope === "statutory" ? "statutory" : "policy",
        jurisdiction: candidate.jurisdiction || jurisdiction,
        ruleKey,
        definition: candidate.definition,
      },
    });
  }

  await db.from("duty_instances").update({ state: "blocked" }).eq("id", dutyInstanceId);

  return { dutyInstanceId, candidatesProposed: candidates.length };
}
