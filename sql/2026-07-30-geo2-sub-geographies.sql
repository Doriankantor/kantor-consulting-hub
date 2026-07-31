-- Geo-2 Part A — additive sub_geographies column (hand-applied in Supabase, then recorded here).
-- PURELY ADDITIVE, nullable. Holds researcher-entered sub-geography keyed by country, as a
-- JSON-string object: {"Colombia": ["Cauca","Arauca"], "Mexico": ["Sinaloa"]}.
-- subject_countries / mentioned_countries stay flat string[] (Geo-1) — untouched.
-- AI does NOT populate this in v1 (researcher-added only).

alter table public.intelligence_sources add column if not exists sub_geographies text;
