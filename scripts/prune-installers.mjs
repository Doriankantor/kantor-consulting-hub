#!/usr/bin/env node
/**
 * Build-installer retention rule.
 *
 * Retain only the latest + one previous build installer; older installers are
 * auto-pruned on build. NEVER deletes source, config, env, databases,
 * node_modules, or caches.
 *
 * Scope is locked by construction:
 *   1. The target directory is HARD-CODED to <projectRoot>/dist (the
 *      electron-builder `directories.output`). It is derived from this file's
 *      own location and is NOT read from argv, env, or any caller input, so the
 *      script cannot be pointed at another directory.
 *   2. Only the top level of that directory is read (NO recursion).
 *   3. Only regular files whose extension is in INSTALLER_EXTS are ever
 *      considered. A second PROTECTED_EXTS denylist hard-blocks databases,
 *      manifests, and configs as defense-in-depth.
 *   4. A file is deleted only if its filename contains a parseable semver AND
 *      that version is older than the newest KEEP_VERSIONS versions present.
 *      Files with no parseable version are never touched.
 *
 * It performs no network, cron, or unattended work — it runs only when invoked
 * by a build/publish npm script.
 */
import { readdirSync, lstatSync, statSync, unlinkSync, realpathSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEEP_VERSIONS = 2 // latest + one previous

// Installer artifacts produced by electron-builder. Lower-cased for matching.
const INSTALLER_EXTS = new Set(['.dmg', '.exe', '.appimage', '.zip', '.blockmap'])
// Defense-in-depth: these must NEVER be deleted even if logic above changed.
const PROTECTED_EXTS = new Set(['.db', '.sqlite', '.sqlite3', '.yml', '.yaml', '.json', '.env', '.ts', '.tsx', '.js', '.mjs'])

// Target dir is fixed relative to this script — never from caller input.
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDir = join(projectRoot, 'dist')

let dir
try {
  dir = realpathSync(outputDir) // follows the dist -> dist.nosync symlink
} catch {
  console.log(`[prune-installers] build-output dir not found (${outputDir}) — nothing to do.`)
  process.exit(0)
}

const semverOf = (name) => {
  const m = name.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
const cmpVer = (a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]

// Collect installer files (top level only), grouped by version string.
const entries = readdirSync(dir)
const byVersion = new Map() // "x.y.z" -> [{ path, size }]
for (const name of entries) {
  const ext = extname(name).toLowerCase()
  if (!INSTALLER_EXTS.has(ext)) continue            // gate 1: installer ext only
  if (PROTECTED_EXTS.has(ext)) continue              // gate 2: never protected ext
  const full = join(dir, name)
  let st
  try { st = lstatSync(full) } catch { continue }
  if (!st.isFile()) continue                         // gate 3: regular files only
  const v = semverOf(name)
  if (!v) continue                                   // gate 4: must have a version
  const key = v.join('.')
  if (!byVersion.has(key)) byVersion.set(key, { v, files: [] })
  byVersion.get(key).files.push({ path: full, size: statSync(full).size })
}

if (byVersion.size === 0) {
  console.log('[prune-installers] no versioned installers found — nothing to prune.')
  process.exit(0)
}

const versions = [...byVersion.values()].sort((a, b) => cmpVer(a.v, b.v))
const keep = versions.slice(0, KEEP_VERSIONS).map(x => x.v.join('.'))
const prune = versions.slice(KEEP_VERSIONS)

console.log(`[prune-installers] dir: ${dir}`)
console.log(`[prune-installers] keeping latest ${KEEP_VERSIONS}: ${keep.join(', ') || '(none)'}`)

let freed = 0, count = 0
for (const grp of prune) {
  for (const f of grp.files) {
    try {
      unlinkSync(f.path)
      freed += f.size; count++
      console.log(`[prune-installers] deleted ${f.path.split('/').pop()}`)
    } catch (e) {
      console.warn(`[prune-installers] could not delete ${f.path}: ${e.message}`)
    }
  }
}
console.log(`[prune-installers] pruned ${count} file(s), freed ${(freed / 1e9).toFixed(2)} GB`)
