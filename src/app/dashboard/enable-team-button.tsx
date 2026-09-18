"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Turns an available team on for the current org — see /api/teams/:key/enable. */
export function EnableTeamButton({ teamKey }: { teamKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/teams/${teamKey}/enable`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button className="btn btn-primary" onClick={handleClick} disabled={busy}>
        {busy ? "Enabling…" : "Enable"}
      </button>
      {error && (
        <p className="error-text" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
