import { useState } from 'react'

interface Props {
  userId: string
  onConnected?: () => void
  onSkip?: () => void
}

export default function ConnectClaude({ userId, onConnected, onSkip }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  async function handleConnect() {
    const trimmed = apiKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setKeyError('Invalid key — must start with "sk-ant-"')
      return
    }
    setConnecting(true)
    setKeyError(null)
    await window.api.claude.saveUserKey(userId, trimmed)
    setConnecting(false)
    onConnected?.()
  }

  return (
    <div className="space-y-5">
      {/* Step 1 */}
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-full bg-hub-gold/15 border border-hub-gold/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-hub-gold text-[10px] font-bold">1</span>
        </div>
        <div className="flex-1">
          <p className="text-sm text-white/70 leading-relaxed">
            Open the Anthropic Console and sign in using your existing Claude account
          </p>
          <button
            onClick={() => window.open('https://console.anthropic.com/settings/keys', '_blank')}
            className="titlebar-no-drag mt-2.5 px-4 py-2 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition inline-flex items-center gap-1.5"
          >
            Open Anthropic Console
            <span className="text-hub-gold/70">↗</span>
          </button>
          <p className="text-[11px] text-white/25 mt-1.5 leading-relaxed">
            Go to API Keys → Create key → copy it
          </p>
        </div>
      </div>

      {/* Step 2 */}
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-full bg-hub-gold/15 border border-hub-gold/30 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-hub-gold text-[10px] font-bold">2</span>
        </div>
        <div className="flex-1">
          <p className="text-sm text-white/70 leading-relaxed mb-2">
            Paste your API key here
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setKeyError(null) }}
            placeholder="sk-ant-api03-…"
            className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition"
          />
          {keyError && (
            <p className="mt-1.5 text-xs text-red-400">{keyError}</p>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting || apiKey.trim().length < 10}
            className="titlebar-no-drag mt-2.5 w-full py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>

      {onSkip && (
        <div className="text-center pt-1">
          <button
            onClick={onSkip}
            className="titlebar-no-drag text-xs text-white/25 hover:text-white/45 transition"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  )
}
