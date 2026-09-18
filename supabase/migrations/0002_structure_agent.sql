-- Muster — Structure agent
-- Adds what the Structure agent needs that `people.salary_structure` (a single
-- mutable jsonb blob of the CURRENT structure) can't give it: a history of
-- revisions to diff arrears against, and loan/advance schedules.

-- ============================================================================
-- Salary revision — insert-only history of changes to a person's salary
-- structure. Never updated: a re-check or a further correction writes a NEW
-- row, same reasoning as `verdicts` — History has to show what the structure
-- was and when it changed, not just what it is now.
-- ============================================================================
create table salary_revisions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organisations(id) on delete cascade,
  person_id          uuid not null references people(id) on delete cascade,
  duty_instance_id   uuid references duty_instances(id),
  reason             text not null, -- e.g. 'promotion', 'annual revision', 'correction'
  previous_structure jsonb, -- null for a person's first-ever structure
  new_structure      jsonb not null,
  effective_from     date not null,
  basic_wage         numeric(12,2) not null,
  gross_wage         numeric(12,2) not null,
  wage_test_ratio    numeric(5,4) not null, -- basic_wage / gross_wage
  wage_test_passed   boolean not null, -- the Code on Wages 50% test — computed, never guessed
  arrear_amount      numeric(12,2), -- null when effective_from isn't retrospective
  created_at         timestamptz not null default now()
);

-- ============================================================================
-- Loan / advance — a running schedule against a person, with its outstanding
-- balance. Mutable (like `people`), not an audit log: the schedule itself is
-- the current state, not history of it.
-- ============================================================================
create type loan_kind as enum ('loan', 'advance');
create type loan_status as enum ('active', 'closed');

create table loans (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organisations(id) on delete cascade,
  person_id           uuid not null references people(id) on delete cascade,
  duty_instance_id    uuid references duty_instances(id),
  kind                loan_kind not null,
  principal           numeric(12,2) not null,
  installment_amount  numeric(12,2) not null,
  installments_total  int not null,
  installments_paid   int not null default 0,
  outstanding         numeric(12,2) not null,
  started_on          date not null,
  status              loan_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — same posture as steps/artifacts/verdicts/exceptions:
-- these are agent-written (service_role bypasses RLS), humans only read them.
-- ============================================================================

alter table salary_revisions enable row level security;
alter table loans             enable row level security;

create policy "member can read salary_revisions" on salary_revisions
  for select using (is_org_member(org_id));

create policy "member can read loans" on loans
  for select using (is_org_member(org_id));
