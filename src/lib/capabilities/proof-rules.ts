import type { Regime } from "./tax-rates";

export type ProofCategory =
  | "rent_receipts"
  | "lic_ppf_elss"
  | "home_loan_principal"
  | "home_loan_interest"
  | "medical_insurance"
  | "nps"
  | "lta";

export interface ProofCategoryRule {
  label: string;
  section: string;
  regimeEligible: Regime[]; // which regime(s) this exemption applies under
  rule: string; // what a proof document must show — used in the judgment prompt
  cap?: number; // this category's own annual cap, if any
  sharedCapWith?: ProofCategory; // combined with another category's cap (Section 80C)
}

/**
 * Capability: proof-category rules. What each of the seven declaration
 * categories the Tax agent handles needs to prove, and its statutory cap —
 * checked against incometaxindia.gov.in (Section 80D) and multiple
 * secondary sources corroborating the long-standing Section 24(b)/80C
 * figures. All seven are old-regime-only exemptions; the new regime keeps
 * almost none of them (Section 115BAC removes most Chapter VI-A
 * deductions and HRA/LTA exemptions).
 */
export const PROOF_CATEGORY_RULES: Record<ProofCategory, ProofCategoryRule> = {
  rent_receipts: {
    label: "Rent receipts (HRA exemption)",
    section: "Section 10(13A)",
    regimeEligible: ["old"],
    rule: "Must cover the claimed period, show the landlord's name and address, and be signed. Annual rent above ₹1,00,000 additionally requires the landlord's PAN on file.",
  },
  lic_ppf_elss: {
    label: "LIC premium / PPF / ELSS",
    section: "Section 80C",
    regimeEligible: ["old"],
    rule: "A premium receipt, PPF passbook entry, or ELSS statement, dated within the financial year, in the employee's own name (LIC may also be spouse or child).",
    cap: 150000,
    sharedCapWith: "home_loan_principal",
  },
  home_loan_principal: {
    label: "Home loan principal repayment",
    section: "Section 80C",
    regimeEligible: ["old"],
    rule: "A bank/NBFC repayment certificate showing the principal component for the financial year, for a self-occupied property.",
    cap: 150000,
    sharedCapWith: "lic_ppf_elss",
  },
  home_loan_interest: {
    label: "Home loan interest",
    section: "Section 24(b)",
    regimeEligible: ["old"],
    rule: "A bank/NBFC interest certificate for the financial year, for a self-occupied property.",
    cap: 200000,
  },
  medical_insurance: {
    label: "Medical insurance premium",
    section: "Section 80D",
    regimeEligible: ["old"],
    rule: "A premium payment receipt/certificate, not paid in cash, for self/family or parents.",
    cap: 25000,
  },
  nps: {
    label: "National Pension System contribution",
    section: "Section 80CCD(1B)",
    regimeEligible: ["old"],
    rule: "An NPS contribution statement for the financial year, over and above the Section 80C limit.",
    cap: 50000,
  },
  lta: {
    label: "Leave Travel Allowance",
    section: "Section 10(5)",
    regimeEligible: ["old"],
    rule: "Travel tickets/boarding passes for domestic travel undertaken within the financial year, for the employee and family.",
  },
};

export const LANDLORD_PAN_RENT_THRESHOLD = 100000;

export interface DeterministicCheckResult {
  passed: boolean;
  reason: string | null; // set when passed is false — never send an obviously-broken claim to the model
}

/**
 * The structured checks that don't need a document to be read at all —
 * regime eligibility and the landlord-PAN rule are both just comparisons
 * against fields already on the declaration. Run these BEFORE spending a
 * model call; only what passes goes on to per-document verification.
 */
export function checkDeterministic(args: {
  category: ProofCategory;
  regime: Regime;
  claimedAmount: number;
  landlordPan?: string | null;
}): DeterministicCheckResult {
  const { category, regime, claimedAmount, landlordPan } = args;
  const rule = PROOF_CATEGORY_RULES[category];

  if (!rule.regimeEligible.includes(regime)) {
    return { passed: false, reason: `${rule.label} is not an eligible exemption under the ${regime} regime.` };
  }

  if (category === "rent_receipts" && claimedAmount > LANDLORD_PAN_RENT_THRESHOLD && !landlordPan) {
    return {
      passed: false,
      reason: `Claimed annual rent (₹${claimedAmount.toLocaleString("en-IN")}) exceeds ₹1,00,000 — landlord PAN is required but missing.`,
    };
  }

  return { passed: true, reason: null };
}
