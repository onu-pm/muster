/**
 * Remote.com API client — thin wrapper, bearer-token auth.
 *
 * Two environment variables drive it:
 *   REMOTE_API_TOKEN     A company API token generated in Remote under
 *                         Company Settings -> Integrations & APIs -> Remote
 *                         API -> Generate API token. Starts with `ra_test_`
 *                         (sandbox) or `ra_live_` (production) — the two are
 *                         fully isolated, so a test token against the
 *                         production URL (or vice versa) will fail.
 *   REMOTE_API_BASE_URL  https://gateway.remote-sandbox.com (sandbox,
 *                         default here) or https://gateway.remote.com
 *                         (production).
 *
 * A note on the endpoint paths below: Remote's own reference pages
 * (developer.remote.com/reference/get_index_employment and
 * .../get_index_timeoff) are JS-rendered and didn't yield the literal path
 * string during research — `/v1/employments` and `/v1/timeoff` are the
 * well-reasoned best guess from the `v1`-versioned gateway and the
 * "list/index" naming, not a confirmed value. The first real call against
 * the sandbox (once REMOTE_API_TOKEN is set) confirms or corrects this in
 * one round trip — a 404 here is the first thing to check, not a deeper bug.
 */

interface RemoteEmployment {
  id: string;
  full_name?: string;
  status?: string; // active | invited | created | deleted | ... (varies)
  job_title?: string;
  [key: string]: unknown; // the rest varies by country — see Remote's docs
}

interface RemoteTimeOffDay {
  date: string; // "2026-09-15"
  hours: number; // 0 for weekends/non-working days, up to 8
}

interface RemoteTimeOff {
  id: string;
  employment_id: string;
  start_date: string;
  end_date: string;
  timeoff_days: RemoteTimeOffDay[];
  timeoff_type: string; // paid_time_off | sick_leave | public_holiday | unpaid_leave | ...
  // Remote's own lifecycle: requested -> approved -> taken (once the date
  // passes) -> or declined / cancel_requested -> canceled.
  status: "requested" | "approved" | "taken" | "declined" | "cancel_requested" | "canceled" | string;
  approver_id?: string;
  approved_at?: string;
}

interface RemotePage<T> {
  data: T[];
  has_more?: boolean;
}

function remoteConfig() {
  const token = process.env.REMOTE_API_TOKEN;
  const baseUrl = process.env.REMOTE_API_BASE_URL || "https://gateway.remote-sandbox.com";
  return { token, baseUrl };
}

/** Whether a Remote.com connection is configured at all — callers use this
 * to fall back to "nothing to sync" rather than throwing. */
export function remoteConfigured(): boolean {
  return Boolean(remoteConfig().token);
}

async function remoteGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<RemotePage<T>> {
  const { token, baseUrl } = remoteConfig();
  if (!token) throw new Error("REMOTE_API_TOKEN is not set.");

  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Remote API ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** All employments for the company this token belongs to, across pages. */
export async function listEmployments(): Promise<RemoteEmployment[]> {
  const all: RemoteEmployment[] = [];
  let page = 1;
  for (;;) {
    const result = await remoteGet<RemoteEmployment>("/v1/employments", { page, page_size: 100 });
    const batch = result.data ?? [];
    all.push(...batch);
    if (!result.has_more || batch.length === 0) break;
    page += 1;
    if (page > 20) break; // sane upper bound for a sandbox demo company
  }
  return all;
}

/** All time-off entries for the company. Filtered client-side by cycle
 * date range in remote-sync.ts — the list endpoint's documented filters
 * are employment id / type / status, not a date range. */
export async function listTimeOff(): Promise<RemoteTimeOff[]> {
  const all: RemoteTimeOff[] = [];
  let page = 1;
  for (;;) {
    const result = await remoteGet<RemoteTimeOff>("/v1/timeoff", { page, page_size: 100 });
    const batch = result.data ?? [];
    all.push(...batch);
    if (!result.has_more || batch.length === 0) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

export type { RemoteEmployment, RemoteTimeOff, RemoteTimeOffDay };
