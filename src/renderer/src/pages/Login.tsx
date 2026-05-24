import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-hub-navy p-4 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-hub-gold/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-hub-blue/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hub-gold/10 border border-hub-gold/30 mb-5 shadow-lg shadow-hub-gold/5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="#d97706" opacity="0.9"/>
              <rect x="16" y="2" width="10" height="10" rx="2" fill="#d97706" opacity="0.5"/>
              <rect x="2" y="16" width="10" height="10" rx="2" fill="#d97706" opacity="0.5"/>
              <rect x="16" y="16" width="10" height="10" rx="2" fill="#d97706" opacity="0.9"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Kantor Consulting Hub</h1>
          <p className="text-white/35 text-sm mt-1.5">Project management center</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <h2 className="text-[15px] font-semibold text-white/90 mb-5">Sign in to your account</h2>

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
              <label htmlFor="email" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition-all"
                placeholder="name@kantor-consulting.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="titlebar-no-drag w-full py-2.5 px-4 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-lg shadow-hub-gold/20 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-white/25">
            Access is managed by your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
