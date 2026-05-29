import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  pageId: string
  canApprove: boolean
  localUser: { id: string; name: string } | null
}

const SECTIONS = ['Incident Feed', 'Platforms & Capabilities', 'Investment & Procurement', 'Finance Nexus', 'Source Archive', 'Statistics', 'Other']
const PRIORITIES = ['high', 'medium', 'low']

const STATUS_STYLES: Record<string, string> = {
  draft:         'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-white/60',
  committed:     'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  approved:      'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  pending_admin: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
  implemented:   'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  rejected:      'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
}

const PRIORITY_STYLES: Record<string, string> = {
  high:   'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  low:    'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-white/50',
}

export default function IdeasTab({ pageId, canApprove, localUser }: Props) {
  const [items, setItems] = useState<InfoPageItem[]>([])
  const [notes, setNotes] = useState('')
  const [notesItemId, setNotesItemId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSection, setNewSection] = useState(SECTIONS[0])
  const [newPriority, setNewPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const all = await window.api.infoPages.getItems(pageId, 'ideas')
      const notesItem = all.find(i => i.sub_type === 'notes')
      const ideaItems = all.filter(i => i.sub_type !== 'notes')
      setItems(ideaItems)
      if (notesItem) {
        const c = JSON.parse(notesItem.content_json || '{}')
        setNotes(c.text || '')
        setNotesItemId(notesItem.id)
      }
    } catch {}
  }, [pageId])

  useEffect(() => { load() }, [load])

  // Debounced notes save
  function handleNotesChange(val: string) {
    setNotes(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        if (notesItemId) {
          await window.api.infoPages.updateItem(notesItemId, { content_json: JSON.stringify({ text: val }) })
        } else {
          const res = await window.api.infoPages.addItem({
            page_id: pageId,
            tab: 'ideas',
            sub_type: 'notes',
            content_json: JSON.stringify({ text: val }),
            created_by_id: localUser?.id,
            created_by_name: localUser?.name,
          })
          setNotesItemId(res.id)
        }
      } catch {}
    }, 800)
  }

  async function handleAddIdea() {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      await window.api.infoPages.addItem({
        page_id: pageId,
        tab: 'ideas',
        sub_type: 'idea',
        title: newTitle.trim(),
        content_json: JSON.stringify({ description: newDescription.trim() }),
        priority: newPriority,
        proposed_section: newSection,
        created_by_id: localUser?.id,
        created_by_name: localUser?.name,
      })
      setNewTitle('')
      setNewDescription('')
      setNewSection(SECTIONS[0])
      setNewPriority('medium')
      setShowAddForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await window.api.infoPages.deleteItem(id)
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
    await load()
  }

  async function handleCommitSelected() {
    if (!selected.size || !localUser) return
    await window.api.infoPages.commitItems({
      pageId,
      itemIds: Array.from(selected),
      submittedById: localUser.id,
      submittedByName: localUser.name,
    })
    setSelected(new Set())
    await load()
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const draftItems = items.filter(i => i.status === 'draft' || i.status === 'rejected')
  const committedItems = items.filter(i => !['draft','rejected'].includes(i.status))

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Planning notes</label>
        <textarea
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Use this space for research notes, planning, brainstorming..."
          rows={3}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      </div>

      {/* Add idea button */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70">Ideas ({draftItems.length})</h4>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Add idea
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-3 border border-gray-200 dark:border-white/[0.08] space-y-2">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Idea title *"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <textarea
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <div className="flex gap-2">
            <select value={newSection} onChange={e => setNewSection(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-white focus:outline-none">
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-white focus:outline-none">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddForm(false)} className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">Cancel</button>
            <button onClick={handleAddIdea} disabled={!newTitle.trim() || saving}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50">
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Draft ideas list */}
      <div className="space-y-2">
        {draftItems.map(item => {
          const c = (() => { try { return JSON.parse(item.content_json || '{}') } catch { return {} } })()
          return (
            <div key={item.id} className={`flex items-start gap-2 p-3 rounded-xl border transition ${selected.has(item.id) ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5' : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]'}`}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500/30 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{item.title}</p>
                  {item.proposed_section && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">{item.proposed_section}</span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium}`}>{item.priority}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[item.status] || STATUS_STYLES.draft}`}>{item.status}</span>
                </div>
                {c.description && <p className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5">{c.description}</p>}
              </div>
              <button onClick={() => handleDelete(item.id)} className="text-gray-300 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 transition">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            </div>
          )
        })}
        {draftItems.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-white/25 text-center py-4">No ideas yet. Add one above.</p>
        )}
      </div>

      {/* Committed items */}
      {committedItems.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70">In progress ({committedItems.length})</h4>
          <div className="space-y-2">
            {committedItems.map(item => {
              const c = (() => { try { return JSON.parse(item.content_json || '{}') } catch { return {} } })()
              return (
                <div key={item.id} className="flex items-start gap-2 p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] opacity-75">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{item.title}</p>
                      {item.proposed_section && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium">{item.proposed_section}</span>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[item.status] || STATUS_STYLES.draft}`}>{item.status}</span>
                    </div>
                    {c.description && <p className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5">{c.description}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Commit button */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-white/[0.08] pt-3 -mx-4 px-4 pb-1">
          <button
            onClick={handleCommitSelected}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-500 hover:bg-purple-600 text-white transition"
          >
            Commit {selected.size} selected for review
          </button>
        </div>
      )}
    </div>
  )
}
