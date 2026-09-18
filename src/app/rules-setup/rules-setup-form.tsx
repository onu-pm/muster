"use client";

import { useState } from "react";

export function RulesSetupForm({ orgId }: { orgId: string }) {
  const [jurisdiction, setJurisdiction] = useState("IN-national");
  const [sheetText, setSheetText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ candidatesProposed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sheetText.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agents/rules-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, jurisdiction, sheetText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        {result.candidatesProposed === 0 ? (
          <p>
            Holly couldn't find a clear, literal rule in that text — she doesn't guess at figures that weren't
            actually stated. Try pasting the raw table or numbers rather than a description.
          </p>
        ) : (
          <p>
            Found {result.candidatesProposed} rule{result.candidatesProposed === 1 ? "" : "s"} in that sheet. Each
            one is on the exception desk now, waiting for you to confirm, correct or reject it — none are live yet.
          </p>
        )}
        <div className="form-row" style={{ marginTop: 12 }}>
          <a className="btn btn-primary" href="/exception-desk">
            Go to the exception desk →
          </a>
          <button className="btn" onClick={() => setResult(null)}>
            Add another sheet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <label style={{ display: "block", marginBottom: 12 }}>
        <div className="text-muted" style={{ marginBottom: 4, fontSize: 13 }}>
          Default jurisdiction (e.g. IN-KA, IN-MH)
        </div>
        <input
          className="field"
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        <div className="text-muted" style={{ marginBottom: 4, fontSize: 13 }}>
          Calculation sheet
        </div>
        <textarea
          className="field"
          value={sheetText}
          onChange={(e) => setSheetText(e.target.value)}
          rows={12}
          placeholder={"e.g.\nKarnataka PT: up to 15000 = 0, 15001-25000 = 200, above 25000 = 300 monthly\nCTC breakup: Basic 40%, HRA 20%, Special allowance remainder\nLOP rounding: round to nearest half day"}
          style={{ width: "100%", fontFamily: "var(--font-mono)" }}
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={busy || !sheetText.trim()}>
        {busy ? "Holly is reading it…" : "Send to Holly"}
      </button>
    </div>
  );
}
