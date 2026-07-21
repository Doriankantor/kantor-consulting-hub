-- Slice C-recurring-3: missed-occurrence tracking on personal_todos.
--
-- NEW COLUMN — has never existed on this table. A JSON array string of 'YYYY-MM-DD'
-- dates: recurrence boundaries that passed while the active instance was still
-- incomplete (stamped by the launch/midnight evaluator). NULL/absent = no misses.
-- Mirrors the local SQLite shape (db.ts, next to recurrence/series_id) and the 1a
-- cloud conventions. Additive and idempotent; safe to re-run.
--
-- No RLS, realtime, or replica-identity change is needed — personal_todos already
-- has all three from 1a, and they apply to the table, not to individual columns.

alter table public.personal_todos add column if not exists missed_dates text;

-- VERIFY (expect one row):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='personal_todos'
--   and column_name='missed_dates';

-- ROLLBACK:
-- alter table public.personal_todos drop column if exists missed_dates;
