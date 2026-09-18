-- Muster — initial schema
-- The twelve tables from the build doc, plus `org_members` (for RLS) and `facts`
-- (the Learned Facts store that `decisions` writes into — the build doc calls this out
-- as a same-transaction write, so it needs to be its own table even though the doc's
-- headline count of "twelve" doesn't list it separately).

create extension if not exists "pgcrypto";

-- ============================================================================
-- Organisation — one per customer. Everything else hangs off this.
-- ============================================================================
create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'pilot',
  data_region text not null default 'ap-south-1',
  created_at  timestamptz not null default now()
);

-- Who may act for which org. Drives every RLS policy below.
create table org_members (
  org_id   uuid not null references organisations(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null default 'hr_admin', -- hr_admin | viewer
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ============================================================================
-- Entity — a legal entity under an org. Jurisdiction follows the entity.
-- ============================================================================
create table entities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  legal_name  text not null,
  pan         text,
  tan         text,
  pf_code     text,
  esi_code    text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Location — state drives most statutory branching.
-- ============================================================================
create table locations (
  id                      uuid primary key default gen_random_uuid(),
  entity_id               uuid not null references entities(id) on delete cascade,
  address                 text,
  state                   text not null,
  pt_applicable           boolean not null default true,
  esi_applicable          boolean not null default true,
  shops_act_registration  text,
  created_at              timestamptz not null default now()
);

-- ============================================================================
-- Person — the statutory spine only. Deliberately not a full employee master.
-- ============================================================================
create type person_type as enum ('candidate', 'employee', 'ex_employee');
create type tax_regime as enum ('old', 'new');

create table people (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organisations(id) on delete cascade,
  entity_id        uuid references entities(id),
  location_id      uuid references locations(id),
  type             person_type not null default 'employee',
  full_name        text not null,
  pan              text,
  uan              text,
  esic_no          text,
  bank_account     text,
  bank_ifsc        text,
  doj              date,
  doe              date,
  salary_structure jsonb not null default '{}'::jsonb,
  tax_regime       tax_regime,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================================
-- Rule — statutory rules seeded from our library; policy rules from their docs.
-- ============================================================================
create type rule_scope as enum ('statutory', 'policy');

create table rules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organisations(id) on delete cascade,
  scope          rule_scope not null,
  jurisdiction   text not null, -- e.g. 'IN-MH', 'IN-national'
  effective_from date not null,
  effective_to   date,
  definition     jsonb not null,
  source         text,
  created_at     timestamptz not null default now()
);

-- ============================================================================
-- Deadline — generates the calendar. Adjusted by learned facts.
-- ============================================================================
create table deadlines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organisations(id) on delete cascade,
  rule_id     uuid references rules(id),
  date        date not null,
  recurrence  text, -- e.g. 'monthly:7', 'monthly:15', null for one-off
  owner       text,
  status      text not null default 'pending', -- pending | met | missed
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Duty instance — one running unit of work: "input pack for September".
-- ============================================================================
create type duty_state as enum ('open', 'in_progress', 'blocked', 'closed');

create table duty_instances (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organisations(id) on delete cascade,
  duty_type         text not null, -- e.g. 'payroll_input_pack', 'joiner_file'
  subject_person_id uuid references people(id),
  state             duty_state not null default 'open',
  opened_at         timestamptz not null default now(),
  due_at            timestamptz,
  closed_at         timestamptz
);

-- ============================================================================
-- Step — the audit trail of what an agent did, one row per capability call.
-- ============================================================================
create table steps (
  id                uuid primary key default gen_random_uuid(),
  duty_instance_id  uuid not null references duty_instances(id) on delete cascade,
  capability        text not null, -- pursue | verify | execute | submit | reconcile | explain
  input             jsonb not null default '{}'::jsonb,
  output            jsonb not null default '{}'::jsonb,
  at                timestamptz not null default now()
);

-- ============================================================================
-- Artifact — a document or a reply that came back.
-- ============================================================================
create table artifacts (
  id                uuid primary key default gen_random_uuid(),
  duty_instance_id  uuid not null references duty_instances(id) on delete cascade,
  person_id         uuid references people(id),
  type              text not null, -- e.g. 'attendance_sheet', 'lop_note', 'incentive_input'
  file_url          text,
  source            text, -- e.g. 'whatsapp', 'email', 'manual_upload'
  received_at       timestamptz not null default now()
);

-- ============================================================================
-- Verdict — why an artifact was accepted, rejected or flagged. Immutable:
-- a re-check writes a NEW verdict, never an update.
-- ============================================================================
create type verdict_outcome as enum ('accepted', 'rejected', 'flagged');

create table verdicts (
  id                uuid primary key default gen_random_uuid(),
  artifact_id       uuid not null references artifacts(id) on delete cascade,
  outcome           verdict_outcome not null,
  confidence        numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  rule_id           uuid references rules(id),
  extracted_fields  jsonb not null default '{}'::jsonb,
  reason            text not null,
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- Exception — everything on the exception desk.
-- ============================================================================
create type exception_status as enum ('open', 'resolved');

create table exceptions (
  id                uuid primary key default gen_random_uuid(),
  duty_instance_id  uuid not null references duty_instances(id) on delete cascade,
  kind              text not null, -- e.g. 'lop_discrepancy', 'missing_input', 'ambiguous_document'
  conclusion        text not null, -- what the agent concluded
  confidence        numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  status            exception_status not null default 'open',
  opened_at         timestamptz not null default now(),
  resolved_at       timestamptz
);

-- ============================================================================
-- Decision — who decided what on an exception, and why. Writes a Fact in the
-- same transaction: the correction loop is a foreign key, not a background job.
-- ============================================================================
create table decisions (
  id               uuid primary key default gen_random_uuid(),
  exception_id     uuid not null references exceptions(id) on delete cascade,
  human_user_id    uuid references auth.users(id),
  outcome          text not null, -- 'approved' | 'rejected' | 'corrected'
  correction_note  text,
  at               timestamptz not null default now()
);

-- ============================================================================
-- Fact — the Learned Facts store. What the agents have worked out about this
-- company, each one carrying its evidence.
-- ============================================================================
create table facts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organisations(id) on delete cascade,
  statement             text not null,
  evidence              jsonb not null default '[]'::jsonb, -- e.g. [{"observed":"2026-08"}, {"observed":"2026-09"}]
  confirmed             boolean not null default false,
  created_from_decision uuid references decisions(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — on from table one, per the build plan.
-- Every table scoped to organisations the calling user belongs to via org_members.
-- The service_role key (used server-side by the agents) bypasses all of this by
-- design — these policies protect the UI's direct reads only.
-- ============================================================================

alter table organisations   enable row level security;
alter table org_members     enable row level security;
alter table entities        enable row level security;
alter table locations       enable row level security;
alter table people          enable row level security;
alter table rules           enable row level security;
alter table deadlines       enable row level security;
alter table duty_instances  enable row level security;
alter table steps           enable row level security;
alter table artifacts       enable row level security;
alter table verdicts        enable row level security;
alter table exceptions      enable row level security;
alter table decisions       enable row level security;
alter table facts           enable row level security;

create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid()
  );
$$;

create policy "member can read own org" on organisations
  for select using (is_org_member(id));

create policy "member can read own org_members row" on org_members
  for select using (is_org_member(org_id));

create policy "member can read entities" on entities
  for select using (is_org_member(org_id));

create policy "member can read locations" on locations
  for select using (is_org_member((select org_id from entities where entities.id = locations.entity_id)));

create policy "member can read people" on people
  for select using (is_org_member(org_id));

create policy "member can read rules" on rules
  for select using (is_org_member(org_id));

create policy "member can read deadlines" on deadlines
  for select using (is_org_member(org_id));

create policy "member can read duty_instances" on duty_instances
  for select using (is_org_member(org_id));

create policy "member can read steps" on steps
  for select using (is_org_member((select org_id from duty_instances where duty_instances.id = steps.duty_instance_id)));

create policy "member can read artifacts" on artifacts
  for select using (is_org_member((select org_id from duty_instances where duty_instances.id = artifacts.duty_instance_id)));

create policy "member can read verdicts" on verdicts
  for select using (is_org_member((
    select di.org_id from artifacts a
    join duty_instances di on di.id = a.duty_instance_id
    where a.id = verdicts.artifact_id
  )));

create policy "member can read exceptions" on exceptions
  for select using (is_org_member((select org_id from duty_instances where duty_instances.id = exceptions.duty_instance_id)));

create policy "member can read and write decisions" on decisions
  for select using (is_org_member((
    select di.org_id from exceptions e
    join duty_instances di on di.id = e.duty_instance_id
    where e.id = decisions.exception_id
  )));

create policy "member can insert decisions" on decisions
  for insert with check (is_org_member((
    select di.org_id from exceptions e
    join duty_instances di on di.id = e.duty_instance_id
    where e.id = decisions.exception_id
  )));

create policy "member can read facts" on facts
  for select using (is_org_member(org_id));

create policy "member can update facts" on facts
  for update using (is_org_member(org_id));
