/**
 * Locations store a plain state name (`locations.state`, e.g. "Karnataka")
 * — rules store an ISO 3166-2:IN-style code (`rules.jurisdiction`, e.g.
 * "IN-KA"), matching what rules-setup-agent already extracts and what a
 * company would recognise from a government notification. This is the
 * fixed lookup between the two, not a computation — same posture as any
 * other static reference data in this codebase (capabilities/tax-rates.ts'
 * slab tables, capabilities/proof-rules.ts' caps).
 */
const STATE_TO_JURISDICTION: Record<string, string> = {
  "andhra pradesh": "IN-AP",
  "arunachal pradesh": "IN-AR",
  assam: "IN-AS",
  bihar: "IN-BR",
  chhattisgarh: "IN-CT",
  goa: "IN-GA",
  gujarat: "IN-GJ",
  haryana: "IN-HR",
  "himachal pradesh": "IN-HP",
  jharkhand: "IN-JH",
  karnataka: "IN-KA",
  kerala: "IN-KL",
  "madhya pradesh": "IN-MP",
  maharashtra: "IN-MH",
  manipur: "IN-MN",
  meghalaya: "IN-ML",
  mizoram: "IN-MZ",
  nagaland: "IN-NL",
  odisha: "IN-OR",
  punjab: "IN-PB",
  rajasthan: "IN-RJ",
  sikkim: "IN-SK",
  "tamil nadu": "IN-TN",
  telangana: "IN-TG",
  tripura: "IN-TR",
  "uttar pradesh": "IN-UP",
  uttarakhand: "IN-UT",
  "west bengal": "IN-WB",
  delhi: "IN-DL",
  "new delhi": "IN-DL",
};

export const NATIONAL_JURISDICTION = "IN-national";

/** A state name (as stored on locations.state) to its rules.jurisdiction
 * code, falling back to the national jurisdiction for anything unmapped
 * or unset — never throws, since an unresolved state just means "use the
 * national default," not an error. */
export function resolveJurisdiction(stateName: string | null | undefined): string {
  if (!stateName) return NATIONAL_JURISDICTION;
  return STATE_TO_JURISDICTION[stateName.trim().toLowerCase()] ?? NATIONAL_JURISDICTION;
}
