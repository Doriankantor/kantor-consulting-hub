// ── View ───────────────────────────────────────────────────────────────────
export type ViewMode = 'kanban' | 'timeline' | 'list' | 'calendar'

// ── Content types ──────────────────────────────────────────────────────────
export type ContentType =
  | 'policy-brief'
  | 'research-report'
  | 'op-ed'
  | 'briefing-note'
  | 'consulting-engagement'
  | 'client-advisory'

// ── Area of analysis ───────────────────────────────────────────────────────
export type AreaOfAnalysis =
  | 'latin-america'
  | 'us-foreign-policy'
  | 'european-politics'
  | 'international-security'
  | 'security-technology'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface Area {
  id: string
  name: string
  color: string
  is_default: number
  position: number
  created_at: string
}

// ── Column (pipeline stage) ────────────────────────────────────────────────
export interface Column {
  id: string
  name: string
  position: number
  color: string // Tailwind bg class
}

// ── Task / Deliverable ─────────────────────────────────────────────────────
export interface Task {
  id: string
  column_id: string
  title: string
  content_type: ContentType
  client: string | null            // client or target deliverable
  client_id: string | null         // FK to clients table
  recurrence_json: string | null   // JSON: { type: 'weekly'|'monthly'|'quarterly'|'custom', interval?: number }
  area_of_analysis: string | null  // stores area ID (default or custom)
  assignee_ids: string[]
  due_date: string | null          // ISO "YYYY-MM-DD"
  start_date: string | null        // ISO "YYYY-MM-DD"
  priority: Priority
  description: string | null
  notes: string | null
  sources_json: string | null  // JSON-serialised Source[]
  position: number
  created_at: string
  updated_at: string
}

// ── Source (stored as JSON array in task.sources_json) ────────────────────
export interface Source {
  id: string
  type: 'url' | 'reference' | 'file'
  title: string
  url: string | null
  note: string | null
  added_at: string
}

// ── Comment ────────────────────────────────────────────────────────────────
export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

// ── Activity ───────────────────────────────────────────────────────────────
export interface ActivityEntry {
  id: string
  task_id: string
  actor_name: string
  action: string
  created_at: string
}

// ── Claude message ─────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Team ───────────────────────────────────────────────────────────────────
export interface TeamMember {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'admin' | 'member'
}

// ── Label / color maps ────────────────────────────────────────────────────

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  'policy-brief':          'Policy Brief',
  'research-report':       'Research Report',
  'op-ed':                 'Op-Ed',
  'briefing-note':         'Briefing Note',
  'consulting-engagement': 'Consulting Engagement',
  'client-advisory':       'Client Advisory',
}

export const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  'policy-brief':          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  'research-report':       'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  'op-ed':                 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30',
  'briefing-note':         'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30',
  'consulting-engagement': 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30',
  'client-advisory':       'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
}

export const CONTENT_TYPE_BAR_COLORS: Record<ContentType, string> = {
  'policy-brief':          '#3b82f6',
  'research-report':       '#8b5cf6',
  'op-ed':                 '#eab308',
  'briefing-note':         '#06b6d4',
  'consulting-engagement': '#f97316',
  'client-advisory':       '#10b981',
}

export const AREA_LABELS: Record<AreaOfAnalysis, string> = {
  'latin-america':         'Latin America',
  'us-foreign-policy':     'US Foreign Policy',
  'european-politics':     'European Politics',
  'international-security':'International Security',
  'security-technology':   'Security Technology',
}

export const AREA_COLORS: Record<AreaOfAnalysis, string> = {
  'latin-america':         'bg-green-500/15 text-green-400 border-green-500/25',
  'us-foreign-policy':     'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'european-politics':     'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'international-security':'bg-red-500/15 text-red-400 border-red-500/25',
  'security-technology':   'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'text-slate-400',
  medium: 'text-blue-400',
  high:   'text-amber-400',
  urgent: 'text-red-400',
}

export const PRIORITY_DOT: Record<Priority, string> = {
  low:    'bg-slate-500',
  medium: 'bg-blue-500',
  high:   'bg-amber-500',
  urgent: 'bg-red-500',
}

export const DEFAULT_COLUMNS: Column[] = [
  { id: 'col-scoping',   name: 'Scoping',         position: 0, color: 'bg-slate-500'  },
  { id: 'col-research',  name: 'Research',         position: 1, color: 'bg-blue-500'   },
  { id: 'col-drafting',  name: 'Drafting',         position: 2, color: 'bg-yellow-500' },
  { id: 'col-review',    name: 'Review',           position: 3, color: 'bg-orange-500' },
  { id: 'col-delivery',  name: 'Client Delivery',  position: 4, color: 'bg-purple-500' },
  { id: 'col-published', name: 'Published',        position: 5, color: 'bg-green-500'  },
]
