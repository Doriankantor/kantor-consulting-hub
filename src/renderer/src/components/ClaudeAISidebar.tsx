import { useState, useRef, useEffect, useCallback } from 'react'
import type { Task, ChatMessage } from '../types'
import { CONTENT_TYPE_LABELS, AREA_LABELS } from '../types'

// ── Quick actions ──────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Draft outline',
    icon: '📋',
    prompt: (task: Task) =>
      `Please draft a structured outline for this engagement: "${task.title}". Include suggested section headings, key questions to address, and a logical flow appropriate for a ${CONTENT_TYPE_LABELS[task.content_type]}.`,
  },
  {
    label: 'Executive summary',
    icon: '📄',
    prompt: (task: Task) =>
      `Write a concise executive summary (3–4 paragraphs) for a client on: "${task.title}". The summary should be appropriate for a senior decision-maker with limited time. Highlight the key issue, analytical context, and 2–3 actionable implications.`,
  },
  {
    label: 'Summarise notes',
    icon: '✂️',
    prompt: (_task: Task, notes?: string) =>
      notes
        ? `Please condense the following working notes into a clean, structured summary — preserving key facts and removing redundancy:\n\n${notes.replace(/<[^>]*>/g, '')}`
        : 'Please provide a structured summary of what has been outlined so far in this engagement.',
  },
  {
    label: 'Suggest deadline',
    icon: '📅',
    prompt: (task: Task) =>
      `Based on the deliverable type (${CONTENT_TYPE_LABELS[task.content_type]}) and scope described for "${task.title}", suggest a realistic timeline with milestone dates. Break it into: (1) research phase, (2) drafting phase, (3) review and revision, (4) final delivery. Assume one analyst working on this.`,
  },
  {
    label: 'Research angles',
    icon: '🔍',
    prompt: (task: Task) =>
      `Suggest 5–7 analytical angles and key source types for the engagement: "${task.title}" in the area of ${task.area_of_analysis ? AREA_LABELS[task.area_of_analysis] : 'political analysis'}. For each angle, suggest a specific question it helps answer and what kind of source would address it.`,
  },
]

// ── Message bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage & { streaming?: boolean } }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-hub-gold/20 border border-hub-gold/30 flex items-center justify-center shrink-0 mt-0.5 mr-2">
          <span className="text-hub-gold text-[10px] font-bold">K</span>
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-hub-gold/20 text-white border border-hub-gold/20 rounded-tr-sm'
            : 'bg-white/[0.06] text-white/85 border border-white/[0.08] rounded-tl-sm'
        }`}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        {msg.streaming && (
          <span className="inline-block w-1 h-4 bg-hub-gold ml-0.5 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  task: Task
  onClose: () => void
}

export default function ClaudeAISidebar({ task, onClose }: Props) {
  const [messages, setMessages] = useState<(ChatMessage & { streaming?: boolean })[]>([
    {
      role: 'assistant',
      content: `I'm ready to assist with "${task.title}". Use the quick actions below or ask me anything about this engagement.`,
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const buildContext = useCallback((): Record<string, string | null> => {
    // Strip HTML tags from notes/description for the context
    const stripHtml = (html: string | null) =>
      html ? html.replace(/<[^>]*>/g, '').trim() : null

    const sources = task.sources_json
      ? (JSON.parse(task.sources_json) as { title: string; url: string | null }[])
          .map(s => `- ${s.title}${s.url ? ` (${s.url})` : ''}`)
          .join('\n')
      : null

    return {
      title:            task.title,
      content_type:     CONTENT_TYPE_LABELS[task.content_type],
      area_of_analysis: task.area_of_analysis ? AREA_LABELS[task.area_of_analysis] : null,
      client:           task.client,
      description:      stripHtml(task.description),
      notes:            stripHtml(task.notes),
      sources,
    }
  }, [task])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...messages.filter(m => !m.streaming), userMsg]

    setMessages([...updatedMessages, { role: 'assistant', content: '', streaming: true }])
    setInput('')
    setStreaming(true)
    setError(null)

    // Register stream listeners BEFORE invoking
    window.api.claude.removeListeners()

    let accumulated = ''

    window.api.claude.onChunk(chunk => {
      accumulated += chunk
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 && m.streaming ? { ...m, content: accumulated } : m
      ))
    })

    window.api.claude.onDone(() => {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { role: 'assistant', content: accumulated, streaming: false } : m
      ))
      setStreaming(false)
      window.api.claude.removeListeners()
    })

    window.api.claude.onError(err => {
      setError(err)
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1))
      setStreaming(false)
      window.api.claude.removeListeners()
    })

    const result = await window.api.claude.sendMessage({
      messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
      taskContext: buildContext(),
    })

    if (result?.error) {
      setError(result.error)
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1))
      setStreaming(false)
      window.api.claude.removeListeners()
    }
  }, [messages, streaming, buildContext])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-white/[0.08] bg-[#0d1520]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-hub-gold/20 border border-hub-gold/30 flex items-center justify-center">
            <span className="text-hub-gold text-[10px] font-bold">K</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-white">Claude AI</p>
            <p className="text-[10px] text-white/30">Political analysis assistant</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="titlebar-no-drag p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.07] transition"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2 px-1">Quick actions</p>
        <div className="grid grid-cols-1 gap-1">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.prompt(task, task.notes ?? undefined))}
              disabled={streaming}
              className="titlebar-no-drag flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] disabled:opacity-40 text-left transition"
            >
              <span className="text-sm shrink-0">{action.icon}</span>
              <span className="text-xs text-white/60 hover:text-white/80 transition">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {error && (
          <div className="mx-1 mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <div className="flex items-end gap-2 bg-white/[0.05] border border-white/[0.09] rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-hub-gold/30 focus-within:border-hub-gold/30 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            rows={2}
            placeholder="Ask Claude… (Enter to send, Shift+Enter for newline)"
            className="titlebar-no-drag flex-1 bg-transparent text-white text-sm placeholder-white/25 resize-none outline-none leading-relaxed"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            className="titlebar-no-drag p-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 mb-0.5"
          >
            {streaming ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12 7L2 2l2.5 5L2 12l10-5z" fill="white"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-white/15 mt-1.5">
          Uses your personal Anthropic API key · Responses not stored
        </p>
      </div>
    </div>
  )
}
