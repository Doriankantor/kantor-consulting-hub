import type { BrowserWindow } from 'electron'
import { cloud } from './client'

// ── Connection state (main process, derived from cloud call OUTCOMES) ─────────
// Main is the only tier that talks to Supabase, so it owns the online/offline
// verdict and pushes it to the renderer (connection:changed). Hysteresis avoids
// flapping on a single transient failure:
//   • 2 CONSECUTIVE failures  → OFFLINE
//   • the FIRST success       → ONLINE
// While ONLINE, every real cloud attempt reports its outcome here (the mirror
// reads call reportCloudResult). While OFFLINE, the mirror-covered reads SKIP
// cloud entirely (serve the local mirror immediately — offline must be fast), so
// the ONLY thing touching the network is a ~10s recovery probe, whose success is
// what flips us back online. We never probe while healthy.

let online = true
let consecutiveFailures = 0
let probeTimer: ReturnType<typeof setInterval> | null = null
let getWindow: () => BrowserWindow | null = () => null

const FAILURE_THRESHOLD = 2
const PROBE_INTERVAL_MS = 10_000

// Offline→online callbacks, invoked once per recovery (from goOnline, after the
// renderer broadcast). This file stays DECOUPLED from the realtime manager — the
// wiring (register rescope here) lives in main/index.ts. Used to deterministically
// tear down and resubscribe realtime channels on reconnect, because the library's
// auto-rejoin is unobservable and postgres_changes never replays the outage window.
const reconnectCallbacks: Array<() => void> = []
export function onReconnect(cb: () => void): void {
  reconnectCallbacks.push(cb)
}

export function initConnection(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
}

export function isOnline(): boolean {
  return online
}

function broadcast(): void {
  try { getWindow()?.webContents.send('connection:changed', { online }) } catch { /* window gone */ }
}

// ── Transient app-wide notice (N-2a) ─────────────────────────────────────────
// A one-line message pushed to the renderer and rendered by the SAME app-wide
// banner as the offline state (OfflineBanner). It exists because some failures
// have no in-flight IPC call to return through: three of the nine notification
// writers run on a 60s timer with NO renderer involvement, so a return value
// cannot carry the failure. Deliberately reuses this module's window getter —
// same `webContents.send` shape as `broadcast()`, no extra wiring in index.ts,
// and NOT an eighth ad-hoc per-page toast.
export function pushNotice(message: string): void {
  if (!message) return
  try { getWindow()?.webContents.send('app:notice', { message }) } catch { /* window gone */ }
}

function goOffline(): void {
  if (!online) return
  online = false
  console.warn('[connection] OFFLINE — cloud reads will serve the local mirror; recovery probe started')
  broadcast()
  startProbe()
}

function goOnline(): void {
  consecutiveFailures = 0
  if (online) return
  online = true
  console.log('[connection] ONLINE — cloud reachable again')
  stopProbe()
  broadcast()
  // Fire reconnect hooks (realtime resubscribe) AFTER the renderer knows we're back.
  for (const cb of reconnectCallbacks) {
    try { cb() } catch (e) { console.warn('[connection] reconnect callback failed:', (e as Error)?.message) }
  }
}

// Report the outcome of a real cloud attempt. ok=true (no error) → online now;
// ok=false → count toward the offline threshold. While offline only the probe
// calls this, so a single probe success is what recovers us.
export function reportCloudResult(ok: boolean): void {
  if (ok) { goOnline(); return }
  consecutiveFailures++
  if (consecutiveFailures >= FAILURE_THRESHOLD) goOffline()
}

function startProbe(): void {
  if (probeTimer) return
  probeTimer = setInterval(async () => {
    try {
      const { error } = await cloud.from('workspace_boards').select('id').limit(1)
      reportCloudResult(!error)
    } catch {
      reportCloudResult(false)
    }
  }, PROBE_INTERVAL_MS)
  // Node timers keep the process alive; the probe is short-lived (stops on recovery).
  if (probeTimer.unref) probeTimer.unref()
}

function stopProbe(): void {
  if (probeTimer) { clearInterval(probeTimer); probeTimer = null }
}
