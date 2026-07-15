import { registerRealtimeSource, type ResolvedScope, type RealtimeEventType } from './realtimeManager'
import { isBoardVisible } from './boards'
import { getActingUserId } from '../ipc'

// ── Intel Realtime source (known_tags; template for intelligence_sources) ────
// known_tags.project_board_id IS the scope id, so no lookup is needed (unlike
// task_attachments, which maps task_id → board). Relevance reuses the EXISTING
// email-keyed visibility (isBoardVisible) against the CURRENT acting user —
// admin sees all — mirroring the boards/permissions sources. A change pushes a
// lightweight invalidate on 'intel:tagsInvalidate'; the renderer re-runs its
// existing getKnownTags refetch for the open project (no rows cross the wire).

export function registerIntelRealtime(): void {
  registerRealtimeSource({
    name: 'intel',
    tables: ['known_tags'],
    async resolveBoardId(_table: string, row: Record<string, unknown>, _e: RealtimeEventType): Promise<ResolvedScope | null> {
      return { boardId: (row.project_board_id as string) ?? null, scope: 'board' }
    },
    async isRelevant(resolved: ResolvedScope, _table: string, _row: Record<string, unknown>, _e: RealtimeEventType): Promise<boolean> {
      // Thin DELETE payloads may omit project_board_id → allow through so the open
      // project re-fetches (the re-fetch is itself project-scoped and harmless).
      if (!resolved.boardId) return true
      return isBoardVisible(getActingUserId(), resolved.boardId)
    },
    pushChannel: 'intel:tagsInvalidate',
  })
}
