import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { llmClient, MODEL_JUDGMENT } from "@/lib/llm/client";
import { logStep, openException } from "@/lib/capabilities/execute";

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
 * What this does NOT do yet: nothing in Structure or Tax's deterministic
 * calculation code (wage-test.ts, tax-rates.ts) reads confirmed rules
 * back out. This is the capture-and-confirm half of the loop; wiring each
 * capability to check `rules` before falling back to the generic
 * statutory defaults is the next, separate piece of work — one capability
 * at a time, not all at once, so each one stays testable.
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

Reply with ONLY a JSON array, no other text. Each element:
{
  "label": "short human name, e.g. 'Karnataka PT slabs'",
  "scope": "statutory" | "policy",
  "jurisdiction": "e.g. IN-KA, or the default above if the sheet doesn't say",
  "definition": { ...whatever structured shape fits this specific rule... },
  "confidence": 0 to 1 — 1 only if the sheet stated this unambiguously
}
Return an empty array if nothing extractable is found — never guess to
produce output.`;

  const anthropic = llmClient();
  const response = await anthropic.messages.create({
    model: MODEL_JUDGMENT, // parsing a whole sheet correctly matters more than cost here
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let candidates: Array<{
    label: string;
    scope: "statutory" | "policy";
    jurisdiction: string;
    definition: Record<string, unknown>;
    confidence: number;
  }> = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) candidates = parsed;
  } catch {
    // Model didn't return clean JSON — zero candidates, never guess.
    candidates = [];
  }

  await logStep(db, {
    dutyInstanceId,
    capability: "explain",
    input: { jurisdiction, sheetLength: sheetText.length },
    output: { candidatesFound: candidates.length },
  });

  for (const candidate of candidates) {
    if (!candidate?.label || !candidate?.definition) continue;
    await openException(db, {
      dutyInstanceId,
      kind: "proposed_rule",
      conclusion: `Proposed rule — ${candidate.label} (${candidate.scope ?? "policy"}, ${candidate.jurisdiction ?? jurisdiction})`,
      confidence: typeof candidate.confidence === "number" ? candidate.confidence : 0.5,
      payload: {
        label: candidate.label,
        scope: candidate.scope === "statutory" ? "statutory" : "policy",
        jurisdiction: candidate.jurisdiction || jurisdiction,
        definition: candidate.definition,
      },
    });
  }

  await db.from("duty_instances").update({ state: "blocked" }).eq("id", dutyInstanceId);

  return { dutyInstanceId, candidatesProposed: candidates.length };
}
