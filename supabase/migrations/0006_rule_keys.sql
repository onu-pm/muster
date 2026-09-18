-- Muster — rule keys for consumption
--
-- `rules.definition` is freeform jsonb — rules-setup-agent extracts
-- whatever shape a company's calculation sheet actually states, which is
-- right for a human reading the exception desk but not enough for tested
-- rule code (wage-test.ts, tax-rates.ts, proof-rules.ts) to find and use a
-- confirmed override: it needs a stable key to look up by, not a label. It
-- also needs the label itself, which until now only existed as text inside
-- an exception's payload/conclusion — gone once the exception resolves.
--
-- rule_key is deliberately a small, closed vocabulary the consuming code
-- already knows how to validate (see capabilities/rules-lookup.ts), not a
-- free-text tag — a rule with no matching key is still captured and
-- visible, just not wired to any calculation yet, same as every rule
-- before this migration.

alter table rules
  add column rule_key text,
  add column label text;
