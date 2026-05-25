import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase/client'
import type { TeamMember } from '../types'
import { SEED_MEMBERS } from '../data/seed'

function Avatar({ member }: { member: TeamMember }) {
  const initials = (member.full_name || member.email)[0].toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-hub-gold/15 border border-hub-gold/25 flex items-center justify-center shrink-0">
      <span className="text-hub-gold font-bold text-sm">{initials}</span>
    </div>
  )
}

export default function Team() {
  const { user, isAdmin } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>(SEED_MEMBERS)
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    if (data && data.length > 0) setMembers(data as TeamMember[])
    setLoading(false)
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    setInviting(true)
    setMsg(null)
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email)
      if (error) throw error
      setMsg({ type: 'ok', text: `Invite sent to ${email}` })
      setInviteEmail('')
      loadMembers()
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message ?? 'Failed to send invite' })
    }
    setInviting(false)
    setTimeout(() => setMsg(null), 5000)
  }

  async function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.full_name || member.email} from the team?`)) return
    await supabase.from('profiles').delete().eq('id', member.id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
          <p className="text-gray-400 dark:text-white/35 text-sm mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} · Access managed by admin
          </p>
        </div>

        {/* Invite (admin only) */}
        {isAdmin && (
          <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-1">Invite a team member</h2>
            <p className="text-xs text-gray-500 dark:text-white/40 mb-4">
              They'll receive an email to set their password and access the Hub.
            </p>
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@kantor-consulting.com"
                className="titlebar-no-drag flex-1 px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition"
              />
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="titlebar-no-drag px-5 py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition shrink-0"
              >
                {inviting ? 'Sending…' : 'Invite'}
              </button>
            </form>
            {msg && (
              <p className={`mt-2 text-xs ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {msg.text}
              </p>
            )}
          </div>
        )}

        {/* Member list */}
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
            <h2 className="text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">Members</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-hub-gold/30 border-t-hub-gold rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between px-5 py-4 group">
                  <div className="flex items-center gap-3.5">
                    <Avatar member={member} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {member.full_name || 'No name set'}
                        </p>
                        {member.id === user?.id && (
                          <span className="text-[10px] text-gray-400 dark:text-white/25 font-medium">(you)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-white/35 mt-0.5">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      member.role === 'admin'
                        ? 'bg-hub-gold/10 border-hub-gold/30 text-hub-gold'
                        : 'bg-gray-50 dark:bg-white/[0.05] border-gray-200 dark:border-white/[0.08] text-gray-400 dark:text-white/35'
                    }`}>
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </span>

                    {isAdmin && member.id !== user?.id && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="titlebar-no-drag opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-400/10 transition"
                        title="Remove member"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Non-admin note */}
        {!isAdmin && (
          <p className="mt-4 text-center text-xs text-gray-300 dark:text-white/20">
            Contact Dorian Kantor to add or remove team members.
          </p>
        )}
      </div>
    </div>
  )
}
