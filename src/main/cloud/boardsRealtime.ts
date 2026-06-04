import { registerRealtimeSource, type ResolvedScope, type RealtimeEventType } from './realtimeManager'
import { boardIdOfTask, isBoardVisible, boardMembersRelevant, resolveIdentity } from './boards'
import { getActingUserId } from '../ipc'

// ── Boards Realtime source (first consumer of the manager) ───────────────────
// Parent tables map to a board directly; child tables (live in-card updates) map
// via the changed row's task_id → board. board_members changes invalidate the
// board LIST (a grant makes a board appear; a revoke makes it disappear).
// Relevance reuses the EXISTING email-keyed visibility (isBoardVisible /
// boardMembersRelevant) against the CURRENT acting user — admin sees all.

const PARENT_LIST_TABLES = new Set(['workspace_boards', 'board_members'])
const PARENT_BOARD_TABLES = new Set(['workspace_columns', 'workspace_tasks'])
const CHILD_TABLES = new Set(['task_comments', 'task_activity', 'task_checklists', 'task_checklist_items', 'task_labels'])

async function resolveBoardId(table: string, row: Record<string, unknown>, _e: RealtimeEventType): Promise<ResolvedScope | null> {
  // workspace_boards: the row IS the board; list-level change (add/rename/archive/delete).
  if (table === 'workspace_boards') {
    return { boardId: (row.id as string) ?? null, scope: 'list' }
  }
  // board_members: membership grant/revoke → list-level change.
  if (table === 'board_members') {
    return { boardId: (row.board_id as string) ?? null, scope: 'list' }
  }
  // columns / tasks: board-level change, board_id is on the row.
  if (PARENT_BOARD_TABLES.has(table)) {
    return { boardId: (row.board_id as string) ?? null, scope: 'board' }
  }
  // child tables: map task_id → board (board-level change).
  if (CHILD_TABLES.has(table)) {
    const taskId = row.task_id as string | undefined
    if (!taskId) return null
    const boardId = await boardIdOfTask(taskId)
    return boardId ? { boardId, scope: 'board' } : null
  }
  return null
}

async function isRelevant(resolved: ResolvedScope, table: string, row: Record<string, unknown>, _e: RealtimeEventType): Promise<boolean> {
  const actor = getActingUserId()
  // Membership changes: relevant if they touch THIS user's email or a board they
  // can already see (so grants appear and revokes disappear, live).
  if (table === 'board_members') {
    return boardMembersRelevant(actor, row)
  }
  // Everything else: only if the acting user can see the resolved board.
  return isBoardVisible(actor, resolved.boardId)
}

export function registerBoardsRealtime(): void {
  registerRealtimeSource({
    name: 'boards',
    tables: [
      'workspace_boards', 'board_members', 'workspace_columns', 'workspace_tasks',
      'task_comments', 'task_activity', 'task_checklists', 'task_checklist_items', 'task_labels',
    ],
    resolveBoardId,
    isRelevant,
    pushChannel: 'workspace:remoteChange',
  })

  // task_attachments: registers as a SEPARATE consumer so the Realtime manager
  // knows to subscribe to that table. resolveBoardId maps via the existing
  // boardIdOfTask(row.task_id) helper; isRelevant uses isBoardVisible.
  // scope 'board' → the renderer re-reads attachments for the open card.
  registerRealtimeSource({
    name: 'attachments',
    tables: ['task_attachments'],
    async resolveBoardId(_table, row) {
      const taskId = row.task_id as string | undefined
      if (!taskId) return null
      const boardId = await boardIdOfTask(taskId)
      return boardId ? { boardId, scope: 'board' as const } : null
    },
    async isRelevant(resolved, _table, _row) {
      return isBoardVisible(getActingUserId(), resolved.boardId)
    },
    pushChannel: 'workspace:remoteChange',
  })

  // member_permissions: grant or revoke pushes a live invalidate so each renderer
  // re-fetches its permission set (no relaunch required after a toggle).
  registerRealtimeSource({
    name: 'permissions',
    tables: ['member_permissions'],
    async resolveBoardId(_table, _row) {
      return { boardId: null, scope: 'list' as const }
    },
    async isRelevant(_resolved, _table, row) {
      const { email, isRoot } = resolveIdentity(getActingUserId())
      const changedEmail = String(row?.user_email ?? '').toLowerCase()
      // Root sees all permission changes (panel refresh); members see only their own.
      return isRoot || changedEmail === email
    },
    pushChannel: 'permissions:invalidate',
  })
}

// Silence unused-set warnings while documenting intent (sets used above).
void PARENT_LIST_TABLES
