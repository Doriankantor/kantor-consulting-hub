import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { Area } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────

const CLIENT_TYPES = ['Government', 'Private', 'NGO', 'Academic', 'Media']

const TYPE_BADGE: Record<string, string> = {
  Government: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  Private:    'bg-amber-500/15 text-amber-400 border-amber-500/25',
  NGO:        'bg-green-500/15 text-green-400 border-green-500/25',
  Academic:   'bg-purple-500/15 text-purple-400 border-purple-500/25',
  Media:      'bg-pink-500/15 text-pink-400 border-pink-500/25',
}

const STAGE_NAMES: Record<string, string> = {
  'col-scoping':   'Scoping',
  'col-research':  'Research',
  'col-drafting':  'Drafting',
  'col-review':    'Review',
  'col-delivery':  'Client Delivery',
  'col-published': 'Published',
}

const PRIORITY_DOT: Record<string, string> = {
  low:    'bg-slate-500',
  medium: 'bg-blue-500',
  high:   'bg-amber-500',
  urgent: 'bg-red-500',
}

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_BADGE[type] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/25'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${cls}`}>
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Active'
    ? 'bg-green-500/15 text-green-400 border-green-500/25'
    : 'bg-gray-500/15 text-gray-400 border-gray-500/25'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${cls}`}>
      {status}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Clients() {
  const { isRoot } = useAuth()

  // List state
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')

  // Detail state
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null)
  const [detail, setDetail] = useState<{ client: ClientRecord; contacts: ClientContact[]; tasks: WorkspaceTaskSummary[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'tasks'>('overview')

  // New client form
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '', type: 'Private', status: 'Active', country: '', region: '', notes: '', area_tags: [] as string[],
  })
  const [areas, setAreas] = useState<Area[]>([])
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Edit client
  const [editingClient, setEditingClient] = useState(false)
  const [editData, setEditData] = useState<Partial<ClientRecord & { area_tags: string[] }>>({})

  // New contact form
  const [showNewContact, setShowNewContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '' })
  const [contactSaving, setContactSaving] = useState(false)

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.clients.list()
      setClients(data)
    } catch {}
    setLoading(false)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const data = await window.api.clients.get(id)
      setDetail(data)
    } catch {}
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    loadClients()
    window.api.areas.list().then(setAreas).catch(() => {})
  }, [loadClients])

  function handleSelectClient(c: ClientRecord) {
    setSelectedClient(c)
    setActiveTab('overview')
    setEditingClient(false)
    setShowNewContact(false)
    setNewContact({ name: '', role: '', email: '', phone: '' })
    loadDetail(c.id)
  }

  // Filter clients
  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.country ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = !filterType || c.type === filterType
    return matchSearch && matchType
  })

  // Create client
  async function handleCreateClient() {
    if (!newClient.name.trim()) return
    setSaving(true)
    setFormMsg(null)
    try {
      const result = await window.api.clients.create({
        name: newClient.name.trim(),
        type: newClient.type,
        status: newClient.status,
        country: newClient.country || null,
        region: newClient.region || null,
        notes: newClient.notes || null,
        area_tags_json: JSON.stringify(newClient.area_tags),
      })
      if (result.id) {
        setFormMsg({ type: 'ok', text: 'Client created.' })
        setNewClient({ name: '', type: 'Private', status: 'Active', country: '', region: '', notes: '', area_tags: [] })
        setShowNewClient(false)
        await loadClients()
      }
    } catch {
      setFormMsg({ type: 'err', text: 'Failed to create client.' })
    }
    setSaving(false)
    setTimeout(() => setFormMsg(null), 3000)
  }

  // Update client
  async function handleUpdateClient() {
    if (!selectedClient) return
    setSaving(true)
    try {
      await window.api.clients.update(selectedClient.id, {
        ...editData,
        area_tags_json: JSON.stringify(editData.area_tags ?? []),
      })
      setEditingClient(false)
      await loadClients()
      await loadDetail(selectedClient.id)
      // Update selected client in state
      const updated = await window.api.clients.get(selectedClient.id)
      setSelectedClient(updated.client)
      setDetail(updated)
    } catch {}
    setSaving(false)
  }

  // Delete client
  async function handleDeleteClient(id: string) {
    if (!confirm('Delete this client? This cannot be undone.')) return
    await window.api.clients.delete(id)
    setSelectedClient(null)
    setDetail(null)
    await loadClients()
  }

  // Add contact
  async function handleAddContact() {
    if (!selectedClient || !newContact.name.trim()) return
    setContactSaving(true)
    try {
      await window.api.clients.addContact(selectedClient.id, {
        name: newContact.name.trim(),
        role: newContact.role || null,
        email: newContact.email || null,
        phone: newContact.phone || null,
      })
      setNewContact({ name: '', role: '', email: '', phone: '' })
      setShowNewContact(false)
      await loadDetail(selectedClient.id)
    } catch {}
    setContactSaving(false)
  }

  // Delete contact
  async function handleDeleteContact(contactId: string) {
    if (!confirm('Remove this contact?')) return
    await window.api.clients.deleteContact(contactId)
    if (selectedClient) await loadDetail(selectedClient.id)
  }

  function startEdit() {
    if (!detail) return
    const tags = (() => { try { return JSON.parse(detail.client.area_tags_json) } catch { return [] } })()
    setEditData({
      name: detail.client.name,
      type: detail.client.type,
      status: detail.client.status,
      country: detail.client.country ?? '',
      region: detail.client.region ?? '',
      notes: detail.client.notes ?? '',
      area_tags: tags,
    })
    setEditingClient(true)
  }

  const inputCls = 'titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40'
  const selectCls = 'titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40'

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: client list ─────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-white/[0.08] bg-white dark:bg-black/10 overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900 dark:text-white">Clients</h1>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/65 text-[10px] font-semibold">
                {clients.length}
              </span>
            </div>
            {isRoot && (
              <button
                onClick={() => setShowNewClient(v => !v)}
                className="titlebar-no-drag flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                New client
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/50" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="titlebar-no-drag w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30"
            />
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap gap-1">
            {['', ...CLIENT_TYPES].map(t => (
              <button
                key={t || 'all'}
                onClick={() => setFilterType(t)}
                className={`titlebar-no-drag px-2 py-0.5 rounded-full text-[10px] font-semibold transition ${
                  filterType === t
                    ? 'bg-hub-gold text-white'
                    : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 hover:bg-gray-200 dark:hover:bg-white/[0.10]'
                }`}
              >
                {t || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* New client form */}
        {showNewClient && isRoot && (
          <div className="px-4 py-4 border-b border-gray-100 dark:border-white/[0.06] space-y-2.5 bg-gray-50 dark:bg-white/[0.02]">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest">New Client</p>
            <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} placeholder="Client name *" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select value={newClient.type} onChange={e => setNewClient(p => ({ ...p, type: e.target.value }))} className={selectCls}>
                {CLIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={newClient.status} onChange={e => setNewClient(p => ({ ...p, status: e.target.value }))} className={selectCls}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={newClient.country} onChange={e => setNewClient(p => ({ ...p, country: e.target.value }))} placeholder="Country" className={inputCls} />
              <input value={newClient.region} onChange={e => setNewClient(p => ({ ...p, region: e.target.value }))} placeholder="Region" className={inputCls} />
            </div>
            <textarea value={newClient.notes} onChange={e => setNewClient(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" rows={2}
              className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40 resize-none"
            />
            {areas.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 dark:text-white/65 mb-1.5">Area tags</p>
                <div className="flex flex-wrap gap-1">
                  {areas.map(a => {
                    const sel = newClient.area_tags.includes(a.id)
                    return (
                      <button
                        key={a.id}
                        onClick={() => setNewClient(p => ({ ...p, area_tags: sel ? p.area_tags.filter(x => x !== a.id) : [...p.area_tags, a.id] }))}
                        className={`titlebar-no-drag px-2 py-0.5 rounded-full text-[10px] font-medium border transition ${sel ? 'text-white' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 border-gray-200 dark:border-white/[0.08]'}`}
                        style={sel ? { backgroundColor: a.color, borderColor: a.color } : {}}
                      >
                        {a.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {formMsg && <p className={`text-xs ${formMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{formMsg.text}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreateClient} disabled={saving || !newClient.name.trim()}
                className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">
                {saving ? 'Saving…' : 'Create client'}
              </button>
              <button onClick={() => { setShowNewClient(false); setFormMsg(null) }}
                className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Client list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-white/50">
              <p className="text-sm">No clients found</p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className={`titlebar-no-drag w-full text-left px-3 py-2.5 rounded-xl transition ${
                    selectedClient?.id === c.id
                      ? 'bg-hub-gold/10 dark:bg-hub-gold/[0.12]'
                      : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={`text-sm font-semibold truncate ${selectedClient?.id === c.id ? 'text-hub-gold' : 'text-gray-900 dark:text-white'}`}>
                      {c.name}
                    </p>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeBadge type={c.type} />
                    {(c.country || c.region) && (
                      <span className="text-[10px] text-gray-400 dark:text-white/65 truncate">
                        {[c.region, c.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: detail ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0f1623]">
        {!selectedClient ? (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-white/50">
            <svg width="48" height="48" viewBox="0 0 15 15" fill="none" className="mb-3 opacity-30">
              <rect x="2" y="4" width="11" height="10" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5 14V9h5v5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M4 1.5h7l1 2.5H3L4 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            <p className="text-sm font-medium">Select a client</p>
            <p className="text-xs mt-1">Choose a client from the list to view details</p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-8 h-8 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
          </div>
        ) : detail ? (
          <>
            {/* Detail header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] flex items-start justify-between shrink-0">
              <div>
                {editingClient ? (
                  <input
                    value={editData.name ?? ''}
                    onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                    className="titlebar-no-drag text-xl font-bold bg-transparent border-b border-hub-gold/40 text-gray-900 dark:text-white focus:outline-none pb-0.5 mb-2 w-full max-w-xs"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{detail.client.name}</h2>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <TypeBadge type={editingClient ? (editData.type ?? detail.client.type) : detail.client.type} />
                  <StatusBadge status={editingClient ? (editData.status ?? detail.client.status) : detail.client.status} />
                </div>
              </div>
              {isRoot && (
                <div className="flex items-center gap-2 shrink-0 mt-1">
                  {editingClient ? (
                    <>
                      <button onClick={handleUpdateClient} disabled={saving}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingClient(false)}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={startEdit}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-600 dark:text-white/75 hover:text-gray-900 dark:hover:text-white text-xs font-medium transition">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteClient(detail.client.id)}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-400 text-xs font-medium transition">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-gray-200 dark:border-white/[0.08] flex gap-1 shrink-0">
              {(['overview', 'contacts', 'tasks'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`titlebar-no-drag px-3 py-2.5 text-xs font-semibold capitalize border-b-2 transition ${
                    activeTab === tab
                      ? 'border-hub-gold text-hub-gold'
                      : 'border-transparent text-gray-400 dark:text-white/65 hover:text-gray-600 dark:hover:text-white/70'
                  }`}
                >
                  {tab === 'tasks' ? `Linked Tasks${detail.tasks.length ? ` (${detail.tasks.length})` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'contacts' && detail.contacts.length > 0 ? ` (${detail.contacts.length})` : ''}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ── Overview tab ────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-5 max-w-xl">
                  {editingClient ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1">Type</p>
                          <select value={editData.type ?? ''} onChange={e => setEditData(p => ({ ...p, type: e.target.value }))} className={selectCls}>
                            {CLIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1">Status</p>
                          <select value={editData.status ?? ''} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))} className={selectCls}>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1">Country</p>
                          <input value={editData.country ?? ''} onChange={e => setEditData(p => ({ ...p, country: e.target.value }))} placeholder="Country" className={inputCls} />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1">Region</p>
                          <input value={editData.region ?? ''} onChange={e => setEditData(p => ({ ...p, region: e.target.value }))} placeholder="Region" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1">Notes</p>
                        <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} rows={3}
                          className="titlebar-no-drag w-full px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40 resize-none"
                        />
                      </div>
                      {areas.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1.5">Area Tags</p>
                          <div className="flex flex-wrap gap-1.5">
                            {areas.map(a => {
                              const sel = (editData.area_tags ?? []).includes(a.id)
                              return (
                                <button
                                  key={a.id}
                                  onClick={() => setEditData(p => ({ ...p, area_tags: sel ? (p.area_tags ?? []).filter(x => x !== a.id) : [...(p.area_tags ?? []), a.id] }))}
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
                    </div>
                  ) : (
                    <>
                      {/* Location */}
                      {(detail.client.country || detail.client.region) && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1.5">Location</p>
                          <p className="text-sm text-gray-700 dark:text-white/80">{[detail.client.region, detail.client.country].filter(Boolean).join(', ')}</p>
                        </div>
                      )}

                      {/* Notes */}
                      {detail.client.notes && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1.5">Notes</p>
                          <p className="text-sm text-gray-700 dark:text-white/80 leading-relaxed whitespace-pre-wrap">{detail.client.notes}</p>
                        </div>
                      )}

                      {/* Area tags */}
                      {(() => {
                        let tags: string[] = []
                        try { tags = JSON.parse(detail.client.area_tags_json) } catch {}
                        const tagAreas = tags.map(id => areas.find(a => a.id === id)).filter(Boolean) as Area[]
                        if (tagAreas.length === 0) return null
                        return (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1.5">Area Tags</p>
                            <div className="flex flex-wrap gap-1.5">
                              {tagAreas.map(a => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                                  style={{ color: a.color, borderColor: a.color + '40', backgroundColor: a.color + '18' }}
                                >
                                  {a.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Primary contact */}
                      {detail.client.primary_contact_name && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/65 uppercase tracking-widest mb-1.5">Primary Contact</p>
                          <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{detail.client.primary_contact_name}</p>
                            {detail.client.primary_contact_email && (
                              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{detail.client.primary_contact_email}</p>
                            )}
                            {detail.client.primary_contact_phone && (
                              <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{detail.client.primary_contact_phone}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Contacts tab ─────────────────────────────────────────── */}
              {activeTab === 'contacts' && (
                <div className="max-w-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-white/65">
                      {detail.contacts.length} contact{detail.contacts.length !== 1 ? 's' : ''}
                    </p>
                    {isRoot && (
                      <button
                        onClick={() => setShowNewContact(v => !v)}
                        className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        Add contact
                      </button>
                    )}
                  </div>

                  {showNewContact && isRoot && (
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] space-y-2.5">
                      <input value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className={inputCls} />
                      <input value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))} placeholder="Role / Title" className={inputCls} />
                      <input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="Email" type="email" className={inputCls} />
                      <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={inputCls} />
                      <div className="flex gap-2">
                        <button onClick={handleAddContact} disabled={contactSaving || !newContact.name.trim()}
                          className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">
                          {contactSaving ? 'Saving…' : 'Add contact'}
                        </button>
                        <button onClick={() => { setShowNewContact(false); setNewContact({ name: '', role: '', email: '', phone: '' }) }}
                          className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {detail.contacts.length === 0 && !showNewContact && (
                    <p className="text-sm text-gray-400 dark:text-white/50 italic py-4 text-center">No contacts yet.</p>
                  )}

                  <div className="space-y-2">
                    {detail.contacts.map(c => (
                      <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] group">
                        <div className="w-8 h-8 rounded-full bg-hub-gold/15 border border-hub-gold/25 flex items-center justify-center shrink-0">
                          <span className="text-hub-gold text-[10px] font-bold">{c.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{c.name}</p>
                          {c.role && <p className="text-xs text-gray-500 dark:text-white/65">{c.role}</p>}
                          {c.email && <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">{c.email}</p>}
                          {c.phone && <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">{c.phone}</p>}
                        </div>
                        {isRoot && (
                          <button
                            onClick={() => handleDeleteContact(c.id)}
                            className="titlebar-no-drag shrink-0 p-1 rounded text-gray-300 dark:text-white/50 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 2.5h7M3.5 2.5V1.5h3v1M4 4.5v3M6 4.5v3M2.5 2.5l.5 6h4l.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tasks tab ─────────────────────────────────────────────── */}
              {activeTab === 'tasks' && (
                <div className="max-w-xl">
                  {detail.tasks.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-white/50 italic py-4 text-center">No tasks linked to this client.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.tasks.map(t => (
                        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] ?? 'bg-gray-400'}`} title={t.priority} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-white/85 truncate">{t.title}</p>
                            <p className="text-[10px] text-gray-400 dark:text-white/65 mt-0.5">
                              {STAGE_NAMES[t.column_id] ?? t.column_id}
                              {t.due_date ? ` · Due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
