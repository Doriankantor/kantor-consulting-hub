import type { BrowserWindow } from 'electron'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { cloud } from './client'

// ── Reusable main-process Realtime manager (first Realtime in the codebase) ──
// A source DECLARES what tables to watch and how to map a changed row to a scope
// id (e.g. a board id); the manager owns ALL channel lifecycle, evaluates
// relevance against the CURRENT acting user via the source's own check, debounces
// per scope, and pushes a LIGHTWEIGHT invalidate to the renderer over the
// existing webContents.send bridge. The renderer then re-runs its existing
// membership-filtered loaders — no full rows cross the wire, no direct Supabase
// in the renderer. New consumers (intel, info pages, uploads) register config;
// they never touch channels.

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface ResolvedScope {
  boardId: string | null
  scope: 'list' | 'board'
}

export interface RealtimeSourceConfig {
  name: string
  tables: string[]
  // Map a changed row → the scope id it belongs to. Return null to ignore.
  resolveBoardId: (table: string, row: Record<string, unknown>, eventType: RealtimeEventType) => Promise<ResolvedScope | null>
  // Should the CURRENT acting user receive this? (consumer-supplied visibility.)
  isRelevant: (resolved: ResolvedScope, table: string, row: Record<string, unknown>, eventType: RealtimeEventType) => Promise<boolean>
  // Renderer channel to send the invalidate on.
  pushChannel: string
  // OPTIONAL data-plane hook: apply a cloud change to the local mirror (e.g. a
  // DELETE removes the mirror row the upsert-only read sync can't drop). The
  // manager stays data-agnostic — it only invokes this, guarded, before the push;
  // the source owns the semantics. A mirror-write failure must never kill the push.
  applyToMirror?: (table: string, row: Record<string, unknown>, eventType: RealtimeEventType) => void
}

const DEBOUNCE_MS = 250

let getWindow: () => BrowserWindow | null = () => null
const sources: RealtimeSourceConfig[] = []
let channels: RealtimeChannel[] = []
let started = false
// Coalesce bursts: key = `${pushChannel}|${scope}|${boardId}` → pending timer.
const pending = new Map<string, ReturnType<typeof setTimeout>>()

// Called once at startup from the main entry so the manager can reach the window
// without importing it (avoids a circular dependency with main/index.ts).
export function initRealtime(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
}

// Declare a source (does NOT open channels — call startRealtime once the acting
// user is known).
export function registerRealtimeSource(config: RealtimeSourceConfig): void {
  if (!sources.find(s => s.name === config.name)) sources.push(config)
}

function pushDebounced(pushChannel: string, resolved: ResolvedScope): void {
  const key = `${pushChannel}|${resolved.scope}|${resolved.boardId ?? '_'}`
  const existing = pending.get(key)
  if (existing) clearTimeout(existing)
  pending.set(key, setTimeout(() => {
    pending.delete(key)
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(pushChannel, { boardId: resolved.boardId, scope: resolved.scope })
    }
  }, DEBOUNCE_MS))
}

function handleEvent(source: RealtimeSourceConfig, table: string, payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }): void {
  // DELETEs may carry data only in `old` (and only the PK unless REPLICA IDENTITY
  // FULL); fall back to old when new is empty.
  const eventType = (payload.eventType ?? 'UPDATE') as RealtimeEventType
  const newRow = payload.new && Object.keys(payload.new).length ? payload.new : undefined
  const row = (newRow ?? payload.old ?? {}) as Record<string, unknown>
  // Data-plane: let the source apply this change to its local mirror (e.g. a
  // cross-device DELETE removes the row). Runs regardless of relevance — the
  // mirror only holds rows the user has read, so an unowned-row delete is a
  // harmless no-op. Guarded so a mirror-write failure never kills the invalidate.
  if (source.applyToMirror) {
    try { source.applyToMirror(table, row, eventType) }
    catch (e) { console.warn(`[realtime] ${source.name} applyToMirror failed for ${table}:`, (e as Error)?.message) }
  }
  void (async () => {
    try {
      const resolved = await source.resolveBoardId(table, row, eventType)
      if (!resolved) return
      if (!(await source.isRelevant(resolved, table, row, eventType))) return
      pushDebounced(source.pushChannel, resolved)
    } catch (err) {
      console.warn(`[realtime] ${source.name} event handling failed for ${table}:`, (err as Error)?.message)
    }
  })()
}

// Open channels for every registered source. Idempotent (no-op if already on).
export function startRealtime(): void {
  if (started) return
  started = true
  for (const source of sources) {
    for (const table of source.tables) {
      const ch = cloud
        .channel(`rt:${source.name}:${table}`)
        .on(
          // postgres_changes, all events on the public table
          'postgres_changes' as unknown as 'system',
          { event: '*', schema: 'public', table } as unknown as Record<string, never>,
          (payload: unknown) => handleEvent(source, table, payload as { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> })
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[realtime] ${source.name}:${table} subscribe status: ${status}`)
          }
        })
      channels.push(ch)
    }
  }
  console.log(`[realtime] started ${channels.length} channel(s) across ${sources.length} source(s)`)
}

// Remove all channels and clear pending pushes.
export function teardownAll(): void {
  for (const ch of channels) {
    try { void cloud.removeChannel(ch) } catch { /* best-effort */ }
  }
  channels = []
  for (const t of pending.values()) clearTimeout(t)
  pending.clear()
  started = false
}

// Tear down and re-create — used when the acting user changes so the live
// relevance filter (evaluated per event via the source's isRelevant) follows the
// new user with a clean set of channels.
export function rescope(): void {
  teardownAll()
  startRealtime()
}
