-- P0 publication seed — two additive tables for outline items + section-level citations.
-- Hand-applied in Supabase, then recorded here. PURELY ADDITIVE.
-- section_items = the outline (structured named-item lists per cell) — hybrid: common columns +
--   attrs jsonb for section-specific fields (supplier/channel/instrument/kind/figure/date).
-- section_citations = section-level reference list (geography-level base material, not per-cell).
-- Both key on (geography, section_key) matching section_texts/cards (NOTE: section_KEY here, like
--   section_texts/cards — NOT 'section' like info_page_sources; same nine values, historical naming).
-- geography = full country name or 'REGIONAL' (matches the Cowork export + placement vocabulary).

create table if not exists public.section_items (
  id           uuid primary key default gen_random_uuid(),
  geography    text not null,
  section_key  text not null,
  heading      text,                    -- the outline group heading this item sits under
  label        text not null,           -- the named item (a platform, actor, program, instrument)
  detail       text,
  status       text,                    -- operational / R&D / testing / etc.
  operator     text,
  origin       text,
  conf         text,                    -- report / corroborated / unconfirmed / vendor claim
  attrs        jsonb,                   -- section-specific long tail: supplier, channel, instrument, kind, figure, date
  position     integer,                 -- order within the cell
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);
create index if not exists section_items_cell_idx on public.section_items (geography, section_key);

create table if not exists public.section_citations (
  id           uuid primary key default gen_random_uuid(),
  geography    text not null default 'REGIONAL',   -- citations are section-level; REGIONAL base material
  section_key  text not null,
  what         text,                    -- what the citation supports
  where_ref    text,                    -- the source reference (e.g. 'CS1 §1.2.4.2') — 'where' is reserved-ish, use where_ref
  position     integer,
  updated_at   timestamptz not null default now()
);
create index if not exists section_citations_cell_idx on public.section_citations (geography, section_key);
