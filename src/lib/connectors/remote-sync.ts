import { listEmployments, listTimeOff, remoteConfigured } from "./remote";
import type { InputAgentRow } from "@/lib/agents/input-agent";

/**
 * Builds Input-agent rows straight from Remote.com.
 *
 * There's no separate "attendance system" behind an EOR/global-payroll
 * platform like Remote the way there would be behind a swipe machine —
 * Remote's own time-off record is the only source of truth available. So
 * rather than fabricate a second independent source, this repurposes the
 * Input agent's two-source reconcile pattern to check a different, still
 * genuinely useful discrepancy: approved leave vs. leave actually taken.
 *
 *   attendanceDays = business days in the cycle − TAKEN leave days
 *                    (days the person was actually at their desk, per
 *                    Remote's own "taken" status — approved leave whose
 *                    date has already passed)
 *   leaveDays      = business days in the cycle − APPROVED-OR-TAKEN days
 *                    (days they were expected at their desk, per what was
 *                    authorized — "approved" and "taken" both count as
 *                    authorized; only "taken" has actually happened)
 *
 * A delta between the two means authorized and actual leave disagree for
 * that person this cycle — which is exactly the kind of thing that should
 * land as an LOP exception rather than being guessed at, not a bug in this
 * mapping.
 *
 * Known gap: no public-holiday calendar is applied — business days here
 * is Mon-Fri only, so a cycle spanning a local holiday will show a
 * harmless day or two of drift on every employee until that's added
 * (the Rules/Calendar store in the Org Brain is where that belongs).
 */
export async function buildRemoteAttendanceRows(args: {
  cycleStart: Date;
  cycleEnd: Date;
}): Promise<InputAgentRow[]> {
  if (!remoteConfigured()) return [];

  const [employments, timeOff] = await Promise.all([listEmployments(), listTimeOff()]);
  const businessDays = countBusinessDays(args.cycleStart, args.cycleEnd);

  return employments
    .filter((e) => (e.status ?? "active") !== "deleted")
    .map((employment) => {
      const entries = timeOff.filter((t) => t.employment_id === employment.id);

      const takenDays = sumOverlappingDays(
        entries.filter((t) => t.status === "taken"),
        args.cycleStart,
        args.cycleEnd
      );
      const authorizedDays = sumOverlappingDays(
        entries.filter((t) => t.status === "taken" || t.status === "approved"),
        args.cycleStart,
        args.cycleEnd
      );

      return {
        personId: employment.id,
        personName: employment.full_name ?? employment.id,
        attendanceDays: Math.max(businessDays - takenDays, 0),
        leaveDays: Math.max(businessDays - authorizedDays, 0),
      };
    });
}

function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Sums a set of time-off entries' per-day hours (8h = 1 day) for the days
 * that fall inside [cycleStart, cycleEnd]. */
function sumOverlappingDays(
  entries: { timeoff_days: { date: string; hours: number }[] }[],
  cycleStart: Date,
  cycleEnd: Date
): number {
  let total = 0;
  for (const entry of entries) {
    for (const day of entry.timeoff_days ?? []) {
      const date = new Date(day.date);
      if (date >= cycleStart && date <= cycleEnd) {
        total += day.hours / 8;
      }
    }
  }
  return total;
}
