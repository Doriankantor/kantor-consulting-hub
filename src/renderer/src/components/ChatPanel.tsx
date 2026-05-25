import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function initials(name: string): string {
  return name.trim().split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

const AVATAR_PALETTE = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#ec4899','#8b5cf6']
function authorColor(id: string): string {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { localUser } = useAuth()
  const userId   = localUser?.id   ?? 'local-admin'
  const userName = localUser?.name ?? 'Dorian Kantor'

  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  const [input, setInput]         = useState('')
  const [unread, setUnread]       = useState(0)
  const lastSeenRef               = useRef<string | null>(null)
  const messagesEndRef            = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    try {
      const data = await window.api.chat.getMessages(50)
      setMessages(data)
      if (!open && data.length > 0) {
        const newest = data[data.length - 1]
        if (lastSeenRef.current === null) {
          lastSeenRef.current = newest.id
        } else if (newest.id !== lastSeenRef.current) {
          // Count new messages from others
          const lastIdx = data.findIndex(m => m.id === lastSeenRef.current)
          const newMsgs = lastIdx === -1 ? data : data.slice(lastIdx + 1)
          const fromOthers = newMsgs.filter(m => m.author_id !== userId).length
          if (fromOthers > 0) setUnread(prev => prev + fromOthers)
        }
      }
    } catch {}
  }, [open, userId])

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [loadMessages])

  // Scroll to bottom when opened or new message arrives
  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [open, messages.length])

  // Mark all as read when opening
  useEffect(() => {
    if (open) {
      setUnread(0)
      if (messages.length > 0) lastSeenRef.current = messages[messages.length - 1].id
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Listen for external toggle (from sidebar)
  useEffect(() => {
    function onToggle() { setOpen(v => !v) }
    window.addEventListener('toggleChat', onToggle)
    return () => window.removeEventListener('toggleChat', onToggle)
  }, [])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    try {
      const msg = await window.api.chat.send({ author_id: userId, author_name: userName, content: text })
      setMessages(prev => [...prev, msg])
      lastSeenRef.current = msg.id
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div className="w-80 h-96 flex flex-col bg-white dark:bg-[#1a2233] border border-gray-200 dark:border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: 'fadeSlideUp 0.18s ease' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Team Chat</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.08] transition text-sm font-bold"
            >
              −
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-xs text-gray-400 dark:text-white/25 mt-8">No messages yet. Say hello!</p>
            )}
            {messages.map((msg, i) => {
              const isMine = msg.author_id === userId
              const showName = !isMine && (i === 0 || messages[i - 1].author_id !== msg.author_id)
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                  {!isMine && (
                    <div
                      style={{ backgroundColor: authorColor(msg.author_id) }}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mb-0.5"
                    >
                      {initials(msg.author_name)}
                    </div>
                  )}
                  <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    {showName && (
                      <span className="text-[10px] text-gray-400 dark:text-white/30 ml-1">{msg.author_name}</span>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? 'bg-hub-blue text-white rounded-br-sm'
                        : 'bg-gray-100 dark:bg-white/[0.08] text-gray-800 dark:text-white/85 rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[9px] text-gray-300 dark:text-white/20 px-1">{fmtTime(msg.created_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 px-3 pb-3 pt-2 border-t border-gray-100 dark:border-white/[0.06] shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message team…"
              className="flex-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/[0.07] border border-gray-200 dark:border-white/[0.08] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-hub-blue/40 resize-none leading-relaxed"
              style={{ maxHeight: '80px', overflowY: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-8 h-8 rounded-xl bg-hub-blue hover:bg-hub-blue/80 disabled:opacity-40 flex items-center justify-center transition shrink-0 mb-0.5"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-white -rotate-45 translate-x-px">
                <path d="M1 6.5h10M7 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative w-13 h-13 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-gray-200 dark:bg-white/[0.12] text-gray-600 dark:text-white/60'
            : 'bg-hub-blue hover:bg-hub-blue/90 text-white'
        }`}
        style={{ width: '52px', height: '52px' }}
        title="Team Chat"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 4h14v9H11l-3 3v-3H3V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
        )}
        {/* Unread badge */}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
