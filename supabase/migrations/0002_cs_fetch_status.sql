-- ============================================================================
-- Contested Skies — fetch-status singleton table (real-time signal for the Hub)
-- ============================================================================
-- A single-row table the daily fetch job updates after each run. The Hub
-- subscribes to it over Supabase Realtime to show "new articles available".
-- Idempotent: safe to run repeatedly.
-- ============================================================================

create table if not exists public.cs_fetch_status (
  id                  smallint primary key default 1,
  last_fetch          timestamptz,
  new_articles_count  integer default 0,
  updated_at          timestamptz default now(),
  constraint cs_fetch_status_singleton check (id = 1)
);

-- Seed the single row so the fetch job can always upsert id = 1.
insert into public.cs_fetch_status (id, last_fetch, new_articles_count)
values (1, null, 0)
on conflict (id) do nothing;

-- Row Level Security (service_role bypasses it; renderer reads via Realtime/policies).
alter table public.cs_fetch_status enable row level security;

-- Add to the Realtime publication so the Hub gets live updates (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cs_fetch_status'
  ) then
    alter publication supabase_realtime add table public.cs_fetch_status;
  end if;
end $$;
