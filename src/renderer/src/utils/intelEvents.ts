// Same-renderer pub/sub for Intelligence pending-set changes. Mirrors the
// notificationsChanged pattern in Inbox.tsx (notifyRead): mutation sites dispatch,
// the Sidebar Intelligence badge listens and refetches immediately. A window event
// is same-renderer only, so the Sidebar's 60s poll stays as the cross-device
// backstop — this just kills the up-to-60s local lag.
export const INTEL_CHANGED_EVENT = 'intelChanged'

export function notifyIntelChanged() {
  window.dispatchEvent(new CustomEvent(INTEL_CHANGED_EVENT))
}
