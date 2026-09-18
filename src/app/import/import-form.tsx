"use client";

import { useState } from "react";
import { parseCsv } from "@/lib/csv";

type Stage = "upload" | "map" | "preview" | "submitting" | "done" | "error";

interface Person {
  id: string;
  full_name: string;
}

interface MappedRow {
  name: string;
  attendanceDays: number;
  leaveDays: number;
  personId: string | null; // null = no match in `people`, skipped on submit
}

export function ImportForm({ orgId, cycleLabel, people }: { orgId: string; cycleLabel: string; people: Person[] }) {
  const [stage, setStage] = useState<Stage>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [nameCol, setNameCol] = useState("");
  const [attendanceCol, setAttendanceCol] = useState("");
  const [leaveCol, setLeaveCol] = useState("");
  const [mapped, setMapped] = useState<MappedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    rowsProcessed: number;
    explainedAutomatically: number;
    exceptionsOpened: number;
  } | null>(null);

  const nameByLower = new Map(people.map((p) => [p.full_name.trim().toLowerCase(), p.id]));

  async function handleFile(file: File) {
    setError(null);
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    if (h.length === 0 || r.length === 0) {
      setError("Couldn't find any rows in that file — check it's a plain CSV with a header row.");
      return;
    }
    setHeaders(h);
    setRows(r);
    // Best-effort guess so the mapping step usually needs no clicks —
    // still shown and overridable, never assumed silently past this point.
    setNameCol(h.find((c) => /name/i.test(c)) ?? h[0]);
    setAttendanceCol(h.find((c) => /attend/i.test(c)) ?? "");
    setLeaveCol(h.find((c) => /leave/i.test(c)) ?? "");
    setStage("map");
  }

  function buildPreview() {
    const nameIdx = headers.indexOf(nameCol);
    const attendanceIdx = headers.indexOf(attendanceCol);
    const leaveIdx = headers.indexOf(leaveCol);

    const preview: MappedRow[] = rows.map((row) => {
      const name = row[nameIdx] ?? "";
      const attendanceDays = Number(row[attendanceIdx]);
      const leaveDays = Number(row[leaveIdx]);
      const personId = nameByLower.get(name.trim().toLowerCase()) ?? null;
      return { name, attendanceDays, leaveDays, personId };
    });
    setMapped(preview);
    setStage("preview");
  }

  async function submit() {
    setStage("submitting");
    setError(null);
    const validRows = mapped
      .filter((r) => r.personId && Number.isFinite(r.attendanceDays) && Number.isFinite(r.leaveDays))
      .map((r) => ({
        personId: r.personId as string,
        personName: r.name,
        attendanceDays: r.attendanceDays,
        leaveDays: r.leaveDays,
      }));

    try {
      const res = await fetch("/api/agents/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, cycleLabel, rows: validRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult(data);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("error");
    }
  }

  function reset() {
    setStage("upload");
    setHeaders([]);
    setRows([]);
    setMapped([]);
    setResult(null);
    setError(null);
  }

  if (stage === "upload") {
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {error && (
          <p className="error-text" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (stage === "map") {
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <p className="text-muted">{rows.length} rows found. Match each column once:</p>
        <div className="form-stack">
          <label>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
              Employee name column
            </div>
            <select className="field" value={nameCol} onChange={(e) => setNameCol(e.target.value)}>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
              Attendance days column
            </div>
            <select className="field" value={attendanceCol} onChange={(e) => setAttendanceCol(e.target.value)}>
              <option value="">— choose —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
              Leave days column
            </div>
            <select className="field" value={leaveCol} onChange={(e) => setLeaveCol(e.target.value)}>
              <option value="">— choose —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={buildPreview} disabled={!nameCol || !attendanceCol || !leaveCol}>
            Preview
          </button>
        </div>
      </div>
    );
  }

  if (stage === "preview") {
    const matchedCount = mapped.filter((r) => r.personId).length;
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <p>
          {matchedCount} of {mapped.length} row(s) matched a person on file by name.
          {matchedCount < mapped.length && " Unmatched rows are skipped, never guessed."}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Attendance</th>
              <th>Leave</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {mapped.slice(0, 20).map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.attendanceDays}</td>
                <td>{r.leaveDays}</td>
                <td className={r.personId ? "" : "error-text"}>{r.personId ? "Matched" : "Not found"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {mapped.length > 20 && <p className="text-muted">…and {mapped.length - 20} more.</p>}
        <div className="form-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={submit} disabled={matchedCount === 0}>
            Send {matchedCount} row(s) to Holly
          </button>
          <button className="btn" onClick={reset}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (stage === "submitting") {
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <p>Holly is reconciling…</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      {result && (
        <p>
          {result.rowsProcessed} checked, {result.explainedAutomatically} explained automatically,{" "}
          {result.exceptionsOpened} sent to the exception desk.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="form-row" style={{ marginTop: 12 }}>
        <a className="btn btn-primary" href="/exception-desk">
          Go to the exception desk →
        </a>
        <button className="btn" onClick={reset}>
          Import another file
        </button>
      </div>
    </div>
  );
}
