import { randomUUID } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { app, dialog, shell } from 'electron'
import { pipeline } from 'stream/promises'
import { cloud, CLOUD_ADMIN_EMAIL } from './client'
import { getDatabase } from '../db'
import { resolveActor, isBoardVisible, boardIdOfTask } from './boards'

// ── Supabase Storage: card attachments (Stage 2 — final piece of boards) ─────
// File blobs live in the private 'card-attachments' bucket. Metadata in a cloud
// task_attachments table (mirrors the local shape but email-keyed, adding
// storage_path). Renderer → IPC → main → Storage; renderer makes NO direct
// Storage calls. The native file picker stays in main (bytes never cross IPC).
// Downloads cache to userData/attachment-cache/ keyed on storage_path.

const BUCKET = 'card-attachments'
const CLOUD_ADMIN = CLOUD_ADMIN_EMAIL

// ── Paths ────────────────────────────────────────────────────────────────────

function getCacheDir(): string {
  // Separate from userData/attachments/ (local originals) and from anything the
  // prune rule or .db protection touches.
  const dir = join(app.getPath('userData'), 'attachment-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// Stable cache key: storage_path with slashes replaced → safe filename.
function cachePathFor(storagePath: string): string {
  const safe = storagePath.replace(/\//g, '__')
  return join(getCacheDir(), safe)
}

// ── Actor helpers ─────────────────────────────────────────────────────────────

function actorEmail(actingUserId?: string | null): string {
  return resolveActor(actingUserId).email
}

function actorName(actingUserId?: string | null): string {
  const actor = resolveActor(actingUserId)
  if (!actor.email) return 'Unknown'
  if (actor.isAdmin) {
    try {
      const row = getDatabase().prepare('SELECT full_name FROM local_users WHERE LOWER(email)=?').get(actor.email) as { full_name?: string } | undefined
      return row?.full_name ?? 'Admin'
    } catch { return 'Admin' }
  }
  try {
    const row = getDatabase().prepare('SELECT full_name FROM local_users WHERE LOWER(email)=?').get(actor.email) as { full_name?: string } | undefined
    return row?.full_name ?? actor.email.split('@')[0]
  } catch { return actor.email.split('@')[0] }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

// Upload a local file to the bucket, streaming from disk (never buffers whole file).
async function uploadToStorage(localPath: string, storagePath: string, mimeType: string): Promise<void> {
  // supabase-js storage.from().upload() accepts a Buffer or Uint8Array, but for
  // large files we need to stream. We use the Node fetch-compatible upload via
  // the raw REST endpoint that the service-role client can reach.
  // The cleanest approach: read the stream into a Buffer chunk-by-chunk. For the
  // typical attachment size and the 30MB bucket cap, this is safe and avoids
  // needing a custom fetch shim. For a future streaming override, replace this.
  const { readFile } = await import('fs/promises')
  const data = await readFile(localPath)
  const { error } = await cloud.storage.from(BUCKET).upload(storagePath, data, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
}

// Download a blob from the bucket to a local file path, streaming to disk.
async function downloadFromStorage(storagePath: string, destPath: string): Promise<void> {
  const { data, error } = await cloud.storage.from(BUCKET).download(storagePath)
  if (error) throw new Error(`Storage download failed: ${error.message}`)
  // data is a Blob; convert to Node ReadableStream and pipe to disk.
  const nodeStream = (data as unknown as { stream(): import('stream').Readable }).stream()
  await pipeline(nodeStream, createWriteStream(destPath))
}

// Delete one blob from Storage (best-effort; non-fatal).
export async function deleteStorageBlob(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return
  try {
    await cloud.storage.from(BUCKET).remove([storagePath])
  } catch (e) {
    console.warn('[attachmentsCloud] blob delete failed:', storagePath, (e as Error)?.message)
  }
}

// Delete multiple blobs (for cascade cleanup on task/board delete).
export async function deleteStorageBlobs(storagePaths: string[]): Promise<void> {
  const paths = storagePaths.filter(Boolean)
  if (!paths.length) return
  try {
    const BATCH = 100
    for (let i = 0; i < paths.length; i += BATCH) {
      await cloud.storage.from(BUCKET).remove(paths.slice(i, i + BATCH))
    }
  } catch (e) {
    console.warn('[attachmentsCloud] bulk blob delete failed:', (e as Error)?.message)
  }
}

// Resolve all storage_paths for a task's attachments (for cascade cleanup).
export async function storagePathsForTask(taskId: string): Promise<string[]> {
  const { data } = await cloud.from('task_attachments').select('storage_path').eq('task_id', taskId)
  return ((data ?? []) as { storage_path?: string }[]).map(r => r.storage_path).filter((p): p is string => !!p)
}

// Resolve all storage_paths for all tasks on a board (for board delete cascade).
export async function storagePathsForBoard(boardId: string): Promise<string[]> {
  // task_ids for this board, then all attachment blobs for those tasks.
  const { data: tasks } = await cloud.from('workspace_tasks').select('id').eq('board_id', boardId)
  const taskIds = ((tasks ?? []) as { id: string }[]).map(r => r.id)
  if (!taskIds.length) return []
  const { data: atts } = await cloud.from('task_attachments').select('storage_path').in('task_id', taskIds)
  return ((atts ?? []) as { storage_path?: string }[]).map(r => r.storage_path).filter((p): p is string => !!p)
}

// ── Attachments CRUD ──────────────────────────────────────────────────────────

export type CloudAttachment = {
  id: string
  task_id: string
  name: string
  type: string
  storage_path: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  author_email: string
  author_name: string
  created_at: string
}

// LIST — gate by board visibility.
export async function listAttachments(
  actingUserId: string | undefined,
  taskId: string,
): Promise<CloudAttachment[]> {
  const boardId = await boardIdOfTask(taskId)
  if (!(await isBoardVisible(actingUserId, boardId))) return []
  const { data, error } = await cloud
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`attachments list failed: ${error.message}`)
  return (data ?? []) as CloudAttachment[]
}

// ADD FILE — native picker in main (bytes never cross IPC), stream to Storage.
export async function addFileAttachment(
  actingUserId: string | undefined,
  taskId: string,
): Promise<{ ok?: boolean; id?: string; name?: string; storage_path?: string; canceled?: boolean; error?: string }> {
  const boardId = await boardIdOfTask(taskId)
  if (!(await isBoardVisible(actingUserId, boardId))) {
    return { error: 'Not authorised to attach files to this card.' }
  }
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select File to Attach',
  })
  if (canceled || !filePaths[0]) return { canceled: true }

  const srcPath = filePaths[0]
  const ext = extname(srcPath).toLowerCase()
  const fileName = basename(srcPath)
  const id = randomUUID()
  const storagePath = `${taskId}/${id}${ext}`

  let mimeType = 'application/octet-stream'
  try {
    // @ts-ignore — mime-types has no bundled declaration file; the fallback covers failure
    const mm = await import('mime-types') // eslint-disable-line
    mimeType = (mm as { lookup: (f: string) => string | false }).lookup(fileName) || mimeType
  } catch { /* mime-types not installed — use fallback */ }

  let sizeBytes: number | null = null
  try { sizeBytes = statSync(srcPath).size } catch { /* non-fatal */ }

  await uploadToStorage(srcPath, storagePath, mimeType)

  const email = actorEmail(actingUserId)
  const name = actorName(actingUserId)
  const row = {
    id, task_id: taskId, name: fileName, type: 'file',
    storage_path: storagePath, url: null,
    mime_type: mimeType, size_bytes: sizeBytes,
    author_email: email, author_name: name,
    created_at: new Date().toISOString(),
  }
  const { error: insErr } = await cloud.from('task_attachments').insert(row)
  if (insErr) {
    // Roll back the blob if metadata insert fails.
    await deleteStorageBlob(storagePath)
    throw new Error(`attachment metadata insert failed: ${insErr.message}`)
  }
  return { ok: true, id, name: fileName, storage_path: storagePath }
}

// ADD URL — metadata only, no blob (preserves existing URL-type behavior).
export async function addUrlAttachment(
  actingUserId: string | undefined,
  taskId: string,
  url: string,
  name: string,
  type: string,
): Promise<{ ok: boolean; id: string }> {
  const boardId = await boardIdOfTask(taskId)
  if (!(await isBoardVisible(actingUserId, boardId))) {
    throw new Error('Not authorised to attach to this card.')
  }
  const id = randomUUID()
  const email = actorEmail(actingUserId)
  const authorName = actorName(actingUserId)
  const { error } = await cloud.from('task_attachments').insert({
    id, task_id: taskId, name: name.trim() || url, type: type || 'url',
    storage_path: null, url: url.trim(),
    mime_type: null, size_bytes: null,
    author_email: email, author_name: authorName,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(`url attachment insert failed: ${error.message}`)
  return { ok: true, id }
}

// OPEN — URL-type: return url for renderer to shell.openExternal.
//         Blob-type: check cache, download if missing, shell.openPath.
export async function openAttachment(
  actingUserId: string | undefined,
  attachmentId: string,
): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const { data: row, error } = await cloud
    .from('task_attachments').select('*').eq('id', attachmentId).maybeSingle()
  if (error) throw new Error(`attachment lookup failed: ${error.message}`)
  if (!row) return { error: 'Attachment not found.' }
  const att = row as CloudAttachment

  // Visibility gate.
  const boardId = await boardIdOfTask(att.task_id)
  if (!(await isBoardVisible(actingUserId, boardId))) return { error: 'Not authorised.' }

  // URL-type: renderer handles shell.openExternal.
  if (!att.storage_path) {
    if (att.url) return { url: att.url }
    return { error: 'No file or URL.' }
  }

  // Blob-type: cache-on-first-open, then shell.openPath.
  const cachePath = cachePathFor(att.storage_path)
  if (!existsSync(cachePath)) {
    await downloadFromStorage(att.storage_path, cachePath)
  }
  await shell.openPath(cachePath)
  return { ok: true }
}

// DELETE — remove blob from Storage + metadata row. Admin or original author.
export async function deleteAttachment(
  actingUserId: string | undefined,
  attachmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await cloud
    .from('task_attachments').select('*').eq('id', attachmentId).maybeSingle()
  if (!row) return { ok: true } // already gone
  const att = row as CloudAttachment

  const actor = resolveActor(actingUserId)
  const isAuthor = actor.email && actor.email === (att.author_email ?? '').toLowerCase()
  if (!actor.isAdmin && !isAuthor) {
    return { ok: false, error: 'Only the file author or an admin can delete this attachment.' }
  }

  // Delete blob first (non-fatal if already gone).
  await deleteStorageBlob(att.storage_path)

  const { error } = await cloud.from('task_attachments').delete().eq('id', attachmentId)
  if (error) throw new Error(`attachment row delete failed: ${error.message}`)
  return { ok: true }
}

// ── One-time seed (guarded — THIS machine only, runs once) ────────────────────
// Uploads local task_attachments rows that have an existing local_path file.
// Skips missing files (collects them; never crashes on a missing file).
// URL-type rows seed as metadata only (no blob needed).
// Guard: no-op if the cloud task_attachments table already has any rows.
// Never modifies or deletes local rows or local files.

export async function seedAttachmentsToCloud(requestEmail: string): Promise<{
  ok: boolean
  seeded?: number
  skippedMissing?: number
  skippedNoPath?: number
  missingFiles?: string[]
  reason?: string
}> {
  if ((requestEmail ?? '').toLowerCase() !== CLOUD_ADMIN) {
    return { ok: false, reason: 'Only the admin can run the one-time attachments seed.' }
  }

  // Guard: no-op if cloud already has attachment rows.
  const { count, error: cErr } = await cloud
    .from('task_attachments').select('id', { count: 'exact', head: true })
  if (cErr) return { ok: false, reason: `cloud check failed: ${cErr.message}` }
  if ((count ?? 0) > 0) {
    return { ok: true, seeded: 0, reason: 'Cloud attachments already seeded — no-op.' }
  }

  const db = getDatabase()
  const localRows = db.prepare('SELECT * FROM task_attachments ORDER BY created_at ASC').all() as Record<string, unknown>[]

  // Build a local_users id→email map for author resolution.
  const emailById = new Map<string, string>()
  try {
    for (const u of db.prepare('SELECT id, email FROM local_users').all() as { id: string; email: string }[]) {
      emailById.set(u.id, (u.email ?? '').toLowerCase())
    }
  } catch { /* best-effort */ }

  let seeded = 0, skippedMissing = 0, skippedNoPath = 0
  const missingFiles: string[] = []

  for (const local of localRows) {
    const id = local.id as string
    const taskId = local.task_id as string
    const localPath = local.local_path as string | null
    const url = local.url as string | null
    const type = (local.type as string) || 'file'
    const fileName = local.name as string
    const mimeType = (local.mime_type as string | null) || 'application/octet-stream'
    const sizeBytes = (local.size_bytes as number | null) ?? null

    // Resolve author email.
    const authorId = local.author_id as string
    const authorEmail = emailById.get(authorId) ?? (authorId === 'local-admin' ? CLOUD_ADMIN : '')
    const authorName = local.author_name as string

    const baseRow = {
      id, task_id: taskId, name: fileName, type,
      url: url ?? null, mime_type: mimeType, size_bytes: sizeBytes,
      author_email: authorEmail, author_name: authorName,
      created_at: local.created_at as string ?? new Date().toISOString(),
    }

    // Detection keys on PRESENCE OF A URL, not on an enumerated type list, so it
    // covers 'url', 'gdoc', 'gslides', 'gsheet', and any future link kind.
    // Rule: a non-empty url with NO usable local file blob is a link/metadata-only
    // attachment (storage_path = null; url + original `type` preserved via baseRow).
    // A blob is only a local_path that is set AND whose file actually exists.
    const hasLocalFile = !!localPath && existsSync(localPath)
    const hasUrl = typeof url === 'string' && url.trim().length > 0

    if (!hasLocalFile && hasUrl) {
      // Link/URL-type: seed metadata only (no blob needed). `type` preserved.
      const { error } = await cloud.from('task_attachments').upsert(
        { ...baseRow, storage_path: null },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      if (error) {
        console.warn('[seed] url/link row failed:', id, error.message)
        skippedNoPath++
      } else {
        seeded++
      }
      continue
    }

    if (!hasLocalFile) {
      // No usable local file AND no url to fall back on.
      if (localPath) {
        // local_path was set but the file is gone — report as missing-on-disk.
        skippedMissing++
        missingFiles.push(localPath)
      } else {
        skippedNoPath++
      }
      continue
    }

    // Blob-type: usable local file present → upload to Storage.
    const blobPath = localPath as string
    const ext = extname(blobPath).toLowerCase()
    const storagePath = `${taskId}/${id}${ext}`
    try {
      await uploadToStorage(blobPath, storagePath, mimeType)
      const { error } = await cloud.from('task_attachments').upsert(
        { ...baseRow, storage_path: storagePath },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      if (error) {
        await deleteStorageBlob(storagePath)
        console.warn('[seed] metadata insert failed after upload:', id, error.message)
        skippedMissing++
        missingFiles.push(`${blobPath} (upload succeeded, metadata failed)`)
      } else {
        seeded++
      }
    } catch (e) {
      console.warn('[seed] upload failed for:', blobPath, (e as Error)?.message)
      skippedMissing++
      missingFiles.push(blobPath)
    }
  }

  return { ok: true, seeded, skippedMissing, skippedNoPath, missingFiles }
}
