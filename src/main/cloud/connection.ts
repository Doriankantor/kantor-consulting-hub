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

// ── Transport-failure classifier (N-2c-1) ────────────────────────────────────
// FAILURE_THRESHOLD is 2, so the FIRST cloud call after the network drops is
// attempted for real while isOnline() still says true — undici rejects with a raw
// `TypeError: fetch failed` and that string leaked all the way to the user.
//
// This distinguishes a REJECTED promise (the request never completed — nothing to
// act on, retry later) from a RESOLVED { data, error } (PostgREST answered; that
// is a real server error the user should see verbatim). Only main can tell them
// apart: the renderer receives a flattened { ok, error } string over IPC and has
// lost the distinction, so classifying there would mean string-matching "fetch
// failed", which breaks whenever undici changes its wording.
//
// ⚠ CLASSIFICATION ONLY — it deliberately does NOT call reportCloudResult. N-2a's
// rule stands: a fire-and-forget notification write must never be able to flip the
// whole app offline. The connection verdict keeps coming from the reads.
// ★ THE PRIMARY SIGNAL, and it is STRUCTURAL — no message matching.
// postgrest-js (2.106.1) does NOT reject on a network failure: shouldThrowOnError
// is false everywhere in this codebase, so PostgrestBuilder catches the fetch
// rejection and RESOLVES with { error: { message: 'TypeError: fetch failed', ... },
// data: null, status: 0, statusText: '' }. `status: 0` is assigned in exactly ONE
// place — that catch handler. Every other status on a resolved response comes from
// a real HTTP Response (or postgrest-js's own 200/204/406 overrides), and the Fetch
// spec reserves 0 for network errors, so a genuine PostgREST answer can never carry
// it. That makes this an exact test for "the request never completed".
//
// ⚠ Classification only — like isTransportError below, it must NOT call
// reportCloudResult (N-2a: a fire-and-forget notification write must never be able
// to flip the whole app offline).
export function isTransportStatus(status: number | undefined): boolean {
  return status === 0
}

const TRANSPORT_CODES = new Set([
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN', 'EHOSTUNREACH',
])

export function isTransportError(e: unknown): boolean {
  // Walk the .cause chain iteratively — undici nests the real reason (ENOTFOUND,
  // ECONNREFUSED) under a bare TypeError. Depth-bounded so a self-referential or
  // cyclic cause can never spin.
  let cur: unknown = e
  for (let depth = 0; depth < 5; depth++) {
    if (!cur || typeof cur !== 'object') return false
    const err = cur as { name?: string; code?: string; cause?: unknown }
    // AbortError / TimeoutError: the request was cut off before an answer arrived.
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
    // undici surfaces every network failure as a bare TypeError from fetch.
    if (err.name === 'TypeError') return true
    if (typeof err.code === 'string' && TRANSPORT_CODES.has(err.code)) return true
    if (!err.cause || err.cause === cur) return false
    cur = err.cause
  }
  return false
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
