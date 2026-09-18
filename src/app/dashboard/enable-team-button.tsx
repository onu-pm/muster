"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Turns an available team on for the current org — see /api/teams/:key/enable. */
export function EnableTeamButton({ teamKey }: { teamKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const res = await fetch(`/api/teams/${teamKey}/enable`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={handleClick} disabled={busy}>
      {busy ? "Enabling…" : "Enable"}
    </button>
  );
}
