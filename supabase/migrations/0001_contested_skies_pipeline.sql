-- ============================================================================
-- Contested Skies Intelligence Pipeline — Supabase schema
-- ============================================================================
-- Idempotent: safe to run repeatedly. Creates three tables, enables Row Level
-- Security on each, and adds the requested indexes. The hub's main process talks
-- to these tables with the service_role key, which BYPASSES RLS, so no policies
-- are required for the pipeline itself. Add policies later if the renderer
-- (anon/authenticated) ever needs direct access.
--
-- Apply via: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- The final SELECT prints the resulting column structure as confirmation.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (preinstalled on Supabase, but ensure it).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- TABLE: cs_articles  — auto-fetched + Claude-categorized news articles
-- ---------------------------------------------------------------------------
create table if not exists public.cs_articles (
  id                 uuid primary key default gen_random_uuid(),
  title              text,                          -- article headline
  url                text,                          -- article link
  source_name        text,                          -- publication name
  published_at       timestamptz,                   -- article publish date
  content_snippet    text,                          -- first ~500 chars
  primary_category   text,                          -- offensive/defensive/procurement/industry/regulatory/criminal/diplomatic
  sub_category       text,                          -- kinetic_strike/reconnaissance/chemical_payload/prison_drop/smuggling/kamikaze/cuav_deployment/interception/jamming/detection/state_purchase/company_funding/rd_announcement/budget/new_manufacturer/new_platform/tech_development/export_deal/acquisition/new_law/agreement/sanctions/cartel_use/new_actor/tactic_evolution/training/foreign_supplier/state_transfer/extra_regional
  confidence_level   text    default 'unrated',     -- high/medium/low/unrated
  status             text    default 'new',         -- new/pending_review/approved/rejected/published
  claude_analysis    text,                          -- Claude's categorization reasoning
  imported_to_hub    boolean default false,
  imported_at        timestamptz,
  approved_by        text,
  approved_at        timestamptz,
  published_at_site  timestamptz,
  notes              text,
  created_at         timestamptz default now()
);

comment on column public.cs_articles.primary_category is
  'offensive | defensive | procurement | industry | regulatory | criminal | diplomatic';
comment on column public.cs_articles.sub_category is
  'kinetic_strike | reconnaissance | chemical_payload | prison_drop | smuggling | kamikaze | cuav_deployment | interception | jamming | detection | state_purchase | company_funding | rd_announcement | budget | new_manufacturer | new_platform | tech_development | export_deal | acquisition | new_law | agreement | sanctions | cartel_use | new_actor | tactic_evolution | training | foreign_supplier | state_transfer | extra_regional';
comment on column public.cs_articles.confidence_level is 'high | medium | low | unrated';
comment on column public.cs_articles.status is 'new | pending_review | approved | rejected | published';

-- ---------------------------------------------------------------------------
-- TABLE: cs_fetch_log  — one row per automated fetch run
-- ---------------------------------------------------------------------------
create table if not exists public.cs_fetch_log (
  id              uuid primary key default gen_random_uuid(),
  fetched_at      timestamptz default now(),
  articles_found  integer,
  articles_new    integer,
  keywords_used   text[],
  status          text,                              -- success/error
  error_message   text
);

comment on column public.cs_fetch_log.status is 'success | error';

-- ---------------------------------------------------------------------------
-- TABLE: cs_sources_manual  — manually entered interviews / social / documents
-- ---------------------------------------------------------------------------
create table if not exists public.cs_sources_manual (
  id                uuid primary key default gen_random_uuid(),
  type              text,                            -- interview/social_media/document
  platform          text,                            -- for social media
  handle            text,
  content           text,
  url               text,
  date_posted       timestamptz,
  source_type_tags  text[],
  confidence_level  text,
  status            text,
  notes             text,
  created_at        timestamptz default now()
);

comment on column public.cs_sources_manual.type is 'interview | social_media | document';

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled on all three tables.
-- (service_role bypasses RLS; renderer has no direct access until policies added)
-- ---------------------------------------------------------------------------
alter table public.cs_articles       enable row level security;
alter table public.cs_fetch_log      enable row level security;
alter table public.cs_sources_manual enable row level security;

-- ---------------------------------------------------------------------------
-- Indexes (requested: status, published_at, primary_category, imported_to_hub)
-- ---------------------------------------------------------------------------
create index if not exists idx_cs_articles_status           on public.cs_articles (status);
create index if not exists idx_cs_articles_published_at      on public.cs_articles (published_at desc);
create index if not exists idx_cs_articles_primary_category  on public.cs_articles (primary_category);
create index if not exists idx_cs_articles_imported_to_hub   on public.cs_articles (imported_to_hub);

-- Helpful companions for the other two tables.
create index if not exists idx_cs_fetch_log_fetched_at       on public.cs_fetch_log (fetched_at desc);
create index if not exists idx_cs_sources_manual_status      on public.cs_sources_manual (status);

-- ---------------------------------------------------------------------------
-- Confirmation: show the structure of all three tables.
-- ---------------------------------------------------------------------------
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cs_articles', 'cs_fetch_log', 'cs_sources_manual')
order by table_name, ordinal_position;
