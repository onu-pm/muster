"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "idle" | "input" | "structure" | "tax" | "done" | "error";

interface AgentResult {
  label: string;
  summary: string;
}

const STAGE_MESSAGE: Partial<Record<Stage, string>> = {
  input: "Holly is reconciling attendance…",
  structure: "Holly is checking salary structures…",
  tax: "Holly is verifying tax proofs…",
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error ?? `${url} failed`);
  }
  return res.json();
}

/**
 * "Run a cycle" — a thin, honest sequence of the three existing agent
 * routes, not a real orchestrator (see the build doc's Section 5 for
 * that, Wave 2). No live attendance/proof source is wired up yet
 * (README), so this runs each agent against whatever's already on file
 * rather than new submissions — it proves the sequencing and the feel of
 * "one thing happening," not that real payroll data is flowing through.
 */
export function RunCycle({ orgId, cycleLabel }: { orgId: string; cycleLabel: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [results, setResults] = useState<AgentResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStage("input");
    setResults([]);
    setError(null);

    try {
      const inputRes = await postJson("/api/agents/input", { orgId, cycleLabel, rows: [] });
      setResults((r) => [
        ...r,
        {
          label: "Attendance & leave",
          summary: `${inputRes.rowsProcessed} checked, ${inputRes.explainedAutomatically} explained automatically, ${inputRes.exceptionsOpened} sent to the exception desk.`,
        },
      ]);

      setStage("structure");
      const structureRes = await postJson("/api/agents/structure", { orgId, cycleLabel, revisions: [], loans: [] });
      setResults((r) => [
        ...r,
        {
          label: "Salary structures",
          summary: `${structureRes.revisionsProcessed} revisions checked, ${structureRes.wageTestBreaches} wage-test breaches, ${structureRes.loansCreated} loans/advances created.`,
        },
      ]);

      setStage("tax");
      const taxRes = await postJson("/api/agents/tax", { orgId, cycleLabel, declarations: [] });
      setResults((r) => [
        ...r,
        {
          label: "Tax declarations",
          summary: `${taxRes.declarationsProcessed} declarations checked, ${taxRes.proofsVerified} proofs verified, ${taxRes.exceptionsOpened} sent to the exception desk.`,
        },
      ]);

      setStage("done");
      router.refresh(); // pick up the new duty_instances in "working on right now" / this month's counts
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }

  if (stage === "idle") {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Run a cycle</h2>
        <p className="text-muted">
          Runs attendance reconciliation, salary structure review and tax verification for {cycleLabel}, in
          sequence. No live attendance or proof-document source is connected yet, so this checks what's already on
          file rather than processing new submissions.
        </p>
        <button className="btn btn-primary" onClick={run}>
          Run {cycleLabel} payroll
        </button>
      </div>
    );
  }

  if (stage === "done" || stage === "error") {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Run a cycle</h2>
        {results.map((r) => (
          <p key={r.label} style={{ margin: "4px 0" }}>
            <strong>{r.label}:</strong> {r.summary}
          </p>
        ))}
        {error && <p className="error-text">{error}</p>}
        <div className="form-row" style={{ marginTop: 12 }}>
          <a className="btn btn-primary" href="/exception-desk">
            Go to the exception desk →
          </a>
          <button className="btn" onClick={() => setStage("idle")}>
            Run again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Run a cycle</h2>
      <p>{STAGE_MESSAGE[stage]}</p>
    </div>
  );
}
