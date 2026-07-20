-- Slice C-recurring: completion-anchored recurring personal to-dos.
--
-- FOUR NEW COLUMNS — none has ever existed on this table. Mirrors the local SQLite
-- shape (db.ts, next to notes/color/starred) and the 1a cloud conventions
-- (sql/2026-07-19_personal_todos_cloud.sql). Additive and idempotent; safe to re-run.
--
--   recurrence        — NULL = non-recurring; else daily|weekly|weekdays|monthly|yearly.
--   recurrence_anchor — 'completion' at spawn/set time; 'scheduled' reserved, unused now.
--   series_id         — shared across every instance of one recurring to-do; NULL if not.
--   spawned_successor — 0/1; 1 once completing an instance has spawned its successor
--                       (idempotency guard so a re-complete after revive never double-spawns).
--
-- No RLS, realtime, or replica-identity change is needed — personal_todos already has
-- all three from 1a, and they apply to the table, not to individual columns.

alter table public.personal_todos add column if not exists recurrence text;
alter table public.personal_todos add column if not exists recurrence_anchor text;
alter table public.personal_todos add column if not exists series_id text;
alter table public.personal_todos add column if not exists spawned_successor integer not null default 0;

-- VERIFY (expect four rows):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='personal_todos'
--   and column_name in ('recurrence','recurrence_anchor','series_id','spawned_successor');

-- ROLLBACK:
-- alter table public.personal_todos drop column if exists spawned_successor;
-- alter table public.personal_todos drop column if exists series_id;
-- alter table public.personal_todos drop column if exists recurrence_anchor;
-- alter table public.personal_todos drop column if exists recurrence;
