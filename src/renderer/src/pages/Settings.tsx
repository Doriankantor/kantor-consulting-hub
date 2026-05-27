import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, GRADIENT_PRESETS, LIGHT_THEME_PRESETS } from '../contexts/ThemeContext'
import ConnectClaude from '../components/ConnectClaude'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUpdate } from '../contexts/UpdateContext'
import type { Area } from '../types'

function formatLastChecked(ts: number): string {
  const diffMs = Date.now() - ts
  const diffM  = Math.floor(diffMs / 60000)
  const diffH  = Math.floor(diffMs / 3600000)
  if (diffM < 1)  return 'Just now'
  if (diffM < 60) return `${diffM}m ago`
  if (diffH < 24) return `${diffH}h ago`
  return new Date(ts).toLocaleDateString()
}

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
  const { state: updateState, version: updateVersion, percent: updatePercent, errorMsg: updateErrorMsg, lastChecked, autoInstall, releaseNotes, checkNow, downloadNow, setAutoInstall } = useUpdate()

  // ── API key ────────────────────────────────────────────────────────────────
  const [maskedKey,  setMaskedKey]  = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [newKey,     setNewKey]     = useState('')
  const [keyMsg,     setKeyMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)
  const [savingKey,  setSavingKey]  = useState(false)

  // ── Connected Accounts (Personal Google) ──────────────────────────────────
  const [googleConnected,  setGoogleConnected]  = useState(false)
  const [googleAuthUrl,    setGoogleAuthUrl]    = useState<string|null>(null) // eslint-disable-line @typescript-eslint/no-unused-vars
  const [googleAuthCode,   setGoogleAuthCode]   = useState('')
  const [googleMsg,        setGoogleMsg]        = useState<{type:'ok'|'err';text:string}|null>(null)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  const [showGoogleSetup,  setShowGoogleSetup]  = useState(false)

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

  // ── Team tabs ──────────────────────────────────────────────────────────────
  const [teamTab, setTeamTab] = useState<'members'|'board-access'>('members')

  // ── Board Access matrix ────────────────────────────────────────────────────
  type BoardRow = { id: string; name: string }
  const [matrixBoards,  setMatrixBoards]  = useState<BoardRow[]>([])
  const [matrixMembers, setMatrixMembers] = useState<LocalTeamMember[]>([])
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({}) // boardId → Set<userId>
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixMsg,     setMatrixMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)

  async function loadMatrix() {
    setMatrixLoading(true)
    try {
      const [bs, ms] = await Promise.all([window.api.boards.list(false), window.api.team.list()])
      setMatrixBoards(bs.map(b => ({ id: b.id, name: b.name })))
      setMatrixMembers(ms)
      const m: Record<string, Set<string>> = {}
      for (const b of bs) {
        const bMembers = await window.api.boardMembers.list(b.id)
        m[b.id] = new Set(bMembers.map(bm => bm.user_id))
      }
      setMatrix(m)
    } catch {
      setMatrixMsg({ type: 'err', text: 'Failed to load board access data.' })
      setTimeout(() => setMatrixMsg(null), 3000)
    }
    setMatrixLoading(false)
  }

  async function toggleBoardAccess(boardId: string, userId: string, hasAccess: boolean) {
    const member = matrixMembers.find(m => m.id === userId)
    const board  = matrixBoards.find(b => b.id === boardId)
    if (!member || !board) return
    try {
      if (hasAccess) {
        await window.api.boardMembers.remove(boardId, userId)
        setMatrix(prev => {
          const next = { ...prev }
          next[boardId] = new Set(prev[boardId])
          next[boardId].delete(userId)
          return next
        })
      } else {
        const adderName = localUser?.name ?? 'Admin'
        await window.api.boardMembers.add(boardId, userId, adderName)
        setMatrix(prev => {
          const next = { ...prev }
          next[boardId] = new Set(prev[boardId])
          next[boardId].add(userId)
          return next
        })
      }
    } catch {
      setMatrixMsg({ type: 'err', text: 'Failed to update access.' })
      setTimeout(() => setMatrixMsg(null), 3000)
    }
  }

  async function grantAllBoards(userId: string) {
    const adderName = localUser?.name ?? 'Admin'
    for (const b of matrixBoards) {
      if (!matrix[b.id]?.has(userId)) {
        await window.api.boardMembers.add(b.id, userId, adderName).catch(() => {})
        setMatrix(prev => {
          const next = { ...prev }
          next[b.id] = new Set(prev[b.id])
          next[b.id].add(userId)
          return next
        })
      }
    }
  }

  async function revokeAllBoards(userId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from all non-admin boards? They will lose access immediately.`)) return
    for (const b of matrixBoards) {
      if (matrix[b.id]?.has(userId)) {
        // Don't remove admins
        const memberRow = matrixMembers.find(m => m.id === userId)
        if (memberRow?.role === 'admin') continue
        await window.api.boardMembers.remove(b.id, userId).catch(() => {})
        setMatrix(prev => {
          const next = { ...prev }
          next[b.id] = new Set(prev[b.id])
          next[b.id].delete(userId)
          return next
        })
      }
    }
  }

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

  // ── Archived Projects ──────────────────────────────────────────────────────
  const [archivedProjects, setArchivedProjects] = useState<import('../types').Board[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState<{type:'ok'|'err';text:string}|null>(null)
  const [boardTaskCounts, setBoardTaskCounts] = useState<Record<string, number>>({})

  // ── App ────────────────────────────────────────────────────────────────────
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (localUser?.id) {
      window.api.userGoogle.getStatus(localUser.id).then(s => setGoogleConnected(s.connected)).catch(() => {})
    }
  }, [localUser?.id])

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
    if (isAdmin) { loadAreas(); loadTeam(); loadTemplates(); loadMatrix() }
    async function loadArchived() {
      setArchivedLoading(true)
      try {
        const boardsList = await window.api.boards.listArchived()
        setArchivedProjects(boardsList)
        const counts: Record<string, number> = {}
        await Promise.all(boardsList.map(async (b: import('../types').Board) => {
          counts[b.id] = await window.api.boards.taskCount(b.id)
        }))
        setBoardTaskCounts(counts)
      } catch {}
      setArchivedLoading(false)
    }
    loadArchived()
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

  // Archived projects
  async function handleRestoreBoard(id: string, name: string) {
    await window.api.boards.restore(id)
    setArchivedProjects(prev => prev.filter(b => b.id !== id))
    setArchiveMsg({ type: 'ok', text: `"${name}" restored successfully.` })
    setTimeout(() => setArchiveMsg(null), 3000)
  }

  async function handleDeleteBoard(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"?\n\nThis will delete all tasks, comments, and data. This cannot be undone.`)) return
    await window.api.boards.delete(id)
    setArchivedProjects(prev => prev.filter(b => b.id !== id))
    setArchiveMsg({ type: 'ok', text: `"${name}" permanently deleted.` })
    setTimeout(() => setArchiveMsg(null), 3000)
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

  // Personal Google Account — single-step loopback flow
  async function handleConnectGoogle() {
    if (!localUser?.id) return
    setConnectingGoogle(true)
    setGoogleMsg(null)
    try {
      // Opens the browser, waits for the loopback redirect, exchanges code — all in one call
      const result = await window.api.userGoogle.connect(localUser.id)
      if (result.ok) {
        setGoogleConnected(true)
        setGoogleMsg({ type: 'ok', text: 'Google account connected successfully.' })
      } else {
        setGoogleMsg({ type: 'err', text: result.error ?? 'Failed to connect.' })
      }
    } finally {
      setConnectingGoogle(false)
    }
  }

  async function handleDisconnectGoogle() {
    if (!localUser?.id) return
    await window.api.userGoogle.disconnect(localUser.id)
    setGoogleConnected(false)
    setGoogleMsg({ type: 'ok', text: 'Google account disconnected.' })
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
            {/* Tabs */}
            <div className="flex border-b border-gray-100 dark:border-white/[0.06]">
              <button
                onClick={() => setTeamTab('members')}
                className={`titlebar-no-drag px-5 py-3 text-xs font-semibold transition border-b-2 ${teamTab === 'members' ? 'border-hub-gold text-hub-gold' : 'border-transparent text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70'}`}
              >
                Members
              </button>
              <button
                onClick={() => { setTeamTab('board-access'); if (matrixBoards.length === 0) loadMatrix() }}
                className={`titlebar-no-drag px-5 py-3 text-xs font-semibold transition border-b-2 ${teamTab === 'board-access' ? 'border-hub-gold text-hub-gold' : 'border-transparent text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70'}`}
              >
                Board Access
              </button>
            </div>

            {teamTab === 'members' && (
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
            )}

            {/* Board Access tab */}
            {teamTab === 'board-access' && (
              <div className="px-5 py-4">
                {matrixMsg && (
                  <div className={`mb-3 p-2.5 rounded-xl text-xs ${matrixMsg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                    {matrixMsg.text}
                  </div>
                )}
                {matrixLoading ? (
                  <p className="text-sm text-gray-400 dark:text-white/50 py-4 text-center">Loading…</p>
                ) : matrixBoards.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-white/50 py-4 text-center">No boards yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-2 pr-3 text-gray-400 dark:text-white/50 font-semibold uppercase tracking-wider text-[10px]">Member</th>
                          {matrixBoards.map(b => (
                            <th key={b.id} className="py-2 px-2 text-gray-400 dark:text-white/50 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap max-w-[80px] truncate" title={b.name}>
                              <span className="block truncate max-w-[72px]">{b.name}</span>
                            </th>
                          ))}
                          <th className="py-2 pl-3 text-right text-gray-400 dark:text-white/50 font-semibold uppercase tracking-wider text-[10px]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                        {matrixMembers.map(m => {
                          const isAdminMember = m.role === 'admin'
                          const name = m.full_name || m.email
                          return (
                            <tr key={m.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition">
                              <td className="py-2.5 pr-3 min-w-[120px]">
                                <div>
                                  <p className="font-medium text-gray-700 dark:text-white/80 truncate max-w-[140px]">{name}</p>
                                  <p className="text-[10px] text-gray-400 dark:text-white/45 truncate max-w-[140px]">{m.email}</p>
                                </div>
                              </td>
                              {matrixBoards.map(b => {
                                const hasAccess = isAdminMember || !!(matrix[b.id]?.has(m.id))
                                return (
                                  <td key={b.id} className="py-2.5 px-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={hasAccess}
                                      disabled={isAdminMember}
                                      onChange={() => toggleBoardAccess(b.id, m.id, hasAccess)}
                                      className={`titlebar-no-drag w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed ${hasAccess ? 'accent-green-500' : ''}`}
                                      title={hasAccess ? 'Has access' : 'No access'}
                                    />
                                  </td>
                                )
                              })}
                              <td className="py-2.5 pl-3">
                                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                                  {!isAdminMember && (
                                    <>
                                      <button
                                        onClick={() => grantAllBoards(m.id)}
                                        className="titlebar-no-drag px-2 py-1 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 text-[10px] font-medium transition whitespace-nowrap"
                                      >
                                        Grant all
                                      </button>
                                      <button
                                        onClick={() => revokeAllBoards(m.id, name)}
                                        className="titlebar-no-drag px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 text-[10px] font-medium transition whitespace-nowrap"
                                      >
                                        Revoke all
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {/* Summary row */}
                        <tr className="border-t-2 border-gray-200 dark:border-white/[0.1]">
                          <td className="py-2 pr-3 text-[10px] text-gray-400 dark:text-white/50 font-semibold uppercase tracking-wider">Total members</td>
                          {matrixBoards.map(b => (
                            <td key={b.id} className="py-2 px-2 text-center text-[11px] font-bold text-gray-600 dark:text-white/65">
                              {matrix[b.id]?.size ?? 0}
                            </td>
                          ))}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Archived Projects */}
        <Section title="Archived Projects">
          <div className="px-5 py-4">
            {archiveMsg && (
              <div className={`mb-3 p-2.5 rounded-xl text-xs ${archiveMsg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {archiveMsg.text}
              </div>
            )}
            {archivedLoading ? (
              <p className="text-sm text-gray-400 dark:text-white/50 py-3 text-center">Loading…</p>
            ) : archivedProjects.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/50 py-3 text-center">No archived projects.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-gray-400 dark:text-white/50 uppercase tracking-widest">
                      <th className="text-left pb-3 font-semibold">Project</th>
                      <th className="text-right pb-3 font-semibold">Tasks</th>
                      <th className="text-left pb-3 pl-4 font-semibold">Archived</th>
                      <th className="text-left pb-3 pl-4 font-semibold">By</th>
                      <th className="pb-3"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                    {archivedProjects.map(board => (
                      <tr key={board.id} className="group">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <svg width="12" height="12" viewBox="0 0 13 13" fill="none" className="text-gray-400 dark:text-white/40 shrink-0">
                              <rect x="1" y="3.5" width="11" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                              <path d="M1 3.5l1.5-2.5h8L12 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                              <path d="M4.5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                            <span className="font-medium text-gray-700 dark:text-white/75 italic">{board.name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-gray-400 dark:text-white/50 tabular-nums">
                          {boardTaskCounts[board.id] ?? '–'}
                        </td>
                        <td className="py-3 pl-4 text-gray-400 dark:text-white/50 text-xs">
                          {board.archived_at ? new Date(board.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '–'}
                        </td>
                        <td className="py-3 pl-4 text-gray-400 dark:text-white/50 text-xs truncate max-w-[100px]">
                          {board.archived_by ?? '–'}
                        </td>
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => handleRestoreBoard(board.id, board.name)}
                              className="titlebar-no-drag px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-medium transition"
                            >
                              Restore
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteBoard(board.id, board.name)}
                                className="titlebar-no-drag px-2.5 py-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 text-xs transition"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>

        {/* Connected Accounts */}
        <Section title="Connected Accounts">
          <div className="px-5 py-4 space-y-3">
            {googleMsg && (
              <div className={`p-2.5 rounded-xl text-xs ${googleMsg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {googleMsg.text}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${googleConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-white/25'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Personal Google Account</p>
                  <p className="text-xs text-gray-400 dark:text-white/50 mt-0.5">Calendar read/write · Drive read-only</p>
                </div>
              </div>
              {googleConnected ? (
                <button
                  onClick={handleDisconnectGoogle}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
                >
                  {connectingGoogle ? 'Waiting for browser…' : 'Connect'}
                </button>
              )}
            </div>
            {connectingGoogle && (
              <p className="text-xs text-gray-400 dark:text-white/40 italic">
                Browser opened — complete sign-in and the connection will complete automatically…
              </p>
            )}
          </div>
        </Section>

        {/* Updates */}
        <Section title="Updates">
          <div className="px-5 py-4 space-y-4">
            {/* Version + status row */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Version</p>
                  <span className="font-mono text-xs text-gray-500 dark:text-white/60">v{appVersion || '…'}</span>
                </div>
                {/* Status */}
                {updateState === 'uptodate' && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-xs text-green-600 dark:text-green-400">Up to date</span>
                  </div>
                )}
                {(updateState === 'available' || updateState === 'downloading' || updateState === 'ready') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      {updateState === 'ready' ? `Ready to install v${updateVersion}` : `Update available: v${updateVersion}`}
                    </span>
                    {releaseNotes && (
                      <a
                        href={`https://github.com/Doriankantor/kantor-consulting-hub/releases/tag/v${updateVersion}`}
                        target="_blank" rel="noopener noreferrer"
                        className="titlebar-no-drag text-xs text-indigo-500 hover:text-indigo-600 underline"
                      >
                        Release notes
                      </a>
                    )}
                  </div>
                )}
                {updateState === 'error' && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-xs text-red-500 dark:text-red-400 font-medium">Update failed</span>
                  </div>
                )}
                {(updateState === 'idle' || updateState === 'checking') && lastChecked && (
                  <p className="text-xs text-gray-400 dark:text-white/40">
                    Last checked: {formatLastChecked(lastChecked)}
                  </p>
                )}
                {lastChecked && (updateState === 'uptodate' || updateState === 'error') && (
                  <p className="text-xs text-gray-400 dark:text-white/40">
                    Last checked: {formatLastChecked(lastChecked)}
                  </p>
                )}
                {updateState === 'error' && updateErrorMsg && (
                  <p className="text-[11px] text-red-400/80 dark:text-red-400/70 max-w-[200px] leading-snug">
                    {updateErrorMsg}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                {/* Update now */}
                {updateState === 'available' && (
                  <button
                    onClick={downloadNow}
                    className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition"
                  >
                    Update now
                  </button>
                )}

                {/* Progress bar */}
                {updateState === 'downloading' && (
                  <div className="flex flex-col items-end gap-1 w-44">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs text-gray-400 dark:text-white/40">
                        {updatePercent < 5 ? 'Preparing…' : updatePercent < 99 ? 'Downloading…' : 'Verifying…'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-white/50 tabular-nums font-medium">{updatePercent}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${Math.max(updatePercent, 3)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Restart & install */}
                {updateState === 'ready' && (
                  <button
                    onClick={() => window.api.updater.install()}
                    className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-hub-gold hover:bg-hub-gold-light text-white font-medium transition"
                  >
                    Restart &amp; install
                  </button>
                )}

                {/* Error — retry button */}
                {updateState === 'error' && (
                  <button
                    onClick={downloadNow}
                    className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.13] text-gray-600 dark:text-white/70 font-medium transition"
                  >
                    Retry
                  </button>
                )}

                {/* Check for updates */}
                {updateState !== 'available' && updateState !== 'downloading' && updateState !== 'ready' && (
                  <button
                    onClick={checkNow}
                    disabled={updateState === 'checking'}
                    className="titlebar-no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-white/[0.08] hover:bg-gray-200 dark:hover:bg-white/[0.13] text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition disabled:opacity-60"
                  >
                    {updateState === 'checking' ? (
                      <>
                        <div className="w-3 h-3 border-[1.5px] border-gray-400/30 border-t-gray-500 dark:border-t-white/60 rounded-full animate-spin" />
                        Checking…
                      </>
                    ) : 'Check for updates'}
                  </button>
                )}
              </div>
            </div>

            {/* Auto-update toggle — admin only */}
            {isAdmin && (
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm text-gray-700 dark:text-white/80">Automatically install updates</p>
                  <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">Downloads and installs on next restart without asking</p>
                </div>
                <div
                  onClick={() => setAutoInstall(!autoInstall)}
                  className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${autoInstall ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-white/[0.12]'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoInstall ? 'left-4' : 'left-0.5'}`} />
                </div>
              </label>
            )}
          </div>
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
