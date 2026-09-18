# Muster

An agentic AI HR platform. Sign up, pick a team, enable it, and its agents
start working — the shared spine is Supabase + Row Level Security, one
Anthropic-compatible LLM client, and an audit trail every agent writes to
the same way: reconcile deterministically, spend a model call only on the
judgment part, and put anything uncertain on the exception desk.

Payroll & Compliance is the one team with real agents behind it so far —
Input, Structure, and Tax. Its home screen (`/team`) shows what it's
working on and has a "Run a cycle" button that calls the three in
sequence — see the Team screen entry below.

## What's here

- `supabase/migrations/` — the schema, in order:
  - `0001_init_schema.sql` — the twelve tables from the build doc, plus
    `org_members` (Row Level Security) and `facts` (the Learned Facts
    store `decisions` writes into).
  - `0002_structure_agent.sql` — `salary_revisions` (insert-only history),
    `loans`.
  - `0003_auth_and_teams.sql` — `teams` (the platform catalog), `org_teams`
    (which teams an org has enabled).
  - `0004_tax_declarations.sql` — `tax_declarations`. Proof documents and
    their verification reuse `artifacts`/`verdicts` from 0001.
- `src/lib/capabilities/` — Verify, Reconcile, Execute, plus per-agent
  deterministic rules: `wage-test.ts` (Structure), `tax-rates.ts` /
  `proof-rules.ts` (Tax). Pursue is still a stub — see below.
- `src/lib/agents/` — `input-agent.ts`, `structure-agent.ts`,
  `tax-agent.ts`, each triggered by its own route under
  `src/app/api/agents/`. No agent calls another directly; all
  coordination is through the shared duty/step/exception/fact tables.
- `src/app/api/exceptions/[id]/decide/route.ts` — the exception desk's one
  action: record a Decision, write a Fact in the same request when there's
  a correction note. Validates the caller is a member of the org it's
  writing to.
- `src/app/api/onboarding`, `src/app/api/teams/[key]/enable` — the two
  writes behind sign-up: create an org (and make the signer its first
  member), and turn a team on for it.
- Screens: `sign-up`, `sign-in`, `onboarding`, `dashboard` (team picker),
  `team` (Screen 1 from the build doc — "Holly's home": what she owns,
  what's in flight, this month's counts, and "Run a cycle"), `work-queue`,
  `exception-desk`. All four post-onboarding screens read through the
  signed-in user's own session, not the admin client — Row Level Security
  scopes them to the right org automatically. `/` redirects to `/team`
  once Payroll & Compliance is enabled, else to `/dashboard`.
