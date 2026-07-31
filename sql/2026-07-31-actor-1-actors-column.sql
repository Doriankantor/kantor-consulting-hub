-- Actor axis (Actor-1) — additive actors column (hand-applied in Supabase, then recorded here).
-- PURELY ADDITIVE, nullable. Holds the named actors a document ENGAGES, as a JSON-string array of
-- {name, type} objects: [{"name":"FARC-EMC","type":"VNSA"},{"name":"Colombian state","type":"state"}].
-- type ∈ VNSA | state | extra-regional | commercial.
-- NOT subject/mentioned — a flat "which actors are engaged, typed" list. AI-extracted (consolidates
-- capabilities[].actor + prose actors), researcher-editable.
-- Distinct from the existing actors_mentioned column, which is the SOCIAL-post free-text field.

alter table public.intelligence_sources add column if not exists actors text;
