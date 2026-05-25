import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ConnectClaude from '../components/ConnectClaude'

type Step = 1 | 2 | 3

export default function FirstLogin() {
  const { localUser, completeMustChange } = useAuth()
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError,   setPwError]   = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Step 3
  const [emailNotif, setEmailNotif] = useState(true)
  const [saving,     setSaving]     = useState(false)

  async function handleChangePassword() {
    if (newPw.length < 8)    { setPwError('Password must be at least 8 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    if (!localUser) return
    setPwLoading(true); setPwError('')
    const result = await window.api.team.changePassword(localUser.id, currentPw, newPw)
    if (result.error) { setPwError(result.error); setPwLoading(false); return }
    setPwLoading(false)
    setStep(2)
  }

  async function handleFinish() {
    if (!localUser) return
    setSaving(true)
    await window.api.team.savePreferences(localUser.id, { emailNotifications: emailNotif })
    completeMustChange()
  }

  const steps = ['Set password', 'AI assistant', 'Preferences']

  return (
    <div className="h-screen flex items-center justify-center bg-white dark:bg-hub-navy p-4 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-hub-gold/4 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {([1,2,3] as Step[]).map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s === step ? 'w-8 bg-hub-gold' : s < step ? 'w-5 bg-hub-gold/50' : 'w-5 bg-gray-200 dark:bg-white/[0.12]'}`} />
          ))}
        </div>

        <div className="text-center mb-6">
          <p className="text-[10px] text-gray-400 dark:text-white/25 uppercase tracking-widest mb-1.5">{steps[step - 1]}</p>
          {step === 1 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Set your password</h1>
              <p className="text-gray-500 dark:text-white/40 text-sm mt-1.5">Welcome, {localUser?.name}. Create a permanent password to continue.</p>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Connect Claude</h1>
              <p className="text-gray-500 dark:text-white/40 text-sm mt-1.5">Use AI to draft reports and analyze engagements — or skip for now.</p>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Almost done</h1>
              <p className="text-gray-500 dark:text-white/40 text-sm mt-1.5">Set your notification preferences.</p>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-gray-300/60 dark:shadow-black/40">
          {step === 1 && (
            <div className="space-y-3">
              {pwError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{pwError}</div>
              )}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 dark:text-white/35 uppercase tracking-widest mb-1.5">Temporary password</label>
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoFocus
                  placeholder="From your invite email"
                  className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-gray-300 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 dark:text-white/35 uppercase tracking-widest mb-1.5">New password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-gray-300 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 dark:text-white/35 uppercase tracking-widest mb-1.5">Confirm password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password"
                  onKeyDown={e => { if (e.key === 'Enter') handleChangePassword() }}
                  className="titlebar-no-drag w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-gray-300 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
              </div>
              <button onClick={handleChangePassword} disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                className="titlebar-no-drag w-full py-2.5 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white font-semibold text-sm transition mt-1">
                {pwLoading ? 'Saving…' : 'Set password →'}
              </button>
            </div>
          )}

          {step === 2 && (
            <ConnectClaude
              userId={localUser?.id ?? ''}
              onConnected={() => setStep(3)}
              onSkip={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm text-gray-700 dark:text-white/80 font-medium">Email notifications</p>
                  <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">Receive updates when tasks are assigned to you</p>
                </div>
                <button
                  onClick={() => setEmailNotif(v => !v)}
                  className={`titlebar-no-drag relative w-11 h-6 rounded-full transition-colors ${emailNotif ? 'bg-hub-gold' : 'bg-gray-200 dark:bg-white/[0.12]'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${emailNotif ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <button onClick={handleFinish} disabled={saving}
                className="titlebar-no-drag w-full py-2.5 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white font-semibold text-sm transition mt-1">
                {saving ? 'Saving…' : 'Enter workspace →'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 dark:text-white/15 mt-4">
          You can change these settings at any time in Settings.
        </p>
      </div>
    </div>
  )
}
