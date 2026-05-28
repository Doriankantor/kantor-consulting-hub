import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TeamMemberProfilePanel from '../components/TeamMemberProfilePanel'

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
  const { isAdmin, localUser } = useAuth()
  const currentId = localUser?.id ?? null

  const [members, setMembers] = useState<LocalTeamMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null)

  // Invite form
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [role,   setRole]   = useState<'member' | 'admin'>('member')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await window.api.team.list()
      setMembers(data)
    } catch {}
    setLoading(false)
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName  = name.trim()

    if (!trimmedEmail || !trimmedName) return

    // Client-side domain pre-check for instant feedback
    if (
      trimmedEmail !== 'doriankantor@gmail.com' &&
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
        const tempPw = (result as any).tempPassword
        const pwNote = tempPw ? ` Temp password: ${tempPw}` : ''
        setMsg({ type: 'ok', text: `Invite sent to ${trimmedEmail}.${pwNote}` })
        setEmail('')
        setName('')
        setRole('member')
        await load()
      }
    } catch {
      setMsg({ type: 'err', text: 'An unexpected error occurred. Please try again.' })
    }

    setInviting(false)
    setTimeout(() => setMsg(null), 6000)
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
              They'll receive an email with a temporary password to log in and set their own.
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
                      Sending…
                    </span>
                  ) : 'Send invite'}
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
                    <StatusBadge status={member.status} />
                    <RoleBadge role={member.role} />
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
