import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, GRADIENT_PRESETS, LIGHT_THEME_PRESETS } from '../contexts/ThemeContext'
import ConnectClaude from '../components/ConnectClaude'
import { useWorkspace } from '../contexts/WorkspaceContext'
import type { Area } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-[0.12em] mb-3 pl-1">{title}</h2>
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">{children}</div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-white/[0.06] last:border-0">{children}</div>
}

function RoleBadge({ role }: { role: string }) {
  const gold = role === 'admin'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${gold ? 'bg-hub-gold/15 border-hub-gold/30 text-hub-gold' : 'bg-gray-50 dark:bg-white/[0.06] border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/65'}`}>
      {role}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'   ? 'bg-green-500/10 border-green-500/20 text-green-400' :
    status === 'invited'  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            'bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/50'
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
  const { theme, setTheme, gradientTheme, setGradientTheme, lightTheme, setLightTheme } = useTheme()
  const { refreshAreas } = useWorkspace()

  // ── API key ────────────────────────────────────────────────────────────────
  const [maskedKey,  setMaskedKey]  = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [newKey,     setNewKey]     = useState('')
  const [keyMsg,     setKeyMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)
  const [savingKey,  setSavingKey]  = useState(false)

  // ── Claude per-user ────────────────────────────────────────────────────────
  const [claudeConnected,   setClaudeConnected]   = useState(false)
  const [showClaudeConnect, setShowClaudeConnect] = useState(false)
  const [teamKeyExists,     setTeamKeyExists]     = useState(false)

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

  // ── Templates ─────────────────────────────────────────────────────────────
  const [templates,      setTemplates]      = useState<TaskTemplate[]>([])
  const [templateLoading,setTemplateLoading]= useState(false)
  const [showNewTemplate,setShowNewTemplate]= useState(false)
  const [newTplName,     setNewTplName]     = useState('')
  const [newTplType,     setNewTplType]     = useState<string>('consulting-engagement')
  const [newTplDuration, setNewTplDuration] = useState(14)
  const [templateMsg,    setTemplateMsg]    = useState<{type:'ok'|'err';text:string}|null>(null)

  // ── Areas ─────────────────────────────────────────────────────────────────
  const [areas,        setAreas]        = useState<Area[]>([])
  const [areaLoading,  setAreaLoading]  = useState(false)
  const [showNewArea,  setShowNewArea]  = useState(false)
  const [newAreaName,  setNewAreaName]  = useState('')
  const [newAreaColor, setNewAreaColor] = useState('#6366f1')
  const [editingArea,  setEditingArea]  = useState<string | null>(null)
  const [editAreaName, setEditAreaName] = useState('')
  const [editAreaColor,setEditAreaColor]= useState('')
  const [areaMsg,      setAreaMsg]      = useState<{type:'ok'|'err';text:string}|null>(null)

  // ── App ────────────────────────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.settings.get('anthropic_api_key').then(k => {
      setTeamKeyExists(!!k)
      if (k) setMaskedKey(`sk-ant-…${k.slice(-6)}`)
    })
    if (localUser) {
      window.api.claude.getUserKeyStatus(localUser.id).then(s => setClaudeConnected(s.hasKey))
    }
    window.api.drive.isConnected().then(setDriveConnected)
    window.api.app.getVersion().then(setAppVersion)
    window.api.settings.get('gmail_app_password').then(p => setGmailSaved(!!p))
    if (isAdmin) { loadAreas(); loadTeam(); loadTemplates() }
  }, [isAdmin, localUser])

  async function loadTeam() {
    setLoadingTeam(true)
    const data = await window.api.team.list()
    setMembers(data)
    setLoadingTeam(false)
  }

  async function loadTemplates() {
    setTemplateLoading(true)
    try {
      const data = await window.api.templates.list()
      setTemplates(data)
    } catch {}
    setTemplateLoading(false)
  }

  async function handleCreateTemplate() {
    if (!newTplName.trim()) return
    const result = await window.api.templates.create({
      name: newTplName.trim(),
      content_type: newTplType,
      duration_days: newTplDuration,
      checklist_json: '[]',
    })
    if (result.id) {
      setTemplateMsg({ type: 'ok', text: `"${newTplName}" created.` })
      setNewTplName(''); setShowNewTemplate(false)
      await loadTemplates()
    } else {
      setTemplateMsg({ type: 'err', text: 'Failed to create template.' })
    }
    setTimeout(() => setTemplateMsg(null), 3000)
  }

  async function handleDeleteTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return
    await window.api.templates.delete(id)
    await loadTemplates()
    setTemplateMsg({ type: 'ok', text: `"${name}" deleted.` })
    setTimeout(() => setTemplateMsg(null), 3000)
  }

  async function loadAreas() {
    setAreaLoading(true)
    const data = await window.api.areas.list()
    setAreas(data)
    setAreaLoading(false)
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return
    const result = await window.api.areas.create(newAreaName.trim(), newAreaColor)
    if (result.error) { setAreaMsg({ type: 'err', text: result.error }); return }
    setNewAreaName(''); setShowNewArea(false)
    await loadAreas(); await refreshAreas()
    setAreaMsg({ type: 'ok', text: `"${newAreaName}" added.` })
    setTimeout(() => setAreaMsg(null), 3000)
  }

  async function handleUpdateArea(id: string) {
    const result = await window.api.areas.update(id, editAreaName.trim(), editAreaColor)
    if (result.error) { setAreaMsg({ type: 'err', text: result.error }); return }
    setEditingArea(null)
    await loadAreas(); await refreshAreas()
  }

  async function handleDeleteArea(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const result = await window.api.areas.delete(id)
    if (result.error) { setAreaMsg({ type: 'err', text: result.error }); return }
    await loadAreas(); await refreshAreas()
    setAreaMsg({ type: 'ok', text: `"${name}" deleted.` })
    setTimeout(() => setAreaMsg(null), 3000)
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

  // Claude disconnect
  async function handleDisconnectClaude() {
    if (!localUser) return
    if (!confirm('Disconnect your Claude account? You will lose access to personal AI features.')) return
    await window.api.claude.removeUserKey(localUser.id)
    setClaudeConnected(false)
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-400 dark:text-white/65 text-sm mt-1">Manage your account and workspace</p>
        </div>

        {/* Profile */}
        <Section title="Profile">
          <Row>
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-hub-gold/15 border border-hub-gold/30 flex items-center justify-center shrink-0">
                <span className="text-hub-gold font-bold text-sm">{displayName[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
                <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">{displayEmail}</p>
              </div>
            </div>
            <div className="flex gap-1.5">{isAdmin && <RoleBadge role="admin" />}</div>
          </Row>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <Row>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Theme</p>
              <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">Choose your preferred color scheme</p>
            </div>
            <div className="flex gap-1.5">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`titlebar-no-drag px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                    theme === t
                      ? 'bg-hub-gold text-white'
                      : 'bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/[0.12]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Background</p>
              <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">Applied in dark mode</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {GRADIENT_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setGradientTheme(p.id)}
                  title={p.label}
                  style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  className={`titlebar-no-drag w-7 h-7 rounded-lg transition-all ${
                    gradientTheme === p.id
                      ? 'ring-2 ring-hub-gold ring-offset-2 ring-offset-white dark:ring-offset-gray-900 scale-110'
                      : 'opacity-60 hover:opacity-100 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </Row>
          <Row>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Light Background</p>
              <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">Applied in light mode</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {LIGHT_THEME_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setLightTheme(p.id)}
                  title={p.label}
                  style={{
                    background: `linear-gradient(135deg, ${p.start}, ${p.end})`,
                    border: '1px solid rgba(0,0,0,0.12)',
                  }}
                  className={`titlebar-no-drag w-7 h-7 rounded-lg transition-all ${
                    lightTheme === p.id
                      ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 scale-110'
                      : 'opacity-80 hover:opacity-100 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </Row>
        </Section>

        {/* Claude AI */}
        <Section title="Claude AI">
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Your Claude account</p>
                  {claudeConnected && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Connected</span>
                  )}
                  {!claudeConnected && teamKeyExists && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">Team key active</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5 leading-relaxed">
                  {claudeConnected
                    ? 'AI features are active using your personal API key.'
                    : teamKeyExists
                      ? "AI is available via your team's shared key. Connect your own for dedicated access."
                      : 'Connect your Claude account to unlock AI-assisted drafting and analysis.'}
                </p>
              </div>
              {claudeConnected ? (
                <button onClick={handleDisconnectClaude}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-red-500/10 hover:bg-red-500/15 text-red-400/80 hover:text-red-400 border border-red-500/15 transition shrink-0">
                  Disconnect
                </button>
              ) : localUser ? (
                <button onClick={() => setShowClaudeConnect(v => !v)}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold font-medium transition shrink-0">
                  {showClaudeConnect ? 'Cancel' : 'Connect →'}
                </button>
              ) : null}
            </div>
            {showClaudeConnect && !claudeConnected && localUser && (
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
                <ConnectClaude
                  userId={localUser.id}
                  onConnected={() => { setClaudeConnected(true); setShowClaudeConnect(false) }}
                  onSkip={() => setShowClaudeConnect(false)}
                />
              </div>
            )}
          </div>
        </Section>

        {/* Integrations (admin only) */}
        {isAdmin && (
          <Section title="Integrations">
            {/* Team shared API key */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Team shared key</p>
                  <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5 font-mono">{maskedKey ?? 'Not set'}</p>
                  <p className="text-[11px] text-gray-300 dark:text-white/50 mt-1 leading-relaxed">Fallback key for team members who haven't connected their own Claude account.</p>
                </div>
                <button onClick={() => { setEditingKey(v => !v); setNewKey(''); setKeyMsg(null) }}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.13] text-gray-500 dark:text-white/75 hover:text-gray-900 dark:hover:text-white transition shrink-0">
                  {editingKey ? 'Cancel' : maskedKey ? 'Update' : 'Add key'}
                </button>
              </div>
              {editingKey && (
                <form onSubmit={handleSaveKey} className="mt-3 space-y-2">
                  <input type="password" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="sk-ant-api03-…" autoFocus
                    className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
                  <button type="submit" disabled={savingKey || newKey.trim().length < 20}
                    className="titlebar-no-drag w-full py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition">
                    {savingKey ? 'Saving…' : 'Save key'}
                  </button>
                </form>
              )}
              {keyMsg && <p className={`mt-2 text-xs ${keyMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{keyMsg.text}</p>}
            </div>

            {/* Google Drive */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Google Drive Backup</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${driveConnected ? 'bg-green-500/15 border-green-500/25 text-green-400' : 'bg-gray-50 dark:bg-white/[0.05] border-gray-200 dark:border-white/10 text-gray-400 dark:text-white/50'}`}>
                      {driveConnected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">Silently auto-syncs task data and notes to Drive every 5 minutes.</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {driveConnected ? (
                    <>
                      <button onClick={handleSyncNow} disabled={syncingNow}
                        className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-gray-50 dark:bg-white/[0.07] hover:bg-gray-100 dark:hover:bg-white/[0.12] text-gray-500 dark:text-white/75 hover:text-gray-900 dark:hover:text-white transition">
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
                <div className="mt-3 p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-3 text-xs">
                  <p className="text-gray-500 dark:text-white/65 leading-relaxed">
                    <span className="text-gray-600 dark:text-white/75 font-semibold">Setup:</span> Go to{' '}
                    <span className="text-gray-500 dark:text-white/75 underline cursor-pointer" onClick={() => window.open('https://console.cloud.google.com', '_blank')}>console.cloud.google.com</span>
                    {' '}→ Create project → Enable Drive API + Gmail API → Credentials → Create OAuth 2.0 Client ID (Desktop app) → copy Client ID &amp; Secret below.
                  </p>
                  <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Google OAuth2 Client ID"
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <input type="password" value={clientSec} onChange={e => setClientSec(e.target.value)} placeholder="Google OAuth2 Client Secret"
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <button onClick={handleSaveCredentials} disabled={!clientId.trim() || !clientSec.trim()}
                    className="titlebar-no-drag w-full py-2 rounded-lg bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.12] text-gray-900 dark:text-white text-xs font-semibold transition disabled:opacity-40">
                    Generate auth URL →
                  </button>
                  {driveAuthUrl && (
                    <div className="space-y-2 pt-1">
                      <p className="text-gray-500 dark:text-white/65">Copy this URL, open it in your browser (sign in with kantorconsulting.hub@gmail.com), then paste the code you receive:</p>
                      <div className="flex gap-2">
                        <input readOnly value={driveAuthUrl}
                          className="flex-1 px-2 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] text-gray-500 dark:text-white/65 font-mono text-[10px]" />
                        <button onClick={() => navigator.clipboard.writeText(driveAuthUrl)}
                          className="titlebar-no-drag px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.07] hover:bg-gray-100 dark:hover:bg-white/[0.12] text-gray-500 dark:text-white/50 text-xs transition">
                          Copy
                        </button>
                      </div>
                      <input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="Paste authorization code here"
                        className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
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
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Gmail (invite emails)</p>
                    {gmailSaved && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Configured</span>}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">Sends from kantorconsulting.hub@gmail.com via an app password.</p>
                </div>
                <button onClick={() => { setGmailEditing(v => !v); setGmailPass('') }}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.13] text-gray-500 dark:text-white/75 hover:text-gray-900 dark:hover:text-white transition shrink-0">
                  {gmailEditing ? 'Cancel' : gmailSaved ? 'Update' : 'Set password'}
                </button>
              </div>
              {gmailEditing && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-400 dark:text-white/65 leading-relaxed">
                    Generate an app password at{' '}
                    <span className="text-gray-500 dark:text-white/50 underline cursor-pointer" onClick={() => window.open('https://myaccount.google.com/apppasswords', '_blank')}>myaccount.google.com</span>
                    {' '}→ Security → 2-Step Verification → App passwords.
                  </p>
                  <input type="password" value={gmailPass} onChange={e => setGmailPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" autoFocus
                    className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition" />
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

        {/* Areas of Analysis (admin only) */}
        {isAdmin && (
          <Section title="Areas of Analysis">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400 dark:text-white/65">{areas.length} area{areas.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowNewArea(v => !v)}
                  className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  New area
                </button>
              </div>

              {showNewArea && (
                <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-3">
                  <div className="flex gap-2">
                    <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)} placeholder="Area name *" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateArea() }}
                      className="titlebar-no-drag flex-1 px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40" />
                    <div className="relative shrink-0">
                      <input type="color" value={newAreaColor} onChange={e => setNewAreaColor(e.target.value)}
                        className="titlebar-no-drag w-10 h-9 rounded-lg border border-gray-200 dark:border-white/[0.08] cursor-pointer p-0.5 bg-white dark:bg-white/[0.06]"
                        title="Pick a color" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateArea} disabled={!newAreaName.trim()}
                      className="titlebar-no-drag flex-1 py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-xs font-semibold transition">
                      Add area
                    </button>
                    <button onClick={() => { setShowNewArea(false); setNewAreaName(''); setNewAreaColor('#6366f1') }}
                      className="titlebar-no-drag px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] text-gray-500 dark:text-white/65 text-xs transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {areaMsg && (
                <div className={`mb-3 p-2.5 rounded-xl text-xs ${areaMsg.type === 'ok' ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400'}`}>
                  {areaMsg.text}
                </div>
              )}

              {areaLoading ? (
                <p className="text-sm text-gray-400 dark:text-white/50 py-3 text-center">Loading…</p>
              ) : (
                <div className="space-y-1">
                  {areas.map(a => (
                    <div key={a.id}>
                      {editingArea === a.id ? (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-2">
                          <div className="flex gap-2">
                            <input value={editAreaName} onChange={e => setEditAreaName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleUpdateArea(a.id) }}
                              className="titlebar-no-drag flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/40" />
                            <input type="color" value={editAreaColor} onChange={e => setEditAreaColor(e.target.value)}
                              className="titlebar-no-drag w-9 h-8 rounded-lg border border-gray-200 dark:border-white/[0.08] cursor-pointer p-0.5 bg-white dark:bg-white/[0.06]" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateArea(a.id)}
                              className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition">Save</button>
                            <button onClick={() => setEditingArea(null)}
                              className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.03] group transition">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                            <span className="text-sm text-gray-800 dark:text-white/80 font-medium truncate">{a.name}</span>
                            {!!a.is_default && (
                              <span className="text-[10px] text-gray-400 dark:text-white/50">default</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                            <button onClick={() => { setEditingArea(a.id); setEditAreaName(a.name); setEditAreaColor(a.color) }}
                              className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-gray-400 dark:text-white/65 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.08] transition text-xs">
                              Edit
                            </button>
                            {!a.is_default && (
                              <button onClick={() => handleDeleteArea(a.id, a.name)}
                                className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-red-400/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition text-xs">
                                Delete
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

        {/* Task Templates (admin only) */}
        {isAdmin && (
          <Section title="Task Templates">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400 dark:text-white/65">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowNewTemplate(v => !v)}
                  className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  New template
                </button>
              </div>

              {showNewTemplate && (
                <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-2.5">
                  <input value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="Template name *" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateTemplate() }}
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/40" />
                  <select value={newTplType} onChange={e => setNewTplType(e.target.value)}
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40">
                    <option value="policy-brief">Policy Brief</option>
                    <option value="research-report">Research Report</option>
                    <option value="op-ed">Op-Ed</option>
                    <option value="briefing-note">Briefing Note</option>
                    <option value="consulting-engagement">Consulting Engagement</option>
                    <option value="client-advisory">Client Advisory</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-white/65 shrink-0">Duration (days):</label>
                    <input type="number" min={1} value={newTplDuration} onChange={e => setNewTplDuration(parseInt(e.target.value, 10) || 1)}
                      className="titlebar-no-drag w-20 px-2.5 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/40" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateTemplate} disabled={!newTplName.trim()}
                      className="titlebar-no-drag flex-1 py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-xs font-semibold transition">
                      Create template
                    </button>
                    <button onClick={() => { setShowNewTemplate(false); setNewTplName('') }}
                      className="titlebar-no-drag px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] text-gray-500 dark:text-white/65 text-xs transition">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {templateMsg && (
                <div className={`mb-3 p-2.5 rounded-xl text-xs ${templateMsg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                  {templateMsg.text}
                </div>
              )}

              {templateLoading ? (
                <p className="text-sm text-gray-400 dark:text-white/50 py-3 text-center">Loading…</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-white/50 py-3 text-center">No templates yet.</p>
              ) : (
                <div className="space-y-1">
                  {templates.map(tpl => (
                    <div key={tpl.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] group transition">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-gray-700 dark:text-white/80 font-medium truncate">{tpl.name}</p>
                          {!!tpl.is_builtin && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-white/[0.08] text-gray-400 dark:text-white/50 border border-gray-200 dark:border-white/[0.06]">Built-in</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-white/50 mt-0.5">{tpl.content_type} · {tpl.duration_days} days</p>
                      </div>
                      {!tpl.is_builtin && (
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                          className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2.5 py-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition text-xs">
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Team Management (admin only) */}
        {isAdmin && (
          <Section title="Team Management">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-400 dark:text-white/65">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowInvite(v => !v)}
                  className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-xs font-semibold transition">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Invite member
                </button>
              </div>

              {showInvite && (
                <form onSubmit={handleInvite} className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-2">
                  <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name *" required
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@kantor-consulting.com *" required
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'member'|'admin')}
                    className="titlebar-no-drag w-full px-3 py-2 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-hub-gold/30">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                      className="titlebar-no-drag flex-1 py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-xs font-semibold transition">
                      {inviting ? 'Sending…' : 'Send invite'}
                    </button>
                    <button type="button" onClick={() => setShowInvite(false)}
                      className="titlebar-no-drag px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] text-gray-500 dark:text-white/65 text-xs transition">
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
                <p className="text-sm text-gray-400 dark:text-white/50 py-4 text-center">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-white/50 py-4 text-center">No team members yet.</p>
              ) : (
                <div className="space-y-1">
                  {members.map(m => (
                    <div key={m.id}>
                      {editingId === m.id ? (
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.08] space-y-2">
                          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"
                            className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30" />
                          <select value={editRole} onChange={e => setEditRole(e.target.value)}
                            className="titlebar-no-drag w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-hub-gold/30">
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEdit(m.id)}
                              className="titlebar-no-drag flex-1 py-1.5 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="titlebar-no-drag px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/65 text-xs transition">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] group">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-gray-700 dark:text-white/80 font-medium truncate">{m.full_name || m.email}</p>
                              <RoleBadge role={m.role} />
                              <StatusBadge status={m.status} />
                            </div>
                            {m.full_name && <p className="text-xs text-gray-400 dark:text-white/50 truncate">{m.email}</p>}
                            <p className="text-[10px] text-gray-300 dark:text-white/50 mt-0.5">Last active: {fmtActive(m.last_active)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                            <button onClick={() => { setEditingId(m.id); setEditName(m.full_name ?? ''); setEditRole(m.role) }}
                              className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-gray-400 dark:text-white/65 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.08] transition text-xs">
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
              <p className="text-sm font-medium text-gray-900 dark:text-white">Version</p>
              <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5 font-mono">v{appVersion || '…'}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => window.open('https://github.com/kantorconsulting/kantor-consulting-hub/releases', '_blank')}
                className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.13] text-gray-500 dark:text-white/75 hover:text-gray-900 dark:hover:text-white transition">
                Check for updates
              </button>
            )}
          </Row>
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Sign out</p>
              <p className="text-xs text-gray-400 dark:text-white/65 mt-0.5">You'll need to sign in again to access the workspace</p>
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