- `src/lib/connectors/remote.ts`, `remote-sync.ts` — an optional Remote.com
  connector. When `REMOTE_API_TOKEN` is set, the Input agent's route pulls
  real employment and time-off data from Remote instead of reconciling an
  empty batch — see the comment at the top of `remote-sync.ts` for exactly
  what it treats as "attendance" vs. "leave" when Remote is the only
  source behind it (there's no separate swipe-machine system for an EOR
  platform, so it isn't a literal attendance-vs-leave comparison). Not yet
  live-tested against a real sandbox token — see "Trying it" below.
- `src/app/globals.css` — the design tokens (colors, type) as CSS custom
  properties, wired into `layout.tsx` with `next/font` for Geist/Geist
  Mono. One shared source, not styles repeated per page.
- `.claude/skills/india-payroll/` — the openaccountants reference skill
  the Tax agent's rate tables were checked against (see below).

## What's deliberately not here yet

- **Pursue** (`capabilities/pursue.ts`) is a stub that logs intent. The real
  channel is the WhatsApp Business Platform API through an Indian BSP
  (Gupshup / Interakt / Wati) — nothing to build against until that
  account exists.
- **No document ingestion.** Structure and Tax still take structured
  numbers directly in their API call rather than parsing real files —
  proof "document summaries" stand in for OCR (Tax). Input can now pull
  real numbers from Remote.com (see above) instead of a manual call, but
  nothing reads an actual uploaded PDF yet.
- **The Remote.com connector's endpoint paths are unverified.** Remote's
  reference docs are JS-rendered and didn't yield the literal path string
  during research; `/v1/employments` and `/v1/timeoff` are the
  well-reasoned guess. The first real call against the sandbox confirms
  or corrects this — check `src/lib/connectors/remote.ts`'s top comment
  before assuming a failure there is a deeper bug.
- **No goal input yet.** The Team screen's "Run a cycle" is a fixed
  three-agent sequence, not the goal-driven orchestrator in Section 5 of
  the team-architecture doc (type a goal in plain language, it classifies
  Cycle/Case/Question/Change and dispatches). That's next, once real data
  is flowing through the sequence that exists.
- **Tax agent v0 stops at monthly TDS projection.** Year-end true-up and
  Form 16 generation aren't built.
- Run, Compliance, Settlement, Query, Audit agents — the other five.
- Only Payroll & Compliance exists as a real team; the dashboard's catalog
  (`teams` table) is built to hold more, but nothing else has been added.

## On the rate tables

The Tax agent's TDS slabs, standard deduction, and proof-category caps
started from the `india-payroll` skill
(`.claude/skills/india-payroll/SKILL.md`, from openaccountants — MIT/AGPL,
marked "source-cited draft" by its own maintainers). The core figures
actually used in code (new/old regime slabs, 4% cess, new-regime standard
deduction and Section 87A rebate, Section 80D caps, Section 24(b) home
loan interest cap, EPFO/ESIC rates) were checked against
incometaxindia.gov.in, PIB press releases, and EPFO/ESIC's own sites
before landing in `capabilities/tax-rates.ts` / `proof-rules.ts` — see the
source comments in those files for exactly what was verified and what
wasn't (a couple of long-standing figures, like the old-regime standard
deduction and 87A rebate, were carried over without an independent
re-check this pass). Treat all of it as a starting point, not ground
truth, until a qualified professional signs off.

## Setup

1. **Supabase.** In your project's SQL editor, run the four migrations
   under `supabase/migrations/`, in order. Then Project Settings → API to
   get your project URL, anon key, and service role key.
2. **Supabase Auth.** Authentication → Providers → Email is on by default;
   decide whether you want "Confirm email" on (safer for real users) or
   off (frictionless while testing solo).
3. **OpenRouter.** Create an account and an API key. The default models
   (`MODEL_ROUTINE` / `MODEL_JUDGMENT` in `.env.example`) are NVIDIA's
   free Nemotron 3 tier — no Anthropic key or OpenRouter balance required.
   Swap either env var if you'd rather point at a paid model later.
4. Copy `.env.example` to `.env.local` and fill in all five real values
   (Supabase URL/anon key/service role key, OpenRouter key — the model
   vars already have working defaults).
5. `npm install`
6. `npm run dev` → http://localhost:3000, which redirects to sign-in.

## Trying it

Sign up, name an organisation, enable Payroll & Compliance from the
dashboard — you'll land on `/team`. Click "Run a cycle" to call Input,
Structure and Tax in sequence against whatever's on file (or against
Remote.com, if `REMOTE_API_TOKEN` is set — see above).

To test the Input agent by hand instead — or before a Remote.com token is
wired up — hit its route directly. Grab your org's id from Supabase
(`organisations` table) after onboarding.

```bash
curl -X POST http://localhost:3000/api/agents/input \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "PASTE-YOUR-ORG-ID",
    "cycleLabel": "September 2026",
    "rows": [
      { "personId": "11111111-1111-1111-1111-111111111111", "personName": "Priya Rao", "attendanceDays": 22, "leaveDays": 21 }
    ]
  }'
```

That opens an Exception (no confirmed fact yet explains the delta). Visit
`/exception-desk`, correct it with a note, and that note becomes a Fact.
`api/agents/structure` and `api/agents/tax` follow the same shape — see
the comment at the top of each route file for its request body.

## Deploying

Push to GitHub, connect the repo in Vercel, and set the same environment
variables there (Project Settings → Environment Variables) — a var
changed in the dashboard needs a redeploy to take effect. Vercel's Hobby
plan is fine while you're the only user; it restricts commercial use once
a real customer is on it — see the "Getting started" section of the
Muster doc for the rest of the go-live checklist (Vercel Pro, Supabase
Pro, moving off the free tier).
