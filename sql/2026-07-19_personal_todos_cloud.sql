-- Slice 1a: personal to-do cloud tables. Owner-keyed by user_email (the only
-- cross-device-stable identity). Main process uses the service-role key and is the
-- real enforcement; RLS below is a defense-in-depth backstop mirroring other tables.

create table if not exists public.personal_todos (
  id text primary key, user_email text not null, title text not null,
  due_date text, due_time text, completed integer not null default 0,
  completed_at timestamptz, position integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists personal_todos_user_email_idx on public.personal_todos(user_email);

create table if not exists public.personal_todo_steps (
  id text primary key, todo_id text not null, user_email text not null,
  text text not null, checked integer not null default 0, position integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists personal_todo_steps_todo_id_idx on public.personal_todo_steps(todo_id);
create index if not exists personal_todo_steps_user_email_idx on public.personal_todo_steps(user_email);
-- todo_id is a plain column (no hard FK) so the 1b sync queue can upload a step before its
-- parent has synced; orphan-step cleanup is handled in app logic.

create table if not exists public.todo_dismissed (
  user_email text not null, task_id text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_email, task_id)
);

alter table public.personal_todos      enable row level security;
alter table public.personal_todo_steps enable row level security;
alter table public.todo_dismissed      enable row level security;

drop policy if exists personal_todos_owner on public.personal_todos;
create policy personal_todos_owner on public.personal_todos for all
  using (lower(user_email)=lower(auth.jwt()->>'email'))
  with check (lower(user_email)=lower(auth.jwt()->>'email'));
drop policy if exists personal_todo_steps_owner on public.personal_todo_steps;
create policy personal_todo_steps_owner on public.personal_todo_steps for all
  using (lower(user_email)=lower(auth.jwt()->>'email'))
  with check (lower(user_email)=lower(auth.jwt()->>'email'));
drop policy if exists todo_dismissed_owner on public.todo_dismissed;
create policy todo_dismissed_owner on public.todo_dismissed for all
  using (lower(user_email)=lower(auth.jwt()->>'email'))
  with check (lower(user_email)=lower(auth.jwt()->>'email'));

alter table public.personal_todos      replica identity full;
alter table public.personal_todo_steps replica identity full;
alter table public.todo_dismissed      replica identity full;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='personal_todos') then
    alter publication supabase_realtime add table public.personal_todos; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='personal_todo_steps') then
    alter publication supabase_realtime add table public.personal_todo_steps; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='todo_dismissed') then
    alter publication supabase_realtime add table public.todo_dismissed; end if;
end $$;

-- ROLLBACK:
-- alter publication supabase_realtime drop table public.personal_todos;
-- alter publication supabase_realtime drop table public.personal_todo_steps;
-- alter publication supabase_realtime drop table public.todo_dismissed;
-- drop table if exists public.personal_todo_steps;
-- drop table if exists public.todo_dismissed;
-- drop table if exists public.personal_todos;
