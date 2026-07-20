-- Slice B: free-text `notes` on personal_todos (detail-panel notes textarea).
--
-- NEW COLUMN — has never existed on this table. Plain nullable text; NULL = no
-- notes. Mirrors the local SQLite shape (db.ts, next to color/starred) and the 1a
-- cloud conventions (sql/2026-07-19_personal_todos_cloud.sql).
--
-- Additive and idempotent; safe to re-run. No RLS, realtime, or replica-identity
-- change is needed — personal_todos already has all three from 1a, and they apply
-- to the table, not to individual columns.

alter table public.personal_todos add column if not exists notes text;

-- VERIFY (expect one row):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='personal_todos'
--   and column_name='notes';

-- ROLLBACK:
-- alter table public.personal_todos drop column if exists notes;
