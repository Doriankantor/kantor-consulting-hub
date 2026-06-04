import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
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
  const { isAdmin, isRoot, localUser } = useAuth()
  const currentId = localUser?.id ?? null

  const [members, setMembers] = useState<LocalTeamMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null)
  // Access codes for members still pending — surfaced inline so the admin can re-share.
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({})

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
    see_all_boards:    'See all boards',
    delete_attachment: 'Delete attachments',
    invite_members:    'Invite members',
  }
  const PERM_KEYS = Object.keys(PERM_LABELS)

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
    } catch {}
    setLoading(false)
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
      <div className="max-w-2xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
          <p className="text-gray-400 dark:text-white/65 text-sm mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} · Access managed by admin
          </p>
        </div>

        {/* Invite form — admin only */}
        {isAdmin && (
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
                    {isAdmin && member.status === 'invited' && inviteCodes[member.id] && (
                      <code className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-mono text-[11px] tracking-wider select-all">
                        {inviteCodes[member.id]}
                      </code>
                    )}
                    {isAdmin && member.status === 'invited' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleMarkActive(member) }}
                        className="titlebar-no-drag px-2 py-1 rounded-lg text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 transition"
                        title="Mark this member as active"
                      >
                        Mark active
                      </button>
                    )}
                    <StatusBadge status={member.status} />
                    <RoleBadge role={member.role} />
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); copyMemberCode(member) }}
                        className="titlebar-no-drag opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg text-[10px] font-semibold text-gray-400 dark:text-white/50 hover:text-hub-gold hover:bg-hub-gold/10 transition"
                        title="Copy this member's access code"
                      >
                        {copied === `code-${member.id}` ? 'Copied ✓' : 'Copy code'}
                      </button>
                    )}
                    {isAdmin && member.id !== currentId && (
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

        {!isAdmin && (
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-white/50">
            Contact your administrator to add or remove team members.
          </p>
        )}
      </div>

      {/* ── Member Permissions (root-only) ─────────────────────────────────── */}
      {isRoot && members.filter(m => m.status !== 'inactive' && m.email !== localUser?.email).length > 0 && (
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
