import { useCallback, useEffect, useState } from 'react'

// S5b-2 (LIFT): the project-scoped THEMATIC ("Topic") tag vocabulary + registry layer,
// lifted VERBATIM from the canonical NewsTab copy so all four intel tabs share ONE
// implementation instead of four byte-identical duplicates. It owns ONLY the vocabulary:
//   - the known-tags list for a project (getKnownTags('thematic', boardId))
//   - the SINGLE realtime re-fetch subscription (onTagsInvalidate) with correct cleanup
//   - the raw registry mutators (createTag / deleteTag) that keep `known` in sync
// It deliberately does NOT own: isAdmin (the tab's permission check), the per-row row write
// (handleSetTags), or the per-row onAdd/onRemove/onCreate/onDelete closures -- those stay in
// the tab. disposition_tags is untouched (legacy project link; not a tag vocabulary).
//
// `projectBoardId` scopes the LOADED vocabulary + the subscription (the tab's selected
// project). The mutators take their OWN `boardId` argument because a create/delete acts on the
// ROW's project (source.project_board_id / projectBoardSel), which can differ from the loaded
// project in an "all projects" view -- this preserves the pre-lift per-row behavior exactly.

export interface ThematicTagVocabulary {
  known: string[]
  createTag: (name: string, boardId: string) => Promise<string | null>
  deleteTag: (name: string, boardId: string) => Promise<{ ok: boolean; error?: string }>
}

export function useThematicTagVocabulary(projectBoardId: string): ThematicTagVocabulary {
  const [known, setKnown] = useState<string[]>([])

  // Load the project's vocabulary; reload when the project changes. No project scope -> empty.
  useEffect(() => {
    (async () => {
      if (!projectBoardId) { setKnown([]); return }
      try {
        const t = await window.api.intelligence.getKnownTags('thematic', projectBoardId)
        setKnown(t || [])
      } catch (e) { console.warn('[useThematicTagVocabulary] known-tags load failed:', e) }
    })()
  }, [projectBoardId])

  // Realtime: re-fetch this project's vocabulary when known_tags changes in cloud.
  useEffect(() => {
    window.api.intelligence.onTagsInvalidate((d) => {
      if (!projectBoardId) return
      if (d.boardId && d.boardId !== projectBoardId) return
      window.api.intelligence.getKnownTags('thematic', projectBoardId).then(setKnown).catch(() => {})
    })
    return () => window.api.intelligence.removeTagsInvalidateListeners()
  }, [projectBoardId])

  // Raw registry create: add a tag to the project's known_tags, keep `known` in sync, and
  // return the canonical created name (or null on failure) so the caller can attach it to a row.
  const createTag = useCallback(async (name: string, boardId: string): Promise<string | null> => {
    if (!boardId) return null
    try {
      const res = await window.api.intelligence.createTag(name, 'thematic', boardId)
      if (!res?.ok || !res.name) {
        console.warn('[useThematicTagVocabulary] createTag failed:', res?.error)
        // Cloud write failed -- refetch so the picker reflects cloud truth (no phantom).
        window.api.intelligence.getKnownTags('thematic', boardId).then(setKnown).catch(() => {})
        return null
      }
      const created = res.name
      setKnown(prev => prev.includes(created) ? prev : [...prev, created].sort((a, b) => a.localeCompare(b)))
      return created
    } catch (e) { console.warn('[useThematicTagVocabulary] createTag failed:', e); return null }
  }, [])

  // Raw registry delete: remove a tag from the project's known_tags and keep `known` in sync.
  // Returns { ok, error? } so the caller can surface the message (existing row chips are kept).
  const deleteTag = useCallback(async (name: string, boardId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!boardId) return { ok: false }
    try {
      const res = await window.api.intelligence.deleteTag(name, 'thematic', boardId)
      if (!res?.ok) {
        console.warn('[useThematicTagVocabulary] deleteTag failed:', res?.error)
        window.api.intelligence.getKnownTags('thematic', boardId).then(setKnown).catch(() => {})
        return { ok: false, error: res?.error }
      }
      setKnown(prev => prev.filter(t => t !== name))
      return { ok: true }
    } catch (e) { console.warn('[useThematicTagVocabulary] deleteTag failed:', e); return { ok: false } }
  }, [])

  return { known, createTag, deleteTag }
}
