-- Completed Projects feature — Stage 1: timestamp columns on workspace_tasks
-- published_at: stamped when a task enters the Published column
-- deletion_scheduled_at: stamped when a Completed task is marked for deletion
alter table public.workspace_tasks
  add column if not exists published_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz;
