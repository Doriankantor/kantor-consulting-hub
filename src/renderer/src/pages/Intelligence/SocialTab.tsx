import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'

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

interface Props { onApprove: (addedToPages?: string[]) => void }

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

export default function SocialTab({ onApprove }: Props) {
  const { localUser, isAdmin } = useAuth()
  const [posts, setPosts] = useState<IntelligenceSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pendingStatus, setPendingStatus] = useState<Record<string, boolean>>({})
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.api.intelligence.getSources({ type: 'social' })
      setPosts(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }))
  }

  async function handleSubmit() {
    const errs: Record<string, string> = {}
    if (!form.handle.trim()) errs.handle = 'Handle is required'
    if (!form.content.trim()) errs.content = 'Post content is required'
    if (!form.post_date) errs.post_date = 'Date is required'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      await window.api.intelligence.addSocial({
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
      })
      setForm({ ...EMPTY_FORM })
      setErrors({})
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(id: string, status: string) {
    setPendingStatus(p => ({ ...p, [id]: true }))
    try {
      const res = await window.api.intelligence.updateStatus(id, status, undefined, localUser?.id, localUser?.name)
      // Update badge in-place — preserves scroll position
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: status as any } : p))
      // Social tab has no status filter, so no fade-out needed — badge just updates in place.
      // If a filter is ever added, add fade logic here similarly to NewsTab.
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

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
    catch { return dateStr }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Add form */}
        <div className="bg-white dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/[0.08] p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add Social Media Post</h3>
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
            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1">URL (optional)</label>
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
          <div className="flex justify-end mt-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
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

        {!loading && posts.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-white/40">No social media posts yet</p>
            <p className="text-xs text-gray-400 dark:text-white/25 mt-1">Add posts using the form above</p>
          </div>
        )}

        {!loading && posts.map(post => {
          const conf = post.confidence || 'low'
          const confStyle = CONFIDENCE_COLORS[conf as keyof typeof CONFIDENCE_COLORS] || CONFIDENCE_COLORS.low
          const cats: string[] = (() => { try { return JSON.parse(post.categories_json || '[]') } catch { return [] } })()
          const PlatformIcon = PLATFORM_ICONS[post.platform || '']
          const isPending = pendingStatus[post.id]

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

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
                <div className="flex-1" />
                {post.status !== 'approved' && post.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(post.id, 'approved')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {post.status !== 'saved' && post.status !== 'approved' && post.status !== 'pushed' && (
                  <button
                    onClick={() => handleStatus(post.id, 'saved')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
                {post.status !== 'rejected' && (
                  <button
                    onClick={() => handleStatus(post.id, 'rejected')}
                    disabled={isPending}
                    className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 3l.5 7h3l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
