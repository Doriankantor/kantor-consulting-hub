-- Phase B2: migrate the info-page source-pipeline tier to cloud.
-- Committed RECORD of the hand-applied schema (applied via the Supabase SQL editor).
-- Two tables, migrated together because every stage-transition writes both atomically:
--   info_page_sources  — one pointer row per (article_id, info_page); stage moves
--                        new -> review -> committed via UPDATE. Natural identity is the
--                        composite (article_id, info_page); the local INTEGER autoincrement
--                        surrogate is dropped (not portable across cloud/mirror).
--   info_page_changes  — append-only audit log; generated identity id, insert-only.
-- Main process uses the service-role key and is the real enforcement; RLS below is a
-- defense-in-depth backstop mirroring the other migrated tables.

create table if not exists public.info_page_sources (
  article_id   text not null,
  info_page    text not null,
  stage        text not null default 'new' check (stage in ('new','review','committed')),
  design_notes text,
  added_at     timestamptz not null default now(),
  committed_at timestamptz,
  source_type  text,
  primary key (article_id, info_page)
);

create table if not exists public.info_page_changes (
  id         bigint generated always as identity primary key,
  article_id text not null,
  info_page  text not null,
  from_stage text,
  to_stage   text not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.info_page_sources enable row level security;
alter table public.info_page_changes enable row level security;
