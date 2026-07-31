-- Geo-3 Step 3 — SOURCE-STRIP of the 10 country-level geography tags from thematic_tags (2026-07-30).
-- RECORD of a data write APPLIED VIA scripts/geo3-strip-tags.mjs, not the Supabase SQL editor.
--
-- Why a script and not plain SQL: thematic_tags is a JSON-STRING array column; the strip is a
-- read-modify-write per row (remove the 10 country tags, preserve order + every other tag). The script
-- is idempotent (a source with no country-geo tags is skipped), dry-run by default (--commit to write),
-- and fail-stops on any error. Scope: project_board_id = 'board-info-latam' (Contested Skies).
--
-- PURPOSE: geography now lives on the axis (subject_countries / mentioned_countries / scalar geography,
-- Geo-1 + Geo-2 + the Step-2 backfill). The flat country tags in thematic_tags are therefore redundant
-- retrieval noise and are removed. Geography is NOT lost — it was already lifted onto the axis first.

-- ── The 10 COUNTRY-LEVEL tags stripped from thematic_tags on every board source ──
--   argentina, brazil, colombia, venezuela, europe, usa, china, russia, ukraine, latam
-- Removed case-insensitively; all remaining tags keep their original order.

-- ── DEFERRED — NOT stripped (preserved on their sources) ──
--   cauca, catatumbo, rio-de-janeiro   (sub-geo / place-level tags)
-- These stay until sub_geographies is populated and has a UI home; stripping them now would drop
-- sub-national detail the axis can't yet hold. Expected counts unchanged: cauca=4, catatumbo=3, rio=3.

-- ── SAFETY: orphan guard ──
-- Before stripping any country tag from a row, the script asserts the source retains geo signal on the
-- axis (subject_countries OR mentioned_countries non-empty) OR a non-null scalar geography. A row whose
-- ONLY geo signal is the tag being stripped HALTS the run (the csa-co-01 lesson) — it must be backfilled
-- (Geo-3 Step 2) first. Post-backfill this never trips; the assertion is a hard floor, not a nicety.

-- ── Illustrative per-row effect (actually applied as REST JSON updates by the script) ──
--   UPDATE public.intelligence_sources
--      SET thematic_tags = <original minus {argentina,brazil,colombia,venezuela,europe,usa,china,
--                                           russia,ukraine,latam}, order + sub-geo + non-geo preserved>
--    WHERE id = <each board source carrying >=1 country-level tag>;

-- ── vocab (known_tags) ──
-- The known_tags rows for the 10 country tags (+ cauca) were ALREADY hand-deleted earlier, so this step
-- performs NO vocab deletes. catatumbo/rio-de-janeiro vocab rows were preserved (their tags are deferred,
-- not orphaned). This step touches sources ONLY.

-- ── Post-state: orphaned-tag condition RESOLVED ──
-- After this strip the country geography tags are gone from BOTH surfaces — sources (this script) and
-- vocab (already deleted). No source references a deleted country vocab row; no country vocab row lacks
-- sources. The Geo-3 arc (geography off the tag axis, onto the geography axis) is complete except for the
-- deferred sub-geo tags, which remain intentionally until sub_geographies is wired.

-- ── Expected post-state (verified by the script's invariants) ──
--   inv1: ZERO board sources carry any of the 10 country-level tags in thematic_tags.
--   inv2: cauca/catatumbo/rio-de-janeiro still present, counts unchanged (4 / 3 / 3).
--   inv3: the 4 backfilled/at-risk sources (csa-rg-02, d1ef73a3, 75706600, 5b1358a1) still have
--         non-empty subject_countries — geography survived the strip.
