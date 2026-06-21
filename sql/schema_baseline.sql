-- ============================================================================
--  Kantor Consulting Hub — SCHEMA BASELINE (public schema)
--  Supabase project ref: iatcafrpkpvyaekoxuao
--  Captured: 2026-06-20  |  Method: catalog-derived snapshot (NOT pg_dump)
-- ----------------------------------------------------------------------------
--  WHAT THIS IS
--    A point-in-time reconstruction of the public schema (tables, columns,
--    primary keys, foreign keys, RLS enablement, and RLS policies) built from
--    read-only information_schema / pg_catalog queries run on the live DB.
--    It is a forward-from-today baseline so the database is no longer
--    undocumented. Realtime config (publication + replica identity) is in the
--    companion file realtime_config.sql.
--
--  WHAT THIS IS NOT / KNOWN LIMITATIONS (this was not produced by pg_dump):
--    - No non-PK INDEXES, TRIGGERS, FUNCTIONS, CHECK constraints, SEQUENCES,
--      or storage-bucket / auth config are captured here.
--    - ARRAY element types (cs_fetch_log.keywords_used,
--      cs_sources_manual.source_type_tags) are INFERRED as text[].
--    - This rebuilds STRUCTURE only — no data rows.
--    For a guaranteed-faithful full dump later, use:
--      supabase db dump --db-url "<direct-connection-uri>" --schema public -f sql/schema_baseline.sql
--    (needs the DB password / direct connection string; run locally only).
--
--  SAFE TO RE-RUN: every statement uses IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================================

-- Tables are created in FK-safe order (parents before children).

create table if not exists public.areas (
  id text not null,
  name text not null,
  color text default '#6366f1'::text not null,
  is_default integer default 0,
  position integer default 0,
  created_at timestamptz default now(),
  constraint areas_pkey primary key (id)
);

create table if not exists public.labels (
  id text not null,
  name text not null,
  color text default '#6366f1'::text not null,
  position integer default 0,
  created_at timestamptz default now(),
  constraint labels_pkey primary key (id)
);

create table if not exists public.clients (
  id text not null,
  name text not null,
  type text default 'Private'::text not null,
  country text,
  region text,
  status text default 'Active'::text not null,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  notes text,
  area_tags_json text default '[]'::text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint clients_pkey primary key (id)
);

create table if not exists public.contacts (
  id text not null,
  full_name text not null,
  job_title text,
  organization text,
  contact_types_json text default '[]'::text not null,
  email_primary text,
  email_secondary text,
  phone_primary text,
  phone_mobile text,
  phone_secondary text,
  linkedin_url text,
  twitter_handle text,
  telegram_username text,
  website_url text,
  country text,
  city text,
  languages_json text default '[]'::text not null,
  org_type text,
  expertise_areas_json text default '[]'::text not null,
  security_sensitivity text default 'none'::text not null,
  how_we_met text,
  how_we_met_note text,
  assigned_to text,
  last_contacted_date text,
  confidential integer default 0 not null,
  do_not_contact integer default 0 not null,
  internal_notes text,
  notes_updated_by text,
  notes_updated_at timestamptz,
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  deleted_by text,
  constraint contacts_pkey primary key (id)
);

create table if not exists public.projects (
  id text not null,
  title text not null,
  description text,
  status text default 'active'::text,
  owner_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint projects_pkey primary key (id)
);

create table if not exists public.chat_messages (
  id text default (gen_random_uuid())::text not null,
  author_id text not null,
  author_name text not null,
  content text not null,
  created_at timestamptz default now() not null,
  constraint chat_messages_pkey primary key (id)
);

create table if not exists public.member_permissions (
  user_email text not null,
  permission_key text not null,
  granted_by text not null,
  granted_at timestamptz default now() not null,
  constraint member_permissions_pkey primary key (user_email, permission_key)
);

create table if not exists public.cs_articles (
  id uuid default gen_random_uuid() not null,
  title text,
  url text,
  source_name text,
  published_at timestamptz,
  content_snippet text,
  primary_category text,
  sub_category text,
  confidence_level text default 'unrated'::text,
  status text default 'new'::text,
  claude_analysis text,
  imported_to_hub boolean default false,
  imported_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  published_at_site timestamptz,
  notes text,
  created_at timestamptz default now(),
  constraint cs_articles_pkey primary key (id)
);

create table if not exists public.cs_fetch_log (
  id uuid default gen_random_uuid() not null,
  fetched_at timestamptz default now(),
  articles_found integer,
  articles_new integer,
  keywords_used text[],
  status text,
  error_message text,
  constraint cs_fetch_log_pkey primary key (id)
);

