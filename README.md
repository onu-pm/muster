# Muster

An agentic AI HR platform. Sign up, pick a team, enable it, and its agents
start working — the shared spine is Supabase + Row Level Security, one
Anthropic-compatible LLM client, and an audit trail every agent writes to
the same way: reconcile deterministically, spend a model call only on the
judgment part, and put anything uncertain on the exception desk.

Payroll & Compliance is the one team with real agents behind it so far —
Input, Structure, and Tax. Its home screen (`/team`) shows what it's
working on and has a goal box ("Run September payroll") that classifies
what you typed and, for a cycle, calls the three agents in sequence.

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
  - `0005_calculation_rules.sql` — `rules.confirmed`/`confirmed_at`,
    `exceptions.payload` (structured detail behind a proposed rule, or
    behind any other exception — see "Rules consumption" below).
  - `0006_rule_keys.sql` — `rules.rule_key`/`label`, so tested rule code
    can find and validate a confirmed rule, not just a human reading the
    exception desk.
- `src/lib/capabilities/` — Verify, Reconcile, Execute, plus per-agent
  deterministic rules: `wage-test.ts` (Structure), `tax-rates.ts` /
  `proof-rules.ts` (Tax), and `rules-lookup.ts` / `jurisdiction.ts` — how
  those two look up and validate a confirmed org rule before falling back
  to their own built-in defaults. Pursue is still a stub — see below.
- `src/lib/agents/` — `input-agent.ts`, `structure-agent.ts`,
  `tax-agent.ts`, `rules-setup-agent.ts`, each triggered by its own route
  under `src/app/api/agents/`. No agent calls another directly; all
  coordination is through the shared duty/step/exception/fact tables.
- `src/app/api/exceptions/[id]/decide/route.ts` — the exception desk's one
  action: record a Decision, and write whatever that decision should
  produce next in the same request — a Fact for most exceptions, or a
  confirmed `rules` row for a `proposed_rule`. Validates the caller is a
  member of the org it's writing to.
- `src/app/api/onboarding`, `src/app/api/teams/[key]/enable` — the two
  writes behind sign-up: create an org (and make the signer its first
  member), and turn a team on for it.
- Screens, all reading through the signed-in user's own session (not the
  admin client) so Row Level Security scopes them to the right org
  automatically: `sign-up`, `sign-in`, `onboarding`, `dashboard` (team
  picker), `team` (Screen 1 — "Holly's home"), `work-queue` (Screen 2,
  filterable), `exception-desk` (Screen 3, five fields per item),
  `history` (Screen 6, read-only audit trail), `org-brain` (Screen 5,
  read-only), `rules-setup` and `import` (not in the original six-screen
  spec — see below). `/` redirects to `/team` once Payroll & Compliance
  is enabled, else to `/dashboard`.
- `src/lib/connectors/remote.ts`, `remote-sync.ts` — an optional Remote.com
  connector. When `REMOTE_API_TOKEN` is set, the Input agent's route pulls
  real employment and time-off data from Remote instead of reconciling an
  empty batch. Verified live against a real account: the endpoint paths
  and response envelope are both confirmed (see `remote.ts`'s top
  comment) — individual field names inside a record are still unverified,
  since that account has zero real employments/timeoff rows to check them
  against.
- `src/app/import/` — a generic CSV import for any customer without an
  EOR account: upload a CSV, map its columns once, and it feeds the Input
  agent the exact same row shape Remote.com data does.
- `src/app/team/goal-box.tsx` + `src/app/api/agents/classify/route.ts` —
  the goal box: one model call classifies free text into Cycle / Case /
  Question / Change (Section 5 of the team-architecture doc). Only
  "cycle" is wired to anything; the other three are classified honestly
  and met with "not built yet," not a bluff.
- `src/app/globals.css` — the design tokens (colors, type) as CSS custom
  properties, wired into `layout.tsx` with `next/font` for Geist/Geist
  Mono. One shared source, not styles repeated per page. Redirected after
  watching a reference recording of Grok Bot's desktop app: near-black
  background, cards separated by elevation (background-lightness steps)
  rather than border lines, large border-radius, sans-serif only (dropped
  the original Georgia serif headings) — kept Muster's own terracotta
  accent rather than switching to Grok's blue. Dark is the only theme for
  now; every page already reads color exclusively through these tokens
  (confirmed by grepping the whole `src/` tree for hardcoded hex values
  before and after), so this was a token-file change, not a per-page one.
- `.claude/skills/india-payroll/` — the openaccountants reference skill
  the Tax agent's rate tables were checked against (see below).

