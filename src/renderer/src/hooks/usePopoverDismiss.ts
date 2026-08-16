import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Close a popover on outside-click or Escape. Lifted verbatim from Todo.tsx
 * (was module-private) so the intel overflow popovers can share it. Logic is
 * unchanged: a mousedown outside the returned ref, or an Escape keypress, calls
 * close(); listeners are attached only while `open`.
 */
export function usePopoverDismiss(open: boolean, close: () => void): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}
