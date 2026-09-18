-- Muster — auth and teams
-- The platform shell: a catalog of AI teams or orgs can enable, and the join
-- table tracking which ones each org has turned on. Payroll & Compliance is
-- the only team with real agents behind it — everything else in `teams` is
-- future rows, not invented placeholders.

-- ============================================================================
-- Team — the catalog of agentic AI teams the platform offers. Global, not
-- org-scoped: every org sees the same catalog, `org_teams` tracks who's
-- turned what on.
-- ============================================================================
create type team_status as enum ('available', 'coming_soon');

create table teams (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique, -- e.g. 'payroll_compliance'
  name        text not null,
  description text,
  status      team_status not null default 'coming_soon',
  created_at  timestamptz not null default now()
);

insert into teams (key, name, description, status) values
  ('payroll_compliance', 'Payroll & Compliance',
   'Reconciles attendance and leave, owns salary structures and statutory compliance, and puts anything uncertain on the exception desk.',
   'available');

-- ============================================================================
-- Org team — which teams an org has enabled. Written only by server routes
-- (service_role) validated against the caller's session, same posture as
-- every other write in this codebase — not opened up as a direct client
-- RLS-gated write.
-- ============================================================================
create table org_teams (
  org_id     uuid not null references organisations(id) on delete cascade,
  team_id    uuid not null references teams(id) on delete cascade,
  enabled    boolean not null default true,
  enabled_at timestamptz not null default now(),
  primary key (org_id, team_id)
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table teams      enable row level security;
alter table org_teams  enable row level security;

-- The catalog itself isn't org-scoped or sensitive — any signed-in user can
-- see what teams exist.
create policy "authenticated users can read the team catalog" on teams
  for select using (auth.uid() is not null);

create policy "member can read org_teams" on org_teams
  for select using (is_org_member(org_id));
