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
 * Verified 2026-09-18 with a live GET against both endpoints (empty
 * company, so shape only — zero real rows to check the mapping logic
 * against):
 * - Paths are correct: `/v1/employments` and `/v1/timeoff` both 200, not
 *   404. The original comment here called these a best guess — they
 *   weren't wrong, just unconfirmed until now.
 * - The response envelope was wrong, though. Both endpoints actually
 *   return `{ data: { total_count, current_page, total_pages, <key> } }`
 *   — a nested object, not `{ data: T[], has_more }` as first assumed.
 *   The array itself is keyed by the resource name, plural:
 *   `employments` on /v1/employments, `timeoffs` (plural, even though
 *   the path is singular) on /v1/timeoff.
 * - Pagination turned out to be uniform after all — both use the same
 *   page/page_size request params and total_pages/current_page response
 *   fields, not a has_more flag. The "might not be uniform" concern in
 *   Remote's docs didn't apply to these two.
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

interface RemotePagination {
  total_count: number;
  current_page: number;
  total_pages: number;
}

interface RemoteEmploymentsResponse {
  data: RemotePagination & { employments: RemoteEmployment[] };
}

interface RemoteTimeOffResponse {
  data: RemotePagination & { timeoffs: RemoteTimeOff[] };
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

async function remoteGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
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
    const result = await remoteGet<RemoteEmploymentsResponse>("/v1/employments", { page, page_size: 100 });
    const { employments, current_page, total_pages } = result.data;
    all.push(...employments);
    if (current_page >= total_pages || employments.length === 0) break;
    page += 1;
    if (page > 20) break; // sane upper bound for a demo company
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
    const result = await remoteGet<RemoteTimeOffResponse>("/v1/timeoff", { page, page_size: 100 });
    const { timeoffs, current_page, total_pages } = result.data;
    all.push(...timeoffs);
    if (current_page >= total_pages || timeoffs.length === 0) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

export type { RemoteEmployment, RemoteTimeOff, RemoteTimeOffDay };
