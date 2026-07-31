-- The cull, commit 2 — VNSA-actor tag family fold + junk-tag drop (2026-07-30).
-- RECORD of a data migration APPLIED VIA scripts/cull-vnsa-fold.mjs, not the Supabase SQL editor.
--
-- Why a script and not plain SQL: intelligence_sources.thematic_tags is a JSON-STRING array
-- column, so each change is a read-modify-write of the array (fold a loser → winner, de-dupe,
-- write back) — not expressible as a flat UPDATE. The script is idempotent, dry-run by default
-- (--commit to write), name-guards every known_tags delete, and fail-stops on any error.
-- Scope: project_board_id = 'board-info-latam' (Contested Skies), 274 sources.
--
-- Companion write-time guard (commit 1, already shipped): TAG_SYNONYMS in src/main/cloud/tags.ts
-- and src/renderer/src/pages/Intelligence/TagPicker.tsx fold these same losers on FUTURE writes,
-- so the variants cannot be reintroduced (e.g. by re-clicking a stale AI suggestion).

-- ── STEP 1 — fold the loser tags to the canonical winner in thematic_tags ─────
-- Canonical winner: 'violent-non-state-actor'. Losers folded into it (12 carriers total):
--   criminal-organizations   (2 sources)  → violent-non-state-actor
--   grupos-armados           (8 sources)  → violent-non-state-actor   [load-bearing]
--   grupo                    (1 source)   → violent-non-state-actor
--   colombia-grupos-armados  (1 source)   → violent-non-state-actor
-- 1 loser-carrier already held the winner → de-duped (no duplicate appended), not 12 net-new.
-- 0 sources carried more than one loser.
-- Equivalent per-row effect (illustrative — actually applied as a JSON-array RMW in the script):
--   UPDATE public.intelligence_sources
--      SET thematic_tags = <array with each loser replaced by 'violent-non-state-actor', de-duped>
--    WHERE project_board_id = 'board-info-latam'
--      AND thematic_tags::text LIKE ANY (ARRAY['%criminal-organizations%','%grupos-armados%','%grupo%','%colombia-grupos-armados%']);
--
-- SPECIAL CASE — source id 'csa-co-01': its only tag was 'colombia-grupos-armados', which encoded
-- BOTH the actor axis (grupos-armados → VNSA) and the geography axis (colombia). The fold collapses
-- its tags to ['violent-non-state-actor']; to avoid silently dropping the geography signal, the
-- script sets geography = <canonical Colombia format, mirrored from a neighbouring CO source> when
-- geography does not already indicate Colombia. (Geography is otherwise OUT of scope for this slice.)

-- ── STEP 2 — drop the junk tag `inadequate` from thematic_tags (2 sources) ────
-- Pure removal, NO repoint — `inadequate` has no canonical replacement.
--   UPDATE public.intelligence_sources
--      SET thematic_tags = <array with 'inadequate' removed>
--    WHERE project_board_id = 'board-info-latam'
--      AND thematic_tags::text LIKE '%inadequate%';

-- ── STEP 3 — delete the dead known_tags rows (name-guarded by the script) ─────
-- Only losers/junk that had a real known_tags row are deleted here; 'grupo' and
-- 'colombia-grupos-armados' were free-text only (no known_tags row) — nothing to delete for them.
DELETE FROM public.known_tags WHERE id = 18;  -- criminal-organizations (thematic, board-info-latam)
DELETE FROM public.known_tags WHERE id = 30;  -- grupos-armados         (thematic, board-info-latam)
DELETE FROM public.known_tags WHERE id = 31;  -- inadequate             (thematic, board-info-latam)
-- The script confirms each row's name matches the expected loser BEFORE deleting (never by id blind),
-- and skips (with a log) any row already gone. The winner known_tags row (id 56) is NOT touched.

-- ── Expected post-state (verified by the script's STEP 4 re-read) ─────────────
--   violent-non-state-actor carriers: 5 → 16
--   criminal-organizations / grupos-armados / grupo / colombia-grupos-armados: 0 remaining
--   inadequate: 0 remaining
--   known_tags ids 18 / 30 / 31: gone
