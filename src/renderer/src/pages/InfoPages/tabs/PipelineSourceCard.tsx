import { ReactNode } from 'react'
import { actorTypeClass } from '../../Intelligence/actorTypeClass'

// Shared read-only source card for the Info Page source pipeline tabs
// (New Sources / Pre-Commit Review / All Sources). All metadata shown here was
// decided at approval time in Source Intelligence and is read-only.

function readArr(raw: string | null): string[] {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

// 3c-2a: parse the analysis_json blob (never throws → {} on missing/invalid).
function parseAnalysis(raw: string | null | undefined): { ai?: any; human?: any; reconciled?: any } {
  if (!raw) return {}
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

// 3c-2a: plain text from the researcher's TipTap notes HTML (for a compact card line).
function stripHtml(html: string | null | undefined): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const REL_BADGE: Record<string, string> = {
  'in-region':        'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300',
  'supply-side':      'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'precedent':        'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'escalation-signal':'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
}
const CONF_BADGE: Record<string, string> = {
  high:   'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300',
  medium: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low:    'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300',
}
const LANG_BADGE: Record<string, string> = {
  es: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  pt: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300',
  en: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

interface Props {
  row: InfoPageSourceRow
  checked?: boolean
  onCheck?: (checked: boolean) => void   // when provided, renders a checkbox
  action?: ReactNode                      // rendered top-right (e.g. a back-out button)
  showDesignNotes?: boolean               // render the committed/batch design notes
}

export default function PipelineSourceCard({ row, checked, onCheck, action, showDesignNotes }: Props) {
  const cats = readArr(row.categories_json)
  const topics = readArr(row.thematic_tags)
  const date = row.published_at ? new Date(row.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const selectable = typeof onCheck === 'function'
  // 3c-2a: full-item data (all optional — most rows have none of these).
  const analysis = parseAnalysis(row.analysis_json)
  const hasAnalysis = !!(analysis.ai || analysis.human || analysis.reconciled)
  // B3: structured identifiers from the AI block (B1 extraction; travels via the live JOIN).
  const articleType = analysis.ai?.article_type as string | undefined
  const caps: Array<Record<string, any>> = Array.isArray(analysis.ai?.capabilities) ? analysis.ai.capabilities : []
  const facts: Array<Record<string, any>> = Array.isArray(analysis.ai?.key_facts) ? analysis.ai.key_facts : []
  const notes = stripHtml(row.intel_notes)

  return (
    <div className={`rounded-xl border p-4 transition-all ${checked ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/5' : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]'}`}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={e => onCheck!(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500/40 accent-indigo-600 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {/* Badge row — full carried metadata */}
          <div className="flex flex-wrap gap-1 mb-2">
            {/* 3c-2a: source type */}
            {row.type && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300">
                {row.type}
              </span>
            )}
            {row.relevance_score != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60">
                REL {row.relevance_score}
              </span>
            )}
            {row.relevance_type && row.relevance_type !== 'none' && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${REL_BADGE[row.relevance_type] || 'bg-gray-100 text-gray-600'}`}>
                {row.relevance_type}
              </span>
            )}
            {row.confidence && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${CONF_BADGE[row.confidence] || ''}`}>
                {row.confidence}
              </span>
            )}
            {row.language && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${LANG_BADGE[row.language] || ''}`}>
                {row.language}
              </span>
            )}
            {row.geography && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                📍 {row.geography}
              </span>
            )}
            {cats.slice(0, 3).map(c => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">{c}</span>
            ))}
            {topics.slice(0, 3).map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300">{t}</span>
            ))}
          </div>
          {/* Title */}
          {row.url ? (
            <a href={row.url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition line-clamp-2">
              {row.title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{row.title}</p>
          )}
          {/* Meta */}
          <div className="flex items-center gap-2 mt-1">
            {row.source_name && <span className="text-xs text-gray-500 dark:text-white/40 font-medium">{row.source_name}</span>}
            {date && <span className="text-xs text-gray-400 dark:text-white/30">{date}</span>}
          </div>
          {/* Snippet */}
          {row.snippet && <p className="text-xs text-gray-500 dark:text-white/50 mt-1.5 line-clamp-2">{row.snippet}</p>}
          {/* Review note (editor's free-hand note from approval) */}
          {row.review_notes && (
            <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1.5 rounded-lg italic">
              📝 {row.review_notes}
            </p>
          )}
          {/* 3c-2a: AI analysis — render only the blocks that exist */}
          {hasAnalysis && (
            <div className="mt-2 space-y-1.5">
              {analysis.human && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Researcher override:</span> relevance = {String(analysis.human.relevance ?? '—')}
                </p>
              )}
              {analysis.ai && (
                <div className="text-xs text-gray-600 dark:text-white/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">AI analysis</span>
                  {typeof analysis.ai.relevance_score === 'number' && (
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">REL {analysis.ai.relevance_score}</span>
                  )}
                  {articleType && (
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-600/30 text-slate-700 dark:text-slate-300 text-[10px] font-medium uppercase tracking-wide">{articleType}</span>
                  )}
                  {analysis.ai.summary && <span className="block mt-0.5">{analysis.ai.summary}</span>}
                  {analysis.ai.relevance_reasoning && <span className="block mt-0.5 italic">{analysis.ai.relevance_reasoning}</span>}
                  {/* B3: SYSTEMS — capabilities table (verbatim named systems + actor/cost). */}
                  {caps.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1">Systems</p>
                      <div className="space-y-1">
                        {caps.map((c, i) => (
                          <div key={`${c.system}-${i}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span className="font-semibold text-gray-800 dark:text-white/80">{c.system}</span>
                            {c.actor && <span className="text-gray-500 dark:text-white/50">· {c.actor}</span>}
                            {c.actor_type && <span className={`px-1 py-0.5 rounded text-[9px] font-medium uppercase ${actorTypeClass(c.actor_type)}`}>{c.actor_type}</span>}
                            {c.cost && <span className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-medium">{c.cost}</span>}
                            {c.category && <span className="px-1 py-0.5 rounded bg-indigo-100/70 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[9px] font-medium">{c.category}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* B3: KEY FACTS — label/value rows for type-specific specifics. */}
                  {facts.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1">Key facts</p>
                      <div className="space-y-1">
                        {facts.map((f, i) => (
                          <div key={`${f.label}-${i}`} className="grid grid-cols-[128px_1fr] gap-x-2">
                            <span className="text-gray-400 dark:text-white/35 break-words">{f.label}</span>
                            <span className="text-gray-700 dark:text-white/70 break-words">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {analysis.reconciled && (
                <div className="text-xs text-gray-600 dark:text-white/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">Reconciled</span>
                  {typeof analysis.reconciled.relevance_score === 'number' && (
                    <span className="ml-1.5 px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">REL {analysis.reconciled.relevance_score}</span>
                  )}
                  {analysis.reconciled.summary && <span className="block mt-0.5">{analysis.reconciled.summary}</span>}
                </div>
              )}
            </div>
          )}
          {/* 3c-2a: researcher notes (intel_notes) */}
          {notes && (
            <p className="mt-2 text-xs text-gray-600 dark:text-white/60 bg-gray-50 dark:bg-white/[0.03] px-2 py-1.5 rounded-lg">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30">📝 Notes</span>
              <span className="block mt-0.5">{notes}</span>
            </p>
          )}
          {/* Design notes (carried with committed sources) */}
          {showDesignNotes && row.design_notes && (
            <p className="mt-2 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 px-2 py-1.5 rounded-lg whitespace-pre-wrap">
              <span className="font-semibold">Design notes:</span> {row.design_notes}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
