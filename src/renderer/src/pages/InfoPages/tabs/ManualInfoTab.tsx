import { useState, useEffect, useCallback } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  localUser: { id: string; name: string } | null
}

type SubTab = 'interviews' | 'social' | 'documents'

const CONF_STYLES: Record<string, string> = {
  high:   'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  medium: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  low:    'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
}

export default function ManualInfoTab({ pageId, page: _page, localUser }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('interviews')
  const [items, setItems] = useState<InfoPageItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Interview form
  const [intName, setIntName] = useState('')
  const [intRole, setIntRole] = useState('')
  const [intOrg, setIntOrg] = useState('')
  const [intDate, setIntDate] = useState('')
  const [intText, setIntText] = useState('')
  const [intQuotes, setIntQuotes] = useState('')
  const [intTopics, setIntTopics] = useState('')
  const [intConfidential, setIntConfidential] = useState(false)

  // Social form
  const [socPlatform, setSocPlatform] = useState('Twitter/X')
  const [socHandle, setSocHandle] = useState('')
  const [socDate, setSocDate] = useState('')
  const [socContent, setSocContent] = useState('')
  const [socConf, setSocConf] = useState('medium')
  const [socUrl, setSocUrl] = useState('')

  const load = useCallback(async () => {
    try {
      const all = await window.api.infoPages.getItems(pageId, 'manual')
      setItems(all.filter(i => {
        if (subTab === 'interviews') return i.sub_type === 'interview'
        if (subTab === 'social')     return i.sub_type === 'social'
        if (subTab === 'documents')  return i.sub_type === 'document'
        return false
      }))
    } catch {}
  }, [pageId, subTab])

  useEffect(() => { load() }, [load])

  function resetForms() {
    setIntName(''); setIntRole(''); setIntOrg(''); setIntDate(''); setIntText(''); setIntQuotes(''); setIntTopics(''); setIntConfidential(false)
    setSocPlatform('Twitter/X'); setSocHandle(''); setSocDate(''); setSocContent(''); setSocConf('medium'); setSocUrl('')
  }

  async function handleAddInterview() {
    if (!intName.trim()) return
    setSaving(true)
    try {
      await window.api.infoPages.addItem({
        page_id: pageId,
        tab: 'manual',
        sub_type: 'interview',
        title: `${intName}${intOrg ? ' — ' + intOrg : ''}`,
        content_json: JSON.stringify({
          interviewee: intName,
          role: intRole,
          org: intOrg,
          date: intDate,
          text: intText,
          key_quotes: intQuotes.split('\n').filter(Boolean),
          topics: intTopics.split(',').map(t => t.trim()).filter(Boolean),
          confidential: intConfidential,
        }),
        priority: 'medium',
        created_by_id: localUser?.id,
        created_by_name: localUser?.name,
      })
      resetForms()
      setShowForm(false)
      await load()
    } finally { setSaving(false) }
  }

  async function handleAddSocial() {
    if (!socHandle.trim() || !socContent.trim()) return
    setSaving(true)
    try {
      // Also add to Intelligence feed
      await window.api.intelligence.addSocial({
        platform: socPlatform,
        handle: socHandle,
        post_date: socDate || new Date().toISOString().slice(0,10),
        content: socContent,
        url: socUrl || undefined,
        confidence: socConf,
        added_by_id: localUser?.id,
        added_by_name: localUser?.name,
      })
      // Add to info page manual items
      await window.api.infoPages.addItem({
        page_id: pageId,
        tab: 'manual',
        sub_type: 'social',
        title: `${socHandle} on ${socPlatform}`,
        content_json: JSON.stringify({ platform: socPlatform, handle: socHandle, content: socContent, url: socUrl, date: socDate }),
        confidence: socConf,
        created_by_id: localUser?.id,
        created_by_name: localUser?.name,
      })
      resetForms()
      setShowForm(false)
      await load()
    } finally { setSaving(false) }
  }

  async function handleUploadDocument() {
    setUploading(true)
    try {
      const result = await window.api.intelligence.uploadDocument({
        userId: localUser?.id,
        addedByName: localUser?.name,
      })
      if (result.ok && result.results?.length) {
        for (const doc of result.results) {
          await window.api.infoPages.addItem({
            page_id: pageId,
            tab: 'manual',
            sub_type: 'document',
            title: doc.file_name,
            content_json: JSON.stringify({ source_id: doc.id }),
            created_by_id: localUser?.id,
            created_by_name: localUser?.name,
          })
        }
        await load()
      }
    } finally { setUploading(false) }
  }

  async function handleDelete(id: string) {
    await window.api.infoPages.deleteItem(id)
    await load()
  }

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'interviews', label: 'Interviews' },
    { id: 'social',     label: 'Social Media' },
    { id: 'documents',  label: 'Documents' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tabs */}
      <div className="shrink-0 px-4 pt-3 pb-0 border-b border-gray-200 dark:border-white/[0.06] flex gap-1">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setShowForm(false) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition ${
              subTab === t.id
                ? 'bg-gray-100 dark:bg-white/[0.08] text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto pb-1">
          {subTab === 'documents' ? (
            <button
              onClick={handleUploadDocument}
              disabled={uploading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          ) : (
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
          {subTab === 'interviews' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={intName} onChange={e => setIntName(e.target.value)} placeholder="Interviewee name *"
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
                <input value={intRole} onChange={e => setIntRole(e.target.value)} placeholder="Role/title"
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={intOrg} onChange={e => setIntOrg(e.target.value)} placeholder="Organization"
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
                <input type="date" value={intDate} onChange={e => setIntDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white focus:outline-none" />
              </div>
              <textarea value={intText} onChange={e => setIntText(e.target.value)} placeholder="Interview notes / transcript" rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none" />
              <textarea value={intQuotes} onChange={e => setIntQuotes(e.target.value)} placeholder="Key quotes (one per line)" rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none" />
              <div className="flex items-center gap-4">
                <input value={intTopics} onChange={e => setIntTopics(e.target.value)} placeholder="Topics (comma-separated)"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-white/60 cursor-pointer">
                  <input type="checkbox" checked={intConfidential} onChange={e => setIntConfidential(e.target.checked)} className="w-3.5 h-3.5" />
                  Confidential
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); resetForms() }} className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">Cancel</button>
                <button onClick={handleAddInterview} disabled={!intName.trim() || saving}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Interview'}
                </button>
              </div>
            </div>
          )}

          {subTab === 'social' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <select value={socPlatform} onChange={e => setSocPlatform(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-white focus:outline-none">
                  {['Twitter/X','Telegram','Facebook','Instagram','LinkedIn','YouTube','TikTok','Other'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={socHandle} onChange={e => setSocHandle(e.target.value)} placeholder="@handle / channel *"
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
                <input type="date" value={socDate} onChange={e => setSocDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white focus:outline-none" />
              </div>
              <textarea value={socContent} onChange={e => setSocContent(e.target.value)} placeholder="Post content *" rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none focus:outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <input value={socUrl} onChange={e => setSocUrl(e.target.value)} placeholder="URL (optional)"
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none" />
                <select value={socConf} onChange={e => setSocConf(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-white focus:outline-none">
                  <option value="high">High confidence</option>
                  <option value="medium">Medium confidence</option>
                  <option value="low">Low confidence</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); resetForms() }} className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">Cancel</button>
                <button onClick={handleAddSocial} disabled={!socHandle.trim() || !socContent.trim() || saving}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Post'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-white/25 text-center py-6">
            No {subTab === 'interviews' ? 'interviews' : subTab === 'social' ? 'social media posts' : 'documents'} yet.
          </p>
        )}
        {items.map(item => {
          const c = (() => { try { return JSON.parse(item.content_json || '{}') } catch { return {} as Record<string,unknown> } })()
          return (
            <div key={item.id} className="p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-white/85">{item.title}</p>
                  {item.confidence && (
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 ${CONF_STYLES[item.confidence] || CONF_STYLES.low}`}>
                      {item.confidence}
                    </span>
                  )}
                  {subTab === 'interviews' && c.date && (
                    <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">{String(c.date)}</p>
                  )}
                  {subTab === 'interviews' && c.text && (
                    <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1 line-clamp-3">{String(c.text)}</p>
                  )}
                  {subTab === 'social' && c.content && (
                    <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1 line-clamp-3">{String(c.content)}</p>
                  )}
                </div>
                <button onClick={() => handleDelete(item.id)} className="text-gray-300 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 transition shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
