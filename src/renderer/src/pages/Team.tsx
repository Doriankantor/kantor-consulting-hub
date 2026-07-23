import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { cetToday } from '../utils/urgency'
import TeamMemberProfilePanel from '../components/TeamMemberProfilePanel'
import { ADMIN_EMAIL } from '../supabase/client'

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, email }: { name: string | null; email: string }) {
  const label = (name || email)[0].toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-hub-gold/15 border border-hub-gold/25 flex items-center justify-center shrink-0">
      <span className="text-hub-gold font-bold text-sm select-none">{label}</span>
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'invited') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-500/10 border-amber-500/30 text-amber-500 dark:text-amber-400">
        Invited — pending
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
        Active
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-gray-100 dark:bg-white/[0.05] border-gray-200 dark:border-white/[0.08] text-gray-400 dark:text-white/50">
      {status}
    </span>
  )
}

// ── Role badge ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
      role === 'admin'
        ? 'bg-hub-gold/10 border-hub-gold/30 text-hub-gold'
        : 'bg-gray-50 dark:bg-white/[0.04] border-gray-200 dark:border-white/[0.08] text-gray-400 dark:text-white/65'
    }`}>
      {role === 'admin' ? 'Admin' : 'Member'}
    </span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function Team() {
  const { isRoot, localUser } = useAuth()
  const currentId = localUser?.id ?? null

  const [members, setMembers] = useState<LocalTeamMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null)
  // Access codes for members still pending — surfaced inline so the admin can re-share.
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({})
  // Off-work (v1): emails currently on leave (drives the pill), and the current
  // user's own window + the date-range picker for setting it.
  const [onLeaveEmails, setOnLeaveEmails] = useState<Set<string>>(new Set())
  const [myLeave, setMyLeave] = useState<{ start_date: string; end_date: string } | null>(null)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [savingLeave, setSavingLeave] = useState(false)
  const [leaveMsg, setLeaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Invite form
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [role,   setRole]   = useState<'member' | 'admin'>('member')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  // The access code to share for the most recently invited member.
  const [generatedCode, setGeneratedCode] = useState<{ email: string; name: string; code: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Permissions panel state (root-only)
  type PermRow = { user_email: string; permission_key: string }
  const [allPerms, setAllPerms] = useState<PermRow[]>([])
  const PERM_LABELS: Record<string, string> = {
    delete_attachment: 'Delete attachments',
    add_board_members: 'Add members to boards',
    delete_comment:    'Delete others’ comments',
    delete_intel_tag:  'Delete intelligence tags',
    delete_intel_doc:  'Delete intelligence documents',
    delete_intel_news: 'Delete intelligence news sources',
    delete_intel_social: 'Delete intelligence social posts',
  }
  const PERM_KEYS = Object.keys(PERM_LABELS)

  // ── Team sub-page tabs ──────────────────────────────────────────────────────
  const [teamTab, setTeamTab] = useState<'members' | 'access'>('members')

  // ── Board Access matrix (relocated from Settings → Board Access) ─────────────
  type BoardRow = { id: string; name: string; board_type?: string }
  const [matrixBoards,  setMatrixBoards]  = useState<BoardRow[]>([])
  const [matrixMembers, setMatrixMembers] = useState<LocalTeamMember[]>([])
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({}) // boardId → Set<email> (members)
  const [heads, setHeads]   = useState<Record<string, Set<string>>>({}) // info-page boardId → Set<user_email> (project heads)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixLoaded,  setMatrixLoaded]  = useState(false) // lazy-load guard: fetch once on first tab open, retry on failure
  const [matrixMsg,     setMatrixMsg]     = useState<{type:'ok'|'err';text:string}|null>(null)

  useEffect(() => { load() }, [])

  async function copyText(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    setCopied(tag)
    setTimeout(() => setCopied(c => (c === tag ? null : c)), 1800)
  }

  function shareMessage(name: string, email: string, code: string) {
    return `Hi ${name || 'there'},\n\nYou've been added to Kantor Consulting Hub. To sign in:\n\n1. Open the app\n2. Email: ${email}\n3. Access code: ${code}\n\nYou'll be asked to set your own password right after.`
  }

  async function copyMemberCode(member: LocalTeamMember) {
    const res = await window.api.team.getLoginCode(member.email)
    if (res?.code) await copyText(res.code, `code-${member.id}`)
  }

  async function load() {
    setLoading(true)
    try {
      const data = await window.api.team.list()
      setMembers(data)
      // Pre-fetch access codes for pending members so the admin can re-share them.
      const pending = data.filter(m => m.status === 'invited')
      const codeEntries = await Promise.all(
        pending.map(async m => {
          try { const r = await window.api.team.getLoginCode(m.email); return [m.id, r?.code ?? ''] as const }
          catch { return [m.id, ''] as const }
        })
      )
      setInviteCodes(Object.fromEntries(codeEntries.filter(([, c]) => c)))
      // Load permission grants for the panel (root-only — silently no-op for non-root)
      if (isRoot) {
        try { setAllPerms(await window.api.permissions.getAll()) } catch {}
      }
      // Off-work: who is currently on leave (pill) + my own window (picker prefill).
      try {
        const [leaves, mine] = await Promise.all([
          window.api.offWork.list(),
          window.api.offWork.get(),
        ])
        setOnLeaveEmails(new Set((leaves ?? []).map(l => l.user_email.toLowerCase())))
        if (mine) { setMyLeave(mine); setLeaveStart(mine.start_date); setLeaveEnd(mine.end_date) }
        else setMyLeave(null)
      } catch {}
    } catch {}
    setLoading(false)
  }

  async function handleSaveLeave() {
    setLeaveMsg(null)
    const today = cetToday()
    if (!leaveStart || !leaveEnd) { setLeaveMsg({ type: 'err', text: 'Pick both a start and end date.' }); return }
    if (leaveStart < today)   { setLeaveMsg({ type: 'err', text: 'Start date must be today or later.' }); return }
    if (leaveEnd < leaveStart) { setLeaveMsg({ type: 'err', text: 'End date must be on or after the start date.' }); return }
    setSavingLeave(true)
    try {
      const res = await window.api.offWork.set(leaveStart, leaveEnd)
      if (res?.ok) {
        setMyLeave({ start_date: leaveStart, end_date: leaveEnd })
        setLeaveMsg({ type: 'ok', text: 'Leave window saved.' })
        // Reflect my own pill immediately if the window covers today.
        const myEmail = localUser?.email?.toLowerCase()
        if (myEmail) {
          setOnLeaveEmails(prev => {
            const next = new Set(prev)
            if (leaveStart <= today && today <= leaveEnd) next.add(myEmail)
            else next.delete(myEmail)
            return next
          })
        }
      } else {
        setLeaveMsg({ type: 'err', text: res?.error || 'Could not save your leave window.' })
      }
    } catch {
      setLeaveMsg({ type: 'err', text: 'Could not save your leave window.' })
    }
    setSavingLeave(false)
  }

  async function handleClearLeave() {
    setLeaveMsg(null)
    setSavingLeave(true)
    try {
      const res = await window.api.offWork.clear()
      if (res?.ok) {
        setMyLeave(null)
        setLeaveStart('')
        setLeaveEnd('')
        setLeaveMsg({ type: 'ok', text: "Leave ended — welcome back." })
        // Optimistically drop my own pill (mirror of Save's optimistic add).
        const myEmail = localUser?.email?.toLowerCase()
        if (myEmail) setOnLeaveEmails(prev => {
          const next = new Set(prev)
          next.delete(myEmail)
          return next
        })
      } else {
        setLeaveMsg({ type: 'err', text: res?.error || 'Could not end your leave window.' })
      }
    } catch {
      setLeaveMsg({ type: 'err', text: 'Could not end your leave window.' })
    }
    setSavingLeave(false)
  }

  async function togglePerm(userEmail: string, key: string, on: boolean) {
    await window.api.permissions.set({ userEmail, key, on })
    setAllPerms(prev =>
      on
        ? [...prev.filter(p => !(p.user_email === userEmail && p.permission_key === key)),
           { user_email: userEmail, permission_key: key }]
        : prev.filter(p => !(p.user_email === userEmail && p.permission_key === key))
    )
  }

  // ── Board Access handlers (relocated verbatim from Settings; behaviour preserved) ──
  async function loadMatrix() {
    setMatrixLoading(true)
    try {
      const [bs, ms] = await Promise.all([window.api.boards.list(false), window.api.team.list()])
      setMatrixBoards(bs.map(b => ({ id: b.id, name: b.name, board_type: b.board_type })))
      setMatrixMembers(ms)
      const m: Record<string, Set<string>> = {}
      const h: Record<string, Set<string>> = {}
      for (const b of bs) {
        const bMembers = await window.api.boardMembers.list(b.id)
        // Key the member Set by lowercased EMAIL (listMembers sets email/user_id both
        // to the cloud user_email) — matching the render + toggles below, and mirroring
        // how heads are keyed. Fixes checkmarks vanishing on reload.
        m[b.id] = new Set(bMembers.map(bm => (bm.email || bm.user_id || '').toLowerCase()))
        // Project heads (info-page boards only) — email-keyed cloud info_page_owners.
        if (b.board_type === 'info-page') {
          try {
            const owners = await window.api.infoPages.getOwners(b.id)
            h[b.id] = new Set(owners.map(o => o.user_email.toLowerCase()))
          } catch { h[b.id] = new Set() }
        }
      }
      setMatrix(m)
      setHeads(h)
      setMatrixLoaded(true) // guard flips only on a successful load, so a failed first open retries on next click
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
    const key = member.email.toLowerCase()   // local Set is email-keyed; IPC stays m.id (server resolves id→email)
    try {
      if (hasAccess) {
        await window.api.boardMembers.remove(boardId, userId)
        setMatrix(prev => {
          const next = { ...prev }
          next[boardId] = new Set(prev[boardId])
          next[boardId].delete(key)
          return next
        })
        // Invariant: a head must be a member — removing membership removes head too.
        if (board.board_type === 'info-page' && heads[boardId]?.has(key)) {
          await window.api.infoPages.removeOwner(boardId, userId)
          setHeads(prev => {
            const next = { ...prev }
            next[boardId] = new Set(prev[boardId])
            next[boardId].delete(key)
            return next
          })
        }
      } else {
        const adderName = localUser?.name ?? 'Admin'
        await window.api.boardMembers.add(boardId, userId, adderName)
        setMatrix(prev => {
          const next = { ...prev }
          next[boardId] = new Set(prev[boardId])
          next[boardId].add(key)
          return next
        })
      }
    } catch {
      setMatrixMsg({ type: 'err', text: 'Failed to update access.' })
      setTimeout(() => setMatrixMsg(null), 3000)
    }
  }

  // Toggle a member as a project HEAD for an info-page board (root-only). Writes/removes
  // an email-keyed cloud info_page_owners row, then REFETCHES that board's heads (truth,
  // not an optimistic flip). Invariant: a head must be a member — turning head ON first
  // ensures board membership.
  async function toggleHead(boardId: string, member: LocalTeamMember, isHead: boolean) {
    const key = member.email.toLowerCase()   // local Sets are email-keyed; IPC stays member.id
    try {
      if (isHead) {
        // Turning head OFF — membership is left untouched.
        await window.api.infoPages.removeOwner(boardId, member.id)
      } else {
        // Turning head ON — a head must be a member: add membership first if missing.
        if (!matrix[boardId]?.has(key)) {
          const adderName = localUser?.name ?? 'Admin'
          await window.api.boardMembers.add(boardId, member.id, adderName)
          setMatrix(prev => {
            const next = { ...prev }
            next[boardId] = new Set(prev[boardId])
            next[boardId].add(key)   // green member check now appears alongside Head
            return next
          })
        }
        await window.api.infoPages.addOwner(boardId, member.id)
      }
      const owners = await window.api.infoPages.getOwners(boardId)
      setHeads(prev => ({ ...prev, [boardId]: new Set(owners.map(o => o.user_email.toLowerCase())) }))
    } catch {
      setMatrixMsg({ type: 'err', text: 'Failed to update project head.' })
      setTimeout(() => setMatrixMsg(null), 3000)
    }
  }

  async function grantAllBoards(userId: string) {
    const adderName = localUser?.name ?? 'Admin'
    const member = matrixMembers.find(m => m.id === userId)
    if (!member) return
    const key = member.email.toLowerCase()   // local Set is email-keyed; IPC stays m.id
    for (const b of matrixBoards) {
      if (!matrix[b.id]?.has(key)) {
        await window.api.boardMembers.add(b.id, userId, adderName).catch(() => {})
        setMatrix(prev => {
          const next = { ...prev }
          next[b.id] = new Set(prev[b.id])
          next[b.id].add(key)
          return next
        })
      }
    }
  }

  async function revokeAllBoards(userId: string, memberName: string) {
    if (!confirm(`Remove ${memberName} from all non-admin boards? They will lose access immediately.`)) return
    const member = matrixMembers.find(m => m.id === userId)
    if (!member) return
    // Don't remove root (root has no board_members rows and sees all via isRoot)
    if (member.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return
    const key = member.email.toLowerCase()   // local Set is email-keyed; IPC stays m.id
    for (const b of matrixBoards) {
      // Invariant: revoking membership also revokes head (info-page boards). Remove
      // head first so we never briefly leave a head without membership.
      if (b.board_type === 'info-page' && heads[b.id]?.has(key)) {
        await window.api.infoPages.removeOwner(b.id, userId).catch(() => {})
        setHeads(prev => {
          const next = { ...prev }
          next[b.id] = new Set(prev[b.id])
          next[b.id].delete(key)
          return next
        })
      }
      if (matrix[b.id]?.has(key)) {
        await window.api.boardMembers.remove(b.id, userId).catch(() => {})
        setMatrix(prev => {
          const next = { ...prev }
          next[b.id] = new Set(prev[b.id])
          next[b.id].delete(key)
          return next
        })
      }
    }
  }

  async function handleMarkActive(member: LocalTeamMember) {
    await window.api.team.markActive(member.id)
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: 'active' } : m))
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName  = name.trim()

    if (!trimmedEmail || !trimmedName) return

    // Client-side domain pre-check for instant feedback
    if (
      trimmedEmail !== ADMIN_EMAIL &&
      !trimmedEmail.endsWith('@kantor-consulting.com')
    ) {
      setMsg({ type: 'err', text: 'Only @kantor-consulting.com emails are allowed.' })
      return
    }

    setInviting(true)
    setMsg(null)

    try {
      const result = await window.api.team.invite({ email: trimmedEmail, full_name: trimmedName, role })

      if (result.error) {
        setMsg({ type: 'err', text: result.error })
      } else {
        const code = (result as { tempPassword?: string }).tempPassword
        if (code) {
          setGeneratedCode({ email: trimmedEmail, name: trimmedName, code })
          setMsg(null)
        } else {
          setMsg({ type: 'ok', text: `Member ${trimmedEmail} added.` })
        }
        setEmail('')
        setName('')
        setRole('member')
        await load()
      }
    } catch {
      setMsg({ type: 'err', text: 'An unexpected error occurred. Please try again.' })
    }

    setInviting(false)
  }

  async function handleRemove(member: LocalTeamMember) {
    if (!confirm(`Remove ${member.full_name || member.email} from the team? This cannot be undone.`)) return
    await window.api.team.remove(member.id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
  }

  const inputCls = 'titlebar-no-drag flex-1 px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition'

  return (
    <div className="p-6 h-full overflow-y-auto">

      {/* Header */}
      <div className="max-w-2xl mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
        <p className="text-gray-400 dark:text-white/65 text-sm mt-1">
          {members.length} member{members.length !== 1 ? 's' : ''} · Access managed by admin
        </p>
      </div>

      {/* ── Sub-page tabs ── "Board access & permissions" is root-only ── */}
      <div className="flex gap-1 border-b border-gray-100 dark:border-white/[0.06] mb-6">
        <button
          onClick={() => setTeamTab('members')}
          className={`titlebar-no-drag px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${teamTab === 'members' ? 'border-hub-gold text-hub-gold' : 'border-transparent text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70'}`}
        >
          Team members
        </button>
        {isRoot && (
          <button
            onClick={() => { setTeamTab('access'); if (!matrixLoaded && !matrixLoading) loadMatrix() }}
            className={`titlebar-no-drag px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${teamTab === 'access' ? 'border-hub-gold text-hub-gold' : 'border-transparent text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white/70'}`}
          >
            Board access & permissions
          </button>
        )}
      </div>

      {/* ── Tab 1: Team members ── */}
      {teamTab === 'members' && (
      <div className="max-w-2xl">

        {/* Invite form — admin only */}
        {isRoot && (
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5 mb-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-white/85 mb-1">
              Invite a team member
            </h2>
            <p className="text-xs text-gray-500 dark:text-white/55 mb-4">
              Generates an access code you share with them. They sign in with their email + code,
              then set their own password. Works on any computer — no email required.
              Only <code className="bg-gray-100 dark:bg-white/[0.08] px-1 rounded text-[11px]">@kantor-consulting.com</code> addresses are allowed.
            </p>

            <form onSubmit={handleInvite} className="space-y-2.5">
              {/* Name + Email row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  className={inputCls}
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@kantor-consulting.com"
                  required
                  className={inputCls}
                />
              </div>

              {/* Role + Submit row */}
              <div className="flex gap-2">
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'member' | 'admin')}
                  className="titlebar-no-drag px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-700 dark:text-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition cursor-pointer"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting || !email.trim() || !name.trim()}
                  className="titlebar-no-drag px-6 py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition shrink-0 shadow-sm"
                >
                  {inviting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating…
                    </span>
                  ) : 'Generate code'}
                </button>
              </div>
            </form>

            {/* Feedback message */}
            {msg && (
              <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm border ${
                msg.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400'
              }`}>
                {msg.type === 'ok' ? (
                  <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M4.5 7l2 2 3-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                )}
                {msg.text}
              </div>
            )}

            {/* Generated access code — share with the new member */}
            {generatedCode && (
              <div className="mt-4 rounded-xl border border-hub-gold/30 bg-hub-gold/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-hub-gold mb-1">
                      Access code for {generatedCode.name || generatedCode.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/55">
                      Send this to {generatedCode.email}. They sign in with their email + this code.
                    </p>
                  </div>
                  <button
                    onClick={() => setGeneratedCode(null)}
                    className="titlebar-no-drag p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/80 transition"
                    title="Dismiss"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-black/30 border border-gray-200 dark:border-white/[0.1] font-mono text-base tracking-wider text-gray-900 dark:text-white select-all">
                    {generatedCode.code}
                  </code>
                  <button
                    onClick={() => copyText(generatedCode.code, 'gen-code')}
                    className="titlebar-no-drag px-3 py-2 rounded-lg bg-hub-gold hover:bg-hub-gold-light text-white text-xs font-semibold transition shrink-0"
                  >
                    {copied === 'gen-code' ? 'Copied ✓' : 'Copy code'}
                  </button>
                </div>

                <button
                  onClick={() => copyText(shareMessage(generatedCode.name, generatedCode.email, generatedCode.code), 'gen-msg')}
                  className="titlebar-no-drag mt-2 w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] text-gray-700 dark:text-white/80 text-xs font-medium transition"
                >
                  {copied === 'gen-msg' ? 'Copied ✓' : 'Copy ready-to-send message'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Member list */}
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
            <h2 className="text-[10px] font-semibold text-gray-400 dark:text-white/50 uppercase tracking-widest">
              Members
            </h2>
            {loading && (
              <div className="w-4 h-4 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
            )}
          </div>

          {!loading && members.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400 dark:text-white/50 text-sm">
              No team members yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-5 py-4 group hover:bg-gray-50 dark:hover:bg-white/[0.03] transition cursor-pointer"
                  onClick={() => setProfileMemberId(member.id)}
                >
                  <div className="flex items-center gap-3.5">
                    <Avatar name={member.full_name} email={member.email} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {member.full_name || 'No name set'}
                        </p>
                        {member.id === currentId && (
                          <span className="text-[10px] text-gray-400 dark:text-white/50 font-medium">(you)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-white/55 mt-0.5">{member.email}</p>
                      {member.last_active && member.status === 'active' && (
                        <p className="text-[10px] text-gray-300 dark:text-white/35 mt-0.5">
                          Last active {new Date(member.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Pending member: show access code + a way to confirm them */}
                    {isRoot && member.status === 'invited' && inviteCodes[member.id] && (
                      <code className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-mono text-[11px] tracking-wider select-all">
                        {inviteCodes[member.id]}
                      </code>
                    )}
                    {isRoot && member.status === 'invited' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleMarkActive(member) }}
                        className="titlebar-no-drag px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition"
                        title="Mark this member as active"
                      >
                        Mark active
                      </button>
                    )}
                    {onLeaveEmails.has(member.email.toLowerCase()) && (
                      <span
                        className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-600 dark:text-sky-400 text-[10px] font-semibold uppercase tracking-wider"
                        title="Currently within their off-work leave window"
                      >
                        On leave
                      </span>
                    )}
                    <StatusBadge status={member.status} />
                    <RoleBadge role={member.role} />
                    {isRoot && (
                      <button
                        onClick={e => { e.stopPropagation(); copyMemberCode(member) }}
                        className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg text-[10px] font-semibold text-gray-400 dark:text-white/50 hover:text-hub-gold hover:bg-hub-gold/10 transition"
                        title="Copy this member's access code"
                      >
                        {copied === `code-${member.id}` ? 'Copied ✓' : 'Copy code'}
                      </button>
                    )}
                    {isRoot && member.id !== currentId && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRemove(member) }}
                        className="titlebar-no-drag opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition"
                        title="Remove member"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── My off-work / leave window (v1) ─────────────────────────────────
            Placement is provisional — the Team redesign will rehome this. A member
            sets ONE future-only window; while today is inside it, misses aren't
            stamped on their recurring to-dos and they show an "On leave" pill. */}
        <div className="mt-6 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-white/85 mb-1">Off work / leave</h2>
          <p className="text-xs text-gray-500 dark:text-white/55 mb-4">
            Set a future date range when you're away. Recurring to-dos won't be marked missed during
            it (they still roll forward), and your teammates see an “On leave” badge.
            {myLeave && (
              <> Current window: <span className="font-medium text-gray-700 dark:text-white/80">{myLeave.start_date} → {myLeave.end_date}</span>.</>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/50">Start</span>
              <input
                type="date"
                value={leaveStart}
                min={cetToday()}
                onChange={e => setLeaveStart(e.target.value)}
                onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }}
                className="titlebar-no-drag px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition [color-scheme:dark]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/50">End</span>
              <input
                type="date"
                value={leaveEnd}
                min={leaveStart || cetToday()}
                onChange={e => setLeaveEnd(e.target.value)}
                onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }}
                className="titlebar-no-drag px-3 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 transition [color-scheme:dark]"
              />
            </label>
            <button
              onClick={handleSaveLeave}
              disabled={savingLeave || !leaveStart || !leaveEnd}
              className="titlebar-no-drag px-5 py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-sm"
            >
              {savingLeave ? 'Saving…' : myLeave ? 'Update' : 'Save'}
            </button>
            {myLeave && (
              <button
                onClick={handleClearLeave}
                disabled={savingLeave}
                className="titlebar-no-drag px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                title="End your leave window — future recurring boundaries will be tracked again"
              >
                End leave
              </button>
            )}
          </div>
          {leaveMsg && (
            <div className={`mt-3 px-3 py-2 rounded-xl text-sm border ${
              leaveMsg.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400'
            }`}>
              {leaveMsg.text}
            </div>
          )}
        </div>

        {!isRoot && (
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-white/50">
            Contact your administrator to add or remove team members.
          </p>
        )}
      </div>
      )}

      {/* ── Tab 2: Board access & permissions (root-only) ── */}
      {teamTab === 'access' && isRoot && (
        <div className="space-y-6">

          {/* Board access — membership + project heads (relocated from Settings → Board Access) */}
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-white/85 mb-1">Board access</h2>
            <p className="text-xs text-gray-500 dark:text-white/55 mb-4">
              Who is a member of each board, and who is a project head. Members see the board; a project head on an info page can move sources to analysis and publish.
            </p>
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
                {matrixBoards.some(b => b.board_type === 'info-page') && (
                  <p className="mb-2 text-[10px] text-gray-400 dark:text-white/45">
                    Green checkbox = board <strong>member</strong>. On info-page projects, the amber
                    <span className="text-amber-600 dark:text-amber-400"> Head</span> toggle assigns a
                    <strong> project head</strong> — can move sources to analysis and publish.
                  </p>
                )}
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
                      // Only ROOT implicitly has all-board access; role==='admin' is cosmetic now.
                      const isRootMember = m.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
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
                            const hasAccess = isRootMember || !!(matrix[b.id]?.has(m.email.toLowerCase()))
                            const isInfoPage = b.board_type === 'info-page'
                            const isHead = !!(heads[b.id]?.has(m.email.toLowerCase()))
                            return (
                              <td key={b.id} className="py-2.5 px-2 text-center align-top">
                                <input
                                  type="checkbox"
                                  checked={hasAccess}
                                  disabled={isRootMember}
                                  onChange={() => toggleBoardAccess(b.id, m.id, hasAccess)}
                                  className={`titlebar-no-drag w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed ${hasAccess ? 'accent-green-500' : ''}`}
                                  title={hasAccess ? 'Member — has access' : 'Not a member'}
                                />
                                {isInfoPage && (
                                  <label
                                    className="mt-1 flex items-center justify-center gap-0.5 cursor-pointer"
                                    title="Project head — can move sources to analysis and publish"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isHead}
                                      onChange={() => toggleHead(b.id, m, isHead)}
                                      className="titlebar-no-drag w-3 h-3 rounded accent-amber-500 cursor-pointer"
                                    />
                                    <span className="text-[8px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Head</span>
                                  </label>
                                )}
                              </td>
                            )
                          })}
                          <td className="py-2.5 pl-3">
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                              {!isRootMember && (
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

          {/* Member Permissions */}
          {members.filter(m => m.status !== 'inactive' && m.email !== localUser?.email).length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-white/[0.07]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Member Permissions</h2>
          <p className="text-xs text-gray-500 dark:text-white/50 mb-4">
            Toggle what each team member can do beyond their default access.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-6 text-gray-500 dark:text-white/50 font-medium">Member</th>
                  {PERM_KEYS.map(k => (
                    <th key={k} className="text-center pb-2 px-3 text-gray-500 dark:text-white/50 font-medium whitespace-nowrap">{PERM_LABELS[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {members
                  .filter(m => m.status !== 'inactive' && m.email !== localUser?.email)
                  .map(m => (
                    <tr key={m.id}>
                      <td className="py-2 pr-6">
                        <div className="font-medium text-gray-800 dark:text-white/85">{m.full_name || m.email}</div>
                        <div className="text-gray-400 dark:text-white/35">{m.email}</div>
                      </td>
                      {PERM_KEYS.map(k => {
                        const granted = allPerms.some(p => p.user_email === m.email && p.permission_key === k)
                        return (
                          <td key={k} className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={granted}
                              onChange={e => togglePerm(m.email, k, e.target.checked)}
                              className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
          )}
        </div>
      )}

      {profileMemberId && (
        <TeamMemberProfilePanel
          memberId={profileMemberId}
          onClose={() => setProfileMemberId(null)}
          showSendMessage={true}
        />
      )}
    </div>
  )
}
