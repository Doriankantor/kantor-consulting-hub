import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConnection } from '../contexts/ConnectionContext'
import { useNavigate } from 'react-router-dom'
import { urgency, URGENCY_RANK, isPromoted, dueLabel, type UrgencyKey } from '../utils/urgency'
// railOrder is no longer imported: the card's rail applies it internally, and the
// panel's list must show STORED order (A-3 drags against it), not display order.
import StepRail, { useReducedMotion } from '../components/StepRail'
import { TODO_COLORS, resolveTodoColor } from '../utils/todoColors'

// ─────────────────────────────────────────────────────────────────────────────
// The To-Do tab (slice 3a). Structure ported from docs/TodoStepRail.html.
//
// DATA: ONE window.api.todos.list(userId) call replaces the old getMyTasks +
// personalTodo.list pair. Dismissals stay a separate read (not part of TodoItem),
// and Google meetings stay a SEPARATE, ONLINE-ONLY renderer concern — they are not
// in the main-process aggregate because they cannot be assembled locally.
//
// STEP RAIL (3b) — PERSONAL ITEMS ONLY. Personal steps arrive INLINE on the
// TodoItem (`steps`), so the rail needs no fetch of its own. Board cards still get
// NO rail: their steps are card checklists, which read an unmirrored local table
// and whose toggle is a card edit gated by slice 4's EDIT tier.
// ─────────────────────────────────────────────────────────────────────────────

/** Display sources = the backend's TodoItem sources + meetings, which are view-layer. */
type DisplaySource =
  | TodoItem['source']
  | 'kc-meeting'
  | 'kc-intel'
  | 'assigned'
  /**
   * The REVERSE of 'assigned' — off-card work where the acting user is the
   * ASSIGNER, not the assignee. Same slice-2.5 entity, queried from the other
   * end. No backend emits it yet, so its tab is empty by construction.
   */
  | 'assigned-by-me'

/**
 * A TodoItem widened for display. Meetings are projected into this shape so tabs,
 * promotion and bands treat every row identically — and so that when kc-meeting
 * becomes a real backend source, the UI needs no restructuring.
 */
interface DisplayItem extends Omit<TodoItem, 'source'> {
  source: DisplaySource
  /** Meetings only — carried through for the chip and Join button. */
  meta?: { timeLabel: string; calendarName: string; calendarColor: string; meetingLink?: string }
}

const TABS = [
  { id: 'kc',              name: 'KC tasks' },
  { id: 'assigned',        name: 'Assigned to me' },
  { id: 'assigned-by-me',  name: 'Assigned by me' },
  { id: 'personal',        name: 'Personal' },
  { id: 'all',             name: 'All tasks' },
] as const
type TabId = typeof TABS[number]['id']

/**
 * KC is a SUPERSET — firm work plus what's assigned TO me (prototype inTab).
 *
 * ★ 'assigned-by-me' is deliberately NOT in the superset. KC answers "what is on
 * my plate"; work I delegated is on someone ELSE's plate and would inflate my own
 * list with items I am not doing. Note this is NOT handled by the `startsWith('kc')`
 * arm either — neither 'assigned' nor 'assigned-by-me' starts with 'kc', so only
 * the explicit `=== 'assigned'` lets one through. The other falls to the final arm
 * and appears solely under its own tab.
 */
const inTab = (t: DisplayItem, id: TabId): boolean =>
  id === 'all' ? true
  : id === 'kc' ? (t.source.startsWith('kc') || t.source === 'assigned')
  : t.source === id

/**
 * ★ ADD-STEP INPUT — MODULE-LEVEL, WITH ITS OWN DRAFT STATE. Both halves matter.
 *
 * THE BUG THIS FIXES: `Row` is defined INSIDE `Todo()`, so every render of Todo
 * creates a NEW function identity for it. React compares component types by
 * identity, sees a different type, and UNMOUNTS + REMOUNTS the whole subtree
 * rather than updating it — destroying the DOM node that had focus. With the draft
 * held in Todo's state, each keystroke re-rendered Todo → new Row → remount →
 * focus lost after exactly one character.
 *
 * THE FIX: keep the draft HERE. Typing now mutates only this component's state, so
 * Todo never re-renders while you type, Row is never recreated, and the input node
 * survives. `onAdd` fires on Enter only — the one moment a refetch is wanted anyway.
 *
 * Defined at module level so its own identity is stable too; without that it would
 * be recreated alongside Row and remount regardless of where the draft lived.
 */
function AddStepInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  // ONE submit path for both Enter and the + button, so they can never diverge.
  const submit = (): void => {
    const t = draft.trim()
    if (!t) return
    setDraft('')
    onAdd(t)
  }
  return (
    // Bordered input + a + button, per docs/TodoDetailPanel_mockup.html. The A-2
    // rewrite had stripped this to a borderless underline with no button. Draft
    // still lives HERE (module-level component, local state) — the 3b focus fix —
    // so typing never re-renders Todo and the input keeps focus.
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        placeholder="Add a step..."
        className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-white/85 placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-400 dark:focus:border-indigo-400/60 transition"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!draft.trim()}
        title="Add step"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-indigo-500 text-white transition"
      >
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

/**
 * ★ THE NOTES EDITOR (slice B) — MODULE-LEVEL, same discipline as AddStepInput.
 *
 * A plain <textarea>, NO TipTap, NO debounce. The draft lives HERE in local state,
 * so typing never re-renders Todo and can't hit the remount/focus trap.
 *
 * SAVE MODEL = onBlur + save-if-changed + an unmount-cleanup flush — the only shape
 * with zero lost-note paths. onBlur covers chevron/backdrop/select-another (all move
 * focus, firing blur first); the unmount cleanup covers the paths a plain onBlur-only
 * model drops — Esc-to-close and a Todo-page unmount (tab-switch / route-change).
 * Keyed by item.id at the call site, so selecting another to-do unmounts THIS editor
 * and its cleanup flushes the old draft before the new one mounts.
 */
function NotesEditor({ initial, onSave }: { initial: string; onSave: (notes: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  // `initial` is what is currently persisted; a save only fires when the draft
  // diverges from it. Kept in a ref so the unmount cleanup (which runs with a stale
  // closure) always compares against the latest values, never mount-time ones.
  const savedRef = useRef(initial)
  const draftRef = useRef(initial)
  draftRef.current = draft

  const flush = useCallback((): void => {
    const next = draftRef.current
    if (next === savedRef.current) return          // save-if-changed
    savedRef.current = next                          // new baseline BEFORE the async call
    onSave(next.length ? next : null)                // empty → NULL (matches the setter)
  }, [onSave])

  // Unmount flush. Empty deps: bind once, fire on teardown only. `flush` reads refs,
  // so a stale identity here can't read a stale draft.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => flushRef.current(), [])

  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={flush}
      placeholder="Add notes..."
      className="w-full min-h-[76px] resize-y rounded-[9px] border border-gray-200 dark:border-white/[0.12] bg-gray-50 dark:bg-white/[0.05] px-3 py-2.5 text-[13px] leading-relaxed text-gray-700 dark:text-white/85 placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-400 dark:focus:border-indigo-400/60 transition"
    />
  )
}

/**
 * ★ THE PERSONAL CARD — MODULE-LEVEL, AND THAT IS THE WHOLE POINT.
 *
 * `Row` is defined INSIDE `Todo()`, so it gets a new function identity on every
 * Todo render and React REMOUNTS its entire subtree rather than reconciling it.
 * That destroyed the Step Rail's DOM nodes on every toggle, which is why FLIP had
 * no "before" node to measure and the fill bar had no from-width to transition.
 *
 * React.memo CANNOT fix that: memo skips re-rendering a component that stays
 * MOUNTED — it cannot survive a parent unmount, and its comparator is never even
 * reached when the parent element's type changed. Stabilizing props via
 * useCallback/useMemo has the same limitation.
 *
 * Hoisting THIS component out is what fixes it: its type is now stable, so React
 * reconciles it (and StepRail below it) instead of tearing it down. Note the
 * distinction that matters — CHANGING PROP IDENTITY causes a re-render, which is
 * fine and in fact required for FLIP; CHANGING COMPONENT TYPE causes a remount,
 * which is fatal. The handlers below may be recreated freely.
 *
 * `Row` itself stays inside Todo (logged tech debt) — only the branch that owns
 * DOM state needed to move.
 */
/**
 * Slice C-recurring-2. ONE source of truth for recurrence labels, shared by the
 * picker trigger, its rows, and the card chip so wording never drifts. Keys match
 * the `recurrence` column values (C-recurring-1); null = non-recurring.
 */
const RECUR_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', weekdays: 'Weekdays', monthly: 'Monthly', yearly: 'Yearly',
}
/** Ordered options for the popover; `null` clears recurrence. */
const RECUR_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
/** Renderer-side validation, mirroring isTodoColorKey. */
const isRecurKey = (k: string | null): boolean => k === null || k in RECUR_LABELS

/** Inline "repeat" glyph (feather path from the mockup) — NO icon library. */
function RepeatIcon({ size = 13 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function PersonalCard({
  item, isSelected, duePill, extraClass = '', showMissedBlock = false,
  onComplete, onDelete, onSelect, onStar, onStepToggle,
}: {
  item: DisplayItem
  isSelected: boolean
  /** Pill classes from duePillFor — the urgency-keyed chip, not a text colour. */
  duePill: string
  extraClass?: string
  /** Slice C-recurring-3. Transient cue when this card's completion was just blocked. */
  showMissedBlock?: boolean
  onComplete: () => void
  onDelete: () => void
  onSelect: () => void
  onStar: () => void
  onStepToggle: (stepId: string) => void
}) {
  const steps = item.steps ?? []
  // Slice C-recurring-3. Un-cleared misses block completion, so the card gets a
  // subtle amber "action needed" cue (a left-edge tint) whenever misses exist.
  const hasMissed = (item.missed_dates ?? []).length > 0
  // A-2. Null for "no colour" AND for an unrecognised key — see todoColors.ts for
  // why an unknown key degrades instead of throwing. No colour ⇒ no stripe at all,
  // not a neutral grey one: a grey bar reads as a colour someone chose.
  const color = resolveTodoColor(item.color)
  return (
      // `relative` anchors the stripe; `overflow-hidden` clips it to the rounded
      // corner (without it the 5px bar squares off the card's left edge).
      <div
        onClick={onSelect}
        className={`group relative overflow-hidden border rounded-xl mx-3 my-1 px-3 py-2.5 cursor-pointer transition ${
          isSelected
            ? 'border-indigo-400 dark:border-indigo-400/60 bg-indigo-50/60 dark:bg-indigo-500/[0.1]'
            : hasMissed
            // Action-needed cue: amber border + faint amber wash while misses block completion.
            ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/[0.06] hover:border-amber-400 dark:hover:border-amber-500/60'
            // SOLID border + the app's standard elevated-card surface
            // (dark:bg-white/[0.04], as Dashboard cards), NOT the near-invisible
            // white/[0.015] over black that read as flat black in A-2.
            : 'border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:border-gray-300 dark:hover:border-white/[0.16]'
        } ${extraClass}`}
      >
      {color && <div className={`absolute left-0 top-0 bottom-0 w-[5px] ${color.barClass}`} />}
      {/* pl-2 clears the stripe so the tick never sits on top of it. */}
      <div className={`flex items-center gap-3 ${color ? 'pl-2' : ''}`}>
        {/* stopPropagation on EVERY control below — the card itself is now
            clickable (it opens the panel), so without this, ticking or deleting
            would also select the item. */}
        <button
          onClick={e => { e.stopPropagation(); onComplete() }}
          className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 transition flex items-center justify-center ${
            item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          }`}
        >
          {item.completed && (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm ${item.completed ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
              {item.title}
            </p>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-white/[0.08] text-gray-400 dark:text-white/40 border border-gray-200 dark:border-white/[0.08]">
              Personal
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(item.due_date || item.due_time) && (
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-[1.4] ${duePill}`}>
                {dueLabel(item.due_date, item.due_time)}
              </span>
            )}
            {/* Slice C-recurring-2. Repeat chip — same pill styling as the due pill,
                neutral tokens already on the card. */}
            {item.recurrence && RECUR_LABELS[item.recurrence] && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full border border-gray-200 dark:border-white/[0.08] bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50 text-[10px] font-semibold leading-[1.4]"
                    title={`Repeats ${RECUR_LABELS[item.recurrence].toLowerCase()}`}>
                <RepeatIcon size={10} />
                {RECUR_LABELS[item.recurrence]}
              </span>
            )}
            {/* Slice C-recurring-3. Missed chips — amber attention (reuses the amber
                due-pill tokens). Their presence blocks completion until cleared. */}
            {(item.missed_dates ?? []).map(d => (
              <span key={d}
                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-[1.4] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30"
                    title="Missed occurrence — clear it in the panel to complete this to-do">
                <RepeatIcon size={10} />
                missed: {d.slice(5)}
              </span>
            ))}
          </div>
          {/* Transient block cue when completion was just refused for un-cleared misses. */}
          {showMissedBlock && (
            <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Clear missed repeats first ↓
            </p>
          )}
        </div>
        {/* ★ AFFORDANCES — visible at rest, not hover-only. They were opacity-0
            until hover on a gray-300 / white-25 icon, which is invisible twice
            over: undiscoverable before hover, low-contrast after. Now they sit at
            60% and come to full on hover, on a larger 7×7 target with a heavier
            stroke. Same interaction, actually findable. */}
        {/* ★ STAR replaces the 3b expand chevron. The panel is now the sole step
            editor, so an expand affordance would open a second, competing one.
            A STARRED star stays at full opacity even at rest — it is state, not an
            affordance, and must be legible without hovering. */}
        <button
          onClick={e => { e.stopPropagation(); onStar() }}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition shrink-0 hover:bg-amber-50 dark:hover:bg-amber-500/15 ${
            item.starred
              ? 'text-amber-400 opacity-100'
              : 'text-gray-500 dark:text-white/50 opacity-60 group-hover:opacity-100 hover:text-amber-400'
          }`}
          title={item.starred ? 'Unstar' : 'Star'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14"
               fill={item.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1.5l1.7 3.44 3.8.55-2.75 2.68.65 3.78L7 10.16l-3.4 1.79.65-3.78L1.5 5.49l3.8-.55L7 1.5z"
                  strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-white/50 opacity-60 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition shrink-0"
          title="Delete"
        >
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ★ THE RAIL IS ALWAYS VISIBLE ONCE A STEP EXISTS — no expand required.
          StepRail itself returns null at zero steps, so a step-less to-do renders
          exactly as it did before 3b: no bar, no track, nothing. */}
      <StepRail
        steps={steps}
        labelMode={steps.length <= 4 ? 'all' : 'truncate'}
        onToggle={sid => onStepToggle(sid)}
      />

      {/* ⚠ NO INLINE STEP EDITOR HERE ANY MORE (A-2). Add/delete moved to the
          panel, which is the sole editor. Re-adding one here would mean two edit
          surfaces for one list — and would put an <input> back BELOW the Row
          boundary, which is exactly what caused the 3b focus bug. */}
      </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE + TIME POPOVERS (A-2 polish r2)
//
// NO reusable picker existed to reuse — verified: TaskDetailPanel uses bare native
// <input type="date">, and the month grids in TeamCalendar / Workspace/CalendarView
// are full-page views, not extractable popovers. These are new, self-contained, and
// module-level (stable identity, so the panel's remount discipline holds).
//
// All date strings are built from Y/M/D PARTS, never via Date.toISOString(), so a
// timezone offset can never shift the picked day by one — the same date-only
// discipline utils/urgency.ts uses. new Date(y, m, d) here is LOCAL and used only
// for weekday math and display, never to derive the stored string.
// ─────────────────────────────────────────────────────────────────────────────

// pad2 is retained for TimePopover's hour/minute option lists (the calendar-grid
// helpers WEEKDAYS/MONTH_NAMES/toISODate/todayISO/prettyDate went with DatePopover,
// which the native <input type="date"> replaced).
const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Close a popover on outside-click or Escape. Shared by both pickers. */
function usePopoverDismiss(open: boolean, close: () => void): React.RefObject<HTMLDivElement> {
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

const PILL_CLASS =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] ' +
  'bg-gray-50 dark:bg-white/[0.05] text-gray-700 dark:text-white/80 text-xs hover:border-indigo-300 ' +
  'dark:hover:border-indigo-400/50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200'

/**
 * Slice C-recurring-2. Recurrence picker — reuses the shared popover machinery
 * (usePopoverDismiss + PILL_CLASS trigger + the shared dropdown container; the
 * former DatePopover, now a native <input type="date">, once shared it too). Six
 * rows from RECUR_OPTIONS; picking one fires onPick and closes.
 */
function RecurrencePopover({ value, onPick, disabled = false }: { value: string | null; onPick: (freq: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = usePopoverDismiss(open, useCallback(() => setOpen(false), []))
  const label = value && RECUR_LABELS[value] ? RECUR_LABELS[value] : 'Does not repeat'

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2">
      <button type="button" disabled={disabled} onClick={() => { if (!disabled) setOpen(o => !o) }} className={PILL_CLASS}>
        <RepeatIcon size={13} />
        {label}
      </button>
      {/* Slice date-picker-C: recurrence is gated on a due date — a to-do with no
          due_date can't be made recurring (prevents the recurrence-without-due
          zombie state at the source). */}
      {disabled && (
        <span className="text-[11px] text-gray-400 dark:text-white/45">Set a due date first</span>
      )}
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-[196px] rounded-xl border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-hub-navy-light shadow-xl p-1.5">
          {RECUR_OPTIONS.map(opt => {
            const active = (value ?? null) === opt.value
            return (
              <button
                key={opt.value ?? 'none'}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-gray-700 dark:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
                }`}
              >
                {opt.value ? <RepeatIcon size={12} /> : <span className="w-3 h-3 inline-block" />}
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TimePopover({ value, disabled, onPick }: { value: string | null; disabled: boolean; onPick: (t: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = usePopoverDismiss(open, useCallback(() => setOpen(false), []))
  const hh = value ? value.slice(0, 2) : '09'
  const mm = value ? value.slice(3, 5) : '00'
  const set = (h: string, m: string): void => onPick(`${h}:${m}`)

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} className={PILL_CLASS}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
          <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {value ? value : 'Add time'}
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1.5 z-30 rounded-xl border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-hub-navy-light shadow-xl p-2.5">
          <div className="flex items-center gap-1.5">
            <select
              value={hh}
              onChange={e => set(e.target.value, mm)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            >
              {Array.from({ length: 24 }, (_, h) => pad2(h)).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-gray-400 dark:text-white/40 text-xs font-semibold">:</span>
            <select
              value={mm}
              onChange={e => set(hh, e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.12] bg-gray-50 dark:bg-white/[0.05] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            >
              {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {value && (
              <button
                type="button"
                onClick={() => { onPick(null); setOpen(false) }}
                className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition"
                title="Clear time"
              >
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * ONE DRAGGABLE STEP ROW (A-3). Module-level so its identity is stable — dnd-kit
 * needs the same persistent DOM nodes FLIP did. `useSortable` supplies the transform
 * and the drag `listeners`, which are spread ONLY on the grip handle: the toggle dot
 * and delete button keep their own onClick and can never be stolen by the drag.
 */
function SortableStepRow({
  step, onToggle, onDelete,
}: {
  step: TodoStep
  onToggle: (stepId: string) => void
  onDelete: (stepId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1.5 group/step py-0.5 ${isDragging ? 'opacity-60 z-10 relative' : ''}`}
    >
      {/* GRIP — the ONLY drag activator. Reveals on hover like the delete button. */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 mt-[2px] w-4 h-[18px] flex items-center justify-center rounded text-gray-300 dark:text-white/25 opacity-0 group-hover/step:opacity-100 hover:text-gray-500 dark:hover:text-white/50 cursor-grab active:cursor-grabbing transition"
        title="Drag to reorder"
        aria-label="Drag to reorder step"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="3" cy="2" r="1"/><circle cx="7" cy="2" r="1"/>
          <circle cx="3" cy="5" r="1"/><circle cx="7" cy="5" r="1"/>
          <circle cx="3" cy="8" r="1"/><circle cx="7" cy="8" r="1"/>
        </svg>
      </button>
      <button
        onClick={() => onToggle(step.id)}
        className={`shrink-0 mt-[3px] w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center transition-all duration-150 hover:scale-110 ${
          step.checked ? 'bg-indigo-500 border-indigo-500' : 'bg-gray-100 dark:bg-white/[0.08] border-gray-300 dark:border-white/30 hover:border-indigo-400'
        }`}
      >
        {step.checked && (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <span className={`flex-1 min-w-0 text-xs leading-snug break-words ${
        step.checked ? 'text-indigo-500 dark:text-indigo-300' : 'text-gray-600 dark:text-white/70'
      }`}>
        {step.text}
      </span>
      <button
        onClick={() => onDelete(step.id)}
        className="opacity-0 group-hover/step:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-gray-500 dark:text-white/50 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 transition shrink-0"
        title="Delete step"
      >
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

/**
 * ★ THE DETAIL PANEL (A-2) — MODULE-LEVEL, AND RENDERED AS A SIBLING OF THE LIST.
 *
 * Both halves are load-bearing, for the reason 3b taught the hard way:
 *
 *   MODULE-LEVEL, so its function identity is stable and React reconciles it
 *   instead of remounting it. This panel holds a date input, a time input and an
 *   add-step input — every one of which would lose focus mid-keystroke if its type
 *   changed on each Todo render (the 3b focus bug, exactly).
 *
 *   OUTSIDE THE ROW BOUNDARY, i.e. rendered directly from Todo's JSX. `Row` is
 *   still defined inside Todo (logged tech debt), so its whole subtree is torn down
 *   on every render. A module-level component rendered from INSIDE Row would remount
 *   anyway — that was the failed second attempt in 3b. Being module-level is not
 *   enough on its own; WHERE it is rendered is what saves it.
 *
 * It owns NO data. Every field comes from the live `item` off todos:list, so an edit
 * anywhere re-renders it with no fetch of its own and no local copy to drift.
 *
 * NO `online` PROP — deliberately. Every control here is a personal write, which is
 * offline-capable by design (1b). The board-card offline disabling in `Row` must not
 * leak into this panel.
 */
function TodoDetailPanel({
  item, open, reducedMotion, onClose, onComplete, onStar, onColor, onDue, onNotes, onRecurrence, onClearMissed,
  onStepToggle, onStepAdd, onStepDelete, onStepReorder, onExited,
}: {
  item: DisplayItem
  /** Drives the slide. False = parked off-screen right (opening frame, or exiting). */
  open: boolean
  reducedMotion: boolean
  /** Fires when the CLOSING slide finishes, so the parent can drop the retained item. */
  onExited: () => void
  onClose: () => void
  onComplete: () => void
  onStar: () => void
  onColor: (key: string | null) => void
  onDue: (date: string | null, time: string | null) => void
  /** Slice B. Fired by NotesEditor's onBlur / unmount flush, save-if-changed. */
  onNotes: (notes: string | null) => void
  /** Slice C-recurring-2. Recurrence frequency; null clears. */
  onRecurrence: (freq: string | null) => void
  /** Slice C-recurring-3. Mark one missed date done (bookkeeping-only). */
  onClearMissed: (date: string) => void
  onStepToggle: (stepId: string) => void
  onStepAdd: (text: string) => void
  onStepDelete: (stepId: string) => void
  /** A-3. New order of step ids after a drag; parent dense-rewrites position. */
  onStepReorder: (orderedStepIds: string[]) => void
}) {
  // POSITION order, not railOrder. The card's rail collects done-to-the-left for
  // legibility at a glance; this list is the editable one, so it must show the
  // stored order — otherwise A-3's drag would reorder a list the user isn't seeing.
  const steps = item.steps ?? []
  const done = steps.filter(s => s.checked).length
  const color = resolveTodoColor(item.color)

  // A-3 DRAG — the SAME dnd-kit setup the Kanban uses (KanbanView.tsx:689). The 5px
  // activation distance means a click on the toggle dot or delete never starts a
  // drag; the grip owns the drag listeners, so those buttons keep their own onClick.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const handleDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = steps.map(s => s.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onStepReorder(arrayMove(ids, from, to))   // commit ON DROP only (no refetch on move)
  }

  return (
    // ★ ABSOLUTELY POSITIONED, not a flex child. A flex sibling would snap the
    // list to its new width the instant it mounted, so the panel would slide in
    // beside a list that had ALREADY jumped. Taking it out of flow means the list
    // is instead pushed by the animated spacer in Todo, in step with this slide.
    //
    // translateX only — no width/left animation. Transform is composited, so it
    // does not relayout the list on every frame.
    <aside
      onTransitionEnd={e => {
        // Guard on the property AND the target: this element's own transform, not
        // a hover transition bubbling up from a swatch or button inside.
        if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return
        if (!open) onExited()
      }}
      className={`absolute right-0 top-0 bottom-0 w-[378px] z-10 border-l border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-gradient-to-b dark:from-hub-navy-light dark:to-hub-navy flex flex-col overflow-hidden shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.18)] dark:shadow-[-8px_0_24px_-10px_rgba(0,0,0,0.5)] ${
        reducedMotion ? '' : 'transition-transform duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)]'
      } ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* HEAD */}
      <div className="relative px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        {color && <div className={`absolute left-0 top-0 bottom-0 w-[5px] ${color.barClass}`} />}
        <div className="flex items-start gap-3 pl-1.5">
          <button
            onClick={onComplete}
            className={`shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full border-2 transition flex items-center justify-center ${
              item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
            }`}
            title={item.completed ? 'Mark not done' : 'Mark done'}
          >
            {item.completed && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          {/* READ-ONLY. There is no personalTodo title-update handler (verified —
              the channel does not exist), and inventing one is out of this slice. */}
          <p className={`flex-1 min-w-0 text-sm leading-snug break-words ${
            item.completed ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'
          }`}>
            {item.title}
          </p>
          <button
            onClick={onStar}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition hover:bg-amber-50 dark:hover:bg-amber-500/15 ${
              item.starred ? 'text-amber-400' : 'text-gray-400 dark:text-white/40 hover:text-amber-400'
            }`}
            title={item.starred ? 'Unstar' : 'Star'}
          >
            <svg width="15" height="15" viewBox="0 0 14 14"
                 fill={item.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M7 1.5l1.7 3.44 3.8.55-2.75 2.68.65 3.78L7 10.16l-3.4 1.79.65-3.78L1.5 5.49l3.8-.55L7 1.5z" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* CLOSE = a chevron pointing at the right edge, i.e. "collapse away in
              the direction you came from". An X reads as "delete/dismiss", which on
              a to-do panel is an alarming thing to guess wrong about. */}
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition"
            title="Close panel"
          >
            <svg width="15" height="15" viewBox="0 0 12 12" fill="none">
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* REVIVE — completed items only. Placed FIRST because it is the one thing
            you came here to do on a done item; the picker and date below stay usable
            (a completed to-do can still be recoloured without being revived). */}
        {item.completed && (
          <div className="rounded-lg border border-green-200 dark:border-green-500/25 bg-green-50/60 dark:bg-green-500/[0.07] px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700 dark:text-green-300">Completed</p>
              {item.completed_at && (
                <p className="text-[10px] text-green-600/70 dark:text-green-400/60 mt-0.5">
                  {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            {/* Same handler as the tick — reviving IS uncompleting. The panel stays
                open afterwards; the item re-sorts out of Completed underneath it. */}
            <button
              onClick={onComplete}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-white/10 border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-white/15 transition"
            >
              Revive
            </button>
          </div>
        )}

        {/* COLOUR */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40 mb-2">Colour</p>
          <div className="flex items-center gap-2 flex-wrap">
            {TODO_COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => onColor(c.key)}
                title={c.label}
                className={`w-6 h-6 rounded-full transition hover:scale-110 ${c.barClass} ${
                  item.color === c.key ? `ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0a0d16] ${c.ringClass}` : ''
                }`}
              />
            ))}
            {/* NO COLOUR — a slashed circle, not an eighth swatch, so it never reads
                as "grey" (which IS a choice, and is the slate swatch). */}
            <button
              onClick={() => onColor(null)}
              title="No colour"
              className={`w-6 h-6 rounded-full border border-gray-300 dark:border-white/25 flex items-center justify-center transition hover:scale-110 ${
                !item.color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0a0d16] ring-gray-400 dark:ring-white/40' : ''
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 8.5L8.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
                      className="text-gray-400 dark:text-white/40" />
              </svg>
            </button>
          </div>
        </div>

        {/* DUE — native date input (app-wide standard; OS picker positions itself) +
            a custom time popover. */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40 mb-2">Due</p>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Picking a date carries the current time through; '' clears to null.
                onClick opens the OS picker on a body click (native inputs otherwise
                open only from the tiny edge glyph). */}
            <input
              type="date"
              value={item.due_date ?? ''}
              onChange={e => onDue(e.target.value || null, item.due_time ?? null)}
              onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }}
              className="titlebar-no-drag px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 [color-scheme:dark]"
            />
            {/* Disabled without a date: setDue (A-1) drops a time whose date is
                null, so an enabled time picker here would let the user set a value
                that silently never persists. */}
            <TimePopover value={item.due_time ?? null} disabled={!item.due_date} onPick={t => onDue(item.due_date ?? null, t)} />
          </div>
          {item.due_date && (
            <button
              onClick={() => onDue(null, null)}
              className="mt-2 text-[10px] text-gray-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400 transition"
            >
              Clear due date
            </button>
          )}
        </div>

        {/* RECURRENCE (slice C-recurring-2) — placed after DUE (date-adjacent). */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40 mb-2">Repeat</p>
          <RecurrencePopover value={item.recurrence ?? null} onPick={onRecurrence} disabled={!item.due_date} />
        </div>

        {/* STEPS — the editable list. Drag-reorder is A-3. */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">Steps</p>
            {steps.length > 0 && (
              <span className="text-[10px] tabular-nums text-gray-400 dark:text-white/35">{done} of {steps.length}</span>
            )}
          </div>
          <div className="space-y-0.5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {steps.map(s => (
                  <SortableStepRow key={s.id} step={s} onToggle={onStepToggle} onDelete={onStepDelete} />
                ))}
              </SortableContext>
            </DndContext>
            {/* The SAME module-level input 3b introduced, for the same reason: it
                holds its own draft, so typing never re-renders Todo. */}
            <div className="pt-1">
              <AddStepInput onAdd={onStepAdd} />
            </div>
          </div>
        </div>

        {/* NOTES (slice B) — plain textarea, keyed by item.id so switching to another
            to-do UNMOUNTS the editor and its cleanup flushes the old draft. */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40 mb-2">Notes</p>
          <NotesEditor key={item.id} initial={item.notes ?? ''} onSave={onNotes} />
        </div>

        {/* MISSED REPEATS (slice C-recurring-3) — after Notes. Hidden when empty.
            Each row marks ONE miss done (bookkeeping-only — never spawns). While any
            remain, completion is blocked, so this is the escape hatch. */}
        {(item.missed_dates ?? []).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
              Missed repeats · clear to complete
            </p>
            <div className="space-y-1">
              {(item.missed_dates ?? []).map(d => (
                <div key={d} className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/[0.08] px-2.5 py-1.5">
                  <RepeatIcon size={12} />
                  <span className="flex-1 min-w-0 text-xs text-amber-800 dark:text-amber-200">
                    {new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => onClearMissed(d)}
                    className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white dark:bg-white/10 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-white/15 transition"
                    title="Mark this missed occurrence done (bookkeeping only — does not create a new to-do)"
                  >
                    Mark done
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

/** Due-date colour for the BOARD-card row (plain text, unchanged from 3a). */
function dueColorFor(item: DisplayItem): string {
  const k = urgency(item.due_date).k
  return k === 'pastdue' ? 'text-red-500 dark:text-red-400'
    : k === 'today' ? 'text-amber-500 dark:text-amber-400'
    : 'text-gray-400 dark:text-white/40'
}

/**
 * THE DUE PILL (A-2 polish) — the personal card's due chip, keyed to the SAME
 * urgency buckets that drive promotion and banding, so a pill can never disagree
 * with the group its card is sitting in.
 *
 * The old chip was `text-[10px] text-gray-400` for everything but past-due and
 * today — grey-on-near-white at ten pixels, which is not a chip so much as a
 * rumour. Every bucket now gets a filled pill with a border and readable contrast.
 *
 * Full literal class strings (no composition) so Tailwind's scanner keeps them.
 */
const DUE_PILL: Record<UrgencyKey, string> = {
  pastdue:  'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
  today:    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  tomorrow: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/[0.12] dark:text-amber-200/90 dark:border-amber-500/20',
  d2:       'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/[0.12] dark:text-amber-200/90 dark:border-amber-500/20',
  d3:       'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/[0.12] dark:text-amber-200/90 dark:border-amber-500/20',
  // Visible, not ghosted — a dated item always reads as dated. Slate rather than
  // grey-400 so it holds its own against the card without competing with amber.
  later:    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.09] dark:text-white/70 dark:border-white/15',
  none:     'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.09] dark:text-white/70 dark:border-white/15',
}

function duePillFor(item: DisplayItem): string {
  return DUE_PILL[urgency(item.due_date).k]
}

const BAND_LABELS: Record<UrgencyKey, string> = {
  pastdue: 'Past due', today: 'Due today', tomorrow: 'Due tomorrow',
  d2: '2 days to go', d3: '3 days to go', later: 'Later', none: 'No date',
}

export default function Todo() {
  const { localUser, isRoot } = useAuth()
  const { areas, openTask, setActiveBoardId, todoDataVersion } = useWorkspace()
  const { online } = useConnection()
  const navigate = useNavigate()
  const userId = localUser?.id ?? 'local-admin'
  const userName = localUser?.name ?? 'Admin'

  const [items, setItems] = useState<DisplayItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  // A-2. Which personal item the detail panel is showing. Replaces 3b's `expanded`
  // set: the panel is a SINGLE editor for ONE item, so a set of open cards no longer
  // has any meaning. Ephemeral by design — not persisted across sessions.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Slice C-recurring-3: the item whose completion was just blocked for un-cleared
  // misses. Drives a transient inline "clear missed repeats first" cue; auto-expires.
  const [missedBlockId, setMissedBlockId] = useState<string | null>(null)
  useEffect(() => {
    if (!missedBlockId) return
    const t = setTimeout(() => setMissedBlockId(null), 4000)
    return () => clearTimeout(t)
  }, [missedBlockId])
  // NOTE: add-step drafts deliberately do NOT live here. See AddStepInput — holding
  // them in this component re-rendered Todo on every keystroke, which recreated the
  // inline `Row` and remounted the input, losing focus after one character.

  const [tab, setTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem(`todo-tab-${userId}`)
      if (saved && TABS.some(t => t.id === saved)) return saved as TabId
    } catch { /* private mode / quota — fall through to the default */ }
    return 'personal'   // prototype default
  })
  useEffect(() => {
    try { localStorage.setItem(`todo-tab-${userId}`, tab) } catch { /* non-fatal */ }
  }, [tab, userId])

  // Add-personal form
  const [showAddPersonal, setShowAddPersonal] = useState(false)
  const [newPersonalTitle, setNewPersonalTitle] = useState('')
  const [newPersonalDate, setNewPersonalDate] = useState('')
  const [newPersonalTime, setNewPersonalTime] = useState('')
  const [addingPersonal, setAddingPersonal] = useState(false)

  // Meetings (Google, online-only, view-layer)
  const [meetings, setMeetings] = useState<DisplayItem[]>([])
  const [showCalEvents, setShowCalEvents] = useState<boolean>(() => {
    try { return localStorage.getItem(`todo-show-cal-${userId}`) !== 'false' } catch { return true }
  })
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleNeedsReauth, setGoogleNeedsReauth] = useState(false)

  // ── Loads ──────────────────────────────────────────────────────────────────
  // Refetches are SERIALIZED through this chain so overlapping pushes can never
  // interleave and land an older result last (same pattern as WorkspaceContext's
  // remoteChainRef).
  const loadChainRef = useRef<Promise<void>>(Promise.resolve())

  const load = useCallback(async () => {
    try {
      const [list, dismissedIds] = await Promise.all([
        window.api.todos.list(userId),
        window.api.todo.getDismissed(userId),
      ])
      setItems(list as DisplayItem[])
      setDismissed(new Set(dismissedIds))
    } catch {
      // Leave whatever is on screen rather than blanking the tab; the aggregate
      // already degrades per-source in main, so a total failure here is a bug
      // worth seeing as staleness, not as an empty list.
    } finally {
      setLoading(false)
    }
  }, [userId])

  const queueLoad = useCallback(() => {
    loadChainRef.current = loadChainRef.current.then(() => load()).catch(() => {})
  }, [load])

  const loadMeetings = useCallback(async () => {
    try {
      const status = await window.api.userGoogle.getStatus(userId)
      setGoogleConnected(status.connected)
      if (!status.connected) return
      const calsResult = await window.api.userGoogle.getCalendars(userId)
      if ('needsReauth' in calsResult && calsResult.needsReauth) {
        setGoogleNeedsReauth(true); setGoogleConnected(false); return
      }
      const cals = calsResult as { id: string; summary: string; backgroundColor: string }[]
      let enabledSet: Set<string>
      try {
        const saved = localStorage.getItem(`cal-toggles-${userId}`)
        enabledSet = saved ? new Set(JSON.parse(saved)) : new Set(cals.map(c => c.id))
      } catch { enabledSet = new Set(cals.map(c => c.id)) }

      const today = new Date()
      const startDate = today.toISOString().slice(0, 10)
      const endDate = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)
      const now = Date.now()
      const out: DisplayItem[] = []
      for (const cal of cals) {
        if (!enabledSet.has(cal.id)) continue
        try {
          const evs = await window.api.userGoogle.getCalendarEvents(userId, cal.id, startDate, endDate, cal.backgroundColor)
          for (const ev of evs) {
            // Skip timed meetings that already ended (all-day events always show).
            if (!ev.allDay && ev.end && new Date(ev.end).getTime() < now) continue
            out.push({
              id: 'gcal-' + ev.id,
              // Meetings have no local row to write to; raw_id carries the bare
              // Google event id purely for shape parity with the aggregate.
              raw_id: ev.id,
              source: 'kc-meeting',
              title: ev.summary,
              due_date: ev.start.slice(0, 10),
              due_time: ev.allDay ? null : ev.start.slice(11, 16),
              completed: false,
              completed_at: null,
              position: null,
              board_id: null,
              board_name: null,
              linked_task_id: null,
              column_id: null,
              area_of_analysis: null,
              has_steps: false,
              meta: {
                timeLabel: ev.allDay ? 'All day' : `${ev.start.slice(11, 16)} – ${ev.end.slice(11, 16)}`,
                calendarName: cal.summary,
                calendarColor: cal.backgroundColor,
                meetingLink: ev.meetingLink,
              },
            })
          }
        } catch { /* one calendar failing must not drop the others */ }
      }
      setMeetings(out)
    } catch { /* Google unreachable — meetings simply absent, per the offline contract */ }
  }, [userId])

  useEffect(() => { queueLoad() }, [queueLoad])
  useEffect(() => { loadMeetings() }, [loadMeetings])

  // ── REFRESH ON CHANGE ──────────────────────────────────────────────────────
  // ★ NO SECOND realtime SUBSCRIPTION HERE — deliberately.
  //
  // The preload teardown is ipcRenderer.removeAllListeners('workspace:remoteChange'),
  // which is CHANNEL-GLOBAL: a second window.api.workspace.onRemoteChange in this
  // component would be silently unsubscribed whenever WorkspaceContext's effect
  // re-ran its cleanup, and the tab would quietly stop updating with no error.
  //
  // Instead we consume `todoDataVersion` off WorkspaceContext, which bumps on every
  // realtime push from the app's single subscription. This is the same mechanism
  // TaskDetailPanel already uses via boardContentVersion.
  useEffect(() => {
    if (todoDataVersion === 0) return   // skip the initial value; mount already loaded
    queueLoad()
  }, [todoDataVersion, queueLoad])

  // Refetch when the window regains focus — covers changes made elsewhere while
  // the app was backgrounded, and anything realtime missed.
  useEffect(() => {
    const onFocus = () => queueLoad()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [queueLoad])

  useEffect(() => {
    try { localStorage.setItem(`todo-show-cal-${userId}`, showCalEvents ? 'true' : 'false') } catch { /* non-fatal */ }
  }, [showCalEvents, userId])

  // ── Identity helpers ───────────────────────────────────────────────────────
  // Personal ids are source-prefixed by the backend (`personal-<uuid>`); the raw
  // id is what the personalTodo:* handlers expect.
  const rawPersonalId = (id: string) => id.replace(/^personal-/, '')

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleComplete(item: DisplayItem) {
    if (!online) return   // board writes are cloud-authoritative — read-only offline
    const taskId = item.linked_task_id
    if (!taskId || completing.has(item.id)) return
    setCompleting(prev => new Set([...prev, item.id]))
    try {
      await window.api.todo.complete(taskId, userId, userName)
      setItems(prev => prev.map(i => i.id === item.id
        ? { ...i, completed: true, completed_at: new Date().toISOString() } : i))
      queueLoad()
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(item.id); return n })
    }
  }

  async function handleUncomplete(item: DisplayItem) {
    if (!online) return
    const taskId = item.linked_task_id
    if (!taskId) return
    await window.api.todo.uncomplete(taskId)
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, completed: false, completed_at: null } : i))
    queueLoad()
  }

  // ── Detail-panel field writes (A-2, over the A-1 setters) ──────────────────
  // OPTIMISTIC, then fire-and-reconcile — the same contract handleStepToggle
  // settled on in 3b. queueLoad() is deliberately NOT called on success: the patch
  // below already holds the right state, and a refetch mid-interaction re-settles
  // the list (a star jumping groups, a stripe repainting) for no gain. A genuinely
  // failed write is corrected by the next natural refetch — focus, realtime, tab
  // switch — and reverted immediately on an explicit refusal.
  //
  // NO `if (!online)` GUARD. These are personal writes: local-first, queued, and
  // the one thing that works offline.
  const patchItem = useCallback((id: string, patch: Partial<DisplayItem>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  async function handleSetColor(item: DisplayItem, key: string | null) {
    const before = item.color ?? null
    patchItem(item.id, { color: key })
    const res = await window.api.personalTodo.setColor(item.raw_id, key)
    if (!res?.ok) patchItem(item.id, { color: before })
  }

  async function handleSetStar(item: DisplayItem) {
    const next = !item.starred
    patchItem(item.id, { starred: next })
    const res = await window.api.personalTodo.setStar(item.raw_id, next)
    if (!res?.ok) patchItem(item.id, { starred: !next })
  }

  async function handleSetDue(item: DisplayItem, date: string | null, time: string | null) {
    const before = { due_date: item.due_date, due_time: item.due_time }
    // Mirror the handler's own rule locally (A-1: a null date drops the time), so
    // the panel never shows a time the backend has just discarded.
    const nextTime = date === null ? null : time
    patchItem(item.id, { due_date: date, due_time: nextTime })
    const res = await window.api.personalTodo.setDue(item.raw_id, date, nextTime)
    if (!res?.ok) patchItem(item.id, before)
  }

  async function handleSetNotes(item: DisplayItem, notes: string | null) {
    // Slice B. NotesEditor already gates on save-if-changed, so this only fires on a
    // real change. Optimistic patch keeps the list's own copy in step (nothing renders
    // notes on the card yet, but it keeps the source of truth honest for a refetch).
    const before = item.notes ?? null
    const value = notes && notes.length ? notes : null
    patchItem(item.id, { notes: value })
    const res = await window.api.personalTodo.setNotes(item.raw_id, value)
    if (!res?.ok) patchItem(item.id, { notes: before })
  }

  async function handleSetRecurrence(item: DisplayItem, freq: string | null) {
    // Slice C-recurring-2. Mirror handleSetColor: optimistic patch, revert on refusal.
    // No queueLoad on success (A-2 contract). Backend spawn logic is unchanged.
    if (!isRecurKey(freq)) return   // renderer-side validation, like isTodoColorKey
    const before = item.recurrence ?? null
    patchItem(item.id, { recurrence: freq })
    const res = await window.api.personalTodo.setRecurrence(item.raw_id, freq)
    if (!res?.ok) patchItem(item.id, { recurrence: before })
  }

  async function handleClearMissed(item: DisplayItem, date: string) {
    // Slice C-recurring-3. BOOKKEEPING ONLY — mirror handleSetColor: optimistic array
    // edit, revert on refusal. Never spawns, never touches due_date.
    const before = item.missed_dates ?? []
    const next = before.filter(d => d !== date)
    patchItem(item.id, { missed_dates: next })
    const res = await window.api.personalTodo.clearMissed(item.raw_id, date)
    if (!res?.ok) patchItem(item.id, { missed_dates: before })
  }

  async function handlePersonalToggle(item: DisplayItem) {
    const id = rawPersonalId(item.id)
    // Local-first (slice 1b): these run offline by design.
    if (item.completed) {
      await window.api.personalTodo.uncomplete(id)
      queueLoad()
      return
    }
    // Slice C-recurring-3 GATE: main refuses completion while misses are un-cleared.
    // The tick must NOT take — surface the block and open the panel so the user can
    // clear the "Missed repeats" section. No queueLoad (nothing changed server-side).
    const res = await window.api.personalTodo.complete(id)
    if (!res?.ok && res?.reason === 'missed') {
      setMissedBlockId(item.id)
      setSelectedId(item.id)   // open the panel → Missed repeats section
      return
    }
    queueLoad()
  }

  // ── Steps (3b) ─────────────────────────────────────────────────────────────
  // NO `if (!online)` GUARD ANYWHERE BELOW — deliberately. Personal is the
  // offline-capable source (local-first + sync queue, 1b), and the 1b lesson was
  // that a renderer-side online guard blocks the one write path that works
  // offline. Board actions elsewhere on this page ARE guarded; these must not be.

  async function handleStepToggle(item: DisplayItem, stepId: string) {
    // Optimistic: the rail's FLIP animation reads from the CURRENT render, so
    // waiting for the round-trip would make the dots jump instead of slide.
    setItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i,
      steps: (i.steps ?? []).map(s => s.id === stepId ? { ...s, checked: !s.checked } : s),
    }))
    // ★ NO queueLoad() HERE — deliberately. The refetch used to land mid-animation
    // and re-settle the rail, producing a visible second hitch. The optimistic
    // update above already holds the correct state, and the write is durable
    // regardless: the handler writes LOCAL first and hands the cloud op to the
    // sync queue, which replays it on reconnect. Refetching bought nothing but a
    // flicker. A genuinely failed toggle is corrected by the next natural
    // refetch (focus, realtime push, tab switch) rather than by fighting the
    // animation on every successful one.
    const res = await window.api.personalTodoStep.toggle(stepId)
    if (!res?.ok) {
      // Revert only on an explicit refusal (e.g. the row vanished). Silent
      // divergence between what the rail shows and what is stored is worse than
      // a visible snap-back.
      setItems(prev => prev.map(i => i.id !== item.id ? i : {
        ...i,
        steps: (i.steps ?? []).map(s => s.id === stepId ? { ...s, checked: !s.checked } : s),
      }))
    }
  }

  async function handleStepAdd(item: DisplayItem, text: string) {
    const body = text.trim()
    if (!body) return
    // raw_id, NOT item.id — the display id carries a `personal-` prefix and would
    // create a step attached to no to-do, with no FK to reject it.
    await window.api.personalTodoStep.create(item.raw_id, body)
    queueLoad()
  }

  async function handleStepDelete(stepId: string, item: DisplayItem) {
    setItems(prev => prev.map(i => i.id !== item.id ? i : {
      ...i, steps: (i.steps ?? []).filter(s => s.id !== stepId),
    }))
    try { await window.api.personalTodoStep.delete(stepId) }
    finally { queueLoad() }
  }

  async function handleStepReorder(item: DisplayItem, orderedStepIds: string[]) {
    // Optimistic: reorder the local steps array to the dropped order so the panel
    // list AND the card rail settle immediately. The backend dense-rewrites
    // position; the next refetch returns the same order, so nothing snaps.
    setItems(prev => prev.map(i => {
      if (i.id !== item.id) return i
      const byId = new Map((i.steps ?? []).map(s => [s.id, s]))
      const next = orderedStepIds.map(id => byId.get(id)).filter(Boolean) as TodoStep[]
      // Guard: if the id set drifted, keep the existing array rather than dropping steps.
      return next.length === (i.steps ?? []).length ? { ...i, steps: next } : i
    }))
    // raw_id, not item.id — the display id carries the `personal-` prefix (3b landmine).
    // No queueLoad() on the happy path (the 3b double-hitch lesson: a refetch
    // mid-interaction re-settles the list for no gain). A refused reorder is
    // corrected by the next natural refetch.
    await window.api.personalTodoStep.reorder(item.raw_id, orderedStepIds)
  }

  async function handlePersonalDelete(item: DisplayItem) {
    // Optimistic removal, then reconcile via refetch — a rejected delete puts the
    // item back rather than leaving the list lying.
    setItems(prev => prev.filter(i => i.id !== item.id))
    try { await window.api.personalTodo.delete(rawPersonalId(item.id)) }
    finally { queueLoad() }
  }

  async function handleAddPersonal() {
    if (!newPersonalTitle.trim()) return
    setAddingPersonal(true)
    try {
      await window.api.personalTodo.create({
        id: crypto.randomUUID(),
        user_id: userId,
        title: newPersonalTitle.trim(),
        due_date: newPersonalDate || undefined,
        due_time: newPersonalTime || undefined,
      })
      setNewPersonalTitle(''); setNewPersonalDate(''); setNewPersonalTime('')
      setShowAddPersonal(false)
      queueLoad()
    } finally {
      setAddingPersonal(false)
    }
  }

  async function handleClearCompleted() {
    const done = tabItems.filter(t => t.completed && t.linked_task_id)
    await Promise.all(done.map(t => window.api.todo.dismiss(userId, t.linked_task_id!)))
    setDismissed(prev => new Set([...prev, ...done.map(t => t.linked_task_id!)]))
  }

  function handleItemClick(item: DisplayItem) {
    // PERSONAL → the detail panel. Clicking the open item again closes it.
    // ⚠ Board cards keep their EXISTING behaviour untouched: they deep-link into
    // Workspace, they do not open this panel. The panel edits personal columns
    // (colour, star, personal steps) that board cards structurally do not have.
    if (item.source === 'personal') {
      setSelectedId(prev => (prev === item.id ? null : item.id))
      return
    }
    if (item.source === 'kc-deadline' && item.board_id && item.linked_task_id) {
      setActiveBoardId(item.board_id)
      openTask(item.linked_task_id)
      navigate('/workspace')
    }
  }

  // ── Derivation ─────────────────────────────────────────────────────────────
  // Personal to-dos render only for the logged-in user (never root viewing others).
  const showPersonal = !isRoot || localUser?.id === userId

  const all = useMemo<DisplayItem[]>(() => {
    const base = items.filter(i => {
      if (i.source === 'personal' && !showPersonal) return false
      // Dismissals are keyed on the raw task id.
      if (i.linked_task_id && dismissed.has(i.linked_task_id)) return false
      return true
    })
    return showCalEvents ? [...base, ...meetings] : base
  }, [items, meetings, dismissed, showCalEvents, showPersonal])

  const tabItems = useMemo(() => all.filter(t => inTab(t, tab)), [all, tab])
  const active   = useMemo(() => tabItems.filter(t => !t.completed), [tabItems])

  // kc-intel directives pin above everything (slice 5 — empty until then).
  const directives = useMemo(() => active.filter(t => t.source === 'kc-intel'), [active])

  /**
   * ★ STARRED = A PINNED GROUP, NOT A SORT KEY (A-2).
   *
   * Sorting starred-first inside the bands would scatter starred items across five
   * headings — the exact opposite of "move it to the top". So they lift OUT into
   * their own group, the same way `promoted` and `directives` do.
   *
   * PERSONAL ONLY, and structurally so: no other source has a `starred` column to
   * be true. The `source === 'personal'` test is therefore belt-and-braces over the
   * `starred` test, and it stays because it documents the intent — a future source
   * that grows a star must opt in here deliberately.
   *
   * ⚠ URGENCY BANDING DOES NOT APPLY to these. A starred past-due item appears ONCE,
   * here, not also in "Needs attention" — the exclusion below is what guarantees it.
   */
  const isPinnedStar = (t: DisplayItem): boolean => t.source === 'personal' && !!t.starred

  const starred = useMemo(() =>
    active.filter(isPinnedStar)
      .sort((a, b) => URGENCY_RANK[urgency(a.due_date).k] - URGENCY_RANK[urgency(b.due_date).k]),
    [active])

  // PROMOTION: pastdue + today lift OUT of the bands into a pinned strip. They are
  // not duplicated below — `body` excludes them.
  const promoted = useMemo(() =>
    active
      .filter(t => t.source !== 'kc-intel' && !isPinnedStar(t) && isPromoted(urgency(t.due_date).k))
      .sort((a, b) => URGENCY_RANK[urgency(a.due_date).k] - URGENCY_RANK[urgency(b.due_date).k]),
    [active])

  const bands = useMemo(() => {
    const body = active.filter(t => t.source !== 'kc-intel' && !isPinnedStar(t) && !isPromoted(urgency(t.due_date).k))
    const map = new Map<UrgencyKey, DisplayItem[]>()
    for (const t of body) {
      const k = urgency(t.due_date).k
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    // Bands are built by reducing over items PRESENT, so absent sources simply
    // produce no band — empty sources need no special-casing.
    return [...map.entries()]
      .sort((a, b) => URGENCY_RANK[a[0]] - URGENCY_RANK[b[0]])
      .map(([k, list]) => ({ k, label: BAND_LABELS[k], items: list }))
  }, [active])

  const doneItems = useMemo(() =>
    tabItems.filter(t => t.completed)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tabItems])

  const tabCounts = useMemo(() => {
    const out = {} as Record<TabId, number>
    for (const t of TABS) out[t.id] = all.filter(i => !i.completed && inTab(i, t.id)).length
    return out
  }, [all])

  /**
   * The panel's item, DERIVED from the live list rather than held in state.
   *
   * That is what makes an edit anywhere show up here with no fetch and no second
   * copy to drift. It also self-heals: if the item is deleted (or filtered away),
   * `find` returns undefined, the panel unmounts, and no stale row can linger.
   *
   * Derived from `all`, not `tabItems`, so switching tabs does not yank the panel
   * out from under an item you are still editing.
   */
  const selectedItem = useMemo(
    () => (selectedId ? all.find(i => i.id === selectedId) ?? null : null),
    [all, selectedId],
  )

  // ── PANEL SLIDE (A-2 polish) ───────────────────────────────────────────────
  // A conditional mount cannot animate OUT — React removes the node before any
  // transition can run. So the panel is kept mounted through its exit:
  //
  //   panelItem  WHAT it shows. Retained after selectedItem goes null, then
  //              cleared by onExited when the closing slide finishes.
  //   panelOpen  WHERE it sits. The class flip that drives translateX.
  //
  // The double rAF is load-bearing: the panel must be COMMITTED at
  // translate-x-full and PAINTED there before flipping to 0, or the browser has no
  // start value to interpolate from and it simply appears. One frame is not
  // reliably enough — React can batch the state update into the same paint.
  const reducedMotion = useReducedMotion()
  const [panelItem, setPanelItem] = useState<DisplayItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    if (!selectedItem) {
      setPanelOpen(false)
      // No transition ⇒ no transitionend ⇒ onExited would never fire and the panel
      // would stay mounted (invisible, off-screen) forever. Clear it here instead.
      if (reducedMotion) setPanelItem(null)
      return
    }
    setPanelItem(selectedItem)
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setPanelOpen(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [selectedItem, reducedMotion])

  // ── Item rendering ─────────────────────────────────────────────────────────
  /**
   * ★ THE DISPATCHER. Personal items go STRAIGHT to PersonalCard; everything else
   * goes through Row.
   *
   * This is a FACTORY, not a component — it is never used as a JSX type, so its
   * unstable identity is harmless. React reconciles on the element type it RETURNS
   * (`PersonalCard`, module-level and stable), which is the whole point:
   *
   *   Todo re-render → Row gets a new identity → React unmounts the Row fiber and
   *   EVERYTHING under it. Nothing below that boundary can be saved — not by
   *   React.memo, not by a stable child type, not by useCallback'd props. Two
   *   earlier attempts failed on exactly that.
   *
   * Routing personal cards ABOVE the boundary is what makes their DOM persist, so
   * StepRail keeps its nodes and FLIP has a "before" to measure. Board and meeting
   * cards still remount every render — harmless, they hold no focus or animation
   * state. ⚠ Do NOT reintroduce a component defined inside Todo for personal cards.
   */
  function renderItem(item: DisplayItem, extraClass = ''): JSX.Element {
    if (item.source === 'personal') {
      return (
        <PersonalCard
          key={item.id}
          item={item}
          isSelected={selectedId === item.id}
          duePill={duePillFor(item)}
          extraClass={extraClass}
          showMissedBlock={missedBlockId === item.id}
          onComplete={() => handlePersonalToggle(item)}
          onDelete={() => handlePersonalDelete(item)}
          onSelect={() => handleItemClick(item)}
          onStar={() => handleSetStar(item)}
          onStepToggle={sid => handleStepToggle(item, sid)}
        />
      )
    }
    return <Row key={item.id} item={item} extraClass={extraClass} />
  }

  function Row({ item, extraClass = '' }: { item: DisplayItem; extraClass?: string }) {
    const area = areas.find(a => a.id === item.area_of_analysis)
    const isMeeting  = item.source === 'kc-meeting'
    const isBusy     = completing.has(item.id)
    const dueColor   = dueColorFor(item)

    if (isMeeting) {
      return (
        <div className="flex items-center gap-3 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/15 rounded-xl mx-3 my-1 px-3 py-2.5">
          <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="11" rx="2" stroke="#6366f1" strokeWidth="1.2"/>
              <path d="M1 5h12" stroke="#6366f1" strokeWidth="1.2"/>
              <path d="M4 1v2M10 1v2" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-white truncate">{item.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] text-gray-500 dark:text-white/50">{item.meta?.timeLabel}</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.meta?.calendarColor }} />
                <span className="text-[10px] text-gray-400 dark:text-white/40 truncate">{item.meta?.calendarName}</span>
              </div>
            </div>
          </div>
          {item.meta?.meetingLink && (
            <button
              onClick={() => window.open(item.meta!.meetingLink, '_blank')}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition"
            >
              Join
            </button>
          )}
        </div>
      )
    }

    // ⚠ NO PERSONAL BRANCH HERE — deliberately removed. Personal items are routed
    // to PersonalCard by renderItem, ABOVE this component, because anything Row
    // renders is destroyed whenever Row's identity changes. Re-adding a personal
    // branch here would silently reinstate the animation bug.

    // Board card (kc-deadline) — and, later, off-card 'assigned'.
    return (
      <div
        className={`group flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition cursor-pointer ${item.completed ? 'opacity-60' : ''} ${extraClass}`}
        onClick={() => handleItemClick(item)}
      >
        <button
          onClick={e => { e.stopPropagation(); if (!item.completed) handleComplete(item); else handleUncomplete(item) }}
          className={`shrink-0 rounded border transition flex items-center justify-center ${
            item.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-white/30 hover:border-indigo-400'
          } ${!online ? 'opacity-40 cursor-not-allowed' : ''}`}
          style={{ width: 18, height: 18 }}
          disabled={isBusy || !online}
          title={!online ? 'Board tasks are read-only offline' : undefined}
        >
          {(item.completed || isBusy) && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
        {area && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: area.color }} />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${item.completed ? 'line-through text-gray-400 dark:text-white/40' : 'text-gray-900 dark:text-white'}`}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.board_name && <span className="text-[10px] text-gray-400 dark:text-white/40">{item.board_name}</span>}
            {item.completed && item.completed_at && (
              <span className="text-[10px] text-gray-400 dark:text-white/35">
                Completed {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        {item.due_date && !item.completed && (
          <span className={`text-[11px] font-medium shrink-0 ${dueColor}`}>{dueLabel(item.due_date)}</span>
        )}
      </div>
    )
  }

  const totalPending = tabCounts.all

  // NO page background on the root below — TRANSPARENT, exactly like Dashboard's
  // root (`p-6 h-full overflow-y-auto`, no bg). The app paints its gradient on
  // `body` (styles/index.css:44 — linear-gradient(135deg, --g-from, --g-via, --g-to),
  // the theme-selectable navy→indigo→blue). A page shows it by NOT painting over it.
  // A-2's `dark:bg-hub-navy` here was an opaque flat navy that hid the gradient and
  // read as flat black. The header/tabs/list below are translucent
  // (`dark:bg-black/10..20`), so the gradient reads through them as faint chrome
  // darkening rather than a solid fill.
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-black/20 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">To-Do</h1>
          {totalPending > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[11px] font-bold min-w-[22px] text-center">
              {totalPending}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCalEvents(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              showCalEvents
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                : 'border-gray-200 dark:border-white/[0.1] text-gray-400 dark:text-white/40'
            }`}
            title="Toggle calendar events"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="0.5" y="1.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M0.5 4.5h11" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3.5 0v2M8.5 0v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Calendar
          </button>
          <button
            onClick={() => setShowAddPersonal(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-700 dark:text-white/75 transition border border-gray-200 dark:border-white/[0.1]"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Add personal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 bg-white dark:bg-black/20 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition ${
              tab === t.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70'
            }`}
          >
            {t.name}
            {tabCounts[t.id] > 0 && (
              <span className="ml-1.5 text-[10px] text-gray-400 dark:text-white/35">{tabCounts[t.id]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Inline add personal form */}
      {showAddPersonal && (
        <div className="bg-white dark:bg-black/20 border-b border-black/[0.06] dark:border-white/[0.06] px-6 py-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={newPersonalTitle}
              onChange={e => setNewPersonalTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPersonal() }}
              placeholder="What do you need to do?"
              autoFocus
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/35 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
            <input type="date" value={newPersonalDate} onChange={e => setNewPersonalDate(e.target.value)}
              onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 [color-scheme:dark]" />
            <input type="time" value={newPersonalTime} onChange={e => setNewPersonalTime(e.target.value)}
              onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 [color-scheme:dark]" />
            <button onClick={handleAddPersonal} disabled={!newPersonalTitle.trim() || addingPersonal}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition">
              {addingPersonal ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setShowAddPersonal(false); setNewPersonalTitle(''); setNewPersonalDate(''); setNewPersonalTime('') }}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/65 text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── CONTENT ROW: list + detail panel ──────────────────────────────────
          The header, tabs and add-form above stay FULL WIDTH; only this region
          splits, per the mockup. `min-w-0` on the list is required — without it a
          flex child refuses to shrink below its content width and long titles would
          push the panel off-screen instead of wrapping. */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 dark:text-white/50 text-sm">Loading…</div>
        ) : (
          <div className="bg-white dark:bg-black/10">
            {/* PINNED: intel directives (slice 5 — none exist yet) */}
            {directives.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Directives
                </div>
                {directives.map(t => renderItem(t, 'bg-violet-50/40 dark:bg-violet-500/5'))}
              </div>
            )}

            {/* PINNED: starred personal items — above the promotion strip. They are
                NOT duplicated below: promoted and bands both exclude them. */}
            {starred.length > 0 && (
              <div>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                    Starred
                  </span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({starred.length})</span>
                </div>
                {starred.map(t => renderItem(t, 'bg-amber-50/40 dark:bg-amber-500/5'))}
              </div>
            )}

            {/* PINNED: promotion strip — past due + due today, all sources */}
            {promoted.length > 0 && (
              <div>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">
                    Needs attention
                  </span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({promoted.length})</span>
                </div>
                {promoted.map(t => renderItem(t, urgency(t.due_date).k === 'pastdue'
                  ? 'bg-red-50/40 dark:bg-red-500/5'
                  : 'bg-amber-50/40 dark:bg-amber-500/5'))}
              </div>
            )}

            {/* BANDS */}
            {bands.map(b => (
              <div key={b.k}>
                <div className="px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">{b.label}</span>
                  <span className="text-xs text-gray-300 dark:text-white/25">({b.items.length})</span>
                </div>
                {b.items.map(t => renderItem(t))}
              </div>
            ))}

            {/* COMPLETED — collapsed by default */}
            {doneItems.length > 0 && (
              <div>
                <button
                  onClick={() => setDoneExpanded(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${doneExpanded ? 'rotate-90' : ''}`}>
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Completed</span>
                  <span className="text-xs text-gray-400 dark:text-white/35">({doneItems.length})</span>
                </button>
                {doneExpanded && (
                  <>
                    {doneItems.map(t => renderItem(t))}
                    <div className="px-4 py-3">
                      <button onClick={handleClearCompleted}
                        className="text-xs text-gray-400 dark:text-white/40 hover:text-red-400 dark:hover:text-red-400 transition">
                        Clear completed
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* EMPTY STATES — per tab, so the not-yet-built sources read as
                intentional rather than broken. */}
            {directives.length === 0 && starred.length === 0 && promoted.length === 0 && bands.length === 0 && doneItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
                {tab === 'assigned' ? (
                  <>
                    <div className="text-3xl">📋</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing assigned to you yet</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">
                      Off-card assignments from a board or info-page head will appear here.
                    </p>
                  </>
                ) : tab === 'assigned-by-me' ? (
                  <>
                    <div className="text-3xl">📤</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">
                      You haven’t assigned anything off-card yet
                    </p>
                    <p className="text-xs text-gray-400 dark:text-white/50">
                      Tasks you delegate will appear here so you can track them.
                    </p>
                  </>
                ) : tab === 'personal' ? (
                  <>
                    <div className="text-3xl">✓</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">No personal to-dos</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">Use “Add personal” to jot something down.</p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl">✓</div>
                    <p className="text-sm font-medium text-gray-500 dark:text-white/65">Nothing to do!</p>
                    <p className="text-xs text-gray-400 dark:text-white/50">Tasks assigned to you will appear here.</p>
                  </>
                )}
                {(tab === 'kc' || tab === 'all') && (!googleConnected || googleNeedsReauth) && (
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 cursor-pointer hover:underline" onClick={() => navigate('/settings')}>
                    {googleNeedsReauth ? 'Re-connect Google in Settings to sync calendar events' : 'Connect Google in Settings to see calendar events'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ★ THE PANEL — a SIBLING of the list, rendered directly from Todo's JSX.
          This placement is the whole fix: `Row` is still defined inside Todo, so
          anything rendered from within it is unmounted on every render. Mounting the
          panel here puts it ABOVE that boundary, so its date/time/add-step inputs
          keep their DOM nodes and their focus. Do NOT move this inside renderItem,
          PersonalCard or Row. */}
      {/* THE SPACER — what actually makes room for the panel. Because the panel is
          absolutely positioned, the list would otherwise sit underneath it. This
          empty flex child widens in step with the slide, so the list is pushed
          smoothly rather than snapping to its new width the moment the panel
          mounts. Same duration and easing as the transform, so they move together. */}
      <div
        aria-hidden
        className={`shrink-0 ${reducedMotion ? '' : 'transition-[width] duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)]'}`}
        style={{ width: panelOpen && panelItem ? 378 : 0 }}
      />

      {/* ★ THE PANEL — still a SIBLING of the list, rendered directly from Todo's
          JSX. Absolute positioning changes where it PAINTS, not where it sits in
          the tree: it remains above the `Row` unmount boundary, so its inputs keep
          their DOM nodes and their focus. Do NOT move this inside renderItem,
          PersonalCard or Row. */}
      {panelItem && panelItem.source === 'personal' && (
        <TodoDetailPanel
          // Keyed on the item so switching selection gives the panel a FRESH
          // subtree — otherwise an <input> would carry the previous item's
          // uncommitted keystrokes across the swap.
          key={panelItem.id}
          item={panelItem}
          open={panelOpen}
          reducedMotion={reducedMotion}
          onExited={() => setPanelItem(null)}
          onClose={() => setSelectedId(null)}
          onComplete={() => handlePersonalToggle(panelItem)}
          onStar={() => handleSetStar(panelItem)}
          onColor={key => handleSetColor(panelItem, key)}
          onDue={(d, t) => handleSetDue(panelItem, d, t)}
          onRecurrence={freq => handleSetRecurrence(panelItem, freq)}
          onNotes={notes => handleSetNotes(panelItem, notes)}
          onClearMissed={date => handleClearMissed(panelItem, date)}
          onStepToggle={sid => handleStepToggle(panelItem, sid)}
          onStepAdd={text => handleStepAdd(panelItem, text)}
          onStepDelete={sid => handleStepDelete(sid, panelItem)}
          onStepReorder={ids => handleStepReorder(panelItem, ids)}
        />
      )}
      </div>
    </div>
  )
}
