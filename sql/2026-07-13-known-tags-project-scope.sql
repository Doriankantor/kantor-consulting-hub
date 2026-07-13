-- T1: project-scope thematic tags (known_tags registry)
--
-- Adds project_board_id to the known_tags registry so the topic-tag vocabulary is
-- scoped per Info Page project instead of being a single global pool. All existing
-- thematic tags are assigned to Contested Skies (board-info-latam), where their
-- articles live. The uniqueness key is re-keyed from (name, type) to
-- (name, type, project_board_id) so the same tag name can exist per-project.
--
-- Disposition tags are intentionally left with project_board_id=NULL (untouched;
-- that vocabulary is being retired).
--
-- This file is the committed schema record per the /sql discipline. It is NOT
-- auto-run — the runtime migration lives in src/main/db.ts (initDatabase), guarded
-- idempotently on the presence of the project_board_id column. known_tags is a
-- local SQLite table (no cloud/Supabase involvement).

ALTER TABLE known_tags ADD COLUMN project_board_id TEXT;

-- Backfill: all existing thematic tags belong to Contested Skies.
UPDATE known_tags SET project_board_id='board-info-latam' WHERE type='thematic';

-- Re-key uniqueness to include project so the same name can exist per-project.
DROP INDEX IF EXISTS idx_known_tags_name_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_known_tags_name_type_project
  ON known_tags(name, type, project_board_id);
