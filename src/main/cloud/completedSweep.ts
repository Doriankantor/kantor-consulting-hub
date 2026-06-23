import { cloud } from './client'
import { markCompleteNow, deleteTask } from './boards'

export async function runCompletedProjectsSweep(): Promise<void> {
  try {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
    const nowIso = new Date().toISOString()

    // --- JOB 1: auto-archive stale Published cards → Completed ---
    const { data: staleProj, error: e1 } = await cloud.from('workspace_tasks')
      .select('id, title')
      .eq('column_id', 'col-published')
      .eq('archived', 0)
      .is('deletion_scheduled_at', null)
      .lt('published_at', thirtyDaysAgo)
    if (e1) { console.error('[sweep] Job1 query failed:', e1.message) }
    else {
      console.log(`[sweep] Job1: ${staleProj?.length ?? 0} Published card(s) >30d → auto-completing:`,
        (staleProj ?? []).map(t => `${t.id} "${t.title}"`))
      for (const t of staleProj ?? []) {
        try { await markCompleteNow(t.id); console.log(`[sweep] Job1 archived ${t.id}`) }
        catch (err) { console.error(`[sweep] Job1 FAILED on ${t.id}:`, err) }
      }
    }

    // --- JOB 2: hard-delete overdue marked-for-deletion cards (IRREVERSIBLE) ---
    const { data: overdue, error: e2 } = await cloud.from('workspace_tasks')
      .select('id, title')
      .not('deletion_scheduled_at', 'is', null)
      .lt('deletion_scheduled_at', nowIso)
    if (e2) { console.error('[sweep] Job2 query failed:', e2.message) }
    else {
      console.log(`[sweep] Job2: ${overdue?.length ?? 0} card(s) past deletion date → HARD DELETING:`,
        (overdue ?? []).map(t => `${t.id} "${t.title}"`))
      for (const t of overdue ?? []) {
        try { await deleteTask(t.id); console.log(`[sweep] Job2 HARD-DELETED ${t.id} "${t.title}"`) }
        catch (err) { console.error(`[sweep] Job2 FAILED on ${t.id}:`, err) }
      }
    }
    console.log('[sweep] complete')
  } catch (err) {
    console.error('[sweep] fatal error:', err)
  }
}
