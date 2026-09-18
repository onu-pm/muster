export interface ReconcileRow {
  personId: string;
  personName: string;
  a: number; // e.g. attendance-derived days
  b: number; // e.g. leave-system days
  label: string; // what a/b represent
}

export interface ReconcileDifference {
  personId: string;
  personName: string;
  expected: number;
  actual: number;
  delta: number;
  explanation: string | null; // null = could not explain, becomes an exception
}

/**
 * Capability: Reconcile. Compare two sources line by line and explain each
 * difference. Never averages or guesses — every unexplained delta is
 * surfaced, not smoothed over. This is plain code, not an LLM call: the
 * arithmetic is deterministic, and only the judgment about *why* a
 * discrepancy exists (which the agent supplies from context) is a
 * capability worth spending a model call on.
 */
export function reconcile(
  rows: ReconcileRow[],
  explain: (row: ReconcileRow, delta: number) => string | null
): ReconcileDifference[] {
  return rows
    .map((row) => {
      const delta = Number((row.a - row.b).toFixed(2));
      if (delta === 0) return null;
      return {
        personId: row.personId,
        personName: row.personName,
        expected: row.b,
        actual: row.a,
        delta,
        explanation: explain(row, delta),
      };
    })
    .filter((d): d is ReconcileDifference => d !== null);
}
