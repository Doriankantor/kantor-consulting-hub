-- Pre-Commit Review, proposal-generation stage (section TEXT only) -- hand-applied
-- in Supabase, then recorded here. PURELY ADDITIVE, nullable.
-- Holds the per-cell AI text proposal for a source's placement row. One
-- info_page_sources row = one (source x cell), so one proposal per row. Shape:
--   {
--     "status": "pending" | "generating" | "ready" | "error" | "nochange",
--     "original_body": "<section_texts.body snapshot at generation time, or ''>",
--     "proposed_body": "<AI reconciled section text>",
--     "divergence": false,            reserved -- contradiction flag, wired later
--     "divergence_reasoning": "",
--     "error": "",                    populated when status = 'error'
--     "generated_at": "<iso>"
--   }
-- Generated fire-and-forget at the new->review transition; NULL until then and
-- cleared back to NULL when a source is sent back to New Sources.

alter table public.info_page_sources add column if not exists proposal_json jsonb;
