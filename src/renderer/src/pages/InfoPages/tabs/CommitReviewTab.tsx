import { useState, useEffect, useCallback } from 'react'

interface Props {
  pageId: string
  page: InfoPage
  canApprove: boolean
  canGeneratePrompt: boolean
  onCountChange: (n: number) => void
  localUser: { id: string; name: string } | null
  isAdmin: boolean
}

const STATUS_STYLES: Record<string, string> = {
  pending_owner:  'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
  approved:       'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  admin_approved: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  rejected:       'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  implemented:    'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40',
}

const STATUS_LABELS: Record<string, string> = {
  pending_owner:  'Pending review',
  approved:       'Owner approved',
  admin_approved: 'Admin approved',
  rejected:       'Rejected',
  implemented:    'Implemented',
}

export default function CommitReviewTab({ pageId, page, canApprove, canGeneratePrompt, onCountChange, localUser, isAdmin }: Props) {
  const [commits, setCommits] = useState<InfoPageCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rejectionNote, setRejectionNote] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [promptText, setPromptText] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const [markingImplemented, setMarkingImplemented] = useState(false)
  const [whatChanged, setWhatChanged] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await window.api.infoPages.getCommits(pageId)
      setCommits(all)
      onCountChange(all.filter(c => c.status === 'pending_owner' || c.status === 'approved').length)
    } catch {} finally {
      setLoading(false)
    }
  }, [pageId, onCountChange])

  useEffect(() => { load() }, [load])

  async function handleReview(commitId: string, action: 'approve' | 'reject', isAdminAction = false) {
    if (!localUser) return
    setReviewing(commitId)
    try {
      const params = {
        reviewedById: localUser.id,
        reviewedByName: localUser.name,
        rejectionNote: action === 'reject' ? rejectionNote : undefined,
      }
      if (isAdminAction) {
        await window.api.infoPages.adminReviewCommit(commitId, action, params)
      } else {
        await window.api.infoPages.reviewCommit(commitId, action, params)
      }
      setRejectionNote('')
      setRejectingId(null)
      await load()
    } finally {
      setReviewing(null)
    }
  }

  async function handleGeneratePrompt() {
    const approvedCommits = commits.filter(c => c.status === 'admin_approved' || (isAdmin && c.status === 'approved'))
    if (!approvedCommits.length) return
    setGeneratingPrompt(true)
    try {
      const config: InfoPageConfig = page.board_config ? (() => { try { return JSON.parse(page.board_config!) } catch { return {} } })() : {}
      const items = approvedCommits.map(c => {
        const analysis = c.analysis_json ? (() => { try { return JSON.parse(c.analysis_json) } catch { return {} } })() : {}
        return {
          action: c.title || analysis.action || 'Update',
          section: c.proposed_section || analysis.section || 'Source Archive',
          detail: analysis.detail || c.title || '',
          confidence: c.confidence || 'medium',
          source: analysis.source || c.source_ref || '',
        }
      })
      const result = await window.api.infoPages.generatePrompt({
        pageName: page.name,
        pageRepo: config.repo || '',
        items,
      })
      if (result.ok && result.prompt) {
        setPromptText(result.prompt)
      }
    } finally {
      setGeneratingPrompt(false)
    }
  }

  async function handleMarkImplemented() {
    if (!localUser || !promptText) return
    const approvedCommits = commits.filter(c => c.status === 'admin_approved' || (isAdmin && c.status === 'approved'))
    setMarkingImplemented(true)
    try {
      await window.api.infoPages.logPublished({
        pageId,
        whatChanged: whatChanged || `${approvedCommits.length} item${approvedCommits.length !== 1 ? 's' : ''} published`,
        committedById: localUser.id,
        committedByName: localUser.name,
        approvedById: localUser.id,
        approvedByName: localUser.name,
        promptUsed: promptText,
        itemIds: approvedCommits.map(c => c.item_id),
        commitCount: approvedCommits.length,
      })
      setPromptText('')
      setWhatChanged('')
      await load()
    } finally {
      setMarkingImplemented(false)
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendingCommits = commits.filter(c => c.status === 'pending_owner')
  const approvedByOwner = commits.filter(c => c.status === 'approved')
  const adminApproved = commits.filter(c => c.status === 'admin_approved')
  const myCommits = commits.filter(c => c.submitted_by_id === localUser?.id)
  const implemented = commits.filter(c => c.status === 'implemented')

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Pending owner review */}
      {canApprove && pendingCommits.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70 mb-2">
            Awaiting your review ({pendingCommits.length})
          </h4>
          <div className="space-y-2">
            {pendingCommits.map(commit => (
              <CommitCard
                key={commit.id}
                commit={commit}
                canAction
                reviewing={reviewing === commit.id}
                rejectingId={rejectingId}
                rejectionNote={rejectionNote}
                setRejectionNote={setRejectionNote}
                setRejectingId={setRejectingId}
                onApprove={() => handleReview(commit.id, 'approve', false)}
                onReject={() => handleReview(commit.id, 'reject', false)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Admin review section */}
      {isAdmin && approvedByOwner.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70 mb-2">
            Owner approved — awaiting admin ({approvedByOwner.length})
          </h4>
          <div className="space-y-2">
            {approvedByOwner.map(commit => (
              <CommitCard
                key={commit.id}
                commit={commit}
                canAction
                reviewing={reviewing === commit.id}
                rejectingId={rejectingId}
                rejectionNote={rejectionNote}
                setRejectionNote={setRejectionNote}
                setRejectingId={setRejectingId}
                onApprove={() => handleReview(commit.id, 'approve', true)}
                onReject={() => handleReview(commit.id, 'reject', true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Admin-approved + prompt generation */}
      {canGeneratePrompt && adminApproved.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70 mb-2">
            Ready to publish ({adminApproved.length})
          </h4>
          <div className="space-y-2 mb-3">
            {adminApproved.map(commit => (
              <CommitCard key={commit.id} commit={commit} canAction={false} />
            ))}
          </div>

          <button
            onClick={handleGeneratePrompt}
            disabled={generatingPrompt}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white transition disabled:opacity-50"
          >
            {generatingPrompt ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </>
            ) : 'Generate Claude Code prompt'}
          </button>

          {promptText && (
            <div className="mt-3 space-y-2">
              <textarea
                readOnly
                value={promptText}
                rows={10}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] text-xs text-gray-700 dark:text-white/80 font-mono resize-none focus:outline-none"
              />
              <input
                value={whatChanged}
                onChange={e => setWhatChanged(e.target.value)}
                placeholder="What changed? (shown in history)"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={copyPrompt}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-white/[0.1] text-gray-700 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
                <button
                  onClick={handleMarkImplemented}
                  disabled={markingImplemented}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition disabled:opacity-50"
                >
                  {markingImplemented ? 'Marking…' : 'Mark as implemented'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* My commits */}
      {!canApprove && myCommits.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 dark:text-white/70 mb-2">My submissions ({myCommits.length})</h4>
          <div className="space-y-2">
            {myCommits.map(commit => (
              <CommitCard key={commit.id} commit={commit} canAction={false} />
            ))}
          </div>
        </div>
      )}

      {/* Implemented */}
      {implemented.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-white/30 mb-2">Implemented ({implemented.length})</h4>
          <div className="space-y-1.5 opacity-60">
            {implemented.slice(0, 5).map(commit => (
              <CommitCard key={commit.id} commit={commit} canAction={false} />
            ))}
          </div>
        </div>
      )}

      {!loading && commits.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-white/25 text-center py-8">No items committed for review yet.</p>
      )}
    </div>
  )
}

// Sub-component
function CommitCard({
  commit, canAction, reviewing = false,
  rejectingId, rejectionNote, setRejectionNote, setRejectingId,
  onApprove, onReject,
}: {
  commit: InfoPageCommit
  canAction: boolean
  reviewing?: boolean
  rejectingId?: string | null
  rejectionNote?: string
  setRejectionNote?: (v: string) => void
  setRejectingId?: (v: string | null) => void
  onApprove?: () => void
  onReject?: () => void
}) {
  const STATUS_STYLES: Record<string, string> = {
    pending_owner:  'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
    approved:       'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
    admin_approved: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    rejected:       'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
    implemented:    'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40',
  }
  const STATUS_LABELS: Record<string, string> = {
    pending_owner:  'Pending review',
    approved:       'Owner approved',
    admin_approved: 'Admin approved',
    rejected:       'Rejected',
    implemented:    'Implemented',
  }

  return (
    <div className="p-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[commit.status] || ''}`}>
              {STATUS_LABELS[commit.status] || commit.status}
            </span>
            {commit.tab && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40">{commit.tab}</span>}
            {commit.confidence && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${commit.confidence === 'high' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : commit.confidence === 'medium' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
                {commit.confidence}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-gray-800 dark:text-white/85">{commit.title || 'Untitled'}</p>
          {commit.proposed_section && (
            <p className="text-[10px] text-gray-400 dark:text-white/30">Section: {commit.proposed_section}</p>
          )}
          <p className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">
            By {commit.submitted_by_name || 'Unknown'} · {new Date(commit.submitted_at).toLocaleDateString()}
          </p>
          {commit.rejection_note && (
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">Rejected: {commit.rejection_note}</p>
          )}
        </div>
      </div>

      {canAction && commit.status !== 'rejected' && commit.status !== 'implemented' && onApprove && onReject && (
        <div className="mt-2">
          {rejectingId === commit.id ? (
            <div className="space-y-1.5">
              <input
                value={rejectionNote}
                onChange={e => setRejectionNote?.(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] text-xs text-gray-900 dark:text-white focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button onClick={() => setRejectingId?.(null)} className="flex-1 px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition">Cancel</button>
                <button onClick={onReject} disabled={reviewing} className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50">Reject</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={onApprove} disabled={reviewing} className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500 hover:bg-green-600 text-white transition disabled:opacity-50">
                {reviewing ? '…' : 'Approve'}
              </button>
              <button onClick={() => setRejectingId?.(commit.id)} disabled={reviewing} className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30 transition disabled:opacity-50">
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
