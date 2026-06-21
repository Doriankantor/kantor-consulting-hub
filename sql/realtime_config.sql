-- ============================================================================
--  Kantor Consulting Hub — REALTIME CONFIG
--  Supabase project ref: iatcafrpkpvyaekoxuao  |  Captured: 2026-06-20
-- ----------------------------------------------------------------------------
--  Live cross-machine sync depends on two database-side settings that the app
--  release does NOT carry and that pg_dump / schema dumps often MISS:
--    1) table membership in the supabase_realtime publication
--    2) REPLICA IDENTITY FULL (so DELETE events carry the full old row)
--
--  *** CRITICAL OPERATIONAL NOTE ***
--  Adding a table to the publication only affects realtime sockets that
--  subscribe AFTER the change. A running app that subscribed before the table
--  was added will NOT receive its events until FULLY QUIT AND RELAUNCHED
--  (not just reloaded). Symptom if missed: writes persist and a
--  navigate-away/back shows them, but nothing updates live. Always restart
--  both machines after changing the publication, then test.
--
--  SAFE TO RE-RUN: ADD TABLE errors only if already a member; if re-running on
--  a fresh DB, run this AFTER schema_baseline.sql (tables must exist first).
-- ============================================================================

-- 1) Publication membership — the 17 tables currently published for realtime.
--    (Run individually or wrap per-table if a table is already a member.)
alter publication supabase_realtime add table
  public.board_members,
  public.client_contacts,
  public.clients,
  public.contact_interactions,
  public.contact_task_links,
  public.contacts,
  public.cs_fetch_status,
  public.member_permissions,
  public.task_activity,
  public.task_attachments,
  public.task_checklist_items,
  public.task_checklists,
  public.task_comments,
  public.task_labels,
  public.workspace_boards,
  public.workspace_columns,
  public.workspace_tasks;

-- 2) Replica identity — tables set to FULL (current live state).
--    Tables NOT listed here are DEFAULT (PK-only old-row on DELETE); that is
--    correct by design for list-scope tables (e.g. workspace_boards) and for
--    child tables whose handler reloads the open board (e.g. task_labels).
alter table public.board_members        replica identity full;
alter table public.client_contacts      replica identity full;
alter table public.clients              replica identity full;
alter table public.contact_interactions replica identity full;
alter table public.contact_task_links   replica identity full;
alter table public.contacts             replica identity full;
alter table public.member_permissions   replica identity full;
alter table public.task_activity        replica identity full;
alter table public.task_attachments     replica identity full;
alter table public.task_checklist_items replica identity full;
alter table public.task_checklists      replica identity full;
alter table public.task_comments        replica identity full;
alter table public.workspace_columns    replica identity full;
alter table public.workspace_tasks      replica identity full;

-- NOTE: the supabase_realtime publication also has pubdelete=true (set during
-- the v2.0.8 DELETE-propagation fix). Verify with:
--   select pubname,pubinsert,pubupdate,pubdelete,pubtruncate
--   from pg_publication where pubname='supabase_realtime';
