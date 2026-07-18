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

// ── 0b-0 INSTRUMENTATION — OBSERVATION ONLY, ZERO behavioral change ──────────
// Realtime and HTTP are INDEPENDENT transports: every channel rides ONE shared
// websocket (client.ts builds a single RealtimeClient), so a socket death downs
// them ALL at once while HTTP keeps succeeding — which is precisely why
// connection.ts's HTTP-derived `online` flag can never see it, and why findings
// 3/4 (grants/revokes not propagating until restart) exist. These structures only
// RECORD what the socket and channels report. Nothing here triggers a resubscribe,
// a teardown, or a rescope — recovery is 0b-2, teardown correctness is 0b-1.
export interface ChannelHealth { status: string; err?: string; at: string }
const channelHealth = new Map<string, ChannelHealth>()
let lastHeartbeat: { status: string; latency?: number; at: string } | null = null
let heartbeatWired = false

// 0b-0: the SOCKET-level health signal, registered ONCE on the shared
// RealtimeClient — never per channel (18 channels would mean 18 registrations of
// the same socket-wide callback). This is the verdict the HTTP-derived online flag
// structurally cannot produce. Guarded: if the installed supabase-js has no
// onHeartbeat we log once and continue rather than throwing at startup.
function wireHeartbeat(): void {
  if (heartbeatWired) return
  heartbeatWired = true
  const rt = cloud.realtime as unknown as {
    onHeartbeat?: (cb: (status: string, latency?: number) => void) => void
  }
  if (typeof rt?.onHeartbeat !== 'function') {
    console.warn('[realtime] onHeartbeat unavailable on this supabase-js build — socket health signal NOT wired')
    return
  }
  rt.onHeartbeat((status: string, latency?: number) => {
    lastHeartbeat = { status, latency, at: new Date().toISOString() }
    console.log(`[realtime] heartbeat: ${status}${latency !== undefined ? ` (${latency}ms)` : ''}`)
  })
}

// 0b-0: our tracked count vs the LIBRARY's own channel list. THE measurement that
// settles cause-vs-symptom for the MaxListenersExceededWarning: if `library`
// CLIMBS across sign-in cycles while `tracked` stays flat, teardownAll's
// un-awaited removeChannel is leaking real channels (the 0b-1 justification). If
// they stay locked together, the warning was a benign test-protocol artifact.
// A divergence is deliberately NOT corrected here — only made VISIBLE.
function logChannelCounts(phase: string): void {
  let library = -1
  try { library = cloud.realtime.getChannels().length } catch { /* best-effort */ }
  console.log(`[realtime] channels after ${phase}: tracked=${channels.length} library=${library}`)
}

// 0b-0: READ-ONLY snapshot for the `realtime:health` debug IPC. Pure getter —
// reading it triggers nothing.
export function getRealtimeHealth(): {
  connectionState: string
  isConnected: boolean
  trackedCount: number
  libraryCount: number
  lastHeartbeat: { status: string; latency?: number; at: string } | null
  channels: Array<{ channel: string; status: string; err?: string; at: string }>
} {
  let connectionState = 'unknown'
  let isConnected = false
  let libraryCount = -1
  try { connectionState = String(cloud.realtime.connectionState()) } catch { /* best-effort */ }
  try { isConnected = cloud.realtime.isConnected() } catch { /* best-effort */ }
  try { libraryCount = cloud.realtime.getChannels().length } catch { /* best-effort */ }
  return {
    connectionState,
    isConnected,
    trackedCount: channels.length,
    libraryCount,
    lastHeartbeat,
    channels: [...channelHealth.entries()].map(([channel, h]) => ({ channel, ...h })),
  }
}

// Called once at startup from the main entry so the manager can reach the window
// without importing it (avoids a circular dependency with main/index.ts).
export function initRealtime(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
  wireHeartbeat()   // 0b-0: once, here — not per channel
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
        .subscribe((status: string, err?: Error) => {
          // 0b-0: record EVERY status — SUBSCRIBED included, not just the failures —
          // so RECOVERY is visible too, not only the death. `err` was previously
          // dropped on the floor; a CHANNEL_ERROR carrying no detail is far less
          // useful than one that names the cause.
          channelHealth.set(`${source.name}:${table}`, {
            status,
            err: err?.message,
            at: new Date().toISOString(),
          })
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              `[realtime] ${source.name}:${table} subscribe status: ${status}` +
              (err?.message ? ` — ${err.message}` : '')
            )
          }
        })
      channels.push(ch)
    }
  }
  console.log(`[realtime] started ${channels.length} channel(s) across ${sources.length} source(s)`)
  logChannelCounts('start')   // 0b-0
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
  logChannelCounts('teardown')   // 0b-0: library count may lag — removeChannel is async (0b-1)
}

// Tear down and re-create — used when the acting user changes so the live
// relevance filter (evaluated per event via the source's isRelevant) follows the
// new user with a clean set of channels.
export function rescope(): void {
  teardownAll()
  startRealtime()
}
