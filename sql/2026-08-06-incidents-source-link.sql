-- Incidents Slice 1: idempotency guard, plus cleanup of the first cut's assumed columns.
--
-- Incidents remain a STANDALONE cloud-only table keyed by event geography (the existing
-- `country` column) and event_date. Slice 1 wires AI incident generation on the
-- new->review transition: an INCIDENT-flagged source produces one structured incident
-- record homed to the EVENT's country. The record maps onto the table's EXISTING named
-- columns (event_date, country, verification, title, summary, location, actor,
-- actor_type, system, casualties, source_id) -- no new per-field columns are needed.
--
-- The only genuinely new column is dedup_key: a stable string of source + country +
-- stated date, so re-running generation for the same source+event (e.g. a source
-- re-routed through review again) does NOT insert a duplicate. Its unique index is
-- PARTIAL (where dedup_key is not null) so legacy / manually-entered rows with a null
-- dedup_key are never blocked.
--
-- CLEANUP: the first cut of this slice added `article_id` (redundant -- the table
-- already has `source_id` for the source link) and a `details` jsonb (unnecessary --
-- every incident field maps onto an existing named column). Drop both. This file is
-- idempotent: run it fresh or over the first cut and the end state is identical.

alter table public.incidents add column if not exists dedup_key text;

create unique index if not exists incidents_dedup_key_uidx
  on public.incidents (dedup_key) where dedup_key is not null;

alter table public.incidents drop column if exists article_id;
alter table public.incidents drop column if exists details;