create table if not exists public.cs_fetch_status (
  id smallint default 1 not null,
  last_fetch timestamptz,
  new_articles_count integer default 0,
  updated_at timestamptz default now(),
  constraint cs_fetch_status_pkey primary key (id)
);

create table if not exists public.cs_sources_manual (
  id uuid default gen_random_uuid() not null,
  type text,
  platform text,
  handle text,
  content text,
  url text,
  date_posted timestamptz,
  source_type_tags text[],
  confidence_level text,
  status text,
  notes text,
  created_at timestamptz default now(),
  constraint cs_sources_manual_pkey primary key (id)
);

create table if not exists public.workspace_boards (
  id text not null,
  name text not null,
  position integer default 0,
  archived integer default 0,
  archived_at timestamptz,
  archived_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted integer default 0,
  constraint workspace_boards_pkey primary key (id)
);

create table if not exists public.task_templates (
  id text not null,
  name text not null,
  content_type text default 'policy-brief'::text not null,
  duration_days integer default 7,
  checklist_json text default '[]'::text,
  is_builtin integer default 0,
  board_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint task_templates_pkey primary key (id),
  constraint task_templates_board_id_fkey foreign key (board_id) references public.workspace_boards(id) on delete CASCADE
);

create table if not exists public.board_members (
  board_id text not null,
  user_email text not null,
  added_by_email text,
  added_at timestamptz default now(),
  constraint board_members_pkey primary key (board_id, user_email),
  constraint board_members_board_id_fkey foreign key (board_id) references public.workspace_boards(id) on delete CASCADE
);

create table if not exists public.workspace_columns (
  id text not null,
  name text not null,
  position integer default 0,
  color text default 'bg-slate-500'::text,
  board_id text default 'board-main'::text not null,
  constraint workspace_columns_pkey primary key (id),
  constraint workspace_columns_board_id_fkey foreign key (board_id) references public.workspace_boards(id) on delete CASCADE
);

create table if not exists public.workspace_tasks (
  id text not null,
  board_id text default 'board-main'::text not null,
  column_id text default 'col-scoping'::text not null,
  title text not null,
  content_type text default 'policy-brief'::text not null,
  client text,
  client_id text,
  client_org text,
  area_of_analysis text,
  assignees_json text default '[]'::text,
  due_date text,
  start_date text,
  priority text default 'medium'::text not null,
  description text,
  notes text,
  sources_json text,
  recurrence_json text,
  position integer default 0,
  archived integer default 0,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint workspace_tasks_pkey primary key (id),
  constraint workspace_tasks_board_id_fkey foreign key (board_id) references public.workspace_boards(id) on delete CASCADE
);

create table if not exists public.client_contacts (
  id text not null,
  client_id text not null,
  name text not null,
  role text,
  email text,
  phone text,
  created_at timestamptz default now() not null,
  constraint client_contacts_pkey primary key (id),
  constraint client_contacts_client_id_fkey foreign key (client_id) references public.clients(id) on delete CASCADE
);

create table if not exists public.contact_interactions (
  id text not null,
  contact_id text not null,
  date text not null,
  type text default 'Meeting'::text not null,
  summary text not null,
  logged_by_id text,
  logged_by_name text,
  follow_up integer default 0 not null,
  follow_up_date text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint contact_interactions_pkey primary key (id),
  constraint contact_interactions_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete CASCADE
);

create table if not exists public.contact_task_links (
  contact_id text not null,
  task_id text not null,
  created_at timestamptz default now() not null,
  constraint contact_task_links_pkey primary key (contact_id, task_id),
  constraint contact_task_links_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete CASCADE
);

create table if not exists public.task_activity (
  id text not null,
  task_id text not null,
  actor_name text not null,
  action text not null,
  created_at timestamptz default now(),
  constraint task_activity_pkey primary key (id),
  constraint task_activity_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);

create table if not exists public.task_attachments (
  id text default (gen_random_uuid())::text not null,
  task_id text not null,
  name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  url text,
  author_email text not null,
  author_name text not null,
  created_at timestamptz default now(),
  type text default 'file'::text not null,
  constraint task_attachments_pkey primary key (id),
  constraint task_attachments_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);

create table if not exists public.task_checklists (
  id text not null,
  task_id text not null,
  title text default 'Checklist'::text not null,
  position integer default 0,
  created_at timestamptz default now(),
  constraint task_checklists_pkey primary key (id),
  constraint task_checklists_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);

create table if not exists public.task_checklist_items (
  id text not null,
  checklist_id text not null,
  task_id text not null,
  text text not null,
  checked integer default 0,
  position integer default 0,
  created_at timestamptz default now(),
  constraint task_checklist_items_pkey primary key (id),
  constraint task_checklist_items_checklist_id_fkey foreign key (checklist_id) references public.task_checklists(id) on delete CASCADE,
  constraint task_checklist_items_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);

