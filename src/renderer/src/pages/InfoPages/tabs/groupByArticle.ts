// NS-2 Step 5 — shared article-grouping for the pipeline tabs.
//
// getSourcePipeline returns one row PER placement: a source routed into N sections yields N
// rows that share article_id + every joined intelligence_sources field, differing only in
// pipeline_id / section / geography / stage. Rendering rows 1:1 produced N duplicate cards
// (and inflated counts). groupByArticle collapses them into ONE GroupedSource per source —
// used by New Sources, Pre-Commit Review, and All Sources so the grouping never drifts.
//
// First-row-wins for the shared article fields (they're identical across a source's rows, so
// which row provides them is immaterial). placements[] carries the per-section detail.
//
// NOTE: `geography` here is the PLACEMENT geography (row.placement_geography), NOT the intel
// article's row.geography. Types match InfoPageSourceRow exactly (pipeline_id is a number;
// section/geography are optional) so the helper stays type-clean.
export interface Placement {
  pipeline_id: number
  section?: string
  geography?: string
  stage: InfoPageSourceRow['stage']
}
export interface GroupedSource extends InfoPageSourceRow {
  placements: Placement[]
}

export function groupByArticle(rows: InfoPageSourceRow[]): GroupedSource[] {
  const map = new Map<string, GroupedSource>()
  for (const row of rows) {
    const placement: Placement = {
      pipeline_id: row.pipeline_id,
      section: row.section,
      geography: row.placement_geography,
      stage: row.stage,
    }
    const g = map.get(row.article_id)
    if (g) g.placements.push(placement)
    else map.set(row.article_id, { ...row, placements: [placement] })
  }
  return [...map.values()]
}
