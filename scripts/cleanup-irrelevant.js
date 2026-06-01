// ============================================================================
// Cleanup — reject stored cs_articles that are NOT about LATAM drones
// ============================================================================
// Walks every article currently in cs_articles (that isn't already rejected),
// re-checks it through the SAME strict Claude relevance gate the fetcher uses
// (lib/categorize.js), and marks the irrelevant ones:
//     status = 'rejected'
//     notes  = 'Rejected: not relevant to LATAM drone topic'
// Articles already imported into the Hub (imported_to_hub = true) are left alone.
//
// Usage:
//   node cleanup-irrelevant.js            # apply changes
//   node cleanup-irrelevant.js --dry-run  # report only, change nothing
// ============================================================================

import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import WebSocket from 'ws'
import { createClient } from '@supabase/supabase-js'
import { makeAnthropic, categorize, isRelevant } from './lib/categorize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: resolve(__dirname, '..', '.env'), override: true })

const DRY_RUN = process.argv.includes('--dry-run')
const REJECT_NOTE = 'Rejected: not relevant to LATAM drone topic'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot run cleanup.')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
})
const anthropic = makeAnthropic(ANTHROPIC_API_KEY)
if (!anthropic) {
  console.error('ANTHROPIC_API_KEY missing — cannot evaluate relevance. Aborting (no changes made).')
  process.exit(1)
}

async function main() {
  console.log(`\n=== Cleanup: reject non-LATAM-drone articles ${DRY_RUN ? '(DRY RUN)' : ''} ===`)

  // Pull every article that hasn't already been rejected and isn't in the Hub.
  const { data: articles, error } = await supabase
    .from('cs_articles')
    .select('id, title, content_snippet, source_name, status, imported_to_hub')
    .neq('status', 'rejected')
    .eq('imported_to_hub', false)

  if (error) {
    console.error('Failed to load cs_articles:', error.message)
    process.exit(1)
  }

  console.log(`  ${articles.length} article(s) to evaluate.\n`)
  let rejected = 0
  let kept = 0
  let evalFailed = 0

  for (const a of articles) {
    const cat = await categorize(anthropic, {
      title: a.title,
      snippet: a.content_snippet || '',
      source: a.source_name,
    })

    if (!cat) {
      // Could not evaluate -> leave untouched (fail safe; never reject on error).
      evalFailed++
      console.log(`  ? eval-failed (kept): ${(a.title || '').slice(0, 70)}`)
      continue
    }

    if (isRelevant(cat)) {
      kept++
      continue
    }

    // Irrelevant -> reject.
    rejected++
    console.log(`  ✗ reject (score ${cat.relevance_score}): ${(a.title || '').slice(0, 70)}`)
    if (!DRY_RUN) {
      const { error: upErr } = await supabase
        .from('cs_articles')
        .update({ status: 'rejected', notes: REJECT_NOTE })
        .eq('id', a.id)
      if (upErr) console.warn(`    ! update failed: ${upErr.message}`)
    }
  }

  console.log(`\n=== Cleanup done${DRY_RUN ? ' (DRY RUN — nothing changed)' : ''} ===`)
  console.log(`  evaluated: ${articles.length}`)
  console.log(`  rejected as irrelevant: ${rejected}`)
  console.log(`  kept as relevant: ${kept}`)
  if (evalFailed) console.log(`  eval failures (left untouched): ${evalFailed}`)
  // Emit a machine-readable line so callers can parse the deleted count.
  console.log(`CLEANUP_RESULT rejected=${rejected} kept=${kept} evaluated=${articles.length}`)
}

main().catch((e) => {
  console.error('FATAL:', e?.stack || e?.message || e)
  process.exit(1)
})