create table if not exists public.task_comments (
  id text not null,
  task_id text not null,
  author_id text not null,
  author_name text not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz,
  mentions_json text,
  constraint task_comments_pkey primary key (id),
  constraint task_comments_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);

create table if not exists public.task_labels (
  task_id text not null,
  label_id text not null,
  constraint task_labels_pkey primary key (task_id, label_id),
  constraint task_labels_task_id_fkey foreign key (task_id) references public.workspace_tasks(id) on delete CASCADE
);


-- ============================================================================
--  ROW-LEVEL SECURITY
-- ============================================================================
-- Enable RLS on every table (matches live: all 24 tables rls_enabled=true,
-- none forced). NOTE: the four cs_* tables have RLS ENABLED but NO policies,
-- so authenticated/anon access is denied by default and only the service-role
-- key (used by the main process / intelligence pipeline) can read/write them.
-- This appears intentional; left as-is.

alter table public.areas enable row level security;
alter table public.board_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.client_contacts enable row level security;
alter table public.clients enable row level security;
alter table public.contact_interactions enable row level security;
alter table public.contact_task_links enable row level security;
alter table public.contacts enable row level security;
alter table public.cs_articles enable row level security;
alter table public.cs_fetch_log enable row level security;
alter table public.cs_fetch_status enable row level security;
alter table public.cs_sources_manual enable row level security;
alter table public.labels enable row level security;
alter table public.member_permissions enable row level security;
alter table public.projects enable row level security;
alter table public.task_activity enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_checklists enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_templates enable row level security;
alter table public.workspace_boards enable row level security;
alter table public.workspace_columns enable row level security;
alter table public.workspace_tasks enable row level security;

-- ----------------------------------------------------------------------------
--  RLS POLICIES
--  Pattern: privilege = admin email (doriankantor@gmail.com) OR board
--  membership (board_members keyed by lowercased email). Child tables join to
--  membership through workspace_tasks.board_id. task_templates additionally
--  allows board_id IS NULL (global/built-in templates). cs_* tables have no
--  policies (service-role only — see note above).
-- ----------------------------------------------------------------------------

-- areas
drop policy if exists "areas_select" on public.areas;
create policy "areas_select" on public.areas for select to authenticated
  using (true);
drop policy if exists "areas_insert" on public.areas;
create policy "areas_insert" on public.areas for insert to authenticated
  with check (true);
drop policy if exists "areas_update" on public.areas;
create policy "areas_update" on public.areas for update to authenticated
  using (true)
  with check (true);

-- board_members
drop policy if exists "board_members_select" on public.board_members;
create policy "board_members_select" on public.board_members for select to authenticated
  using (true);
drop policy if exists "board_members_insert" on public.board_members;
create policy "board_members_insert" on public.board_members for insert to authenticated
  with check (true);

-- chat_messages
drop policy if exists "chat_select_authenticated" on public.chat_messages;
create policy "chat_select_authenticated" on public.chat_messages for select to authenticated
  using (true);
drop policy if exists "chat_insert_authenticated" on public.chat_messages;
create policy "chat_insert_authenticated" on public.chat_messages for insert to authenticated
  with check (true);

-- client_contacts
drop policy if exists "client_contacts_select" on public.client_contacts;
create policy "client_contacts_select" on public.client_contacts for select to authenticated
  using (true);
drop policy if exists "client_contacts_insert" on public.client_contacts;
create policy "client_contacts_insert" on public.client_contacts for insert to authenticated
  with check (true);

-- clients
drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients for select to authenticated
  using (true);
drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients for insert to authenticated
  with check (true);
drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients for update to authenticated
  using (true);

-- contact_interactions
drop policy if exists "interactions_select" on public.contact_interactions;
create policy "interactions_select" on public.contact_interactions for select to authenticated
  using (true);
drop policy if exists "interactions_insert" on public.contact_interactions;
create policy "interactions_insert" on public.contact_interactions for insert to authenticated
  with check (true);
drop policy if exists "interactions_update" on public.contact_interactions;
create policy "interactions_update" on public.contact_interactions for update to authenticated
  using (true);

-- contact_task_links
drop policy if exists "task_links_select" on public.contact_task_links;
create policy "task_links_select" on public.contact_task_links for select to authenticated
  using (true);
drop policy if exists "task_links_insert" on public.contact_task_links;
create policy "task_links_insert" on public.contact_task_links for insert to authenticated
  with check (true);

-- contacts
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts for select to authenticated
  using (true);
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts for insert to authenticated
  with check (true);
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts for update to authenticated
  using (true);

-- labels
drop policy if exists "labels_select" on public.labels;
create policy "labels_select" on public.labels for select to authenticated
  using (true);
