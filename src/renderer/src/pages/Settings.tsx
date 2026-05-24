import { useState, useEffect, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase/client'

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 pl-1">
        {title}
      </h2>
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden">
        {children}
      </div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.06] last:border-0">
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Settings() {
  const { user, profile, isAdmin, signOut } = useAuth()

  // Anthropic key state
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [keyMsg, setKeyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [savingKey, setSavingKey] = useState(false)

  // Team member state (admin)
  const [members, setMembers] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [memberMsg, setMemberMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    window.api.settings.get('anthropic_api_key').then(key => {
      if (key) setMaskedKey(`sk-ant-…${key.slice(-6)}`)
    })
  }, [])

  useEffect(() => {
    if (isAdmin) loadMembers()
  }, [isAdmin])

  async function loadMembers() {
    setLoadingMembers(true)
    const { data } = await supabase.from('profiles').select('id, email, full_name, role').order('created_at')
    if (data) setMembers(data)
    setLoadingMembers(false)
  }

  const handleSaveKey = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = newKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setKeyMsg({ type: 'err', text: 'Invalid format — key must start with "sk-ant-"' })
      return
    }
    setSavingKey(true)
    await window.api.settings.set('anthropic_api_key', trimmed)
    setMaskedKey(`sk-ant-…${trimmed.slice(-6)}`)
    setEditingKey(false)
    setNewKey('')
    setKeyMsg({ type: 'ok', text: 'API key updated.' })
    setSavingKey(false)
    setTimeout(() => setKeyMsg(null), 3000)
  }

  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault()
    if (!newMemberEmail.trim()) return
    setAddingMember(true)
    setMemberMsg(null)
    const { error } = await supabase.auth.admin.inviteUserByEmail(newMemberEmail.trim())
    if (error) {
      setMemberMsg({ type: 'err', text: error.message })
    } else {
      setMemberMsg({ type: 'ok', text: `Invite sent to ${newMemberEmail}` })
      setNewMemberEmail('')
      loadMembers()
    }
    setAddingMember(false)
    setTimeout(() => setMemberMsg(null), 4000)
  }

  const handleRemoveMember = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the team? They will lose access immediately.`)) return
    await supabase.from('profiles').delete().eq('id', id)
    loadMembers()
  }

  const displayName = profile?.full_name || user?.email?.split('@')[0] || '?'
  const initials = displayName[0].toUpperCase()

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-white/35 text-sm mt-1">Manage your account and preferences</p>
        </div>

        {/* Profile */}
        <Section title="Profile">
          <Row>
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-hub-gold/15 border border-hub-gold/30 flex items-center justify-center shrink-0">
                <span className="text-hub-gold font-bold text-sm">{initials}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs text-white/35 mt-0.5">{user?.email}</p>
              </div>
            </div>
            {isAdmin && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-hub-gold/15 border border-hub-gold/30 text-hub-gold text-xs font-semibold">
                Admin
              </span>
            )}
          </Row>
        </Section>

        {/* AI */}
        <Section title="AI Configuration">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-medium text-white">Anthropic API Key</p>
                <p className="text-xs text-white/35 mt-0.5 font-mono">
                  {maskedKey ?? 'Not configured'}
                </p>
              </div>
              <button
                onClick={() => { setEditingKey(v => !v); setNewKey(''); setKeyMsg(null) }}
                className="titlebar-no-drag px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.08] hover:bg-white/[0.13] text-white/60 hover:text-white transition"
              >
                {editingKey ? 'Cancel' : maskedKey ? 'Update' : 'Add key'}
              </button>
            </div>

            {editingKey && (
              <form onSubmit={handleSaveKey} className="mt-3 space-y-2">
                <input
                  type="password"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  autoFocus
                  className="titlebar-no-drag w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/25 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition"
                />
                <button
                  type="submit"
                  disabled={savingKey || newKey.trim().length < 20}
                  className="titlebar-no-drag w-full py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition"
                >
                  {savingKey ? 'Saving…' : 'Save key'}
                </button>
              </form>
            )}

            {keyMsg && (
              <p className={`mt-2 text-xs ${keyMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {keyMsg.text}
              </p>
            )}
          </div>
        </Section>

        {/* Admin: Team */}
        {isAdmin && (
          <Section title="Team Management">
            <div className="px-5 py-4">
              <p className="text-sm text-white/50 mb-4">
                Invite team members and manage their access. Only you can add or remove accounts.
              </p>

              {/* Invite form */}
              <form onSubmit={handleInviteMember} className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  placeholder="colleague@kantorconsulting.com"
                  className="titlebar-no-drag flex-1 px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-hub-gold/40 focus:border-hub-gold/40 transition"
                />
                <button
                  type="submit"
                  disabled={addingMember || !newMemberEmail.trim()}
                  className="titlebar-no-drag px-4 py-2 rounded-xl bg-hub-gold hover:bg-hub-gold-light disabled:opacity-50 text-white text-sm font-semibold transition shrink-0"
                >
                  {addingMember ? '…' : 'Invite'}
                </button>
              </form>

              {memberMsg && (
                <p className={`mb-3 text-xs ${memberMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                  {memberMsg.text}
                </p>
              )}

              {/* Member list */}
              {loadingMembers ? (
                <p className="text-sm text-white/30 py-4 text-center">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-white/25 py-4 text-center">No team members yet.</p>
              ) : (
                <div className="space-y-1">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-white/[0.04] group">
                      <div>
                        <p className="text-sm text-white/80">{m.full_name || m.email}</p>
                        {m.full_name && <p className="text-xs text-white/35">{m.email}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          m.role === 'admin'
                            ? 'bg-hub-gold/10 border-hub-gold/30 text-hub-gold'
                            : 'bg-white/[0.06] border-white/10 text-white/40'
                        }`}>
                          {m.role}
                        </span>
                        {m.id !== user?.id && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.email)}
                            className="titlebar-no-drag opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition p-1"
                            title="Remove member"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Sign out */}
        <Section title="Account">
          <Row>
            <div>
              <p className="text-sm font-medium text-white">Sign out</p>
              <p className="text-xs text-white/35 mt-0.5">Sign out on this device</p>
            </div>
            <button
              onClick={signOut}
              className="titlebar-no-drag px-4 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 hover:bg-red-500/15 text-red-400/80 hover:text-red-400 border border-red-500/15 hover:border-red-500/25 transition"
            >
              Sign out
            </button>
          </Row>
        </Section>
      </div>
    </div>
  )
}
