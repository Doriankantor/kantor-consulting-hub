import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 pl-1">{title}</h2>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">{children}</div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.06] last:border-0">{children}</div>
}

function RoleBadge({ role }: { role: string }) {
  const gold = role === 'admin'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${gold ? 'bg-hub-gold/15 border-hub-gold/30 text-hub-gold' : 'bg-white/[0.06] border-white/10 text-white/40'}`}>
      {role}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'   ? 'bg-green-500/10 border-green-500/20 text-green-400' :
    status === 'invited'  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            'bg-white/[0.04] border-white/10 text-white/25'
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${cls}`}>{status}</span>
}

function fmtActive(ts: string | null): string {
  if (!ts) return 'Never'
  const diffH = (Date.now() - new Date(ts).getTime()) / 3_600_000
  if (diffH < 1)   return 'Just now'
  if (diffH < 24)  return `${Math.floor(diffH)}h ago`
  if (diffH < 168) return `${Math.floor(diffH / 24)}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function Settings() {
  const { user, localUser, isAdmin, signOut } = useAuth()

  // ── API key ────────────────────────────────────────────────────────────────
  const [maskedKey,  setMaskedKey]  = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [newKey,     setNewKey]     = useState('')
  const [keyMsg,     setKeyMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)
  const [savingKey,  setSavingKey]  = useState(false)

  // ── Drive ──────────────────────────────────────────────────────────────────
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAuthUrl,   setDriveAuthUrl]   = useState<string|null>(null)
  const [authCode,       setAuthCode]       = useState('')
  const [clientId,       setClientId]       = useState('')
  const [clientSec,      setClientSec]      = useState('')
  const [driveMsg,       setDriveMsg]       = useState<{type:'ok'|'err';text:string}|null>(null)
  const [showDriveSetup, setShowDriveSetup] = useState(false)
  const [syncingNow,     setSyncingNow]     = useState(false)

  // ── Gmail ──────────────────────────────────────────────────────────────────
  const [gmailPass,    setGmailPass]    = useState('')
  const [gmailEditing, setGmailEditing] = useState(false)
  const [gmailMsg,     setGmailMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)
  const [gmailSaved,   setGmailSaved]   = useState(false)

  // ── Team ───────────────────────────────────────────────────────────────────
  const [members,     setMembers]     = useState<LocalTeamMember[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [showInvite,  setShowInvite]  = useState(false)
  const [inviteName,  setInviteName]  = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'member'|'admin'>('member')
  const [inviting,    setInviting]    = useState(false)
  const [inviteMsg,   setInviteMsg]   = useState<{type:'ok'|'err';text:string}|null>(null)
  const [editingId,   setEditingId]   = useState<string|null>(null)
  const [editName,    setEditName]    = useState('')
  const [editRole,    setEditRole]    = useState('')

  // ── App ────────────────────────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.settings.get('anthropic_api_key').then(k => { if (k) setMaskedKey(`sk-ant-…${k.slice(-6)}`) })
    window.api.drive.isConnected().then(setDriveConnected)
    window.api.app.getVersion().then(setAppVersion)
    window.api.settings.get('gmail_app_password').then(p => setGmailSaved(!!p))
    if (isAdmin) loadTeam()
  }, [isAdmin])

  async function loadTeam() {
    setLoadingTeam(true)
    const data = await window.api.team.list()
    setMembers(data)
    setLoadingTeam(false)
  }

  // API key
  async function handleSaveKey(e: FormEvent) {
    e.preventDefault()
    const t = newKey.trim()
    if (!t.startsWith('sk-ant-')) { setKeyMsg({ type: 'err', text: 'Invalid — must start with "sk-ant-"' }); return }
    setSavingKey(true)
    await window.api.settings.set('anthropic_api_key', t)
    setMaskedKey(`sk-ant-…${t.slice(-6)}`); setEditingKey(false); setNewKey('')
    setKeyMsg({ type: 'ok', text: 'API key updated.' })
    setSavingKey(false)
    setTimeout(() => setKeyMsg(null), 3000)
  }

  // Drive
  async function handleSaveCredentials() {
    if (!clientId.trim() || !clientSec.trim()) { setDriveMsg({ type: 'err', text: 'Both Client ID and Secret are required.' }); return }
    await window.api.settings.set('google_client_id',     clientId.trim())
    await window.api.settings.set('google_client_secret', clientSec.trim())
    await window.api.drive.reinit()
    const url = await window.api.drive.getAuthUrl()
    if (url) { setDriveAuthUrl(url); setDriveMsg({ type: 'ok', text: 'Credentials saved. Copy the URL, open it in your browser, and paste the code back here.' }) }
    else      setDriveMsg({ type: 'err', text: 'Could not generate auth URL — check your credentials.' })
  }

  async function handleExchangeCode() {
    if (!authCode.trim()) return
    const result = await window.api.drive.exchangeCode(authCode.trim())
    if (result.ok) { setDriveConnected(true); setShowDriveSetup(false); setDriveAuthUrl(null); setDriveMsg({ type: 'ok', text: 'Google Drive connected!' }) }
    else setDriveMsg({ type: 'err', text: result.error ?? 'Failed to connect.' })
    setTimeout(() => setDriveMsg(null), 5000)
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Google Drive? Auto-backup will stop.')) return
    await window.api.drive.disconnect()
    setDriveConnected(false)
  }

  async function handleSyncNow() {
    setSyncingNow(true)
    await window.api.drive.syncNow()
    setSyncingNow(false)
    setDriveMsg({ type: 'ok', text: 'Sync completed.' })
    setTimeout(() => setDriveMsg(null), 3000)
  }

  // Gmail
  async function handleSaveGmail() {
    if (!gmailPass.trim()) return
    await window.api.settings.set('gmail_app_password', gmailPass.trim())
    setGmailEditing(false); setGmailPass(''); setGmailSaved(true)
    setGmailMsg({ type: 'ok', text: 'App password saved.' })
    setTimeout(() => setGmailMsg(null), 3000)
  }

  // Team
  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (!inviteName.trim() || !inviteEmail.trim()) return
    setInviting(true); setInviteMsg(null)
    const result = await window.api.team.invite({ email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole })
    if (result.error) {
      setInviteMsg({ type: 'err', text: result.error })
    } else {
      const emailNote = result.emailSent
        ? ' Invite email sent.'
        : ` Email not sent — share temp password manually: ${result.tempPassword}`
      setInviteMsg({ type: 'ok', text: `${inviteName} invited.${emailNote}` })
      setInviteName(''); setInviteEmail(''); setInviteRole('member')
      setShowInvite(false); loadTeam()
    }
    setInviting(false)
    setTimeout(() => setInviteMsg(null), 10_000)
  }

  async function handleRemove(id: string, email: string) {
    if (!confirm(`Deactivate ${email}? They will lose access immediately.`)) return
    await window.api.team.remove(id)
    loadTeam()
  }

  async function handleSaveEdit(id: string) {
    await window.api.team.edit({ id, full_name: editName, role: editRole })
    setEditingId(null); loadTeam()
  }

  const displayName  = localUser?.name  ?? user?.email?.split('@')[0] ?? '?'
  const displayEmail = localUser?.email ?? user?.email ?? ''

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-white/35 text-sm mt-1">Manage your account and workspace</p>
        </div>

        {/* Profile */}
        <Section title="Profile">
          <Row>
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-hub-gold/15 border border-hub-gold/30 flex items-center justify-center shrink-0">
                <span className="text-hub-gold font-bold text-sm">{displayName[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs text-white/35 mt-0.5">{displayEmail}</p>
              </div>
            </div>
            <div className="flex gap-1.5">{isAdmin && <RoleBadge role="admin" />}</div>
          </Row>
        </Section>

        {/* AI Configuration */}
        <Section title="AI Configuration">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-medium text-white">Anthropic API Key</p>
                <p className="text-xs text-white/35 mt-0.5 font-mono">{maskedKey ?? 'Not configured'}</p>
              </div>
              <button onClick={() => { setEditingKey(v => !v); setNewKey(''); setKeyMsg(null) }}
                className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.08] hover:bg-white/[0.13] text-white/60 hover:text-white transition">
                {editingKey ? 'Cancel' : maskedKey ? 'Update' : 'Add key'}
              </button>
            </div>
            {editingKey && (
              <form onSubmit={handleSaveKey} className="mt-3 space-y-2">
                <input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-ant-api03-…" autoFocus
                  className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/25 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
                <button type="submit" disabled={savingKey || newKey.trim().length < 20}
                  className="titlebar-no-drag w-full py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition">
                  {savingKey ? 'Saving…' : 'Save key'}
                </button>
              </form>
            )}
            {keyMsg && <p className={`mt-2 text-xs ${keyMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{keyMsg.text}</p>}
          </div>
        </Section>

        {/* Integrations (admin only) */}
        {isAdmin && (
          <Section title="Integrations">
            {/* Google Drive */}
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">Google Drive Backup</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${driveConnected ? 'bg-green-500/15 border-green-500/25 text-green-400' : 'bg-white/[0.05] border-white/10 text-white/30'}`}>
                      {driveConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">Silently auto-syncs task data and notes to Drive every 5 minutes.</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {driveConnected ? (
                    <>
                      <button onClick={handleSyncNow} disabled={syncingNow}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-white/[0.07] hover:bg-white/[0.12] text-white/60 hover:text-white transition">
                        {syncingNow ? 'Syncing…' : 'Sync now'}
                      </button>
                      <button onClick={handleDisconnect}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-red-500/10 hover:bg-red-500/15 text-red-400 transition">
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setShowDriveSetup(v => !v)}
                      className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-hub-gold/15 hover:bg-hub-gold/25 text-hub-gold border border-hub-gold/30 transition">
                      Connect →
                    </button>
                  )}
                </div>
              </div>

              {showDriveSetup && !driveConnected && (
                <div className="mt-3 p-4 rounded-xl bg-black/20 border border-white/[0.08] space-y-3 text-xs">
                  <p className="text-white/40 leading-relaxed">
                    <span className="text-white/60 font-semibold">Setup:</span> Go to{' '}
                    <span className="text-white/55 underline cursor-pointer" onClick={() => window.open('https://console.cloud.google.com', '_blank')}>console.cloud.google.com</span>
                    {' '}→ Create project → Enable Drive API + Gmail API → Credentials → Create OAuth 2.0 Client ID (Desktop app) → copy Client ID &amp; Secret below.
                  </p>
                  <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Google OAuth2 Client ID"
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <input type="password" value={clientSec} onChange={e => setClientSec(e.target.value)} placeholder="Google OAuth2 Client Secret"
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <button onClick={handleSaveCredentials} disabled={!clientId.trim() || !clientSec.trim()}
                    className="titlebar-no-drag w-full py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold transition disabled:opacity-40">
                    Generate auth URL →
                  </button>
                  {driveAuthUrl && (
                    <div className="space-y-2 pt-1">
                      <p className="text-white/40">Copy this URL, open it in your browser (sign in with kantorconsulting.hub@gmail.com), then paste the code you receive:</p>
                      <div className="flex gap-2">
                        <input readOnly value={driveAuthUrl}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 font-mono text-[10px]" />
                        <button onClick={() => navigator.clipboard.writeText(driveAuthUrl)}
                          className="titlebar-no-drag px-2.5 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white/50 text-xs transition">
                          Copy
                        </button>
                      </div>
                      <input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="Paste authorisation code here"
                        className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-xs placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                      <button onClick={handleExchangeCode} disabled={!authCode.trim()}
                        className="titlebar-no-drag w-full py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-40 text-white text-xs font-semibold transition">
                        Connect Drive →
                      </button>
                    </div>
                  )}
                </div>
              )}
              {driveMsg && <p className={`mt-2 text-xs ${driveMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{driveMsg.text}</p>}
            </div>

            {/* Gmail */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">Gmail (invite emails)</p>
                    {gmailSaved && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Configured</span>}
                  </div>
                  <p className="text-xs text-white/35 mt-0.5">Sends from kantorconsulting.hub@gmail.com via an app password.</p>
                </div>
                <button onClick={() => { setGmailEditing(v => !v); setGmailPass('') }}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-white/[0.08] hover:bg-white/[0.13] text-white/60 hover:text-white transition shrink-0">
                  {gmailEditing ? 'Cancel' : gmailSaved ? 'Update' : 'Set password'}
                </button>
              </div>
              {gmailEditing && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-white/35 leading-relaxed">
                    Generate an app password at{' '}
                    <span className="text-white/50 underline cursor-pointer" onClick={() => window.open('https://myaccount.google.com/apppasswords', '_blank')}>myaccount.google.com</span>
                    {' '}→ Security → 2-Step Verification → App passwords.
                  </p>
                  <input type="password" value={gmailPass} onChange={e => setGmailPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" autoFocus
                    className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/25 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
                  <button onClick={handleSaveGmail} disabled={!gmailPass.trim()}
                    className="titlebar-no-drag w-full py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition">
                    Save
                  </button>
                </div>
              )}
              {gmailMsg && <p className={`mt-2 text-xs ${gmailMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{gmailMsg.text}</p>}
            </div>
          </Section>
        )}

        {/* Team Management (admin only) */}
        {isAdmin && (
          <Section title="Team Management">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-white/35">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowInvite(v => !v)}
                  className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Invite member
                </button>
              </div>

              {showInvite && (
                <form onSubmit={handleInvite} className="mb-4 p-4 rounded-xl bg-black/20 border border-white/[0.08] space-y-2">
                  <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name *" required
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@kantor-consulting.com *" required
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'member'|'admin')}
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/30">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                      className="titlebar-no-drag flex-1 py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-xs font-semibold transition">
                      {inviting ? 'Sending…' : 'Send invite'}
                    </button>
                    <button type="button" onClick={() => setShowInvite(false)}
                      className="titlebar-no-drag px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/45 text-xs transition">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {inviteMsg && (
                <div className={`mb-3 p-3 rounded-xl text-xs ${inviteMsg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                  {inviteMsg.text}
                </div>
              )}

              {loadingTeam ? (
                <p className="text-sm text-white/30 py-4 text-center">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-white/25 py-4 text-center">No team members yet.</p>
              ) : (
                <div className="space-y-1">
                  {members.map(m => (
                    <div key={m.id}>
                      {editingId === m.id ? (
                        <div className="p-3 rounded-xl bg-black/20 border border-white/[0.08] space-y-2">
                          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"
                            className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                          <select value={editRole} onChange={e => setEditRole(e.target.value)}
                            className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30">
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEdit(m.id)}
                              className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/45 text-xs transition">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.04] group">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-white/80 font-medium truncate">{m.full_name || m.email}</p>
                              <RoleBadge role={m.role} />
                              <StatusBadge status={m.status} />
                            </div>
                            {m.full_name && <p className="text-xs text-white/30 truncate">{m.email}</p>}
                            <p className="text-[10px] text-white/20 mt-0.5">Last active: {fmtActive(m.last_active)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                            <button onClick={() => { setEditingId(m.id); setEditName(m.full_name ?? ''); setEditRole(m.role) }}
                              className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition text-xs">
                              Edit
                            </button>
                            {m.id !== 'local-admin' && (
                              <button onClick={() => handleRemove(m.id, m.email)}
                                className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition text-xs">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* App */}
        <Section title="App">
          <Row>
            <div>
              <p className="text-sm font-medium text-white">Version</p>
              <p className="text-xs text-white/35 mt-0.5 font-mono">v{appVersion || '…'}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => window.open('https://github.com/kantorconsulting/kantor-consulting-hub/releases', '_blank')}
                className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-white/[0.08] hover:bg-white/[0.13] text-white/60 hover:text-white transition">
                Check for updates
              </button>
            )}
          </Row>
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row>
            <div>
              <p className="text-sm font-medium text-white">Sign out</p>
              <p className="text-xs text-white/35 mt-0.5">You'll need to sign in again to access the workspace</p>
            </div>
            <button onClick={signOut}
              className="titlebar-no-drag px-4 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 hover:bg-red-500/15 text-red-400/80 hover:text-red-400 border border-red-500/15 hover:border-red-500/25 transition">
              Sign out
            </button>
          </Row>
        </Section>
      </div>
    </div>
  )
}
