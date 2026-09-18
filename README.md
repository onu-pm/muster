# Muster

An agentic AI HR platform. Sign up, pick a team, enable it, and its agents
start working — the shared spine is Supabase + Row Level Security, one
Anthropic-compatible LLM client, and an audit trail every agent writes to
the same way: reconcile deterministically, spend a model call only on the
judgment part, and put anything uncertain on the exception desk.

Payroll & Compliance is the one team with real agents behind it so far —
Input, Structure, and Tax.

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
  `work-queue`, `exception-desk`. The last two read through the signed-in
  user's own session, not the admin client — Row Level Security scopes
  them to the right org automatically.
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
- **No document ingestion.** Every agent takes structured numbers directly
  in its API call — attendance/leave (Input), proof "document summaries"
  standing in for OCR (Tax) — rather than parsing real files. Nothing
  pulls from a real attendance system or reads an actual uploaded PDF yet.
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
dashboard, then hit the agent routes directly — the UI doesn't have forms
for triggering agents yet, so `curl` stands in for "already pulled from
the source system." Grab your org's id from Supabase (`organisations`
table) after onboarding.

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
