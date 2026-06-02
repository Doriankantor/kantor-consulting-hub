import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import TaskDetailPanel from '../components/TaskDetailPanel'

// ── Constants ──────────────────────────────────────────────────────────────

type ContactType = 'client' | 'subscriber' | 'source' | 'media' | 'partner' | 'prospect'
const CONTACT_TYPES: ContactType[] = ['client', 'subscriber', 'source', 'media', 'partner', 'prospect']
const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  client: 'Client', subscriber: 'Subscriber', source: 'Source',
  media: 'Media', partner: 'Partner', prospect: 'Prospect',
}
const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  client:     'bg-indigo-500/15 text-indigo-600 border-indigo-500/30 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40',
  subscriber: 'bg-teal-500/15 text-teal-600 border-teal-500/30 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/40',
  source:     'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
  media:      'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40',
  partner:    'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40',
  prospect:   'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40',
}

const ORG_TYPES = ['Government', 'Think Tank', 'Media', 'NGO', 'Private Sector', 'Academic', 'Other']
const HOW_MET_OPTIONS = ['Conference', 'Referral', 'Cold Outreach', 'Event', 'Introduction', 'Other']
const INTERACTION_TYPES = ['Call', 'Email', 'Meeting', 'Conference', 'Message', 'Other']
const SENSITIVITY_OPTIONS = ['none', 'confidential', 'sensitive']
const SORT_OPTIONS = [
  { value: 'name',           label: 'Name' },
  { value: 'last_contacted', label: 'Last Contacted' },
  { value: 'organization',   label: 'Organization' },
  { value: 'date_added',     label: 'Date Added' },
]

const AVATAR_PALETTE = [
  '#6366f1','#0891b2','#d97706','#7c3aed','#059669',
  '#db2777','#dc2626','#2563eb','#65a30d','#c2410c',
]

const STAGE_NAMES: Record<string, string> = {
  'col-scoping':'Scoping','col-research':'Research','col-drafting':'Drafting',
  'col-review':'Review','col-delivery':'Client Delivery','col-published':'Published',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) as T } catch { return fallback }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgo(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function lastContactedLabel(date: string | null): { text: string; cls: string } {
  if (!date) return { text: 'Never contacted', cls: 'text-gray-400 dark:text-white/50' }
  const d = daysAgo(date)
  if (d === 0) return { text: 'Contacted today', cls: 'text-emerald-600 dark:text-emerald-400' }
  if (d === 1) return { text: 'Contacted yesterday', cls: 'text-gray-500 dark:text-white/65' }
  if (d > 90) return { text: `${d} days ago`, cls: 'text-red-500 dark:text-red-400 font-medium' }
  if (d > 30) return { text: `${d} days ago`, cls: 'text-amber-600 dark:text-amber-400 font-medium' }
  return { text: `${d} days ago`, cls: 'text-gray-500 dark:text-white/65' }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ContactType }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${CONTACT_TYPE_COLORS[type]}`}>
      {CONTACT_TYPE_LABELS[type]}
    </span>
  )
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const bg = avatarColor(name)
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-9 h-9 text-xs'
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center shrink-0 font-bold text-white select-none`}
      style={{ backgroundColor: bg }}
    >
      {initials(name)}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-widest mb-1.5">
      {children}
    </p>
  )
}

function Field({ label, value, href, onClick }: { label: string; value: string | null; href?: string; onClick?: () => void }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-0.5">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer"
          className="text-sm text-hub-gold hover:underline break-all">{value}</a>
      ) : onClick ? (
        <button onClick={onClick} className="text-sm text-hub-gold hover:underline text-left break-all">{value}</button>
      ) : (
        <p className="text-sm text-gray-800 dark:text-white/85 break-all">{value}</p>
      )}
    </div>
  )
}

