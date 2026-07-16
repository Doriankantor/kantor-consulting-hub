import { registerRealtimeSource, type ResolvedScope, type RealtimeEventType } from './realtimeManager'
import { isBoardVisible } from './boards'
import { applyCloudDelete } from './intel'
import { getActingUserId } from '../ipc'

// ── Intel Realtime sources ───────────────────────────────────────────────────
// TWO registrations, one per table, because they invalidate DIFFERENT renderer
// loaders: known_tags → re-fetch getKnownTags (project vocabulary); the migrated
// intelligence_sources → re-fetch getSources + the count badges. Both use the
// same scope key (project_board_id IS the board id — no lookup) and the same
// email-keyed visibility gate (isBoardVisible against the CURRENT acting user;
// admin sees all). No rows cross the wire — only a lightweight invalidate.

// project_board_id is the scope id on both tables; thin DELETE payloads may omit
// it → allow through so the open project re-fetches (the re-fetch is itself
// project-scoped and membership-gated, so this is harmless).
async function resolveByProjectBoard(_table: string, row: Record<string, unknown>, _e: RealtimeEventType): Promise<ResolvedScope | null> {
  return { boardId: (row.project_board_id as string) ?? null, scope: 'board' }
}
async function relevantByBoard(resolved: ResolvedScope, _table: string, _row: Record<string, unknown>, _e: RealtimeEventType): Promise<boolean> {
  if (!resolved.boardId) return true
  return isBoardVisible(getActingUserId(), resolved.boardId)
}

export function registerIntelRealtime(): void {
  // known_tags (unchanged) → 'intel:tagsInvalidate'; renderer re-runs getKnownTags.
  registerRealtimeSource({
    name: 'intel',
    tables: ['known_tags'],
    resolveBoardId: resolveByProjectBoard,
    isRelevant: relevantByBoard,
    pushChannel: 'intel:tagsInvalidate',
  })

  // intelligence_sources → 'intel:sourcesInvalidate'; renderer re-runs getSources +
  // the count reads. On a cross-device DELETE, applyToMirror removes the stale
  // mirror row (the upsert-only read sync can't) — DELETE only; INSERT/UPDATE
  // self-heal via the renderer's cloud-first getSources refetch (upserts the mirror).
  registerRealtimeSource({
    name: 'intel-sources',
    tables: ['intelligence_sources'],
    resolveBoardId: resolveByProjectBoard,
    isRelevant: relevantByBoard,
    applyToMirror(_table: string, row: Record<string, unknown>, eventType: RealtimeEventType): void {
      if (eventType !== 'DELETE') return
      applyCloudDelete(row.id as string)
    },
    pushChannel: 'intel:sourcesInvalidate',
  })
}
