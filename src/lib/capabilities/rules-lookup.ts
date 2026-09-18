import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProofCategory } from "./proof-rules";
import { PROOF_CATEGORY_RULES } from "./proof-rules";
import { NATIONAL_JURISDICTION } from "./jurisdiction";

/**
 * Capability: rule lookup. Finds the most recent CONFIRMED row in `rules`
 * for a given org + rule_key, trying the exact jurisdiction first and
 * falling back to the national default — never a jurisdiction that wasn't
 * asked for. A rule with an `effective_to` in the past doesn't match; one
 * with no `effective_to` is open-ended.
 *
 * This returns the raw jsonb `definition` and nothing else. It is
 * deliberately NOT the last word on whether the rule is usable — each
 * caller (wage-test.ts's consumer in structure-agent.ts, proof-rules.ts's
 * consumer in tax-agent.ts) validates the shape itself with a matching
 * parse* function below before trusting it. A confirmed row is still just
 * data a human approved on the exception desk, not code — an invalid or
 * unexpected shape falls back to the tested default rather than being
 * used half-parsed, same "never guess" posture as everywhere else in this
 * codebase that reads a model or a human's free-form input.
 */
export async function findConfirmedRule(
  db: SupabaseClient,
  args: { orgId: string; jurisdiction: string; ruleKey: string; asOf: string }
): Promise<unknown | null> {
  const candidates = [args.jurisdiction, NATIONAL_JURISDICTION].filter(
    (j, i, arr) => arr.indexOf(j) === i // dedupe when jurisdiction is already national
  );

  for (const jurisdiction of candidates) {
    const { data, error } = await db
      .from("rules")
      .select("definition, effective_from, effective_to")
      .eq("org_id", args.orgId)
      .eq("rule_key", args.ruleKey)
      .eq("jurisdiction", jurisdiction)
      .eq("confirmed", true)
      .lte("effective_from", args.asOf)
      .or(`effective_to.is.null,effective_to.gte.${args.asOf}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.definition;
  }
  return null;
}

/**
 * Same matching as findConfirmedRule, but for a rule_key that can
 * legitimately have several confirmed rows at once — proof_category_cap
 * is one per category (medical_insurance, nps, ...), not a single value.
 * Returns every currently-effective definition for org + jurisdiction (no
 * per-row jurisdiction fallback here, since a caller batching several
 * categories at once already knows which single jurisdiction it wants —
 * pass NATIONAL_JURISDICTION directly for rule keys that are always
 * national, as proof_category_cap is).
 */
export async function findAllConfirmedRules(
  db: SupabaseClient,
  args: { orgId: string; jurisdiction: string; ruleKey: string; asOf: string }
): Promise<unknown[]> {
  const { data, error } = await db
    .from("rules")
    .select("definition")
    .eq("org_id", args.orgId)
    .eq("rule_key", args.ruleKey)
    .eq("jurisdiction", args.jurisdiction)
    .eq("confirmed", true)
    .lte("effective_from", args.asOf)
    .or(`effective_to.is.null,effective_to.gte.${args.asOf}`)
    .order("effective_from", { ascending: true }); // later rows overwrite earlier ones when a caller folds these into a map
  if (error) throw error;
  return (data ?? []).map((row) => row.definition);
}

export interface WageDefinitionOverride {
  baseComponents: string[];
  minRatio: number;
}

/** rule_key = 'wage_definition' — overrides wage-test.ts's built-in
 * WAGE_BASE_COMPONENTS / WAGE_TEST_MIN_RATIO. Valid only if baseComponents
 * is a non-empty array of strings and minRatio is a number in (0, 1]. */
export function parseWageDefinitionOverride(definition: unknown): WageDefinitionOverride | null {
  if (!definition || typeof definition !== "object") return null;
  const d = definition as Record<string, unknown>;

  const baseComponents =
    Array.isArray(d.baseComponents) &&
    d.baseComponents.length > 0 &&
    d.baseComponents.every((c) => typeof c === "string")
      ? (d.baseComponents as string[])
      : null;
  const minRatio = typeof d.minRatio === "number" && d.minRatio > 0 && d.minRatio <= 1 ? d.minRatio : null;

  if (!baseComponents || minRatio === null) return null;
  return { baseComponents, minRatio };
}

export interface ProofCategoryCapOverride {
  category: ProofCategory;
  cap: number;
}

/** rule_key = 'proof_category_cap' — overrides one of proof-rules.ts's
 * built-in per-category caps (Section 80C/80D/24(b) etc.). Valid only if
 * category is a real ProofCategory and cap is a positive number. */
export function parseProofCategoryCapOverride(definition: unknown): ProofCategoryCapOverride | null {
  if (!definition || typeof definition !== "object") return null;
  const d = definition as Record<string, unknown>;

  const category = typeof d.category === "string" && d.category in PROOF_CATEGORY_RULES ? (d.category as ProofCategory) : null;
  const cap = typeof d.cap === "number" && d.cap > 0 ? d.cap : null;

  if (!category || cap === null) return null;
  return { category, cap };
}
