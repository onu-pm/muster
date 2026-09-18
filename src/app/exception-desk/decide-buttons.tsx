"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The exception desk's action row. Every correction asks one short
 * question about what the agent got wrong — that answer is what becomes
 * a Fact (see /api/exceptions/[id]/decide).
 */
export function DecideButtons({ exceptionId, orgId }: { exceptionId: string; orgId: string }) {
  const router = useRouter();
  const [correcting, setCorrecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(outcome: "approved" | "rejected" | "corrected", correctionNote?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, correctionNote, orgId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setCorrecting(false);
      setNote("");
    }
  }

  if (correcting) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          autoFocus
          placeholder="What did it get wrong?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button disabled={busy || !note} onClick={() => decide("corrected", note)}>
          Save correction
        </button>
        <button disabled={busy} onClick={() => setCorrecting(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button disabled={busy} onClick={() => decide("approved")}>
        Approve
      </button>
      <button disabled={busy} onClick={() => decide("rejected")}>
        Reject
      </button>
      <button disabled={busy} onClick={() => setCorrecting(true)}>
        Correct…
      </button>
    </div>
  );
}
