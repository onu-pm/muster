"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "idle" | "classifying" | "input" | "structure" | "tax" | "done" | "unsupported" | "error";

interface AgentResult {
  label: string;
  summary: string;
}

const CYCLE_STAGE_MESSAGE: Partial<Record<Stage, string>> = {
  classifying: "Holly is reading that…",
  input: "Holly is reconciling attendance…",
  structure: "Holly is checking salary structures…",
  tax: "Holly is verifying tax proofs…",
};

const SHAPE_LABEL: Record<string, string> = {
  cycle: "a cycle",
  case: "a case about one person",
  question: "a question",
  change: "a change to many records",
  unsupported: "something I don't recognise",
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
 * The goal box — type what you want, Holly reads it and either takes
 * over or tells you honestly that she can't do that yet.
 *
 * One classification call (api/agents/classify) reads the goal shape
 * (Section 5 of the team-architecture doc: Cycle / Case / Question /
 * Change). Only "cycle" is wired to anything right now — it runs the
 * same Input -> Structure -> Tax sequence the old "Run a cycle" button
 * did (against Remote.com data when REMOTE_API_TOKEN is set, otherwise
 * whatever's on file). Case, Question and Change are classified
 * correctly but have no agent behind them yet, so Holly says so instead
 * of pretending. That gap closes agent by agent, not by this box getting
 * cleverer.
 */
export function GoalBox({ orgId, cycleLabel }: { orgId: string; cycleLabel: string }) {
  const router = useRouter();
  const [goal, setGoal] = useState(`Run ${cycleLabel} payroll`);
  const [stage, setStage] = useState<Stage>("idle");
  const [results, setResults] = useState<AgentResult[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!goal.trim()) return;
    setStage("classifying");
    setResults([]);
    setNote(null);
    setError(null);

    try {
      const classification = await postJson("/api/agents/classify", { goal });

      if (classification.shape !== "cycle") {
        setNote(classification.reason || `That reads like ${SHAPE_LABEL[classification.shape] ?? "something new"}.`);
        setStage("unsupported");
        return;
      }

      setStage("input");
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

  function reset() {
    setStage("idle");
    setResults([]);
    setNote(null);
    setError(null);
  }

  if (stage === "idle") {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tell Holly what you need</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          She currently only knows how to run a payroll cycle — attendance reconciliation, salary structure review
          and tax verification, in sequence. Ask her anything else and she'll tell you it's not built yet rather than
          guess.
        </p>
        <div className="form-row">
          <input
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={`Run ${cycleLabel} payroll`}
            style={{ flex: 1, padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
          />
          <button className="btn btn-primary" onClick={submit} disabled={!goal.trim()}>
            Send
          </button>
        </div>
      </div>
    );
  }

  if (stage === "unsupported") {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tell Holly what you need</h2>
        <p style={{ margin: "8px 0" }}>{note}</p>
        <p className="text-muted" style={{ margin: "8px 0 12px" }}>
          The only thing she can actually run right now is a payroll cycle. Try "Run {cycleLabel} payroll," or ask
          again once more of the team is built.
        </p>
        <button className="btn" onClick={reset}>
          Try again
        </button>
      </div>
    );
  }

  if (stage === "done" || stage === "error") {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tell Holly what you need</h2>
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
          <button className="btn" onClick={reset}>
            Ask again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Tell Holly what you need</h2>
      <p>{CYCLE_STAGE_MESSAGE[stage]}</p>
    </div>
  );
}