drop policy if exists "labels_insert" on public.labels;
create policy "labels_insert" on public.labels for insert to authenticated
  with check (true);
drop policy if exists "labels_update" on public.labels;
create policy "labels_update" on public.labels for update to authenticated
  using (true)
  with check (true);

-- member_permissions
drop policy if exists "member_permissions_read" on public.member_permissions;
create policy "member_permissions_read" on public.member_permissions for select to authenticated
  using (true);

-- projects
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects for select to authenticated
  using (true);
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects for insert to authenticated
  with check (true);
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects for update to authenticated
  using (true)
  with check (true);

-- task_activity
drop policy if exists "task_activity_select" on public.task_activity;
create policy "task_activity_select" on public.task_activity for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_activity_insert" on public.task_activity;
create policy "task_activity_insert" on public.task_activity for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_activity_update" on public.task_activity;
create policy "task_activity_update" on public.task_activity for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_attachments
drop policy if exists "att_select" on public.task_attachments;
create policy "att_select" on public.task_attachments for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "att_insert" on public.task_attachments;
create policy "att_insert" on public.task_attachments for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "att_update" on public.task_attachments;
create policy "att_update" on public.task_attachments for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))))
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_attachments_delete" on public.task_attachments;
create policy "task_attachments_delete" on public.task_attachments for delete to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_checklist_items
drop policy if exists "task_checklist_items_select" on public.task_checklist_items;
create policy "task_checklist_items_select" on public.task_checklist_items for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklist_items_insert" on public.task_checklist_items;
create policy "task_checklist_items_insert" on public.task_checklist_items for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklist_items_update" on public.task_checklist_items;
create policy "task_checklist_items_update" on public.task_checklist_items for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklist_items_delete" on public.task_checklist_items;
create policy "task_checklist_items_delete" on public.task_checklist_items for delete to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_checklists
drop policy if exists "task_checklists_select" on public.task_checklists;
create policy "task_checklists_select" on public.task_checklists for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklists_insert" on public.task_checklists;
create policy "task_checklists_insert" on public.task_checklists for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklists_update" on public.task_checklists;
create policy "task_checklists_update" on public.task_checklists for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_checklists_delete" on public.task_checklists;
create policy "task_checklists_delete" on public.task_checklists for delete to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_comments
drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select" on public.task_comments for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert" on public.task_comments for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_comments_update" on public.task_comments;
create policy "task_comments_update" on public.task_comments for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_comments_delete" on public.task_comments;
create policy "task_comments_delete" on public.task_comments for delete to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_labels
drop policy if exists "task_labels_select" on public.task_labels;
create policy "task_labels_select" on public.task_labels for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));
drop policy if exists "task_labels_insert" on public.task_labels;
create policy "task_labels_insert" on public.task_labels for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (task_id in ( select t.id from workspace_tasks t where (t.board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))));

-- task_templates
drop policy if exists "task_templates_select" on public.task_templates;
create policy "task_templates_select" on public.task_templates for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id is null) or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "task_templates_insert" on public.task_templates;
create policy "task_templates_insert" on public.task_templates for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id is null) or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "task_templates_update" on public.task_templates;
create policy "task_templates_update" on public.task_templates for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id is null) or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));

-- workspace_boards
drop policy if exists "workspace_boards_select" on public.workspace_boards;
create policy "workspace_boards_select" on public.workspace_boards for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_boards_insert" on public.workspace_boards;
create policy "workspace_boards_insert" on public.workspace_boards for insert to authenticated
  with check (true);
drop policy if exists "workspace_boards_update" on public.workspace_boards;
create policy "workspace_boards_update" on public.workspace_boards for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));

-- workspace_columns
drop policy if exists "workspace_columns_select" on public.workspace_columns;
create policy "workspace_columns_select" on public.workspace_columns for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_columns_insert" on public.workspace_columns;
create policy "workspace_columns_insert" on public.workspace_columns for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_columns_update" on public.workspace_columns;
create policy "workspace_columns_update" on public.workspace_columns for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));

-- workspace_tasks
drop policy if exists "workspace_tasks_select" on public.workspace_tasks;
create policy "workspace_tasks_select" on public.workspace_tasks for select to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_tasks_insert" on public.workspace_tasks;
create policy "workspace_tasks_insert" on public.workspace_tasks for insert to authenticated
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_tasks_update" on public.workspace_tasks;
create policy "workspace_tasks_update" on public.workspace_tasks for update to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))))
  with check ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
drop policy if exists "workspace_tasks_delete" on public.workspace_tasks;
create policy "workspace_tasks_delete" on public.workspace_tasks for delete to authenticated
  using ((lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = 'doriankantor@gmail.com'::text or (board_id in ( select board_members.board_id from board_members where lower(board_members.user_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) ))));
