import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useConnection } from '../../contexts/ConnectionContext'
import RichTextEditor from '../../components/RichTextEditor'
import TagPicker from './TagPicker'

const PLATFORMS = ['X / Twitter', 'Telegram', 'LinkedIn', 'Facebook', 'Instagram', 'Other']

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  'X / Twitter': (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 1.5h2.8l2.7 4L9.5 1.5H12L8 7l4 4.5H9.2L6.5 7.8 3.5 11.5H1l4.2-5L1 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  ),
  'Telegram': (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3 6.5l2 1.5 4-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  'LinkedIn': (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M4 5.5V9M4 3.5v.5M6 9V7c0-1 .5-1.5 1.5-1.5S9 6 9 7v2M6 5.5V9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  ),
}

const ALL_CATEGORIES = [
  'Incident', 'Investment & Procurement', 'Innovation & Technology',
  'Policy & Regulation', 'Criminal & VNSA Activity', 'Counter-drone / C-UAS',
  'State Military Activity', 'Finance & Sanctions', 'Extra-regional Supplier',
]

const CONFIDENCE_COLORS = {
  high:   { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400',   dot: 'bg-green-500' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400',   dot: 'bg-amber-500' },
  low:    { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500' },
}

const STATUS_COLORS: Record<string, string> = {
  unreviewed: 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
  approved:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  rejected:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  saved:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  pushed:     'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
}

// Selected project, threaded from the Intelligence container (Slice 1/2b).
type ProjectInfo = { id: string; name: string; keywords?: string } | null

interface Props {
  onApprove: (addedToPages?: string[]) => void
  project?: ProjectInfo
}

const EMPTY_FORM = {
  platform: 'X / Twitter',
  handle: '',
  post_date: new Date().toISOString().slice(0, 10),
  content: '',
  location_mentioned: '',
  actors_mentioned: '',
  url: '',
  confidence: 'low' as 'high' | 'medium' | 'low',
  categories: [] as string[],
}

// Map fetcher platform label → the existing Platform dropdown values.
function mapPlatform(p?: string): string {
  if (!p) return 'Other'
  const v = p.toLowerCase()
  if (v === 'x' || v.includes('twitter')) return 'X / Twitter'
  if (v === 'telegram') return 'Telegram'
  if (v === 'linkedin') return 'LinkedIn'
  if (v === 'facebook') return 'Facebook'
  if (v === 'instagram') return 'Instagram'
  return 'Other'
}

// ISO/date string → yyyy-mm-dd for <input type="date">, or undefined if unparseable.
function toDateInput(s?: string): string | undefined {
  if (!s) return undefined
  const d = new Date(s)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}

// T3: parse a thematic_tags JSON array safely (mirrors NewsTab's readTags).
function readTags(raw: string | null): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

export default function SocialTab({ onApprove, project = null }: Props) {
  const { localUser, isRoot, can } = useAuth()
  const { online } = useConnection()
  const [posts, setPosts] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Form-level save error (distinct from `errors`, which is per-FIELD validation).
  // The save path must never clear the form on a failed write — see handleSubmit.
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})
  const [fadingIds] = useState<Set<string>>(new Set())
  // URL-paste autofill (Social-a fetcher).
  const [urlInput, setUrlInput] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchNote, setFetchNote] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)
  // 3d: the info-page projects (for the per-item project picker + Send target).
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  // T3: the selected project's thematic tag vocabulary (project-scoped, from T1).
  const [knownThematic, setKnownThematic] = useState<string[]>([])
  const handleRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (opts?: { background?: boolean }) => {
    // Background refetch (realtime echo / reconnect): swap the data under the
    // existing stable keys WITHOUT flipping `loading`, so the card list stays
    // mounted and scroll is preserved. Only the initial/foreground load spins.
    const background = opts?.background ?? false
    if (!background) setLoading(true)
    try {
      const data = await window.api.intelligence.getSources({ type: 'social' })
      // 3d: sent items (status='routed') live in the pipeline now — drop from compose.
      setPosts(data.filter((d: any) => d.status !== 'routed'))
    } catch { /* ignore */ }
    if (!background) setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 3d: load the info-page projects once for the picker/Send target.
  useEffect(() => {
    (async () => {
      try {
        const boards = await window.api.infoPages.list()
        setProjects((boards as Array<{ id: string; name: string }>).map(b => ({ id: b.id, name: b.name })))
      } catch (e) { console.warn('[SocialTab] projects load failed:', e) }
    })()
  }, [])

  // T3: load the selected project's thematic tag vocabulary; reload on project change.
  useEffect(() => {
    const boardId = project?.id
    if (!boardId) { setKnownThematic([]); return }
    window.api.intelligence.getKnownTags('thematic', boardId)
      .then(setKnownThematic).catch(() => setKnownThematic([]))
  }, [project?.id])

  // Realtime: re-fetch this project's tag vocabulary when known_tags changes in cloud.
  useEffect(() => {
    const boardId = project?.id
    window.api.intelligence.onTagsInvalidate((d) => {
      if (!boardId) return
      if (d.boardId && d.boardId !== boardId) return
      window.api.intelligence.getKnownTags('thematic', boardId).then(setKnownThematic).catch(() => {})
    })
    return () => window.api.intelligence.removeTagsInvalidateListeners()
  }, [project?.id])

  // Realtime: re-fetch the social list when intelligence_sources changes in cloud.
  useEffect(() => {
    window.api.intelligence.onSourcesInvalidate(() => { load({ background: true }) })
    return () => window.api.intelligence.removeSourcesInvalidateListeners()
  }, [load])

  // Reconnect: on offline→online, refetch — postgres_changes never replays the
  // outage window. prevOnlineRef avoids a double-load on mount.
  const prevOnlineRef = useRef(online)
  useEffect(() => {
    const wasOnline = prevOnlineRef.current
    prevOnlineRef.current = online
    if (!online || wasOnline) return
    load({ background: true })
  }, [online, load])

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }))
  }

  // Paste a URL → try the metadata fetcher. ok → autofill the (editable) fields;
  // not-ok → a NORMAL fallback: message + focus the manual form. Never crashes.
  async function handleReadLink() {
    const u = urlInput.trim()
    if (!u) return
    setFetching(true)
    setFetchNote(null)
    try {
      const res = await window.api.intelligence.fetchUrlMetadata(u)
      if (res.ok) {
        const m = res.metadata
        setForm(f => ({
          ...f,
          platform: mapPlatform(m.platform),
          handle: m.author || m.site_name || f.handle,
          content: m.description || m.title || f.content,
          url: m.url || u,
          post_date: toDateInput(m.published) || f.post_date,
        }))
        setFetchNote({ type: 'ok', text: 'Filled from link ✓ — review and edit the fields below.' })
      } else {
        const msg = res.reason === 'invalid_url'
          ? "That's not a valid URL."
          : "Couldn't read this link — fill in the details below."
        setFetchNote({ type: 'warn', text: msg })
        setForm(f => ({ ...f, url: u }))         // keep what they pasted
        setTimeout(() => handleRef.current?.focus(), 0)
      }
    } catch {
      setFetchNote({ type: 'warn', text: "Couldn't read this link — fill in the details below." })
    } finally {
      setFetching(false)
    }
  }

  async function handleSubmit() {
    const errs: Record<string, string> = {}
    if (!form.handle.trim()) errs.handle = 'Handle is required'
    if (!form.content.trim()) errs.content = 'Post content is required'
    if (!form.post_date) errs.post_date = 'Date is required'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setFormError(null)

    setSaving(true)
    try {
      const res = await window.api.intelligence.addSocial({
        platform: form.platform,
        handle: form.handle.trim(),
        post_date: form.post_date,
        content: form.content.trim(),
        location_mentioned: form.location_mentioned.trim() || undefined,
        actors_mentioned: form.actors_mentioned.trim() || undefined,
        url: form.url.trim() || undefined,
        categories_json: JSON.stringify(form.categories),
        confidence: form.confidence,
        added_by_id: localUser?.id,
        added_by_name: localUser?.name,
        // 0a-1: the source is born with its project (Save is disabled when none is
        // selected). Replaces the former non-atomic follow-up setProject write.
        project_board_id: project?.id,
      })
      // GATE THE RESET ON THE WRITE RESULT. addSocial returns {ok,id,error?} and never
      // throws, so the failure signal is always available here. Returning BEFORE the
      // form-clear is the whole point: on a failed save the user's typed content STAYS.
      if (!res.ok) { setFormError('Could not save the post.'); return }
      setForm({ ...EMPTY_FORM })
      setErrors({})
      setUrlInput('')
      setFetchNote(null)
      await load()
    } catch (e) {
      setFormError((e as Error)?.message || 'Could not save the post.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(id: string, status: string) {
    if (!online) return   // read-only offline (Save)
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      const res = await window.api.intelligence.updateStatus(id, status, undefined, localUser?.id, localUser?.name)
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: status as any } : p))
      if (status === 'approved') onApprove(res?.addedToPages)
      else onApprove()
    } finally {
      setPendingStatus(p => ({ ...p, [id]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this post?')) return
    await window.api.intelligence.deleteSource(id)
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  // 3d: persist the reliable board-id project association (picker change).
  const handleProjectSelect = async (id: string, boardId: string) => {
    await window.api.intelligence.setProject(id, boardId || null)
    setPosts(prev => prev.map(p => p.id === id ? { ...p, project_board_id: boardId || null } : p))
  }

  // 3d: Send to New sources — route into the selected project's pipeline (stage='new')
  // and drop the item from the compose list (status='routed').
  const handleSend = async (id: string, boardId: string) => {
    if (!online) return   // read-only offline (Send to New sources)
    const res = await window.api.intelligence.routeToProject(id, boardId)
    if (res?.ok) {
      setPosts(prev => prev.filter(p => p.id !== id))
      onApprove(res.pageName ? [res.pageName] : [])
    } else if (res?.error) {
      console.warn('[3d] send failed:', res.error)
    }
  }

  // T3: project-scoped topic tags on the compose item (mirrors NewsTab).
  const handleSetTags = async (id: string, tags: string[]) => {
    try {
      const res = await window.api.intelligence.setArticleTags(id, 'thematic', tags)
      const final = res?.tags ?? tags
      setPosts(prev => prev.map(p => p.id === id ? { ...p, thematic_tags: JSON.stringify(final) } : p))
    } catch (e) { console.warn('[SocialTab] setArticleTags failed:', e) }
  }
  const handleCreateTag = async (id: string, current: string[], name: string, boardId: string) => {
    if (!boardId) return
    try {
      const res = await window.api.intelligence.createTag(name, 'thematic', boardId)
      if (!res?.ok || !res.name) {
        console.warn('[SocialTab] createTag failed:', res?.error)
        window.api.intelligence.getKnownTags('thematic', boardId).then(setKnownThematic).catch(() => {})
        return
      }
      setKnownThematic(prev => prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b)))
      if (!current.includes(res.name)) await handleSetTags(id, [...current, res.name])
    } catch (e) { console.warn('[SocialTab] createTag failed:', e) }
  }
  const handleDeleteTag = async (name: string, boardId: string) => {
    if (!boardId) return
    if (!confirm(`Delete tag "${name}" from this project's registry?`)) return
    try {
      const res = await window.api.intelligence.deleteTag(name, 'thematic', boardId)
      if (!res?.ok) {
        console.warn('[SocialTab] deleteTag failed:', res?.error)
        window.api.intelligence.getKnownTags('thematic', boardId).then(setKnownThematic).catch(() => {})
        alert(res?.error || 'Could not delete the tag.')
        return
      }
      setKnownThematic(prev => prev.filter(t => t !== name))
    } catch (e) { console.warn('[SocialTab] deleteTag failed:', e) }
  }

  // Patch one post in local state so notes/AI results re-render in place.
  const patchDoc = useCallback((id: string, patch: Partial<IntelligenceSource>) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }, [])

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  // T5: project-scoped view — mirror NewsTab. When a project is selected (project not
  // null / "All"), show only that project's items; changing a card's project (which
  // patches project_board_id in state) makes it drop out here with no refetch.
  const projectScoped = !!project?.id
  const visible = posts.filter(p => !projectScoped || p.project_board_id === project?.id)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Add form */}
        <div className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Social Media Post</h3>

          {/* URL paste — convenience autofill on top of the manual form (not a gate) */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Paste a post URL (optional)</label>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleReadLink() } }}
                placeholder="https://…  — we'll try to auto-fill the fields"
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                onClick={handleReadLink}
                disabled={fetching || !urlInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50 shrink-0"
              >
                {fetching ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reading…</>
                ) : (
                  <>✦ Read link</>
                )}
              </button>
            </div>
            {fetchNote && (
              <p className={`text-xs mt-1 ${fetchNote.type === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {fetchNote.text}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Platform */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                {PLATFORMS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            {/* Handle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Handle / Account *</label>
              <input
                ref={handleRef}
                value={form.handle}
                onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
                placeholder="@username or channel name"
                className={`w-full px-3 py-1.5 rounded-lg border text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${errors.handle ? 'border-red-400' : 'border-gray-200 dark:border-white/[0.1]'}`}
              />
              {errors.handle && <p className="text-xs text-red-500 mt-0.5">{errors.handle}</p>}
            </div>
            {/* Post date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Post Date *</label>
              <input
                type="date"
                value={form.post_date}
                onChange={e => setForm(f => ({ ...f, post_date: e.target.value }))}
                className={`w-full px-3 py-1.5 rounded-lg border text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${errors.post_date ? 'border-red-400' : 'border-gray-200 dark:border-white/[0.1]'}`}
              />
            </div>
            {/* Confidence */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Confidence</label>
              <select
                value={form.confidence}
                onChange={e => setForm(f => ({ ...f, confidence: e.target.value as any }))}
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-transparent text-sm text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            {/* URL + View original */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-white/50">URL (optional)</label>
                {form.url.trim() && (
                  <button
                    type="button"
                    onClick={() => window.open(form.url.trim(), '_blank')}
                    title="Open the original post in your browser"
                    className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View original ↗
                  </button>
                )}
              </div>
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            {/* Location */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Location mentioned</label>
              <input
                value={form.location_mentioned}
                onChange={e => setForm(f => ({ ...f, location_mentioned: e.target.value }))}
                placeholder="e.g. Bogotá, Colombia"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none"
              />
            </div>
            {/* Actors */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Actors mentioned</label>
              <input
                value={form.actors_mentioned}
                onChange={e => setForm(f => ({ ...f, actors_mentioned: e.target.value }))}
                placeholder="e.g. ELN, FARC-EP"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none"
              />
            </div>
            {/* Content */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">Post content *</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Paste the post text here..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg border text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${errors.content ? 'border-red-400' : 'border-gray-200 dark:border-white/[0.1]'}`}
              />
              {errors.content && <p className="text-xs text-red-500 mt-0.5">{errors.content}</p>}
            </div>
            {/* Categories */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5">Categories</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                      form.categories.includes(cat)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/[0.1]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-gray-400 dark:text-white/30">
              {!project?.id ? 'Select a project above to add sources.' : "Add the post, then describe what's happening and analyze it on its card below."}
            </p>
            {formError && <span className="text-xs text-red-500 dark:text-red-400 ml-3">{formError}</span>}
            <button
              onClick={handleSubmit}
              disabled={saving || !project?.id}
              className="px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Post'}
            </button>
          </div>
        </div>

        {/* Posts list */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-white/40">No social media posts yet</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Add posts using the form above</p>
          </div>
        )}

        {!loading && visible.map(post => {
          const conf = post.confidence || 'low'
          const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low
          const cats: string[] = (() => { try { return JSON.parse(post.categories_json || '[]') } catch { return [] } })()
          const PlatformIcon = PLATFORM_ICONS[post.platform || '']
          const isPending = pendingStatus[post.id]
          // 3d: picker default — the post's project, else the top-dropdown selected project.
          const projectBoardSel = post.project_board_id || (project?.id ?? '')
          // T3: this item's topic tags (project-scoped write target = projectBoardSel).
          const themaTags = readTags(post.thematic_tags)
          const isFading = fadingIds.has(post.id)
          return (
            <div key={post.id} className={`bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4 transition-all duration-300 ${isFading ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
                  {PlatformIcon || <span className="text-[10px] font-bold">{(post.platform || 'S')[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{post.handle}</span>
                    <span className="text-xs text-gray-400 dark:text-white/30">{post.platform}</span>
                    <span className="text-xs text-gray-400 dark:text-white/30">{formatDate(post.published_at)}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${confStyle.bg} ${confStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`} />
                      {conf}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${STATUS_COLORS[post.status] || STATUS_COLORS.unreviewed}`}>
                      {post.status}
                    </span>
                  </div>
                </div>
                {post.url && (
                  <button
                    onClick={() => window.open(post.url!, '_blank')}
                    title="View original post"
                    className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                  >
                    View original ↗
                  </button>
                )}
                {(can('delete_intel_social') || isRoot) && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                    title="Delete post"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>

              <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap line-clamp-4">{post.content}</p>

              {(post.location_mentioned || post.actors_mentioned) && (
                <div className="flex gap-3 mt-2">
                  {post.location_mentioned && (
                    <span className="text-xs text-gray-500 dark:text-white/40">
                      <span className="font-medium">Location:</span> {post.location_mentioned}
                    </span>
                  )}
                  {post.actors_mentioned && (
                    <span className="text-xs text-gray-500 dark:text-white/40">
                      <span className="font-medium">Actors:</span> {post.actors_mentioned}
                    </span>
                  )}
                </div>
              )}

              {cats.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cats.map(cat => (
                    <span key={cat} className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Human-first compose: describe → on-demand AI → editable reconcile */}
              <SocialCompose doc={post} project={project} onPatch={patchDoc} formatDate={formatDate} />

              {/* Status actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                <div className="flex-1" />
                {/* 3d: project picker (reliable board-id association) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Project</span>
                  {projects.length > 0 ? (
                    <select
                      value={projectBoardSel}
                      onChange={e => handleProjectSelect(post.id, e.target.value)}
                      className="px-2 py-0.5 rounded text-[11px] border border-gray-200 dark:border-white/[0.15] bg-white dark:bg-gray-900 text-gray-700 dark:text-white/80 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      {!projectBoardSel && <option value="">— select project —</option>}
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-[11px] text-gray-400 dark:text-white/30">Loading…</span>
                  )}
                </div>
                {/* T3: project-scoped topic tags */}
                {projectBoardSel ? (
                  <TagPicker
                    label="Topic"
                    value={themaTags}
                    known={knownThematic}
                    chipClass="bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300"
                    onAdd={tag => handleSetTags(post.id, [...themaTags, tag])}
                    onRemove={tag => handleSetTags(post.id, themaTags.filter(t => t !== tag))}
                    onCreate={name => handleCreateTag(post.id, themaTags, name, projectBoardSel)}
                    onDelete={((can('delete_intel_tag') || isRoot) && projectBoardSel) ? tag => handleDeleteTag(tag, projectBoardSel) : undefined}
                    isAdmin={can('delete_intel_tag') || isRoot}
                  />
                ) : (
                  <span className="text-[10px] text-gray-400 dark:text-white/30 italic">Select a project to tag</span>
                )}
                {post.status !== 'saved' && (
                  <button onClick={() => handleStatus(post.id, 'saved')} disabled={isPending || !online}
                    title={!online ? 'Unavailable while offline' : undefined}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50">Save</button>
                )}
                {/* 3d: Send to New sources — routes into the selected project's pipeline */}
                <button
                  onClick={() => handleSend(post.id, projectBoardSel)}
                  disabled={!projectBoardSel || !online}
                  title={!online ? 'Unavailable while offline' : projectBoardSel ? 'Route this post into the project’s New sources' : 'Select a project first'}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ➤ Send to New sources
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Social-b: the human-first compose area for one post — replicates the Documents
// (2b) / Interviews (2c) pattern. "Describe what's happening" is the PRIMARY layer,
// always present, saved to intel_notes. AI is on-demand only (→ analysis_json.ai);
// reconcile is an editable merged read (→ reconciled_notes). Every AI call is an
// explicit button. The relevance AI reads the post text + the researcher's take.
function SocialCompose({
  doc, project, onPatch, formatDate,
}: {
  doc: IntelligenceSource
  project: ProjectInfo
  onPatch: (id: string, patch: Partial<IntelligenceSource>) => void
  formatDate: (d: string | null) => string
}) {
  const [notes, setNotes] = useState<string>(doc.intel_notes || '')
  const [reconciledText, setReconciledText] = useState<string>(doc.reconciled_notes || '')
  const [analyzing, setAnalyzing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analysis = parseAnalysis(doc.analysis_json)
  const ai = analysis.ai as Record<string, any> | undefined
  const reconciledMeta = analysis.reconciled as Record<string, any> | undefined
  const hasAi = !!ai
  const plain = stripHtml(notes)
  const hasNotes = plain.length > 0
  const content = doc.content || ''
  // The relevance AI sees the post text plus the researcher's description.
  const analyzeInput = content + (plain ? `\n\nResearcher's take: ${plain}` : '')

  async function saveNotes() {
    if (notes === (doc.intel_notes || '')) return
    try {
      await window.api.intelligence.updateNotes(doc.id, notes)
      onPatch(doc.id, { intel_notes: notes || null })
    } catch { /* transient — next blur retries */ }
  }

  async function saveReconciledText() {
    if (reconciledText === (doc.reconciled_notes || '')) return
    try {
      await window.api.intelligence.updateReconciledNotes(doc.id, reconciledText)
      onPatch(doc.id, { reconciled_notes: reconciledText || null })
    } catch { /* transient — next blur retries */ }
  }

  async function analyze() {
    if (analyzing) return
    setAnalyzing(true)
    setError(null)
    try {
      const res = await window.api.intelligence.analyzeText({
        task: 'relevance',
        text: analyzeInput,
        projectConfig: project ? { name: project.name, keywords: project.keywords } : null,
      })
      if (!res.ok) { setError(res.error); return }
      const saved = await window.api.intelligence.saveAiAnalysis(doc.id, res.result)
      if (!saved.ok) { setError(saved.error); return }
      onPatch(doc.id, { analysis_json: withAnalysisKey(doc.analysis_json, 'ai', saved.ai) })
    } catch (e) {
      setError((e as Error)?.message || 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function reconcile() {
    if (!hasAi || !hasNotes || reconciling) return
    setReconciling(true)
    setError(null)
    try {
      if (notes !== (doc.intel_notes || '')) {
        await window.api.intelligence.updateNotes(doc.id, notes)
        onPatch(doc.id, { intel_notes: notes || null })
      }
      const res = await window.api.intelligence.analyzeText({
        task: 'reconcile',
        text: content,
        userNotes: plain,
        projectConfig: project ? { name: project.name, keywords: project.keywords } : null,
        priorAi: ai,
      })
      if (!res.ok) { setError(res.error); return }
      const savedMeta = await window.api.intelligence.saveReconciled(doc.id, res.result)
      if (!savedMeta.ok) { setError(savedMeta.error); return }
      const seeded = res.result.summary ? `<p>${escapeHtml(res.result.summary)}</p>` : (reconciledText || '')
      await window.api.intelligence.updateReconciledNotes(doc.id, seeded)
      setReconciledText(seeded)
      onPatch(doc.id, {
        analysis_json: withAnalysisKey(doc.analysis_json, 'reconciled', savedMeta.reconciled),
        reconciled_notes: seeded || null,
      })
    } catch (e) {
      setError((e as Error)?.message || 'Reconcile failed.')
    } finally {
      setReconciling(false)
    }
  }

  const showReconciledField = reconciledText.trim() !== '' || !!reconciledMeta

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06] space-y-4">
      {/* PRIMARY — describe what's happening */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wide">Primary</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">Describe what's happening (your take)</span>
          <span className="text-[10px] font-normal text-gray-300 dark:text-white/25">· optional</span>
        </div>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          onBlur={saveNotes}
          placeholder="What is this post, who's involved, why it matters for the project…"
          minHeight="80px"
        />
      </div>

      {/* AI — on-demand, separate box */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">AI analysis — suggestions</span>
          <button
            onClick={analyze}
            disabled={analyzing}
            title="Run the AI analysis on demand (project-aware). Nothing runs until you press this."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {analyzing ? (
              <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
            ) : (
              <>✦ {hasAi ? 'Re-analyze' : 'Analyze with AI'}</>
            )}
          </button>
        </div>
        {hasAi ? (
          <div className="p-3 rounded-lg bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 space-y-2 text-xs">
            {typeof ai!.relevance_score === 'number' && (
              <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 font-bold text-[10px]">relevance {ai!.relevance_score}/10</span>
            )}
            {ai!.summary && <p className="text-gray-700 dark:text-white/70">{ai!.summary}</p>}
            {ai!.relevance_reasoning && <p className="text-gray-500 dark:text-white/50 italic">{ai!.relevance_reasoning}</p>}
            {Array.isArray(ai!.suggested_tags) && ai!.suggested_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ai!.suggested_tags.map((t: string, i: number) => (
                  <span key={`${t}-${i}`} className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">{t}</span>
                ))}
              </div>
            )}
            {ai!.analyzed_at && <p className="text-[10px] text-indigo-500/60 dark:text-indigo-400/40">Analyzed {formatDate(ai!.analyzed_at)}</p>}
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-dashed border-gray-200 dark:border-white/10 text-[11px] text-gray-400 dark:text-white/30">
            Press <span className="font-medium">Analyze with AI</span> to generate analysis — nothing runs until you ask.
          </div>
        )}
      </div>

      {/* RECONCILE — editable merged read; appears once an AI read exists */}
      {hasAi && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Reconciled — editable before commit</span>
            <div className="flex items-center gap-2">
              {!hasNotes && <span className="text-[10px] text-gray-300 dark:text-white/25">add a description first</span>}
              <button
                onClick={reconcile}
                disabled={!hasNotes || reconciling}
                title={hasNotes ? 'Merge your description with the AI read into an editable version' : 'Add a description to enable reconcile'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {reconciling ? (
                  <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Reconciling…</>
                ) : (
                  <>⟲ Reconcile with my notes</>
                )}
              </button>
            </div>
          </div>
          {reconciledMeta && (
            <div className="flex items-center flex-wrap gap-1 mb-1.5">
              {typeof reconciledMeta.relevance_score === 'number' && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold text-[10px]">relevance {reconciledMeta.relevance_score}/10</span>
              )}
              {Array.isArray(reconciledMeta.suggested_tags) && reconciledMeta.suggested_tags.map((t: string, i: number) => (
                <span key={`${t}-${i}`} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-medium">{t}</span>
              ))}
              {reconciledMeta.reconciled_at && (
                <span className="text-[10px] text-amber-600/60 dark:text-amber-400/40 ml-1">Reconciled {formatDate(reconciledMeta.reconciled_at)}</span>
              )}
            </div>
          )}
          {showReconciledField ? (
            <RichTextEditor
              value={reconciledText}
              onChange={setReconciledText}
              onBlur={saveReconciledText}
              placeholder="The reconciled read — edit freely before commit…"
              minHeight="80px"
            />
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-white/30">Press <span className="font-medium">Reconcile with my notes</span> to generate an editable merged read.</p>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  )
}

// Parse analysis_json to an object (never throws; {} on missing/invalid).
function parseAnalysis(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

// Return analysis_json with one top-level key replaced, preserving the rest.
function withAnalysisKey(raw: string | null, key: string, block: unknown): string {
  const o = parseAnalysis(raw)
  o[key] = block
  return JSON.stringify(o)
}

// Strip TipTap HTML to plain text — for the reconcile userNotes payload + emptiness check.
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
