alter table public.cs_articles
  add column if not exists source_stream text[];