## What's deliberately not here yet

- **Pursue** (`capabilities/pursue.ts`) is a stub that logs intent. The real
  channel is the WhatsApp Business Platform API through an Indian BSP
  (Gupshup / Interakt / Wati) — nothing to build against until that
  account exists. The Conversations screen (spec'd Screen 4) waits on the
  same dependency.
- **No document ingestion.** Structure and Tax still take structured
  numbers directly in their API call rather than parsing real files —
  proof "document summaries" stand in for OCR (Tax). Input can pull real
  numbers from Remote.com or a CSV import (see above); nothing reads an
  actual uploaded PDF yet.
- **No goal-driven orchestrator.** The goal box classifies a goal's shape
  but only dispatches "cycle" to a fixed three-agent sequence — no
  routing logic across Case/Question/Change, no reading the Brain before
  planning, none of Section 5's four routing rules. That's real
  orchestration and depends on Run/Compliance existing to route between
  something.
- **Org Brain is read-only.** Screen 5 shows Structure/Rules/Calendar/
  Learned Facts; editing any of them directly (the spec's stated end
  state) is separate, later work.
- **Tax agent v0 stops at monthly TDS projection.** Year-end true-up and
  Form 16 generation aren't built.
- Run, Compliance, Settlement, Query, Audit agents — the other five.
- Only Payroll & Compliance exists as a real team; the dashboard's catalog
  (`teams` table) is built to hold more, but nothing else has been added.
- The nav is eight flat links with no active-state or grouping — noted,
  not yet worth restructuring until another team exists to group against.

## Rules consumption

`/rules-setup` captures a company's own calculation sheet as candidate
rules, confirmed on the exception desk. Structure's wage-definition test
and Tax's proof-category caps read a confirmed rule back out, for a
small, closed set of consumable `rule_key`s the extraction prompt already
knows how to tag correctly:

- `wage_definition` — overrides which salary components count toward the
  statutory 50% test and the minimum ratio itself. Looked up per person,
  scoped to their location's jurisdiction (falling back to
  `IN-national`), with an as-of date.
- `proof_category_cap` — overrides one Tax proof category's cap (Section
  80C/80D/24(b) etc.). Always looked up at `IN-national` — these are
  central-law provisions, not state-varying.

A rule extracted with neither shape still gets captured and confirmable
as before — it's just not wired to a calculation, and still visible on
`/org-brain`. **What this deliberately does NOT do:** compute a PT slab, a
TDS slab, or anything not already tested code in
`wage-test.ts`/`tax-rates.ts`/`proof-rules.ts` — adding that would be a
new calculation engine, which the product's own rules don't allow an LLM
extraction to author. See `capabilities/rules-lookup.ts` for the
validation every confirmed rule goes through before a deterministic
calculation trusts it (a confirmed row is still just data a human
approved, not code).

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

1. **Supabase.** In your project's SQL editor, run the six migrations
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
   vars already have working defaults). `REMOTE_API_TOKEN` /
   `REMOTE_API_BASE_URL` are optional — leave both unset to reconcile
   whatever rows you pass by hand or import via CSV.
5. `npm install`
6. `npm run dev` → http://localhost:3000, which redirects to sign-in.

## Trying it

Sign up, name an organisation, enable Payroll & Compliance from the
dashboard — you'll land on `/team`. Type "Run [month] payroll" in the
goal box to call Input, Structure and Tax in sequence against whatever's
on file (Remote.com, if `REMOTE_API_TOKEN` is set, or whatever's already
in `people`/prior test data otherwise). `/import` feeds Input a CSV
instead. `/rules-setup` teaches Holly a company-specific rule — paste a
calculation sheet, confirm what she finds on the exception desk, and the
next Structure/Tax run picks it up automatically. `/history` and
`/org-brain` are both read-only views into what's happened and what's
currently believed.

To test the Input agent by hand instead — hit its route directly. Grab
your org's id from Supabase (`organisations` table) after onboarding.

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
`api/agents/structure`, `api/agents/tax` and `api/agents/rules-setup`
follow the same shape — see the comment at the top of each route file
for its request body.

## Deploying

Push to GitHub, connect the repo in Vercel, and set the same environment
variables there (Project Settings → Environment Variables) — a var
changed in the dashboard needs a redeploy to take effect. Vercel's Hobby
plan is fine while you're the only user; it restricts commercial use once
a real customer is on it — see the "Getting started" section of the
Muster doc for the rest of the go-live checklist (Vercel Pro, Supabase
Pro, moving off the free tier).
