# Muster — v0

The first runnable slice: the schema, and the Input agent (Wave 1, payroll
team). This is not the whole product — it's the smallest thing that proves
the architecture works end to end: reconcile deterministically, spend a
model call only on the judgment part, write everything to an auditable
trail, and put anything uncertain on the exception desk.

## What's here

- `supabase/migrations/0001_init_schema.sql` — the full schema: the twelve
  tables from the build doc, plus `org_members` (for Row Level Security)
  and `facts` (the Learned Facts store `decisions` writes into).
- `src/lib/capabilities/` — Verify, Reconcile, Execute (Pursue is stubbed —
  see below).
- `src/lib/agents/input-agent.ts` — the Input agent itself.
- `src/app/api/agents/input/route.ts` — triggers it.
- `src/app/api/exceptions/[id]/decide/route.ts` — the exception desk's one
  action: record a Decision, write a Fact in the same request when there's
  a correction note.
- `src/app/work-queue`, `src/app/exception-desk` — two of the six screens
  from the build doc, reading Supabase directly.

## What's deliberately not here yet

- **Pursue** (`capabilities/pursue.ts`) is a stub that logs intent. The real
  channel is the WhatsApp Business Platform API through an Indian BSP
  (Gupshup / Interakt / Wati) — nothing to build against until that
  account exists.
- **No login.** The UI reads with the Supabase service-role key directly,
  server-side, so there's nothing to sign into yet. Row Level Security is
  already in the schema (`org_members`) for when Supabase Auth is wired
  into the UI — the policies just aren't being exercised by anything yet.
- **No document ingestion.** The Input agent here takes attendance/leave
  numbers directly in the API call, standing in for "already pulled from
  the attendance system" — that integration doesn't exist yet either.
- Structure, Tax, Run, Compliance, Settlement, Query, Audit agents — the
  other seven. One at a time, per the build sequence in the doc.

## Setup

1. **Supabase.** In your project's SQL editor, run
   `supabase/migrations/0001_init_schema.sql`. Then Project Settings → API
   to get your project URL, anon key, and service role key.
2. **OpenRouter.** Create an account, then Settings → Integrations → add
   your own Anthropic API key (BYOK) — this is what makes it cost the same
   as calling Anthropic directly. Create an OpenRouter API key for the app.
3. Copy `.env.example` to `.env.local` and fill in all five values.
4. `npm install`
5. `npm run dev` → http://localhost:3000

## Trying the Input agent

You'll need at least one row in `organisations` first (create one from the
Supabase table editor — id, name is enough). Then:

```bash
curl -X POST http://localhost:3000/api/agents/input \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "PASTE-YOUR-ORG-ID",
    "cycleLabel": "September 2026",
    "rows": [
      { "personId": "11111111-1111-1111-1111-111111111111", "personName": "Priya Rao", "attendanceDays": 22, "leaveDays": 21 },
      { "personId": "22222222-2222-2222-2222-222222222222", "personName": "Arjun Mehta", "attendanceDays": 20, "leaveDays": 20 }
    ]
  }'
```

Arjun reconciles clean (no LLM call — the delta is zero, so nothing to
judge). Priya has a one-day delta: the agent asks a Haiku call whether any
confirmed fact explains it. With nothing on file yet, it can't, so an
Exception opens. Visit `/exception-desk`, correct it with a note, and
that note becomes a Fact — run the same discrepancy again next cycle and
the agent has something to reason from.

## Deploying

Push this to a GitHub repo, connect it in Vercel, and add the same five
environment variables under Project Settings → Environment Variables.
Vercel's Hobby plan is fine while you're the only user; it restricts
commercial use once a real customer is on it — see the "Getting started"
section of the Muster doc for the rest of the go-live checklist (Vercel
Pro, Supabase Pro, moving off the free tier).
