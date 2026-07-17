-- Intel: backfill NULL project_board_id on pipeline articles (0a-1b)
--
-- RUN BY HAND on 2026-07-17 in the Supabase SQL editor against project
-- iatcafrpkpvyaekoxuao. This is a RECORD of what was executed — it is NOT
-- auto-run and must NOT be re-executed from here.
--
-- Why this happened: syncFromContestedSkies (src/main/ipc/index.ts) built its
-- candidate rows with no project_board_id, so every GDELT/cs_articles article
-- inserted since the cfdd4b1 migration landed in cloud with project_board_id=NULL.
-- The db.ts:1036 "3a" seed stamps only the LOCAL mirror, so the app looked correct
-- while cloud stayed NULL. 7 such rows appeared 2026-07-17 09:47:12Z; this UPDATE
-- cleared them. Cloud verified 0 NULLs afterward.
--
-- The cloud WRITER is fixed in the same slice (0a-1b): the candidate object now
-- carries project_board_id='board-info-latam' from a constant, so future syncs
-- stop minting NULLs. This backfill is only for the rows minted before that fix.
--
-- Provenance note: cfdd4b1's own backfill (the 242 historical rows) was performed
-- by a scratchpad script that was NEVER committed — the value it wrote was inherited
-- from the already-seeded local mirror, not derived from any source of truth. That
-- missing record is why the 242 rows' provenance had to be reverse-engineered, and
-- why this file exists: hand-run intel backfills get a committed, dated record.

update intelligence_sources set project_board_id='board-info-latam'
where type='article' and (project_board_id is null or project_board_id='');
