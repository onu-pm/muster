/** Plain-language versions of duty_type/state — for screens a non-technical
 * founder reads, not the raw enum values. */

const DUTY_TYPE_LABELS: Record<string, string> = {
  payroll_input_pack: "Reconciling attendance and leave",
  salary_structure_review: "Reviewing salary structure changes",
  tax_declaration_review: "Verifying tax declarations",
};

const DUTY_STATE_LABELS: Record<string, string> = {
  open: "starting",
  in_progress: "in progress",
  blocked: "waiting on your review",
  closed: "done",
};

export function dutyTypeLabel(dutyType: string): string {
  return DUTY_TYPE_LABELS[dutyType] ?? dutyType.replace(/_/g, " ");
}

export function dutyStateLabel(state: string): string {
  return DUTY_STATE_LABELS[state] ?? state;
}

export function describeDuty(args: { dutyType: string; state: string; openedAt: string }): string {
  const cycle = new Date(args.openedAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return `${dutyTypeLabel(args.dutyType)} for ${cycle} — ${dutyStateLabel(args.state)}`;
}

/** The current cycle's plain label, e.g. "September 2026" — used as the
 * default cycleLabel for "Run a cycle" and shown on the button itself. */
export function currentCycleLabel(): string {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
