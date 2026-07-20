-- ─────────────────────────────────────────────────────────────────────────────
-- Slice 1c-2b-① — CLOUD BACKUP for the assignees_json device-id → email rewrite.
-- RUN THIS BY HAND IN SUPABASE **BEFORE** LAUNCHING THE APP WITH THE MIGRATION.
--
-- This is the LAST REVERSIBLE POINT. Once cloud holds emails AND a second device
-- syncs them down, no local backup can un-ring it — the mirror would simply
-- re-pull the rewritten values over any local restore. This table is what makes
-- the cloud step restorable, and it deliberately lives in CLOUD rather than on
-- one machine so a rollback does not depend on Dorian's laptop being the one
-- that runs it.
--
-- The migration routine REFUSES TO RUN if this table is missing or holds fewer
-- rows than there are tasks to rewrite. That check is the whole point: a backup
-- that is assumed rather than verified is not a backup.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.assignees_backup_cloud (
  task_id            text primary key,
  assignees_json_old text        not null,
  backed_up_at       timestamptz not null default now()
);

-- Populate from the CURRENT live values. ON CONFLICT DO NOTHING so re-running
-- this file can never overwrite a true original with an already-migrated value —
-- same first-run-wins rule as the local assignees_backup table in 1c-2a.
insert into public.assignees_backup_cloud (task_id, assignees_json_old)
select id, assignees_json
from public.workspace_tasks
where assignees_json is not null
  and assignees_json not in ('', '[]', 'null')
on conflict (task_id) do nothing;

-- RLS: main process uses the service-role key and bypasses RLS, but leave the
-- table locked down so the anon key can never read or write it.
alter table public.assignees_backup_cloud enable row level security;

-- ── VERIFY (run this and eyeball it before starting the app) ─────────────────
-- Expect 4 rows, each assignees_json_old a JSON array of UUID device ids.
--
--   select task_id, assignees_json_old, backed_up_at
--   from public.assignees_backup_cloud
--   order by task_id;
--
-- Cross-check that nothing was missed — expect ZERO rows returned:
--
--   select t.id
--   from public.workspace_tasks t
--   left join public.assignees_backup_cloud b on b.task_id = t.id
--   where t.assignees_json is not null
--     and t.assignees_json not in ('', '[]', 'null')
--     and b.task_id is null;

-- ── ROLLBACK — restore cloud from the backup ────────────────────────────────
-- VALID ONLY while no second device has synced the rewritten emails down. After
-- that, this restores cloud but the other device's mirror already holds emails
-- and will push/serve them again. THIS IS THE LAST REVERSIBLE POINT.
-- PREFERRED ROUTE — run it from the app's DevTools console instead, so the
-- rollback exercises the same code path a real rollback uses (it also clears the
-- settings flag for you, so the manual step below is not needed):
--
--   await window.api.assigneesMigration.cloudRollback()
--
-- The SQL below is the fallback for when the app won't start.
--
--   update public.workspace_tasks t
--   set    assignees_json = b.assignees_json_old,
--          updated_at     = now()
--   from   public.assignees_backup_cloud b
--   where  b.task_id = t.id;
--
-- Then clear the local settings flag so the migration will re-run:
--   (local SQLite)  delete from settings where key='assignees_cloud_email_migration_1c2b_v1';
