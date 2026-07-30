-- Restructure step 1 — ADDITIVE schema foundation (hand-applied in Supabase, then recorded here).
-- PURELY ADDITIVE: nullable columns + new tables. Invalidates no existing row.
-- DEFERRED to front of step 2 (with routing code): info_page_sources PK widening to
-- (article_id, info_page, category, geography), the onConflict change, the mirror UNIQUE
-- rebuild, the .eq-writer widening, and the pre-existing-row backfill.

-- 1. info_page_sources — placement columns, NULLABLE, PK unchanged
alter table public.info_page_sources add column if not exists category  text;
alter table public.info_page_sources add column if not exists geography text;

-- 2. intelligence_sources — role-split geography lists (JSON-string, matching categories_json).
--    Old scalar geography/location_mentioned kept in place (superseded, not dropped).
alter table public.intelligence_sources add column if not exists subject_countries   text;  -- JSON array; ONLY these generate placements
alter table public.intelligence_sources add column if not exists mentioned_countries text;  -- JSON array; metadata only

-- 3. incidents — own record type (Decision 3). Key locked; columns designed here.
create table if not exists public.incidents (
  id            text primary key,
  event_date    date not null,
  country       text not null,
  verification  text not null default 'single-source'
                check (verification in ('single-source','corroborated','disputed')),
  title         text,
  summary       text,
  location      text,
  actor         text,
  actor_type    text,
  system        text,
  casualties    integer,
  source_id     text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_by    text,
  updated_at    timestamptz not null default now()
);
create index if not exists incidents_country_date_idx on public.incidents (country, event_date);

-- 4. section_texts — versioned narrative (§5 sketch) + §7 override flag
create table if not exists public.section_texts (
  id            bigint generated always as identity primary key,
  geography     text not null,
  section_key   text not null,
  lang          text not null default 'en' check (lang in ('en','es','pt')),
  body          text not null default '',
  version       integer not null default 1,
  superseded_by bigint references public.section_texts(id),
  override_translation boolean not null default false,
  updated_by    text,
  updated_at    timestamptz not null default now()
);
create index if not exists section_texts_cell_idx on public.section_texts (geography, section_key, lang);

-- 5. cards — 12-slot published-figure layer (§5 sketch)
create table if not exists public.cards (
  id           bigint generated always as identity primary key,
  geography    text not null,
  section_key  text not null,
  slot_kind    text,
  headline     text not null default '',
  detail       text,
  countries    text,
  confidence   text,
  source_id    text,
  position     integer check (position between 1 and 12),
  active       boolean not null default true,
  replaced_by  bigint references public.cards(id),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
create index if not exists cards_cell_idx on public.cards (geography, section_key);