function InteractionTypeIcon({ type }: { type: string }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-[10px]'
  const map: Record<string, { bg: string; icon: React.ReactNode }> = {
    Call:       { bg: 'bg-emerald-500', icon: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M10.5 8.5c0 .3-.07.59-.21.87-.14.28-.33.54-.57.76A2.36 2.36 0 0 1 8.24 11c-.8 0-1.66-.22-2.56-.67-.9-.45-1.8-1.06-2.68-1.85A17.8 17.8 0 0 1 1.16 5.8C.72 4.9.5 4.05.5 3.25c0-.52.17-1 .49-1.44A2.15 2.15 0 0 1 2.76 1c.18 0 .35.04.51.12.17.08.32.2.43.36l1.5 2.1c.11.16.19.3.24.44.06.13.09.25.09.36 0 .14-.04.28-.11.42-.07.14-.17.28-.3.42l-.4.42a.28.28 0 0 0-.08.2c0 .04.01.07.02.1.07.14.21.33.44.56.23.23.48.47.74.7.28.23.55.45.83.64.28.2.49.3.64.32l.1.02c.08 0 .15-.02.21-.08l.4-.42c.14-.14.28-.25.42-.32a.9.9 0 0 1 .42-.1c.11 0 .23.02.36.08.13.05.28.13.43.24l2.12 1.52c.16.12.28.26.36.43.07.17.11.35.11.54z" fill="currentColor"/></svg> },
    Email:      { bg: 'bg-blue-500',    icon: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="2.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M1 3.5l5 3.5 5-3.5" stroke="currentColor" strokeWidth="1.1"/></svg> },
    Meeting:    { bg: 'bg-indigo-500',  icon: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="2" width="9" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M4 1v2M8 1v2M1.5 5h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg> },
    Conference: { bg: 'bg-purple-500',  icon: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M1 10.5c0-2 2.24-3.5 5-3.5s5 1.5 5 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg> },
    Message:    { bg: 'bg-cyan-500',    icon: <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1.5 1.5h9v6.5H7l-2 2v-2H1.5V1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg> },
    Other:      { bg: 'bg-slate-500',   icon: <span className="font-bold">•</span> },
  }
  const m = map[type] ?? map['Other']
  return <div className={`${base} ${m.bg}`}>{m.icon}</div>
}

const inputCls = 'titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40'
const selectCls = 'titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40 cursor-pointer'

// ── Add Contact Modal ──────────────────────────────────────────────────────

function AddContactModal({
  teamMembers,
  onSave,
  onClose,
}: {
  teamMembers: LocalTeamMember[]
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
}) {
  const { localUser } = useAuth()
  const [form, setForm] = useState({
    full_name: '', email_primary: '', organization: '',
    job_title: '', contact_types: [] as ContactType[], assigned_to: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  function toggleType(t: ContactType) {
    setForm(p => ({
      ...p,
      contact_types: p.contact_types.includes(t)
        ? p.contact_types.filter(x => x !== t)
        : [...p.contact_types, t],
    }))
  }

  async function handleSave() {
    if (!form.full_name.trim()) return
    setSaving(true)
    await onSave({
      ...form,
      full_name: form.full_name.trim(),
      email_primary: form.email_primary.trim() || null,
      organization: form.organization.trim() || null,
      job_title: form.job_title.trim() || null,
      assigned_to: form.assigned_to || null,
      created_by: localUser?.id ?? null,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 bg-white dark:bg-[#141c2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.1] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">New Contact</h3>
          <button onClick={onClose} className="titlebar-no-drag p-1 rounded-lg text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70 transition">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <SectionLabel>Full Name *</SectionLabel>
            <input autoFocus value={form.full_name} onChange={set('full_name')} placeholder="Jane Smith" className={inputCls} />
          </div>
          <div>
            <SectionLabel>Email</SectionLabel>
            <input type="email" value={form.email_primary} onChange={set('email_primary')} placeholder="jane@example.com" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel>Organization</SectionLabel>
              <input value={form.organization} onChange={set('organization')} placeholder="Org name" className={inputCls} />
            </div>
            <div>
              <SectionLabel>Job Title</SectionLabel>
              <input value={form.job_title} onChange={set('job_title')} placeholder="Title" className={inputCls} />
            </div>
          </div>
          <div>
            <SectionLabel>Contact Types</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`titlebar-no-drag px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition ${
                    form.contact_types.includes(t)
                      ? CONTACT_TYPE_COLORS[t]
                      : 'border-gray-200 dark:border-white/[0.1] text-gray-400 dark:text-white/50 hover:border-gray-300 dark:hover:border-white/20'
                  }`}
                >
                  {CONTACT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          {teamMembers.length > 0 && (
            <div>
              <SectionLabel>Assigned Team Member</SectionLabel>
              <select value={form.assigned_to} onChange={set('assigned_to')} className={selectCls}>
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-white/[0.06] flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.full_name.trim()}
            className="titlebar-no-drag flex-1 py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-sm font-semibold transition"
          >
            {saving ? 'Saving…' : 'Save and open profile'}
          </button>
          <button
            onClick={onClose}
            className="titlebar-no-drag px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/70 text-sm transition hover:bg-gray-200 dark:hover:bg-white/[0.1]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Log Interaction Form ───────────────────────────────────────────────────

function LogInteractionForm({
  contactId,
  loggedByName,
  loggedById,
  onSaved,
  onCancel,
}: {
  contactId: string
  loggedByName: string
  loggedById: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    date: today(), type: 'Meeting', summary: '',
    follow_up: false, follow_up_date: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.summary.trim()) return
    setSaving(true)
    await window.api.contacts.addInteraction({
      contact_id: contactId,
      date: form.date,
      type: form.type,
      summary: form.summary.trim(),
      logged_by_id: loggedById,
      logged_by_name: loggedByName,
      follow_up: form.follow_up ? 1 : 0,
      follow_up_date: form.follow_up ? form.follow_up_date || null : null,
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] space-y-3">
      <p className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-widest">Log Interaction</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Date</p>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Type</p>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className={selectCls}>
            {INTERACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Summary</p>
        <textarea
          value={form.summary}
          onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
          placeholder="What was discussed…"
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.follow_up}
          onChange={e => setForm(p => ({ ...p, follow_up: e.target.checked }))}
          className="w-3.5 h-3.5 rounded accent-hub-gold"
        />
        <span className="text-sm text-gray-600 dark:text-white/70">Follow-up needed</span>
      </label>
      {form.follow_up && (
        <div>
          <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Follow-up Date</p>
          <input type="date" value={form.follow_up_date} onChange={e => setForm(p => ({ ...p, follow_up_date: e.target.value }))} className={inputCls} />
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !form.summary.trim()}
          className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}
          className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Contact Detail Panel ───────────────────────────────────────────────────

function ContactDetail({
  contactId,
  teamMembers,
  areas,
  onDeleted,
  onUpdated,
}: {
  contactId: string
  teamMembers: LocalTeamMember[]
  areas: Area[]
  onDeleted: () => void
  onUpdated: (c: Contact) => void
}) {
  const { isAdmin, localUser } = useAuth()
  const { tasks: workspaceTasks, selectTask } = useWorkspace()

  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<ContactInteraction[]>([])
  const [linkedTasks, setLinkedTasks] = useState<WorkspaceTaskSummary[]>([])
  const [loading, setLoading] = useState(true)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Contact & { contact_types: ContactType[]; languages: string[]; expertise_areas: string[] }>>({})

  // Interaction log
  const [showLogForm, setShowLogForm] = useState(false)
  const [editingInteraction, setEditingInteraction] = useState<ContactInteraction | null>(null)
  const [editInteractionData, setEditInteractionData] = useState({ summary: '', type: '', follow_up: false, follow_up_date: '' })

  // Link task
  const [showLinkTask, setShowLinkTask] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const taskSearchRef = useRef<HTMLInputElement>(null)

  // Notes
  const [notesValue, setNotesValue] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.contacts.get(contactId)
      setContact(data.contact)
      setInteractions(data.interactions)
      setLinkedTasks(data.tasks)
      setNotesValue(data.contact.internal_notes ?? '')
    } catch {}
    setLoading(false)
  }, [contactId])

  useEffect(() => { load() }, [load])

  function startEdit() {
    if (!contact) return
    setEditData({
      full_name: contact.full_name,
      job_title: contact.job_title ?? '',
      organization: contact.organization ?? '',
      email_primary: contact.email_primary ?? '',
      email_secondary: contact.email_secondary ?? '',
      phone_primary: contact.phone_primary ?? '',
      phone_mobile: contact.phone_mobile ?? '',
      phone_secondary: contact.phone_secondary ?? '',
      linkedin_url: contact.linkedin_url ?? '',
      twitter_handle: contact.twitter_handle ?? '',
      telegram_username: contact.telegram_username ?? '',
      website_url: contact.website_url ?? '',
      country: contact.country ?? '',
      city: contact.city ?? '',
      org_type: contact.org_type ?? '',
      security_sensitivity: contact.security_sensitivity,
      how_we_met: contact.how_we_met ?? '',
      how_we_met_note: contact.how_we_met_note ?? '',
      assigned_to: contact.assigned_to ?? '',
      contact_types: parseJSON<ContactType[]>(contact.contact_types_json, []),
      languages: parseJSON<string[]>(contact.languages_json, []),
      expertise_areas: parseJSON<string[]>(contact.expertise_areas_json, []),
    })
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!contact || !editData.full_name?.trim()) return
    const payload: Record<string, unknown> = {
      full_name: editData.full_name?.trim(),
      job_title: editData.job_title || null,
      organization: editData.organization || null,
      email_primary: editData.email_primary || null,
      email_secondary: editData.email_secondary || null,
      phone_primary: editData.phone_primary || null,
      phone_mobile: editData.phone_mobile || null,
      phone_secondary: editData.phone_secondary || null,
      linkedin_url: editData.linkedin_url || null,
      twitter_handle: editData.twitter_handle || null,
      telegram_username: editData.telegram_username || null,
      website_url: editData.website_url || null,
      country: editData.country || null,
      city: editData.city || null,
      org_type: editData.org_type || null,
      security_sensitivity: editData.security_sensitivity ?? 'none',
      how_we_met: editData.how_we_met || null,
      how_we_met_note: editData.how_we_met_note || null,
      assigned_to: editData.assigned_to || null,
      contact_types: editData.contact_types ?? [],
      languages: editData.languages ?? [],
      expertise_areas: editData.expertise_areas ?? [],
    }
    await window.api.contacts.update(contact.id, payload)
    setEditing(false)
    await load()
    if (contact) onUpdated({ ...contact, ...(payload as Partial<Contact>) })
  }

  async function handleDelete() {
    if (!contact) return
    if (!confirm(`Delete ${contact.full_name}? This cannot be undone.`)) return
    await window.api.contacts.delete(contact.id)
    onDeleted()
  }

  async function handleToggleFlag(field: 'confidential' | 'do_not_contact', value: number) {
    if (!contact) return
    await window.api.contacts.update(contact.id, { [field]: value })
    setContact(p => p ? { ...p, [field]: value } : p)
  }

  async function handleDeleteInteraction(id: string) {
    if (!confirm('Delete this interaction log entry?')) return
    await window.api.contacts.deleteInteraction(id)
    await load()
  }

  async function handleSaveInteractionEdit(id: string) {
    await window.api.contacts.updateInteraction(id, {
      summary: editInteractionData.summary,
      type: editInteractionData.type,
      follow_up: editInteractionData.follow_up ? 1 : 0,
      follow_up_date: editInteractionData.follow_up ? editInteractionData.follow_up_date || null : null,
    })
    setEditingInteraction(null)
    await load()
  }

  async function handleLinkTask(taskId: string) {
    if (!contact) return
    await window.api.contacts.linkTask(contact.id, taskId)
    setShowLinkTask(false)
    setTaskSearch('')
    await load()
  }

  async function handleUnlinkTask(taskId: string) {
    if (!contact) return
    await window.api.contacts.unlinkTask(contact.id, taskId)
    await load()
  }

  async function handleSaveNotes() {
    if (!contact) return
    await window.api.contacts.update(contact.id, {
      internal_notes: notesValue,
      notes_updated_by: localUser?.name ?? 'Unknown',
      notes_updated_at: new Date().toISOString(),
    })
    setNotesDirty(false)
    await load()
  }

  const linkedTaskIds = new Set(linkedTasks.map(t => t.id))
  const availableTasks = useMemo(() =>
    workspaceTasks.filter(t =>
      !linkedTaskIds.has(t.id) &&
      (taskSearch === '' ||
        t.title.toLowerCase().includes(taskSearch.toLowerCase()) ||
        (t.client ?? '').toLowerCase().includes(taskSearch.toLowerCase()))
    ).slice(0, 8),
    [workspaceTasks, linkedTaskIds, taskSearch]
  )

  const ed = (k: keyof typeof editData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditData(p => ({ ...p, [k]: e.target.value }))

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
      </div>
    )
  }
  if (!contact) return null

  const types = parseJSON<ContactType[]>(contact.contact_types_json, [])
  const langs = parseJSON<string[]>(contact.languages_json, [])
  const expertiseAreas = parseJSON<string[]>(contact.expertise_areas_json, [])
  const assignedMember = teamMembers.find(m => m.id === contact.assigned_to)
  const lc = lastContactedLabel(contact.last_contacted_date)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Do Not Contact banner */}
      {contact.do_not_contact === 1 && (
        <div className="shrink-0 px-6 py-2.5 bg-red-500/15 border-b border-red-500/20 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-red-500 shrink-0">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2.5 2.5l9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-semibold text-red-500">Do Not Contact</span>
          <span className="text-xs text-red-400">— This contact must not be reached out to.</span>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-6 py-5 border-b border-gray-200 dark:border-white/[0.07]">
        <div className="flex items-start gap-4">
          <Avatar name={contact.full_name} size="lg" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                value={editData.full_name ?? ''}
                onChange={ed('full_name')}
                className="titlebar-no-drag text-xl font-bold bg-transparent border-b border-hub-gold/40 text-gray-900 dark:text-white focus:outline-none pb-0.5 w-full mb-2"
              />
            ) : (
              <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{contact.full_name}</h2>
            )}
            {editing ? (
              <div className="flex gap-2 mt-1.5">
                <input value={editData.job_title ?? ''} onChange={ed('job_title')} placeholder="Job title" className="titlebar-no-drag flex-1 px-2 py-1 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 text-sm focus:outline-none" />
                <input value={editData.organization ?? ''} onChange={ed('organization')} placeholder="Organization" className="titlebar-no-drag flex-1 px-2 py-1 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 text-sm focus:outline-none" />
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-white/65 mt-0.5 truncate">
                {[contact.job_title, contact.organization].filter(Boolean).join(' · ') || '—'}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {editing ? (
                CONTACT_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setEditData(p => {
                      const cur = p.contact_types ?? []
                      return { ...p, contact_types: cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t] }
                    })}
                    className={`titlebar-no-drag px-2 py-0.5 rounded-full text-[10px] font-semibold border transition ${
                      (editData.contact_types ?? []).includes(t)
                        ? CONTACT_TYPE_COLORS[t]
                        : 'border-gray-200 dark:border-white/[0.1] text-gray-400 dark:text-white/40'
                    }`}
                  >
                    {CONTACT_TYPE_LABELS[t]}
                  </button>
                ))
              ) : (
                types.map(t => <TypeBadge key={t} type={t} />)
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Confidential">
                <div
                  onClick={() => handleToggleFlag('confidential', contact.confidential === 1 ? 0 : 1)}
                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${contact.confidential === 1 ? 'bg-amber-500' : 'bg-gray-200 dark:bg-white/[0.15]'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mt-0.5 ${contact.confidential === 1 ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[10px] text-gray-400 dark:text-white/50">Conf.</span>
              </label>
            )}
            {editing ? (
              <>
                <button onClick={handleSaveEdit}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition">
                  Save
                </button>
                <button onClick={() => setEditing(false)}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-white/65 text-xs transition">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={startEdit}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-600 dark:text-white/75 text-xs font-medium transition">
                  Edit
                </button>
                {isAdmin && (
                  <button onClick={handleDelete}
                    className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium transition">
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-6 py-5 space-y-7">

          {/* ── Contact Information ────────────────────────────────────── */}
          <section>
            <SectionLabel>Contact Information</SectionLabel>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.05] overflow-hidden">
              {editing ? (
                <div className="p-4 grid grid-cols-2 gap-3">
                  {([
                    ['email_primary','Email (Primary)','email'],
                    ['email_secondary','Email (Secondary)','email'],
                    ['phone_primary','Phone (Primary)','tel'],
                    ['phone_mobile','Mobile','tel'],
                    ['phone_secondary','Phone (Secondary)','tel'],
                    ['linkedin_url','LinkedIn URL','url'],
                    ['twitter_handle','X / Twitter Handle','text'],
                    ['telegram_username','Telegram Username','text'],
                    ['website_url','Website','url'],
                    ['country','Country','text'],
                    ['city','City','text'],
                  ] as [keyof typeof editData, string, string][]).map(([k, label, type]) => (
                    <div key={k}>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">{label}</p>
                      <input
                        type={type}
                        value={(editData[k] ?? '') as string}
                        onChange={ed(k)}
                        className={inputCls}
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Languages</p>
                    <input
                      value={(editData.languages ?? []).join(', ')}
                      onChange={e => setEditData(p => ({ ...p, languages: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                      placeholder="English, Spanish, French…"
                      className={inputCls}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Email" value={contact.email_primary} href={contact.email_primary ? `mailto:${contact.email_primary}` : undefined} />
                  <Field label="Email (Alt)" value={contact.email_secondary} href={contact.email_secondary ? `mailto:${contact.email_secondary}` : undefined} />
                  <Field label="Phone" value={contact.phone_primary} href={contact.phone_primary ? `tel:${contact.phone_primary}` : undefined} />
                  <Field label="Mobile" value={contact.phone_mobile} href={contact.phone_mobile ? `tel:${contact.phone_mobile}` : undefined} />
                  <Field label="Phone (Alt)" value={contact.phone_secondary} />
                  <Field label="LinkedIn" value={contact.linkedin_url} href={contact.linkedin_url ?? undefined} />
                  <Field label="X / Twitter" value={contact.twitter_handle} href={contact.twitter_handle ? `https://x.com/${contact.twitter_handle.replace('@','')}` : undefined} />
                  <Field label="Telegram" value={contact.telegram_username} />
                  <Field label="Website" value={contact.website_url} href={contact.website_url ?? undefined} />
                  <Field label="Location" value={[contact.city, contact.country].filter(Boolean).join(', ')} />
                  {langs.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Languages</p>
                      <div className="flex flex-wrap gap-1">
                        {langs.map(l => (
                          <span key={l} className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-white/70 text-xs">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Professional Context ───────────────────────────────────── */}
          <section>
            <SectionLabel>Professional Context</SectionLabel>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02] p-4 space-y-4">
              {editing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Organization Type</p>
                      <select value={editData.org_type ?? ''} onChange={ed('org_type')} className={selectCls}>
                        <option value="">Not set</option>
                        {ORG_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Security Sensitivity</p>
                      <select value={editData.security_sensitivity ?? 'none'} onChange={ed('security_sensitivity')} className={selectCls}>
                        {SENSITIVITY_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">How We Met</p>
                      <select value={editData.how_we_met ?? ''} onChange={ed('how_we_met')} className={selectCls}>
                        <option value="">Not set</option>
                        {HOW_MET_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">Assigned Team Member</p>
                      <select value={editData.assigned_to ?? ''} onChange={ed('assigned_to')} className={selectCls}>
                        <option value="">Unassigned</option>
                        {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}
                      </select>
                    </div>
                  </div>
                  {editData.how_we_met === 'Other' && (
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1">How We Met (detail)</p>
                      <input value={editData.how_we_met_note ?? ''} onChange={ed('how_we_met_note')} placeholder="Describe…" className={inputCls} />
                    </div>
                  )}
                  {areas.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1.5">Areas of Expertise</p>
                      <div className="flex flex-wrap gap-1.5">
                        {areas.map(a => {
                          const sel = (editData.expertise_areas ?? []).includes(a.id)
                          return (
                            <button
                              key={a.id}
                              onClick={() => setEditData(p => {
                                const cur = p.expertise_areas ?? []
                                return { ...p, expertise_areas: sel ? cur.filter(x => x !== a.id) : [...cur, a.id] }
                              })}
                              className="titlebar-no-drag px-2.5 py-0.5 rounded-full text-xs font-medium border transition"
                              style={sel ? { backgroundColor: a.color, borderColor: a.color, color: 'white' } : { color: a.color, borderColor: a.color + '40', backgroundColor: a.color + '18' }}
                            >
                              {a.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <Field label="Organization Type" value={contact.org_type} />
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-white/45 mb-0.5">Security Sensitivity</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      contact.security_sensitivity === 'sensitive'    ? 'bg-red-500/15 text-red-500 dark:text-red-400' :
                      contact.security_sensitivity === 'confidential' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                      'text-gray-500 dark:text-white/50'
                    }`}>
                      {contact.security_sensitivity.charAt(0).toUpperCase() + contact.security_sensitivity.slice(1)}
                    </span>
                  </div>
                  <Field label="How We Met" value={contact.how_we_met_note && contact.how_we_met === 'Other' ? `${contact.how_we_met}: ${contact.how_we_met_note}` : contact.how_we_met} />
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-white/45 mb-0.5">Assigned To</p>
                    {assignedMember ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar name={assignedMember.full_name ?? assignedMember.email} size="sm" />
                        <span className="text-sm text-gray-700 dark:text-white/80">{assignedMember.full_name ?? assignedMember.email}</span>
                      </div>
                    ) : <span className="text-sm text-gray-400 dark:text-white/40">Unassigned</span>}
                  </div>
                  {expertiseAreas.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-gray-400 dark:text-white/45 mb-1.5">Areas of Expertise</p>
                      <div className="flex flex-wrap gap-1.5">
                        {expertiseAreas.map(id => {
                          const a = areas.find(x => x.id === id)
                          if (!a) return null
                          return (
                            <span key={id} className="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                              style={{ color: a.color, borderColor: a.color + '40', backgroundColor: a.color + '18' }}>
                              {a.name}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Linked Engagements ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>Linked Engagements</SectionLabel>
              <button
                onClick={() => { setShowLinkTask(v => !v); setTimeout(() => taskSearchRef.current?.focus(), 50) }}
                className="titlebar-no-drag flex items-center gap-1 text-xs text-hub-gold hover:text-hub-gold-light transition font-medium"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Link engagement
              </button>
            </div>

            {showLinkTask && (
              <div className="mb-3 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08]">
                <input
                  ref={taskSearchRef}
                  type="text"
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder="Search engagements…"
                  className={`${inputCls} mb-2`}
                />
                {availableTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-white/50 text-center py-2">No matching engagements</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableTasks.map(t => (
                      <button
                        key={t.id}
                        onClick={() => handleLinkTask(t.id)}
                        className="titlebar-no-drag w-full text-left px-3 py-2 rounded-lg bg-white dark:bg-white/[0.05] hover:bg-gray-100 dark:hover:bg-white/[0.08] transition flex items-center gap-2"
                      >
                        <span className="flex-1 text-sm text-gray-700 dark:text-white/80 truncate">{t.title}</span>
                        <span className="text-[10px] text-gray-400 dark:text-white/45 shrink-0">{STAGE_NAMES[t.column_id] ?? t.column_id}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => { setShowLinkTask(false); setTaskSearch('') }}
                  className="titlebar-no-drag mt-2 text-xs text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70 transition">
                  Cancel
                </button>
              </div>
            )}

            {linkedTasks.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/40 italic">No linked engagements.</p>
            ) : (
              <div className="space-y-1.5">
                {linkedTasks.map(t => {
                  const full = workspaceTasks.find(x => x.id === t.id)
                  return (
                    <div key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/60 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.07] group">
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => full && selectTask(full)}
                          className="titlebar-no-drag text-sm font-medium text-gray-800 dark:text-white/85 hover:text-hub-gold dark:hover:text-hub-gold truncate block text-left"
                        >
                          {t.title}
                        </button>
                        <p className="text-[10px] text-gray-400 dark:text-white/45 mt-0.5">
                          {STAGE_NAMES[t.column_id] ?? t.column_id}
                          {t.due_date ? ` · Due ${formatDate(t.due_date)}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnlinkTask(t.id)}
                        className="titlebar-no-drag shrink-0 p-1 rounded text-gray-300 dark:text-white/30 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                        title="Unlink"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Interaction Log ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>Interaction Log</SectionLabel>
              <button
                onClick={() => setShowLogForm(v => !v)}
                className="titlebar-no-drag flex items-center gap-1 text-xs text-hub-gold hover:text-hub-gold-light transition font-medium"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Log interaction
              </button>
            </div>

            {/* Last contacted summary */}
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.07]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="text-xs text-gray-500 dark:text-white/60">Last contacted:</span>
              <span className={`text-xs font-semibold ${lc.cls}`}>{lc.text}</span>
              {contact.last_contacted_date && (
                <span className="text-xs text-gray-400 dark:text-white/40">({formatDate(contact.last_contacted_date)})</span>
              )}
            </div>

            {showLogForm && (
              <div className="mb-4">
                <LogInteractionForm
                  contactId={contact.id}
                  loggedByName={localUser?.name ?? 'Unknown'}
                  loggedById={localUser?.id ?? 'local-admin'}
                  onSaved={async () => { setShowLogForm(false); await load() }}
                  onCancel={() => setShowLogForm(false)}
                />
              </div>
            )}

            {interactions.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/40 italic">No interactions logged yet.</p>
            ) : (
              <div className="space-y-3">
                {interactions.map(ix => (
                  <div key={ix.id} className="flex gap-3 group">
                    <InteractionTypeIcon type={ix.type} />
                    <div className="flex-1 min-w-0">
                      {editingInteraction?.id === ix.id ? (
                        <div className="space-y-2 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08]">
                          <div className="grid grid-cols-2 gap-2">
                            <select value={editInteractionData.type} onChange={e => setEditInteractionData(p => ({ ...p, type: e.target.value }))} className={selectCls}>
                              {INTERACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <textarea
                            value={editInteractionData.summary}
                            onChange={e => setEditInteractionData(p => ({ ...p, summary: e.target.value }))}
                            rows={2}
                            className={`${inputCls} resize-none`}
                          />
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editInteractionData.follow_up}
                              onChange={e => setEditInteractionData(p => ({ ...p, follow_up: e.target.checked }))}
                              className="w-3.5 h-3.5 rounded accent-hub-gold" />
                            <span className="text-xs text-gray-600 dark:text-white/70">Follow-up needed</span>
                          </label>
                          {editInteractionData.follow_up && (
                            <input type="date" value={editInteractionData.follow_up_date}
                              onChange={e => setEditInteractionData(p => ({ ...p, follow_up_date: e.target.value }))}
                              className={inputCls} />
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveInteractionEdit(ix.id)}
                              className="titlebar-no-drag px-3 py-1 rounded bg-hub-gold text-white text-xs font-semibold transition">
                              Save
                            </button>
                            <button onClick={() => setEditingInteraction(null)}
                              className="titlebar-no-drag px-3 py-1 rounded bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-500 dark:text-white/65">{ix.type}</span>
                                <span className="text-[10px] text-gray-400 dark:text-white/45">{formatDate(ix.date)}</span>
                                {ix.logged_by_name && (
                                  <span className="text-[10px] text-gray-400 dark:text-white/40">by {ix.logged_by_name}</span>
                                )}
                                {ix.follow_up === 1 && (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                    ix.follow_up_date && ix.follow_up_date < today()
                                      ? 'bg-red-500/15 text-red-500 border-red-500/30'
                                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  }`}>
                                    Follow-up{ix.follow_up_date ? ` ${formatDate(ix.follow_up_date)}` : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 dark:text-white/80 mt-1 leading-relaxed">{ix.summary}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => {
                                  setEditingInteraction(ix)
                                  setEditInteractionData({ summary: ix.summary, type: ix.type, follow_up: ix.follow_up === 1, follow_up_date: ix.follow_up_date ?? '' })
                                }}
                                className="titlebar-no-drag p-1 rounded text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 transition"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteInteraction(ix.id)}
                                className="titlebar-no-drag p-1 rounded text-gray-400 dark:text-white/40 hover:text-red-400 transition"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M1.5 2.5h8M3.5 2.5V1.5h4v1M4 4v4M7 4v4M2.5 2.5l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Internal Notes ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>Internal Notes</SectionLabel>
              <span className="text-[10px] text-gray-400 dark:text-white/40 italic">Internal only — never shared externally</span>
            </div>
            <textarea
              value={notesValue}
              onChange={e => { setNotesValue(e.target.value); setNotesDirty(true) }}
              placeholder="Add internal notes, context, or background…"
              rows={5}
              className={`${inputCls} resize-y`}
            />
            {notesDirty && (
              <div className="flex items-center gap-2 mt-2">
                <button onClick={handleSaveNotes}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition">
                  Save Notes
                </button>
                <button onClick={() => { setNotesValue(contact.internal_notes ?? ''); setNotesDirty(false) }}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
                  Discard
                </button>
              </div>
            )}
            {contact.notes_updated_by && !notesDirty && (
              <p className="text-[10px] text-gray-400 dark:text-white/40 mt-1.5">
                Last edited by {contact.notes_updated_by}
                {contact.notes_updated_at ? ` · ${new Date(contact.notes_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </p>
            )}
          </section>

          {/* ── Do Not Contact ─────────────────────────────────────────── */}
          {isAdmin && (
            <section className="pb-6">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02]">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-white/80">Do Not Contact</p>
                  <p className="text-xs text-gray-400 dark:text-white/45 mt-0.5">Flags this contact and prevents outreach</p>
                </div>
                <div
                  onClick={() => handleToggleFlag('do_not_contact', contact.do_not_contact === 1 ? 0 : 1)}
                  className={`w-10 h-5 rounded-full cursor-pointer transition-colors ${contact.do_not_contact === 1 ? 'bg-red-500' : 'bg-gray-200 dark:bg-white/[0.15]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-transform ${contact.do_not_contact === 1 ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </section>
          )}

        </div>
      </div>

      {/* Task detail panel overlay */}
    </div>
  )
}

// ── Main Contacts Page ─────────────────────────────────────────────────────

export default function Contacts() {
  const { isAdmin, localUser } = useAuth()
  const { selectedTask } = useWorkspace()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<LocalTeamMember[]>([])
  const [areas, setAreas] = useState<Area[]>([])

  // Filters & sort
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [sortKey, setSortKey] = useState('name')

  // Add contact modal
  const [showAdd, setShowAdd] = useState(false)

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.contacts.list()
      setCloudError(null)
      // Permission filter: hide confidential/sensitive from non-admin non-assigned
      const userId = localUser?.id ?? 'local-admin'
      const visible = isAdmin
        ? data
        : data.filter(c => {
            if (c.confidential === 1 && c.assigned_to !== userId) return false
            if (['confidential', 'sensitive'].includes(c.security_sensitivity) && c.assigned_to !== userId) return false
            return true
          })
      setContacts(visible)
    } catch (e: any) {
      // Cloud unreachable — surface inline; do NOT silently fall back to stale local data.
      setCloudError(`Couldn't reach the server — contacts may be out of date. (${e?.message ?? 'network error'})`)
    }
    setLoading(false)
  }, [isAdmin, localUser])

  useEffect(() => {
    loadContacts()
    window.api.team.list().then(setTeamMembers).catch(() => {})
    window.api.areas.list().then(setAreas).catch(() => {})
  }, [loadContacts])

  const filtered = useMemo(() => {
    let list = contacts
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.organization ?? '').toLowerCase().includes(q) ||
        (c.email_primary ?? '').toLowerCase().includes(q)
      )
    }
    if (filterType) {
      list = list.filter(c => parseJSON<string[]>(c.contact_types_json, []).includes(filterType))
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'name')           return a.full_name.localeCompare(b.full_name)
      if (sortKey === 'last_contacted') return (b.last_contacted_date ?? '').localeCompare(a.last_contacted_date ?? '')
      if (sortKey === 'organization')   return (a.organization ?? '').localeCompare(b.organization ?? '')
      if (sortKey === 'date_added')     return b.created_at.localeCompare(a.created_at)
      return 0
    })
  }, [contacts, search, filterType, sortKey])

  async function handleAddContact(data: Record<string, unknown>) {
    const result = await window.api.contacts.create(data)
    if (result.id) {
      await loadContacts()
      setSelectedId(result.id)
      setShowAdd(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Panel ─────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-white/[0.08] bg-white/90 dark:bg-black/[0.3] backdrop-blur-xl overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900 dark:text-white">Contacts</h1>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/65 text-[10px] font-semibold">
                {contacts.length}
              </span>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add Contact
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2.5">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/50" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, org, email…"
              className="titlebar-no-drag w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1">
            {['', ...CONTACT_TYPES].map(t => (
              <button
                key={t || 'all'}
                onClick={() => setFilterType(t)}
                className={`titlebar-no-drag px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                  filterType === t
                    ? 'bg-hub-gold text-white'
                    : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 hover:bg-gray-200 dark:hover:bg-white/[0.10]'
                }`}
              >
                {t ? CONTACT_TYPE_LABELS[t as ContactType] : 'All'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select value={sortKey} onChange={e => setSortKey(e.target.value)}
            className="titlebar-no-drag mt-2.5 w-full px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-white/65 text-xs focus:outline-none cursor-pointer">
            {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
          </select>
        </div>

        {/* Cloud connection error — do NOT silently show stale data */}
        {cloudError && (
          <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-[11px] text-red-600 dark:text-red-400">
            {cloudError}
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-white/50">
              <p className="text-sm">No contacts found</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map(c => {
                const types = parseJSON<ContactType[]>(c.contact_types_json, [])
                const lc = lastContactedLabel(c.last_contacted_date)
                const assigned = teamMembers.find(m => m.id === c.assigned_to)
                const isSelected = selectedId === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`titlebar-no-drag w-full text-left px-3 py-2.5 rounded-xl transition ${
                      isSelected
                        ? 'bg-hub-gold/10 dark:bg-hub-gold/[0.12]'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar name={c.full_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className={`text-sm font-bold truncate leading-snug ${isSelected ? 'text-hub-gold' : 'text-gray-900 dark:text-white'}`}>
                            {c.full_name}
                          </p>
                          {assigned && (
                            <Avatar name={assigned.full_name ?? assigned.email} size="sm" />
                          )}
                        </div>
                        {(c.job_title || c.organization) && (
                          <p className="text-[11px] text-gray-500 dark:text-white/55 truncate leading-tight mt-0.5">
                            {[c.job_title, c.organization].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {types.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {types.slice(0, 3).map(t => <TypeBadge key={t} type={t} />)}
                          </div>
                        )}
                        <p className={`text-[10px] mt-1 ${lc.cls}`}>{lc.text}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedId ? (
          <ContactDetail
            key={selectedId}
            contactId={selectedId}
            teamMembers={teamMembers}
            areas={areas}
            onDeleted={() => { setSelectedId(null); loadContacts() }}
            onUpdated={updated => setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-white/50">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mb-3 opacity-25">
              <circle cx="20" cy="18" r="8" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M4 40c0-8 7.16-14 16-14s16 6 16 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M34 14c3.31 0 6 2.69 6 6s-2.69 6-6 6M40 40c0-4.42-2.69-8-6-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p className="text-sm font-medium">Select a contact</p>
            <p className="text-xs mt-1 opacity-75">Choose a contact to view their profile</p>
          </div>
        )}
      </div>

      {/* Task detail panel (when a linked task is clicked) */}
      {selectedTask && <TaskDetailPanel />}

      {/* Add contact modal */}
      {showAdd && (
        <AddContactModal
          teamMembers={teamMembers}
          onSave={handleAddContact}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
