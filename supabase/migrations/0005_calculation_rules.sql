-- Muster — calculation rules setup
--
-- The `rules` table (0001) already exists for exactly this — "statutory
-- rules seeded from our library; policy rules from their documents and
-- confirmed" — but nothing populates or reads it yet. This adds the two
-- small things needed to actually use it: a confirmation flag (matching
-- `facts.confirmed` — a rule proposed from a company's own calculation
-- sheet isn't live until a human confirms it, same posture as a Fact),
-- and a structured payload on `exceptions` so a proposed rule can carry
-- its actual definition through the SAME exception desk every other
-- judgment call already goes through, rather than a new screen.

alter table rules
  add column confirmed boolean not null default false,
  add column confirmed_at timestamptz;

-- Existing statutory rules seeded elsewhere aren't retroactively
-- unconfirmed by this migration if any exist — but nothing currently
-- writes to `rules` at all, so this is a no-op in practice today.

alter table exceptions
  add column payload jsonb not null default '{}'::jsonb;
-- e.g. for kind = 'proposed_rule': { "label": "...", "scope": "policy",
-- "jurisdiction": "IN-KA", "definition": { ... } } — read by
-- /api/exceptions/[id]/decide to know what to write into `rules` on
-- approval, instead of overloading `conclusion` (free text) with JSON.
