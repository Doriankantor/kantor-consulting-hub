import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  canApprove: boolean
  localUser: { id: string; name: string } | null
  onNavigate?: (tab: string) => void
}

export default function ClaudeAnalysisTab({ pageId, page, localUser, onNavigate }: Props) {
  const [messages, setMessages] = useState<InfoPageChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}

  const loadChat = useCallback(async () => {
    try {
      const rows = await window.api.infoPages.getChat(pageId)
      setMessages(rows)
    } catch { /* ignore */ }
  }, [pageId])

  useEffect(() => { loadChat() }, [loadChat])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    setSending(true)
    // Optimistic append of the user's message.
    setMessages(prev => [...prev, { id: `tmp-${Date.now()}`, page_id: pageId, role: 'user', content: text, created_at: new Date().toISOString() }])
    setInput('')
    try {
      const res = await window.api.infoPages.chat({ pageId, pageName: page.name, userId: localUser?.id, message: text })
      if (!res.ok) setError(res.error || 'Claude request failed')
      await loadChat()
    } catch (e: any) {
      setError(e.message || 'Unknown error')
      await loadChat()
    } finally {
      setSending(false)
    }
  }

  async function clearConversation() {
    if (!confirm('Clear the entire analysis conversation for this page?')) return
    try {
      await window.api.infoPages.clearChat(pageId)
      setMessages([])
      setError(null)
    } catch { /* ignore */ }
  }

  async function markComplete() {
    if (!messages.length || completing || !localUser) return
    setCompleting(true)
    setError(null)
    try {
      const res = await window.api.infoPages.summarizeAnalysis({ pageId, pageName: page.name, userId: localUser.id })
      if (!res.ok) { setError(res.error || 'Could not summarize analysis'); return }
      await window.api.infoPages.addItem({
        page_id: pageId,
        tab: 'design',
        sub_type: 'design_notes',
        title: 'Pre-publish Design Notes',
        status: 'draft',
        analysis_json: JSON.stringify({ summary: res.summary || '', recommendations: res.recommendations || [] }),
        created_by_id: localUser.id,
        created_by_name: localUser.name,
      })
      setToast('Analysis complete — design notes ready')
      setTimeout(() => { setToast(null); onNavigate?.('design') }, 1200)
    } catch (e: any) {
      setError(e.message || 'Unknown error')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium shadow-2xl">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-green-400 dark:text-green-600">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4.5 7l1.5 1.5L9.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-white/75">Claude Analysis</p>
          <p className="text-[10px] text-gray-400 dark:text-white/30">
            Knows this page's sources, manual info{config.live_url ? ' and live page state' : ''}.
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearConversation}
            className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1] text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">
            Clear conversation
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mx-auto mb-3 text-gray-300 dark:text-white/20">
              <path d="M4 7a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H12l-6 5v-5H7a3 3 0 0 1-3-3V7z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
            <p className="text-sm text-gray-400 dark:text-white/30">Start a conversation with Claude</p>
            <p className="text-xs text-gray-400 dark:text-white/20 mt-1 max-w-sm mx-auto">
              Ask what should change on the page, or paste new findings. Claude already has the sources you sent here, your manual info, and the current live page.
            </p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed ${
              m.role === 'user'
                ? 'bg-indigo-500 text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/85 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-white/[0.06]">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Completed analysis bar */}
      {messages.length > 0 && (
        <div className="shrink-0 px-4 py-2.5 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
          <button
            onClick={markComplete}
            disabled={completing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-green-500 hover:bg-green-600 text-white transition disabled:opacity-50"
          >
            {completing ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Summarizing…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Mark analysis complete and move to Pre-publish Design Notes
              </>
            )}
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 px-4 py-3 border-t border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={1}
            placeholder="Ask Claude about updates to this page…"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
