-- NS-2 Step 1 — rename category→section, widen PK to 4 columns (hand-applied in Supabase).
-- Prereq: info_page_sources MUST be empty (Step 0 cleared the test row) — PK columns are NOT NULL.
-- section holds a section key (systems|vnsa|industry|external|supply|investment|legal|civilian|logistics).
-- geography holds a country/sub-geo, or the sentinel 'REGIONAL' for a region-wide (All-LATAM) placement.

-- 1. rename the mis-named category column → section
alter table public.info_page_sources rename column category to section;

-- 2. make the two new PK columns NOT NULL with the sentinel default
--    (safe: table is empty, so no existing row violates NOT NULL)
alter table public.info_page_sources alter column section  set default '';
alter table public.info_page_sources alter column section  set not null;
alter table public.info_page_sources alter column geography set default 'REGIONAL';
alter table public.info_page_sources alter column geography set not null;

-- 3. swap the primary key: drop the 2-col, add the 4-col
alter table public.info_page_sources drop constraint info_page_sources_pkey;
alter table public.info_page_sources add primary key (article_id, info_page, section, geography);
