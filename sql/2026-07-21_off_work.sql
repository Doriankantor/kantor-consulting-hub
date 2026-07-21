-- Off-work / leave-window slice v1 (2026-07-21).
--
-- Per-member self-set ONE leave window, future-only. Keyed on the stable work
-- email (like team_members / board_members / info_page_owners), so it survives a
-- device change. PK = user_email => exactly one active window per member; setting
-- a new window UPSERTs (replaces) the old one.
--
-- Effects (v1): the missed-occurrence evaluator SKIPS stamping misses for
-- boundaries inside [start_date, end_date] (it still rolls due_date forward), and
-- the Team page shows an "on leave" pill for members currently inside their window.
-- The notification-drop half is DEFERRED (blocked on notifications -> cloud).
--
-- Additive and idempotent; safe to re-run. No RLS change beyond the table default
-- (single-owner data, service-role key bypasses RLS as everywhere else here).

create table if not exists public.off_work (
  user_email text primary key,
  start_date text not null,   -- 'YYYY-MM-DD'
  end_date   text not null,   -- 'YYYY-MM-DD', >= start_date
  created_at timestamptz default now()
);

-- VERIFY (expect the four columns):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema='public' and table_name='off_work'
-- order by ordinal_position;

-- ROLLBACK:
-- drop table if exists public.off_work;
