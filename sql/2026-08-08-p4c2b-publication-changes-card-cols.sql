-- 2026-08-08 · P4c-2b-1a · publication_changes: nullable card columns.
-- Extends the Layer-1 accept-flow change record (2026-08-07-p4a2b-publication-changes.sql)
-- so a card accept (action='card') can be recorded structurally alongside the body-shaped
-- narrative accepts. All three columns are NULLABLE: a narrative accept leaves them null
-- (it uses before_body/after_body/section_text_id), a card accept leaves the body columns
-- null and carries the card facts here. `action` is plain text (no CHECK), so 'card' is
-- already a valid value; no constraint migration is needed. Cloud-only (no mirror), like
-- the rest of the publication tables. Apply in the Supabase SQL editor; this file is the
-- record of that DDL.
alter table public.publication_changes
  add column card_id       bigint,
  add column card_headline text,
  add column card_detail    text;
