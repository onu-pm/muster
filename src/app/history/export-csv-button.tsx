"use client";

interface HistoryEventLike {
  at: string;
  personName: string | null;
  label: string;
  ruleApplied: string | null;
  outcome: string;
  approver: string | null;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Exports exactly the rows currently on screen (after filtering) — no
 * separate server round trip, since the page already has them. */
export function ExportCsvButton({ events }: { events: HistoryEventLike[] }) {
  function download() {
    const header = ["When", "Who", "What was done", "Rule applied", "Outcome", "Approver"];
    const rows = events.map((e) => [
      new Date(e.at).toLocaleString(),
      e.personName ?? "",
      e.label,
      e.ruleApplied ?? "",
      e.outcome,
      e.approver ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `muster-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn" onClick={download} disabled={events.length === 0}>
      Export CSV
    </button>
  );
}
