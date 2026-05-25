import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Setup() {
  const { completeSetup, skipSetup, signOut, user, localUser } = useAuth()
  const [apiKey, setApiKey]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const displayEmail = user?.email ?? localUser?.email ?? ''

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = apiKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key must start with "sk-ant-". Get yours at console.anthropic.com')
      return
    }
    if (trimmed.length < 40) {
      setError('That key looks too short — please paste the full key.')
      return
    }

    setLoading(true)
    try {
      await completeSetup(trimmed)
    } catch {
      setError('Failed to save. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-white dark:bg-hub-navy p-4 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-hub-gold/4 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-6 h-1.5 rounded-full bg-hub-gold/40" />
          <div className="w-6 h-1.5 rounded-full bg-hub-gold" />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-hub-gold/10 border border-hub-gold/25 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI assistant setup</h1>
          {displayEmail && (
            <p className="text-gray-500 dark:text-white/65 text-sm mt-1.5">
              Signed in as <span className="text-gray-500 dark:text-white/75">{displayEmail}</span>
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-7 shadow-2xl shadow-gray-300/60 dark:shadow-black/40">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white/90 mb-1">Anthropic API Key</h2>
          <p className="text-sm text-gray-500 dark:text-white/65 mb-1 leading-relaxed">
            Optional — only needed for the Claude AI assistant sidebar.
            All other features (Kanban, tasks, timeline, calendar) work without it.
          </p>
          <p className="text-xs text-gray-400 dark:text-white/50 mb-5 leading-relaxed">
            Your key is stored <strong className="text-gray-500 dark:text-white/65">only on this Mac</strong> and is never sent to our servers.
          </p>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-xs font-medium text-gray-500 dark:text-white/50 mb-1.5 uppercase tracking-wide">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoFocus
                className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-gray-300 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition-all"
                placeholder="sk-ant-api03-…"
              />
            </div>

            {/* Helper */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06]">
              <svg className="mt-0.5 shrink-0 text-gray-400 dark:text-white/50" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="text-xs text-gray-500 dark:text-white/65 leading-relaxed">
                Get a free-tier key at{' '}
                <span className="text-gray-500 dark:text-white/75 font-medium">console.anthropic.com</span>
                {' '}→ API Keys. You can also add it later in Settings.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || apiKey.trim().length < 10}
              className="titlebar-no-drag w-full py-2.5 px-4 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-lg shadow-hub-gold/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save key & continue →'
              )}
            </button>
          </form>

          {/* Skip option */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
            <button
              onClick={() => skipSetup()}
              className="titlebar-no-drag text-sm text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 transition font-medium"
            >
              Skip for now →
            </button>
            <button
              onClick={signOut}
              className="titlebar-no-drag text-xs text-gray-300 dark:text-white/50 hover:text-gray-500 dark:hover:text-white/65 transition"
            >
              Sign out
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-300 dark:text-white/50 mt-4">
          You can add your API key at any time in Settings → AI Configuration.
        </p>
      </div>
    </div>
  )
}
