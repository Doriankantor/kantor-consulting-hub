// B2/B3: color-code a capability's actor_type badge (VNSA-held vs state-held vs
// commercial distinguishable at a glance). Shared by the News card (NewsTab) and the
// New-sources pipeline card (PipelineSourceCard).
export function actorTypeClass(t?: string): string {
  switch ((t || '').toLowerCase()) {
    case 'vnsa':       return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    case 'state':      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    case 'commercial': return 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300'
    default:           return 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-white/40'
  }
}
