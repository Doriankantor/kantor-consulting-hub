import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

// KC monogram — matches the app icon: serif KC + spaced HUB in navy
function KCLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* White rounded square background */}
      <rect width="72" height="72" rx="16" fill="white"/>
      {/* K — left column + two diagonal strokes */}
      <text
        x="7" y="50"
        fontFamily="'New York', 'Georgia', 'Times New Roman', serif"
        fontSize="42"
        fontWeight="700"
        fill="#0e1e4a"
        letterSpacing="-3"
      >KC</text>
      {/* HUB — spaced caps below */}
      <text
        x="9" y="66"
        fontFamily="'-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Helvetica Neue', sans-serif"
        fontSize="11"
        fontWeight="600"
        fill="#0e1e4a"
        letterSpacing="3.5"
      >HUB</text>
    </svg>
  )
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div
      className="h-screen flex items-center justify-center p-6 overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0a0f1e 0%, #0e1e4a 45%, #0d1530 100%)' }}
    >
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #d97706 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-15%] right-[20%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#d97706 1px, transparent 1px), linear-gradient(90deg, #d97706 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-9">
          {/* Logo with gold glow ring */}
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-[20px] blur-xl opacity-40"
              style={{ background: '#d97706', transform: 'scale(1.15)' }} />
            <div className="relative rounded-[18px] shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 0 0 1px rgba(217,119,6,0.4), 0 24px 48px rgba(0,0,0,0.6)' }}>
              <KCLogo size={80} />
            </div>
          </div>

          <h1 className="text-[22px] font-bold tracking-tight text-white">
            Kantor Consulting Hub
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Strategic intelligence platform
          </p>
        </div>

        {/* Sign-in card */}
        <div
          className="rounded-2xl p-7 backdrop-blur-md"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <h2 className="text-[15px] font-semibold text-white mb-5">Sign in to your account</h2>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email"
                className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: 'rgba(255,255,255,0.45)' }}>
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
                placeholder="name@kantor-consulting.com"
                className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'white',
                  caretColor: '#d97706',
                }}
                onFocus={e => { e.target.style.border = '1px solid rgba(217,119,6,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(217,119,6,0.15)' }}
                onBlur={e =>  { e.target.style.border = '1px solid rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <div>
              <label htmlFor="password"
                className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: 'rgba(255,255,255,0.45)' }}>
                Password or access code
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl text-sm transition-all focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'white',
                  caretColor: '#d97706',
                }}
                onFocus={e => { e.target.style.border = '1px solid rgba(217,119,6,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(217,119,6,0.15)' }}
                onBlur={e =>  { e.target.style.border = '1px solid rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="titlebar-no-drag w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: loading ? '#d97706' : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                boxShadow: '0 4px 20px rgba(217,119,6,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
            First time? Enter your email and the access code<br />from your administrator — you'll set a password next.
          </p>
        </div>

        {/* Version hint */}
        <p className="text-center mt-5 text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Kantor Consulting · Confidential
        </p>
      </div>
    </div>
  )
}
