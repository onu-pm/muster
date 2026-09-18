"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The one-field "name your organisation" form that finishes onboarding. */
export function OnboardingForm() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }

    // "/" decides where to land next — no team is enabled yet for a
    // brand-new org, so this currently lands on the team picker.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="form-stack auth-shell">
      <input
        required
        className="field"
        placeholder="Organisation name"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
      />
      {error && <p className="error-text">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !orgName}>
        {busy ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}
