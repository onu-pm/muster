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
 */
export function checkWageDefinition(structure: SalaryStructure): WageTestResult {
  const grossWage = Object.values(structure).reduce((sum, v) => sum + (v || 0), 0);
  const basicWage = WAGE_BASE_COMPONENTS.reduce((sum, key) => sum + (structure[key] || 0), 0);
  const ratio = grossWage === 0 ? 0 : Number((basicWage / grossWage).toFixed(4));
  return { basicWage, grossWage, ratio, passed: ratio >= WAGE_TEST_MIN_RATIO };
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
