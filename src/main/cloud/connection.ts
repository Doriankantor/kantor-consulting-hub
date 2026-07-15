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

export function initConnection(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter
}

export function isOnline(): boolean {
  return online
}

function broadcast(): void {
  try { getWindow()?.webContents.send('connection:changed', { online }) } catch { /* window gone */ }
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
