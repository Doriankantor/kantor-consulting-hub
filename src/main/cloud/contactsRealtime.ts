import { registerRealtimeSource } from './realtimeManager'

// ── Contacts Realtime source ──────────────────────────────────────────────────
// Contacts are team-wide (no per-member visibility). Any change to the five
// contacts tables invalidates the whole list on every machine. resolveBoardId
// returns { boardId: null, scope: 'list' } — the same shape workspace_boards
// list-scope changes use (boardId=null means "no specific board"; scope='list'
// tells the renderer to reload the full list). isRelevant is always true.

export function registerContactsRealtime(): void {
  registerRealtimeSource({
    name: 'contacts',
    tables: ['contacts', 'contact_interactions', 'contact_task_links', 'clients', 'client_contacts'],
    async resolveBoardId(_table, _row, _eventType) {
      return { boardId: null, scope: 'list' }
    },
    async isRelevant(_resolved, _table, _row, _eventType) {
      return true
    },
    pushChannel: 'contacts:remoteChange',
  })
}
