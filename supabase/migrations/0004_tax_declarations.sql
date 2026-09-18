-- Muster — Tax agent
-- One new table. Proof documents and their verification already have a
-- home: `artifacts` (a document that came back) + `verdicts` (why it was
-- accepted/rejected, insert-only) — that pairing has existed since 0001
-- and gone unused until now. What's missing is somewhere to hold the
-- declaration itself: which regime a person elected, what they've
-- claimed per category, and what's actually been verified.

-- ============================================================================
-- Tax declaration — one row per person per financial year. Mutable, not an
-- audit log: this is the current state of the declaration (like `people` or
-- `loans`), while the individual proof verdicts stay insert-only in
-- `verdicts` where the real history lives.
-- ============================================================================
create table tax_declarations (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organisations(id) on delete cascade,
  person_id                uuid not null references people(id) on delete cascade,
  duty_instance_id         uuid references duty_instances(id),
  financial_year           text not null, -- e.g. 'FY2025-26'
  regime                   tax_regime not null,
  declared                 jsonb not null default '{}'::jsonb, -- category -> claimed annual amount
  landlord_pan             text, -- required once claimed rent exceeds the statutory threshold
  previous_employer_income numeric(12,2),
  verified_exemptions      jsonb not null default '{}'::jsonb, -- category -> amount actually allowed, post-verification
  monthly_tds              numeric(12,2),
  status                   text not null default 'draft', -- draft | submitted | verified
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (person_id, financial_year)
);

-- ============================================================================
-- Row Level Security — same posture as salary_revisions/loans: agent-written
-- via service_role, humans only read.
-- ============================================================================
alter table tax_declarations enable row level security;

create policy "member can read tax_declarations" on tax_declarations
  for select using (is_org_member(org_id));
