export interface SalaryStructure {
  [component: string]: number;
}

export interface WageTestResult {
  basicWage: number;
  grossWage: number;
  ratio: number; // basicWage / grossWage
  passed: boolean;
}

// Code on Wages, 2019: "wages" — the components that must add up to at least
// half of total remuneration — is basic pay plus dearness allowance. Every
// other component (HRA, special allowance, bonus, ...) is excluded.
const WAGE_BASE_COMPONENTS = ["basic", "da"];
const WAGE_TEST_MIN_RATIO = 0.5;

/**
 * Capability: the statutory 50% wage-definition test. Plain arithmetic, no
 * LLM involved — a structure either meets the rule or it doesn't. The
 * Structure agent spends a model call only once this has already found a
 * breach, to propose how to fix the split.
 *
 * `overrides` lets a caller substitute a confirmed org/jurisdiction rule
 * (see capabilities/rules-lookup.ts's parseWageDefinitionOverride) for the
 * built-in constants below — the test itself doesn't know or care where
 * the numbers came from, it's still the same tested arithmetic either way.
 */
/** "basic" should match "Basic", "special allowance" should match
 * "specialAllowance" — a confirmed rule's component names come from a
 * human's calculation sheet (or an LLM's reading of one), not from the
 * salary_structure JSON's own camelCase keys, so exact-key lookup would
 * silently drop a real match. Comparing case/space-normalised is a
 * lookup, not a calculation — the actual sum is still exact. */
function normalizeComponentKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

export function checkWageDefinition(
  structure: SalaryStructure,
  overrides?: { baseComponents?: string[]; minRatio?: number }
): WageTestResult {
  const baseComponents = overrides?.baseComponents ?? WAGE_BASE_COMPONENTS;
  const minRatio = overrides?.minRatio ?? WAGE_TEST_MIN_RATIO;
  const normalizedBaseComponents = new Set(baseComponents.map(normalizeComponentKey));

  const grossWage = Object.values(structure).reduce((sum, v) => sum + (v || 0), 0);
  const basicWage = Object.entries(structure).reduce(
    (sum, [key, value]) => (normalizedBaseComponents.has(normalizeComponentKey(key)) ? sum + (value || 0) : sum),
    0
  );
  const ratio = grossWage === 0 ? 0 : Number((basicWage / grossWage).toFixed(4));
  return { basicWage, grossWage, ratio, passed: ratio >= minRatio };
}

/**
 * Capability: arrear recomputation. Plain arithmetic — the difference in
 * gross pay between the old and new structure, times the number of already-
 * elapsed months since the change should have taken effect. Returns null
 * when there's nothing to backdate (no previous structure on file, or the
 * change isn't retrospective).
 */
export function computeArrears(args: {
  previousStructure: SalaryStructure | null;
  newStructure: SalaryStructure;
  effectiveFrom: string; // ISO date
  asOf: string; // ISO date to measure "already elapsed" against
}): number | null {
  const { previousStructure, newStructure, effectiveFrom, asOf } = args;
  if (!previousStructure) return null;

  const effective = new Date(effectiveFrom);
  const cutoff = new Date(asOf);
  const monthsElapsed =
    (cutoff.getFullYear() - effective.getFullYear()) * 12 + (cutoff.getMonth() - effective.getMonth());
  if (monthsElapsed <= 0) return null; // not retrospective

  const previousGross = Object.values(previousStructure).reduce((sum, v) => sum + (v || 0), 0);
  const newGross = Object.values(newStructure).reduce((sum, v) => sum + (v || 0), 0);
  return Number(((newGross - previousGross) * monthsElapsed).toFixed(2));
}
