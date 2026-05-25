import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_BAR_COLORS } from '../types'
import type { ContentType } from '../types'

// ── Constants ──────────────────────────────────────────────────────────────

const STAGE_NAMES: Record<string, string> = {
  'col-scoping':   'Scoping',
  'col-research':  'Research',
  'col-drafting':  'Drafting',
  'col-review':    'Review',
  'col-delivery':  'Client Delivery',
  'col-published': 'Published',
}

const STAGE_COLORS: Record<string, string> = {
  'col-scoping':   '#64748b',
  'col-research':  '#3b82f6',
  'col-drafting':  '#eab308',
  'col-review':    '#f97316',
  'col-delivery':  '#a855f7',
  'col-published': '#22c55e',
}

const PRIORITY_COLORS: Record<string, string> = {
  low:    '#64748b',
  medium: '#3b82f6',
  high:   '#f59e0b',
  urgent: '#ef4444',
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function HorizontalBar({ label, value, max, color, count }: { label: string; value: number; max: number; color: string; count: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="w-28 shrink-0 text-xs text-gray-500 dark:text-white/55 truncate text-right">{label}</div>
      <div className="flex-1 h-5 bg-gray-100 dark:bg-white/[0.06] rounded-md overflow-hidden">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="w-6 text-xs text-gray-400 dark:text-white/40 tabular-nums text-right shrink-0">{count}</div>
    </div>
  )
}

function BarChart({ data }: { data: { date: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const width = 600
  const height = 120
  const barW = Math.floor((width - (data.length - 1) * 4) / data.length)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * (height - 20), d.value > 0 ? 4 : 0)
        const x = i * (barW + 4)
        const y = height - barH - 16
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill="#c9a84c" opacity="0.8" />
            <text x={x + barW / 2} y={height - 2} textAnchor="middle" fontSize="8" fill="currentColor" className="text-gray-400 dark:text-white/30">
              {new Date(d.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
            </text>
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill="#c9a84c">{d.value}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface AnalyticsData {
  tasks: Record<string, unknown>[]
  activity: Record<string, unknown>[]
  comments: Record<string, unknown>[]
  stageActivity: Record<string, unknown>[]
}

export default function Analytics() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportMsg, setExportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    window.api.analytics.getData()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function handleExportPDF() {
    setExporting(true)
    setExportMsg(null)
    try {
      const result = await window.api.analytics.exportPDF()
      if (result.ok) {
        setExportMsg({ type: 'ok', text: `PDF saved${result.filePath ? ` to ${result.filePath}` : ' to Downloads'}.` })
      } else {
        setExportMsg({ type: 'err', text: result.error ?? 'Export failed.' })
      }
    } catch {
      setExportMsg({ type: 'err', text: 'Export failed.' })
    }
    setExporting(false)
    setTimeout(() => setExportMsg(null), 5000)
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mb-3 text-gray-300 dark:text-white/20">
          <rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" strokeWidth="2"/>
          <path d="M24 16v8M24 28v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <p className="text-lg font-semibold text-gray-600 dark:text-white/50">Access restricted</p>
        <p className="text-sm text-gray-400 dark:text-white/30 mt-1">Analytics is only available to administrators.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-hub-gold/20 border-t-hub-gold rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 dark:text-white/30">Failed to load analytics data.</p>
      </div>
    )
  }

  // ── Compute chart data ─────────────────────────────────────────────────

  // Tasks by stage
  const stageMap: Record<string, number> = {}
  for (const t of data.tasks) {
    const col = (t.column_id as string) ?? ''
    stageMap[col] = (stageMap[col] ?? 0) + 1
  }
  const maxStage = Math.max(...Object.values(stageMap), 1)

  // Tasks by content type
  const typeMap: Record<string, number> = {}
  for (const t of data.tasks) {
    const ct = (t.content_type as string) ?? 'unknown'
    typeMap[ct] = (typeMap[ct] ?? 0) + 1
  }
  const maxType = Math.max(...Object.values(typeMap), 1)

  // Priority breakdown
  const priorityMap: Record<string, number> = {}
  for (const t of data.tasks) {
    const p = (t.priority as string) ?? 'low'
    priorityMap[p] = (priorityMap[p] ?? 0) + 1
  }
  const maxPriority = Math.max(...Object.values(priorityMap), 1)

  // 7-day activity — merge activity + comments by date
  const activityByDate: Record<string, number> = {}
  for (const a of data.activity) {
    const date = (a.date as string) ?? ''
    if (date) activityByDate[date] = (activityByDate[date] ?? 0) + ((a.count as number) ?? 0)
  }
  for (const c of data.comments) {
    const date = (c.date as string) ?? ''
    if (date) activityByDate[date] = (activityByDate[date] ?? 0) + ((c.count as number) ?? 0)
  }
  // Build last 7 days
  const activityChartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    return { date: key, value: activityByDate[key] ?? 0 }
  })

  // Workload per member — count tasks by assignee
  const memberMap: Record<string, { name: string; count: number }> = {}
  for (const t of data.tasks) {
    const ids = (t.assignee_ids as string[]) ?? []
    const names = (t.assignee_names as string[]) ?? []
    ids.forEach((id, idx) => {
      if (!memberMap[id]) memberMap[id] = { name: names[idx] ?? id, count: 0 }
      memberMap[id].count++
    })
  }
  const memberList = Object.entries(memberMap)
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const maxMember = Math.max(...memberList.map(m => m.count), 1)

  const stageOrder = ['col-scoping', 'col-research', 'col-drafting', 'col-review', 'col-delivery', 'col-published']
  const contentTypeOrder = Object.keys(CONTENT_TYPE_LABELS) as ContentType[]
  const priorityOrder = ['urgent', 'high', 'medium', 'low']

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
            <p className="text-gray-400 dark:text-white/35 text-sm mt-1">
              Workspace insights as of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {exportMsg && (
              <p className={`text-xs ${exportMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {exportMsg.text}
              </p>
            )}
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="titlebar-no-drag flex items-center gap-2 px-4 py-2 rounded-xl bg-hub-gold/15 hover:bg-hub-gold/25 border border-hub-gold/30 text-hub-gold text-sm font-semibold transition disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v7M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 10v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Tasks', value: data.tasks.length },
            { label: 'In Progress', value: data.tasks.filter(t => t.column_id !== 'col-published').length },
            { label: 'Published', value: stageMap['col-published'] ?? 0 },
            { label: 'Urgent', value: priorityMap['urgent'] ?? 0 },
          ].map(stat => (
            <div key={stat.label} className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{stat.value}</p>
              <p className="text-xs text-gray-400 dark:text-white/40 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">

          {/* Tasks by Stage */}
          <ChartCard title="Tasks by Stage">
            {stageOrder.map(colId => (
              <HorizontalBar
                key={colId}
                label={STAGE_NAMES[colId] ?? colId}
                value={stageMap[colId] ?? 0}
                max={maxStage}
                color={STAGE_COLORS[colId] ?? '#6b7280'}
                count={stageMap[colId] ?? 0}
              />
            ))}
          </ChartCard>

          {/* Tasks by Content Type */}
          <ChartCard title="Tasks by Content Type">
            {contentTypeOrder.map(ct => (
              <HorizontalBar
                key={ct}
                label={CONTENT_TYPE_LABELS[ct]}
                value={typeMap[ct] ?? 0}
                max={maxType}
                color={CONTENT_TYPE_BAR_COLORS[ct] ?? '#6b7280'}
                count={typeMap[ct] ?? 0}
              />
            ))}
          </ChartCard>

        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">

          {/* Priority Breakdown */}
          <ChartCard title="Priority Breakdown">
            {priorityOrder.map(p => (
              <HorizontalBar
                key={p}
                label={p.charAt(0).toUpperCase() + p.slice(1)}
                value={priorityMap[p] ?? 0}
                max={maxPriority}
                color={PRIORITY_COLORS[p] ?? '#6b7280'}
                count={priorityMap[p] ?? 0}
              />
            ))}
          </ChartCard>

          {/* Workload per Member */}
          <ChartCard title="Workload per Member">
            {memberList.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/30 italic">No assignments yet.</p>
            ) : (
              memberList.map((m, i) => (
                <HorizontalBar
                  key={i}
                  label={m.name}
                  value={m.count}
                  max={maxMember}
                  color="#c9a84c"
                  count={m.count}
                />
              ))
            )}
          </ChartCard>

        </div>

        {/* 7-Day Activity */}
        <ChartCard title="7-Day Activity (Tasks + Comments)">
          <BarChart data={activityChartData} />
        </ChartCard>

      </div>
    </div>
  )
}
