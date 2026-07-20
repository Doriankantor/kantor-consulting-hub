-- Slice A-1: detail-panel data foundation — `color` + `starred` on personal_todos.
--
-- BOTH COLUMNS ARE NEW. Neither has ever existed on this table in any commit; this
-- is not a re-add of something an earlier slice dropped.
--
-- Types mirror the local SQLite shape (db.ts:688+) and the 1a cloud conventions
-- (sql/2026-07-19_personal_todos_cloud.sql): text for the palette key, integer for
-- the boolean — `completed integer not null default 0` set that precedent, so the
-- sync layer never has to translate a bool across the two stores.
--
-- `color` holds a PALETTE KEY ('indigo', 'red', 'amber', 'green', 'teal', 'purple',
-- 'slate') — NOT a hex. The renderer resolves the key per theme. NULL = no colour.
--
-- Additive and idempotent; safe to re-run. No RLS, realtime, or replica-identity
-- change is needed — personal_todos already has all three from 1a, and they apply
-- to the table, not to individual columns.

alter table public.personal_todos add column if not exists color text;
alter table public.personal_todos add column if not exists starred integer not null default 0;

-- VERIFY (expect both rows):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='personal_todos'
--   and column_name in ('color','starred');

-- ROLLBACK:
-- alter table public.personal_todos drop column if exists starred;
-- alter table public.personal_todos drop column if exists color;
