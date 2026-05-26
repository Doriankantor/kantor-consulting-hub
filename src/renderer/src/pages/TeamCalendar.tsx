import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

type CalView = 'month' | 'week' | 'agenda'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const COLORS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Amber',  value: '#f59e0b' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Purple', value: '#a855f7' },
]

function pad(n: number): string { return n.toString().padStart(2, '0') }
function toDateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function toDateTimeStr(d: Date): string { return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

interface EventModalProps {
  event: Partial<CalendarEvent> | null
  defaultDate?: string
  onSave: (data: Record<string, unknown>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
  teamMembers: LocalTeamMember[]
  isAdmin: boolean
}

function EventModal({ event, defaultDate, onSave, onDelete, onClose, teamMembers }: EventModalProps) {
  const isNew = !event?.id
  const now = new Date()
  const defaultStart = defaultDate ? `${defaultDate}T09:00` : toDateTimeStr(now)
  const defaultEnd   = defaultDate ? `${defaultDate}T10:00` : toDateTimeStr(new Date(now.getTime() + 3600000))

  const [title,       setTitle]       = useState(event?.title ?? '')
  const [allDay,      setAllDay]      = useState(!!(event?.all_day))
  const [startDate,   setStartDate]   = useState(event?.start_date?.slice(0, 16) ?? defaultStart)
  const [endDate,     setEndDate]     = useState(event?.end_date?.slice(0, 16) ?? defaultEnd)
  const [description, setDescription] = useState(event?.description ?? '')
  const [location,    setLocation]    = useState(event?.location ?? '')
  const [color,       setColor]       = useState(event?.color ?? '#6366f1')
  const [visibility,  setVisibility]  = useState(event?.visibility ?? 'team')
  const [attendees,   setAttendees]   = useState<string[]>(() => {
    if (!event?.attendees_json) return []
    try { return (JSON.parse(event.attendees_json) as {id:string}[]).map(a => a.id) } catch { return [] }
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const attendeeObjs = teamMembers
        .filter(m => attendees.includes(m.id))
        .map(m => ({ id: m.id, name: m.full_name ?? m.email, email: m.email }))
      await onSave({
        title: title.trim(),
        all_day: allDay ? 1 : 0,
        start_date: allDay ? startDate.slice(0,10) : startDate,
        end_date:   allDay ? endDate.slice(0,10)   : endDate,
        description: description || null,
        location:    location || null,
        color,
        visibility,
        attendees: attendeeObjs,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/[0.12] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/[0.08]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{isNew ? 'New Event' : 'Edit Event'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/75 transition">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Title */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          {/* All day toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAllDay(v => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative ${allDay ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-white/[0.12]'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allDay ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-gray-600 dark:text-white/70">All day</span>
          </label>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-white/50 mb-1">Start</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startDate.slice(0,10) : startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-white/50 mb-1">End</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? endDate.slice(0,10) : endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          {/* Location */}
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          {/* Color */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 mb-2">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-white/50 scale-110' : ''}`}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          {/* Attendees */}
          {teamMembers.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-white/50 mb-2">Attendees</label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {teamMembers.map(m => (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attendees.includes(m.id)}
                      onChange={e => {
                        if (e.target.checked) setAttendees(prev => [...prev, m.id])
                        else setAttendees(prev => prev.filter(id => id !== m.id))
                      }}
                      className="rounded border-gray-300 dark:border-white/20 text-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-white/75">{m.full_name ?? m.email}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Visibility */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 mb-2">Visibility</label>
            <div className="flex gap-2">
              {(['team','personal'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                    visibility === v
                      ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                      : 'border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/20'
                  }`}
                >
                  {v === 'team' ? 'Team' : 'Personal'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-white/[0.08]">
          <div>
            {!isNew && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">Delete this event?</span>
                  <button onClick={onDelete} className="text-xs text-red-500 font-semibold hover:underline">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:underline">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-400 hover:text-red-500 transition">Delete event</button>
              )
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Month View ─────────────────────────────────────────────────────────────

function MonthView({
  year, month, events,
  onDayClick, onEventClick,
}: {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick: (dateStr: string) => void
  onEventClick: (e: CalendarEvent) => void
}) {
  const today = toDateStr(new Date())
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to full rows
  while (cells.length % 7 !== 0) cells.push(null)

  function eventsForDay(day: number): CalendarEvent[] {
    const ds = `${year}-${pad(month+1)}-${pad(day)}`
    return events.filter(e => e.start_date.slice(0,10) <= ds && e.end_date.slice(0,10) >= ds)
  }

  return (
    <div className="flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-white/[0.06]">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400 dark:text-white/40">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(80px, 1fr))` }}>
        {cells.map((day, idx) => {
          const ds = day ? `${year}-${pad(month+1)}-${pad(day)}` : null
          const isToday = ds === today
          const dayEvents = day ? eventsForDay(day) : []
          return (
            <div
              key={idx}
              onClick={() => ds && onDayClick(ds)}
              className={`border-b border-r border-gray-100 dark:border-white/[0.06] p-1 min-h-[80px] cursor-pointer transition-colors ${
                day ? 'hover:bg-gray-50 dark:hover:bg-white/[0.03]' : 'bg-gray-50/50 dark:bg-white/[0.01] cursor-default'
              }`}
            >
              {day && (
                <>
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                    isToday
                      ? 'bg-indigo-500 text-white'
                      : 'text-gray-700 dark:text-white/75'
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0,3).map(ev => (
                      <div
                        key={ev.id}
                        onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                        style={{ backgroundColor: ev.color + '33', borderLeft: `2px solid ${ev.color}` }}
                        className="px-1.5 py-0.5 rounded text-[10px] truncate text-gray-800 dark:text-white/90 cursor-pointer hover:opacity-80 transition"
                        title={ev.title}
                      >
                        {ev.all_day ? '' : `${ev.start_date.slice(11,16)} `}{ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-gray-400 dark:text-white/40 pl-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ──────────────────────────────────────────────────────────────

function WeekView({
  weekStart, events,
  onSlotClick, onEventClick,
}: {
  weekStart: Date
  events: CalendarEvent[]
  onSlotClick: (dateStr: string) => void
  onEventClick: (e: CalendarEvent) => void
}) {
  const hours = Array.from({ length: 13 }, (_, i) => i + 8) // 8am–8pm
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const today = toDateStr(new Date())

  function eventsForDay(d: Date): CalendarEvent[] {
    const ds = toDateStr(d)
    return events.filter(e => e.start_date.slice(0,10) <= ds && e.end_date.slice(0,10) >= ds)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        {/* Header */}
        <div className="border-b border-r border-gray-100 dark:border-white/[0.06]" />
        {days.map((d, i) => {
          const isToday = toDateStr(d) === today
          return (
            <div key={i} className="py-2 text-center border-b border-r border-gray-100 dark:border-white/[0.06]">
              <div className="text-xs text-gray-400 dark:text-white/40">{DAY_NAMES[d.getDay()]}</div>
              <div className={`text-sm font-semibold mt-0.5 ${isToday ? 'text-indigo-500' : 'text-gray-700 dark:text-white/75'}`}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
        {/* Hour rows */}
        {hours.map(h => (
          <>
            <div key={`h${h}`} className="border-b border-r border-gray-100 dark:border-white/[0.06] pr-2 pt-1 text-right text-[10px] text-gray-400 dark:text-white/30 h-12">
              {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
            </div>
            {days.map((d, i) => {
              const ds = toDateStr(d)
              const slotEvents = eventsForDay(d).filter(e => {
                if (e.all_day) return h === 8
                const startH = parseInt(e.start_date.slice(11,13))
                return startH === h
              })
              return (
                <div
                  key={`${h}-${i}`}
                  onClick={() => onSlotClick(ds)}
                  className="border-b border-r border-gray-100 dark:border-white/[0.06] h-12 p-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition relative"
                >
                  {slotEvents.map(ev => (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                      style={{ backgroundColor: ev.color + '33', borderLeft: `2px solid ${ev.color}` }}
                      className="px-1 py-0.5 rounded text-[10px] truncate text-gray-800 dark:text-white/90 cursor-pointer hover:opacity-80"
                    >
                      {ev.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

// ── Agenda View ────────────────────────────────────────────────────────────

function AgendaView({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void }) {
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const grouped: Record<string, CalendarEvent[]> = {}
  for (const ev of sorted) {
    const ds = ev.start_date.slice(0, 10)
    if (!grouped[ds]) grouped[ds] = []
    grouped[ds].push(ev)
  }
  const dates = Object.keys(grouped).sort()

  if (dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-400 dark:text-white/40 font-medium">No upcoming events</p>
        <p className="text-gray-300 dark:text-white/25 text-sm mt-1">Click "New Event" to add one</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 overflow-y-auto flex-1">
      {dates.map(ds => (
        <div key={ds}>
          <div className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">
            {new Date(ds + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="space-y-2">
            {grouped[ds].map(ev => (
              <div
                key={ev.id}
                onClick={() => onEventClick(ev)}
                style={{ borderLeft: `3px solid ${ev.color}` }}
                className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-xl p-3 cursor-pointer hover:shadow-sm transition pl-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm text-gray-900 dark:text-white">{ev.title}</div>
                    {ev.description && <div className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{ev.description}</div>}
                    {ev.location && (
                      <div className="text-xs text-gray-400 dark:text-white/35 mt-0.5 flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1a3 3 0 0 1 3 3c0 2-3 5-3 5S2 6 2 4a3 3 0 0 1 3-3z" stroke="currentColor" strokeWidth="1.2"/></svg>
                        {ev.location}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-white/35 whitespace-nowrap">
                    {ev.all_day ? 'All day' : `${ev.start_date.slice(11,16)} – ${ev.end_date.slice(11,16)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TeamCalendar() {
  const { localUser } = useAuth()
  const [view,         setView]         = useState<CalView>('month')
  const [currentDate,  setCurrentDate]  = useState(new Date())
  const [events,       setEvents]       = useState<CalendarEvent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [teamMembers,  setTeamMembers]  = useState<LocalTeamMember[]>([])
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent> | null>(null)
  const [defaultDate,  setDefaultDate]  = useState<string | undefined>()

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Compute range for fetching
  const rangeStart = view === 'month'
    ? `${year}-${pad(month+1)}-01`
    : toDateStr(getWeekStart(currentDate))
  const rangeEnd = view === 'month'
    ? `${year}-${pad(month+1)}-${new Date(year, month+1, 0).getDate()}`
    : toDateStr(new Date(getWeekStart(currentDate).getTime() + 6 * 86400000))

  function getWeekStart(d: Date): Date {
    const day = d.getDay()
    const result = new Date(d)
    result.setDate(d.getDate() - day)
    return result
  }

  const loadEvents = useCallback(async () => {
    try {
      // For agenda, fetch next 90 days
      const start = view === 'agenda' ? toDateStr(new Date()) : rangeStart
      const end   = view === 'agenda' ? toDateStr(new Date(Date.now() + 90 * 86400000)) : rangeEnd
      const data = await window.api.calendar.list(start, end)
      setEvents(data)
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, year, month, currentDate])

  useEffect(() => { loadEvents() }, [loadEvents])

  useEffect(() => {
    window.api.team.list().then(setTeamMembers).catch(() => {})
  }, [])

  function prev() {
    setCurrentDate(prev => {
      const d = new Date(prev)
      if (view === 'month') d.setMonth(d.getMonth() - 1)
      else d.setDate(d.getDate() - 7)
      return d
    })
  }
  function next() {
    setCurrentDate(prev => {
      const d = new Date(prev)
      if (view === 'month') d.setMonth(d.getMonth() + 1)
      else d.setDate(d.getDate() + 7)
      return d
    })
  }
  function goToday() { setCurrentDate(new Date()) }

  function openNewEvent(dateStr?: string) {
    setEditingEvent(null)
    setDefaultDate(dateStr)
    setModalOpen(true)
  }

  function openEditEvent(ev: CalendarEvent) {
    setEditingEvent(ev)
    setDefaultDate(undefined)
    setModalOpen(true)
  }

  async function handleSave(data: Record<string, unknown>) {
    if (editingEvent?.id) {
      await window.api.calendar.update(editingEvent.id, {
        ...data,
        updated_at: new Date().toISOString(),
      })
    } else {
      await window.api.calendar.create({
        ...data,
        created_by_id:   localUser?.id ?? null,
        created_by_name: localUser?.name ?? null,
      })
    }
    await loadEvents()
  }

  async function handleDelete() {
    if (!editingEvent?.id) return
    await window.api.calendar.delete(editingEvent.id)
    setModalOpen(false)
    await loadEvents()
  }

  const headerLabel = view === 'month'
    ? `${MONTH_NAMES[month]} ${year}`
    : view === 'week'
    ? (() => {
        const ws = getWeekStart(currentDate)
        const we = new Date(ws.getTime() + 6 * 86400000)
        return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() !== we.getMonth() ? MONTH_NAMES[we.getMonth()] + ' ' : ''}${we.getDate()}, ${we.getFullYear()}`
      })()
    : 'Upcoming Events'

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          {view !== 'agenda' && (
            <>
              <button onClick={prev} className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-gray-500 dark:text-white/60 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={next} className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-gray-500 dark:text-white/60 transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={goToday} className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/65 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">
                Today
              </button>
            </>
          )}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{headerLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* View tabs */}
          <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl p-1">
            {(['month','week','agenda'] as CalView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition capitalize ${
                  view === v
                    ? 'bg-white dark:bg-white/[0.15] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/75'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNewEvent()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            New Event
          </button>
        </div>
      </div>

      {/* Calendar area */}
      <div className="flex-1 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : view === 'month' ? (
          <MonthView
            year={year} month={month} events={events}
            onDayClick={openNewEvent} onEventClick={openEditEvent}
          />
        ) : view === 'week' ? (
          <WeekView
            weekStart={getWeekStart(currentDate)} events={events}
            onSlotClick={openNewEvent} onEventClick={openEditEvent}
          />
        ) : (
          <div className="p-4 flex-1 overflow-y-auto">
            <AgendaView events={events} onEventClick={openEditEvent} />
          </div>
        )}
      </div>

      {/* Event modal */}
      {modalOpen && (
        <EventModal
          event={editingEvent}
          defaultDate={defaultDate}
          onSave={handleSave}
          onDelete={editingEvent?.id ? handleDelete : undefined}
          onClose={() => setModalOpen(false)}
          teamMembers={teamMembers}
          isAdmin={true}
        />
      )}
    </div>
  )
}
