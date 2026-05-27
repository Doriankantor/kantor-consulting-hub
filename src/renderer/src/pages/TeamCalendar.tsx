import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useNavigate } from 'react-router-dom'

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

  // Recurrence
  const [recurrence, setRecurrence] = useState<{
    freq: 'none'|'daily'|'weekly'|'biweekly'|'monthly'|'annually'
    endType: 'never'|'count'|'date'
    endCount: number
    endDate: string
  }>(() => {
    if (!event?.recurrence_json) return { freq: 'none', endType: 'never', endCount: 10, endDate: '' }
    try { return JSON.parse(event.recurrence_json) } catch { return { freq: 'none', endType: 'never', endCount: 10, endDate: '' } }
  })

  // Meeting link
  const [meetingLink, setMeetingLink] = useState(event?.meeting_link ?? '')
  const [meetingType, setMeetingType] = useState(event?.meeting_type ?? 'zoom')

  // External attendees
  const [externalAttendees, setExternalAttendees] = useState<{email: string; name: string}[]>(() => {
    if (!event?.external_attendees_json) return []
    try { return JSON.parse(event.external_attendees_json) } catch { return [] }
  })
  const [extEmail, setExtEmail] = useState('')
  const [extName,  setExtName]  = useState('')
  const [contacts, setContacts] = useState<{id:string; full_name:string; email_primary:string}[]>([])
  const [contactSearch, setContactSearch] = useState('')

  useEffect(() => {
    window.api.contacts.list().then((list: any[]) => setContacts(list)).catch(() => {})
  }, [])

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
        recurrence_json: recurrence.freq === 'none' ? null : recurrence,
        meeting_link: meetingLink.trim() || null,
        meeting_type: meetingLink.trim() ? meetingType : null,
        external_attendees: externalAttendees,
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
          {/* Meeting link */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 mb-1.5">Meeting link (optional)</label>
            <div className="flex gap-2">
              <select
                value={meetingType}
                onChange={e => setMeetingType(e.target.value)}
                className="px-2 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs focus:outline-none"
              >
                <option value="zoom">Zoom</option>
                <option value="teams">Teams</option>
                <option value="meet">Meet</option>
                <option value="other">Other</option>
              </select>
              <input
                type="url"
                value={meetingLink}
                onChange={e => setMeetingLink(e.target.value)}
                placeholder="https://…"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

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
          {/* Recurrence */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 mb-2">Repeat</label>
            <select
              value={recurrence.freq}
              onChange={e => setRecurrence(r => ({ ...r, freq: e.target.value as any }))}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="annually">Annually</option>
            </select>
            {recurrence.freq !== 'none' && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  {(['never','count','date'] as const).map(et => (
                    <button
                      key={et}
                      onClick={() => setRecurrence(r => ({ ...r, endType: et }))}
                      className={`px-3 py-1 rounded-lg text-xs border transition ${
                        recurrence.endType === et
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                          : 'border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/60'
                      }`}
                    >
                      {et === 'never' ? 'Never' : et === 'count' ? 'After N times' : 'End date'}
                    </button>
                  ))}
                </div>
                {recurrence.endType === 'count' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-white/50">Occurrences:</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={recurrence.endCount}
                      onChange={e => setRecurrence(r => ({ ...r, endCount: parseInt(e.target.value) || 1 }))}
                      className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none"
                    />
                  </div>
                )}
                {recurrence.endType === 'date' && (
                  <input
                    type="date"
                    value={recurrence.endDate}
                    onChange={e => setRecurrence(r => ({ ...r, endDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                )}
              </div>
            )}
          </div>

          {/* External Attendees */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-white/50 mb-2">External Attendees</label>
            {externalAttendees.length > 0 && (
              <div className="space-y-1 mb-2">
                {externalAttendees.map((ea, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]">
                    <span className="flex-1 text-xs text-gray-700 dark:text-white/75 truncate">{ea.name || ea.email}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">External</span>
                    <button
                      onClick={() => setExternalAttendees(prev => prev.filter((_, j) => j !== i))}
                      className="text-gray-300 dark:text-white/25 hover:text-red-400 transition"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Search contacts */}
            <div className="space-y-2">
              <input
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                placeholder="Search contacts…"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              {contactSearch && (
                <div className="max-h-24 overflow-y-auto border border-gray-100 dark:border-white/[0.08] rounded-xl">
                  {contacts
                    .filter(c => c.email_primary && (
                      c.full_name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                      c.email_primary.toLowerCase().includes(contactSearch.toLowerCase())
                    ))
                    .slice(0, 5)
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          if (!externalAttendees.some(ea => ea.email === c.email_primary)) {
                            setExternalAttendees(prev => [...prev, { email: c.email_primary, name: c.full_name }])
                          }
                          setContactSearch('')
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-white/75 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition text-left"
                      >
                        <span>{c.full_name}</span>
                        <span className="text-gray-400 dark:text-white/35">{c.email_primary}</span>
                      </button>
                    ))
                  }
                  {contactSearch && !contacts.some(c => c.email_primary?.toLowerCase().includes(contactSearch.toLowerCase())) && (
                    <button
                      onClick={() => {
                        const email = contactSearch.trim()
                        if (email.includes('@') && !externalAttendees.some(ea => ea.email === email)) {
                          setExternalAttendees(prev => [...prev, { email, name: email }])
                        }
                        setContactSearch('')
                      }}
                      className="w-full px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition text-left"
                    >
                      + Add "{contactSearch}" as external
                    </button>
                  )}
                </div>
              )}
              {/* Manual email entry */}
              <div className="flex gap-2">
                <input
                  value={extEmail}
                  onChange={e => setExtEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                />
                <button
                  onClick={() => {
                    if (!extEmail.trim().includes('@')) return
                    if (!externalAttendees.some(ea => ea.email === extEmail.trim())) {
                      setExternalAttendees(prev => [...prev, { email: extEmail.trim(), name: extName.trim() || extEmail.trim() }])
                    }
                    setExtEmail(''); setExtName('')
                  }}
                  disabled={!extEmail.includes('@')}
                  className="px-2 py-1.5 rounded-xl border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-white/60 text-xs hover:bg-gray-50 dark:hover:bg-white/[0.06] transition disabled:opacity-40"
                >
                  Add
                </button>
              </div>
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

  function allDayEventsForDay(d: Date): CalendarEvent[] {
    return eventsForDay(d).filter(e => e.all_day)
  }

  function hourlyEventsForDayHour(d: Date, h: number): CalendarEvent[] {
    return eventsForDay(d).filter(e => {
      if (e.all_day) return false
      const startH = parseInt(e.start_date.slice(11,13))
      return startH === h
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        {/* Header row: day names */}
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
        {/* All-day row */}
        <div className="border-b border-r border-gray-100 dark:border-white/[0.06] pr-2 pt-1 text-right text-[10px] text-gray-400 dark:text-white/30 min-h-[28px]">
          all-day
        </div>
        {days.map((d, i) => {
          const allDayEvs = allDayEventsForDay(d)
          return (
            <div
              key={`allday-${i}`}
              onClick={() => onSlotClick(toDateStr(d))}
              className="border-b border-r border-gray-100 dark:border-white/[0.06] min-h-[28px] p-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition"
            >
              {allDayEvs.map(ev => (
                <div
                  key={ev.id}
                  onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                  style={{ backgroundColor: ev.color + '33', borderLeft: `2px solid ${ev.color}` }}
                  className="px-1 py-0.5 rounded text-[10px] truncate text-gray-800 dark:text-white/90 cursor-pointer hover:opacity-80 mb-0.5"
                >
                  {ev.title}
                </div>
              ))}
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
              const slotEvents = hourlyEventsForDayHour(d, h)
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
                {ev.meeting_link && (
                  <a
                    href={ev.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5h3M5 3.5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    Join {ev.meeting_type ?? 'Meeting'}
                  </a>
                )}
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
  const { openTask, setActiveBoardId } = useWorkspace()
  const navigate = useNavigate()
  const [view,         setView]         = useState<CalView>('month')
  const [currentDate,  setCurrentDate]  = useState(new Date())
  const [events,       setEvents]       = useState<CalendarEvent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [teamMembers,  setTeamMembers]  = useState<LocalTeamMember[]>([])
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent> | null>(null)
  const [defaultDate,  setDefaultDate]  = useState<string | undefined>()

  // 5-minute auto-sync tick
  const [syncTick, setSyncTick] = useState(0)

  // Left sidebar state
  const [googleCalendars, setGoogleCalendars] = useState<{id:string; summary:string; backgroundColor:string; foregroundColor:string; primary:boolean; accessRole:string}[]>([])
  const [enabledCalendars, setEnabledCalendars] = useState<Set<string>>(() => {
    try {
      const userId = localUser?.id ?? 'local-admin'
      const saved = localStorage.getItem(`cal-toggles-${userId}`)
      return saved ? new Set(JSON.parse(saved)) : new Set(['hub', 'task-deadlines'])
    } catch { return new Set(['hub', 'task-deadlines']) }
  })
  const [googleEvents, setGoogleEvents] = useState<Record<string, {id:string; summary:string; start:string; end:string; allDay:boolean; color:string; location?:string; meetingLink?:string; calendarId:string}[]>>({})
  const [userGoogleConnected, setUserGoogleConnected] = useState(false)
  const [googleNeedsReauth, setGoogleNeedsReauth] = useState(false)
  const [googleDiagError, setGoogleDiagError] = useState<string | null>(null)
  const [myTasks, setMyTasks] = useState<any[]>([])

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Save toggle state to localStorage
  useEffect(() => {
    const userId = localUser?.id ?? 'local-admin'
    localStorage.setItem(`cal-toggles-${userId}`, JSON.stringify([...enabledCalendars]))
  }, [enabledCalendars, localUser?.id])

  // Load Google calendars on mount
  useEffect(() => {
    if (!localUser?.id) return
    window.api.userGoogle.getStatus(localUser.id).then(s => {
      setUserGoogleConnected(s.connected)
      if (s.connected) {
        window.api.userGoogle.getCalendars(localUser.id).then(result => {
          if ('needsReauth' in result && result.needsReauth) {
            setUserGoogleConnected(false)
            setGoogleNeedsReauth(true)
            return
          }
          const cals = result as { id:string; summary:string; backgroundColor:string; foregroundColor:string; primary:boolean; accessRole:string }[]
          setGoogleCalendars(cals)
          setEnabledCalendars(prev => {
            const next = new Set(prev)
            for (const c of cals) if (!next.has(c.id)) next.add(c.id)
            return next
          })
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [localUser?.id])

  // Load my tasks for deadlines
  useEffect(() => {
    if (!localUser?.id) return
    window.api.todo.getMyTasks(localUser.id).then(setMyTasks).catch(() => {})
  }, [localUser?.id])

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

  // Load Google personal calendar events when range or toggles change
  useEffect(() => {
    if (!localUser?.id || !userGoogleConnected) return
    const ids = googleCalendars.filter(c => enabledCalendars.has(c.id)).map(c => c.id)
    if (ids.length === 0) return
    const start = view === 'agenda' ? toDateStr(new Date()) : rangeStart
    const end   = view === 'agenda' ? toDateStr(new Date(Date.now() + 90 * 86400000)) : rangeEnd
    Promise.all(ids.map(id => {
      const cal = googleCalendars.find(c => c.id === id)
      return window.api.userGoogle.getCalendarEvents(localUser!.id, id, start, end, cal?.backgroundColor)
        .then(evs => [id, evs] as const)
        .catch(() => [id, []] as const)
    })).then(results => {
      setGoogleEvents(Object.fromEntries(results))
    })
  }, [localUser?.id, userGoogleConnected, googleCalendars, enabledCalendars, view, rangeStart, rangeEnd, syncTick])

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

  // 5-minute auto-sync
  useEffect(() => {
    const id = setInterval(() => {
      loadEvents()
      setSyncTick(t => t + 1)
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadEvents])

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

  // Build combined events for display
  const allDisplayEvents = useMemo(() => {
    const out: CalendarEvent[] = []
    if (enabledCalendars.has('hub')) out.push(...events)

    // Google personal events
    for (const [, calEvs] of Object.entries(googleEvents)) {
      for (const ev of calEvs) {
        out.push({
          id: 'g-' + ev.id,
          title: ev.summary,
          description: null,
          location: ev.location ?? null,
          start_date: ev.start,
          end_date: ev.end || ev.start,
          all_day: ev.allDay ? 1 : 0,
          color: ev.color,
          visibility: 'personal',
          created_by_id: null,
          created_by_name: null,
          attendees_json: '[]',
          linked_task_id: null,
          google_event_id: ev.id,
          created_at: '',
          updated_at: '',
          meeting_link: ev.meetingLink ?? null,
        })
      }
    }

    // Task deadlines
    if (enabledCalendars.has('task-deadlines')) {
      const userId = localUser?.id ?? 'local-admin'
      const deadlineTasks = myTasks.filter(t =>
        t.due_date &&
        !t.completed_at &&
        t.column_id !== 'col-published' &&
        t.archived !== 1 &&
        (t.assignee_ids ?? []).includes(userId)
      )
      for (const t of deadlineTasks) {
        out.push({
          id: 'deadline-' + t.id,
          title: t.title,
          description: null,
          location: null,
          start_date: t.due_date,
          end_date: t.due_date,
          all_day: 1,
          color: '#f59e0b',
          visibility: 'personal',
          created_by_id: null,
          created_by_name: null,
          attendees_json: '[]',
          linked_task_id: t.id,
          google_event_id: null,
          created_at: '',
          updated_at: '',
        })
      }
    }

    return out
  }, [events, enabledCalendars, googleEvents, myTasks, localUser?.id])

  function handleDeadlineEventClick(ev: CalendarEvent) {
    if (ev.linked_task_id && ev.id.startsWith('deadline-')) {
      const task = myTasks.find(t => t.id === ev.linked_task_id)
      if (task) {
        setActiveBoardId(task.board_id)
        openTask(ev.linked_task_id)
        navigate('/workspace')
        return
      }
    }
    openEditEvent(ev)
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

      {/* Main row: left sidebar + calendar */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar */}
        <div className="w-48 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* My Calendars section */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">My Calendars</h3>

            {/* Kantor Hub — always on */}
            <label className="flex items-center gap-2 py-1 cursor-not-allowed opacity-90">
              <div className="w-3 h-3 rounded-sm bg-indigo-500 flex items-center justify-center shrink-0">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5 6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <span className="text-xs text-gray-700 dark:text-white/70">Kantor Hub</span>
            </label>

            {/* Task Deadlines toggle */}
            <label
              className="flex items-center gap-2 py-1 cursor-pointer"
              onClick={() => {
                setEnabledCalendars(prev => {
                  const next = new Set(prev)
                  if (next.has('task-deadlines')) next.delete('task-deadlines')
                  else next.add('task-deadlines')
                  return next
                })
              }}
            >
              <div className={`w-3 h-3 rounded-sm border transition flex items-center justify-center shrink-0 ${
                enabledCalendars.has('task-deadlines') ? 'bg-amber-500 border-amber-500' : 'border-gray-300 dark:border-white/20'
              }`}>
                {enabledCalendars.has('task-deadlines') && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5 6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
                )}
              </div>
              <span className="text-xs text-gray-700 dark:text-white/70">Task Deadlines</span>
            </label>

            {/* Personal Google calendars: My Calendars */}
            {userGoogleConnected && googleCalendars.filter(c => c.accessRole === 'owner' || c.primary).map(cal => (
              <label
                key={cal.id}
                className="flex items-center gap-2 py-1 cursor-pointer"
                onClick={() => {
                  setEnabledCalendars(prev => {
                    const next = new Set(prev)
                    if (next.has(cal.id)) next.delete(cal.id)
                    else next.add(cal.id)
                    return next
                  })
                }}
              >
                <div
                  className="w-3 h-3 rounded-sm border flex items-center justify-center transition shrink-0"
                  style={{
                    backgroundColor: enabledCalendars.has(cal.id) ? cal.backgroundColor : 'transparent',
                    borderColor: cal.backgroundColor,
                  }}
                >
                  {enabledCalendars.has(cal.id) && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5 6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  )}
                </div>
                <span className="text-xs text-gray-700 dark:text-white/70 truncate">{cal.summary}</span>
              </label>
            ))}

            {(!userGoogleConnected || googleNeedsReauth) && (
              <div className="mt-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mb-1.5">
                  {googleNeedsReauth ? 'Re-connect Google to sync calendars' : 'Connect Google to see your calendars'}
                </p>
                {googleDiagError && (
                  <p className="text-[9px] text-red-400 mb-1.5 break-words">{googleDiagError}</p>
                )}
                <button
                  onClick={() => {
                    if (!localUser?.id) return
                    setGoogleDiagError(null)
                    window.api.userGoogle.connect(localUser.id).then(async r => {
                      if (r.ok) {
                        // Run diagnostic to surface any API errors
                        const diag = await (window.api.userGoogle as any).diagnose(localUser.id).catch(() => null)
                        if (diag && !diag.ok) {
                          setGoogleDiagError(diag.calendarError ?? 'Unknown error — check Google Cloud Console')
                          setGoogleNeedsReauth(true)
                          return
                        }
                        setUserGoogleConnected(true)
                        setGoogleNeedsReauth(false)
                        const result = await window.api.userGoogle.getCalendars(localUser.id).catch(() => null)
                        if (result && !('needsReauth' in result)) {
                          setGoogleCalendars(result)
                          setEnabledCalendars(prev => {
                            const next = new Set(prev)
                            for (const c of result) if (!next.has(c.id)) next.add(c.id)
                            return next
                          })
                        }
                      } else {
                        setGoogleDiagError(r.error ?? 'Connection failed')
                      }
                    }).catch((e: any) => setGoogleDiagError(e?.message ?? 'Connection failed'))
                  }}
                  className="w-full px-2 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-semibold transition"
                >
                  {googleNeedsReauth ? 'Re-connect' : 'Connect Google'}
                </button>
              </div>
            )}
          </div>

          {/* Other Calendars section */}
          {userGoogleConnected && googleCalendars.filter(c => c.accessRole !== 'owner' && !c.primary).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">Other Calendars</h3>
              {googleCalendars.filter(c => c.accessRole !== 'owner' && !c.primary).map(cal => (
                <label
                  key={cal.id}
                  className="flex items-center gap-2 py-1 cursor-pointer"
                  onClick={() => {
                    setEnabledCalendars(prev => {
                      const next = new Set(prev)
                      if (next.has(cal.id)) next.delete(cal.id)
                      else next.add(cal.id)
                      return next
                    })
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-sm border flex items-center justify-center transition shrink-0"
                    style={{
                      backgroundColor: enabledCalendars.has(cal.id) ? cal.backgroundColor : 'transparent',
                      borderColor: cal.backgroundColor,
                    }}
                  >
                    {enabledCalendars.has(cal.id) && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5 6.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-700 dark:text-white/70 truncate">{cal.summary}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Calendar area */}
        <div className="flex-1 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : view === 'month' ? (
            <MonthView
              year={year} month={month} events={allDisplayEvents}
              onDayClick={openNewEvent} onEventClick={handleDeadlineEventClick}
            />
          ) : view === 'week' ? (
            <WeekView
              weekStart={getWeekStart(currentDate)} events={allDisplayEvents}
              onSlotClick={openNewEvent} onEventClick={handleDeadlineEventClick}
            />
          ) : (
            <div className="p-4 flex-1 overflow-y-auto">
              <AgendaView events={allDisplayEvents} onEventClick={handleDeadlineEventClick} />
            </div>
          )}
        </div>
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
