-- 2026-08-07 · P4a-2b · publication_changes: Layer-1 accept-flow change record.
-- Cloud-only (no mirror), like the other four publication tables. Access gated at the
-- app layer (isOwner / isBoardVisibleFor), not RLS. Already applied in the Supabase SQL
-- editor and verified; this file is the record of that DDL.
create table public.publication_changes (
  id                   bigint generated always as identity primary key,
  article_id           text        not null,
  info_page            text        not null,
  section_key          text        not null,
  geography            text        not null,
  lang                 text        not null default 'en',
  action               text        not null,
  before_body          text,
  after_body           text,
  divergence           boolean     not null default false,
  divergence_reasoning text,
  section_text_id      bigint,
  accepted_by          text        not null,
  accepted_at          timestamptz not null default now()
);
create index on public.publication_changes (info_page, accepted_at desc);
create index on public.publication_changes (article_id);
