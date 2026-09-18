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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
      <input
        required
        placeholder="Organisation name"
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
      />
      {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
      <button type="submit" disabled={busy || !orgName}>
        {busy ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}
