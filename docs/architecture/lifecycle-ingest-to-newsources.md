# Intelligence lifecycle: origin -> New Sources

_As of 2026-10-29 (HEAD 1485438). One piece of intelligence from ingest to a routed
info_page_sources row. Point-in-time; the region-routing detail reflects post-
subregional behavior (regions route to their own buckets). Regenerate if the pipeline
changes._

```mermaid
flowchart LR
  GD["GDELT pull (cron) - url/title/snippet, NO body"] --> CULL
  MC["Manual compose - Social/Doc/Interview"] --> IS
  CULL["Relevance gate / culling (Haiku, learns from approve/reject verdicts)"] --> CSA["cs_articles (CLOUD) - status, claude_analysis, imported_to_hub"]
  CSA --> SYNC["syncFromContestedSkies - maps to intel schema, claude_analysis DECOMPOSED to scalar cols (blob dropped)"]
  SYNC --> IS["intelligence_sources (CLOUD = truth)"]
  IS --> MIR["SQLite mirror (resyncRow)"]
  AZ["app-side Analyze (explicit; needs pasted body) -> analysis_json.ai"] --> IS
  MIR --> RV["Human review (SourceCard): confidence_override, geography_confirmed, human.incident, tags"]
  RV --> CR{"canRoute - six checks"}
  CR -->|pass| RT["routeToNewSources -> resolvePlacementGeographies (regions route to own cells; no REGIONAL fallback) -> info_page_sources rows, stage='new'"]
```

Key facts (see HANDOFF Architecture Notes): two article tables (cs_articles collection
vs intelligence_sources working); GDELT is two-hop, manual is one-hop; collection +
learning loop are Contested-Skies-only; claude_analysis is decomposed to columns on
import, so analysis_json.ai only exists after explicit app-side Analyze.
