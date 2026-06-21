-- Completed Projects feature — mark-for-deletion: snapshot archived state before marking
-- pre_deletion_archived: stores the task's archived flag at the moment it was marked for
-- deletion, so undeleteTask can return it to the correct place (board or Completed drawer).
alter table public.workspace_tasks
  add column if not exists pre_deletion_archived integer;
