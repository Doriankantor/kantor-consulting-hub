import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { createHash, randomBytes } from 'crypto'

// ── Password hashing (sha-256 + per-user salt, sufficient for local desktop) ──
export function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex')
}

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'db')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'kantor-hub.sqlite')
  db = new Database(dbPath)

  // Performance + safety settings
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  // ── Schema ──────────────────────────────────────────────────────────────────

  // Migrate: add sources_json column if it doesn't exist yet
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN sources_json TEXT;')
  } catch {
    // Column already exists — safe to ignore
  }

  db.exec(`
    -- Local key-value settings (Anthropic key, preferences, etc.)
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Projects cache (synced from Supabase, writeable offline)
    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT DEFAULT 'active',
      owner_id     TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at    DATETIME,
      is_dirty     INTEGER DEFAULT 0
    );

    -- Tasks cache
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT DEFAULT 'todo',
      assignee_id  TEXT,
      due_date     TEXT,
      priority     TEXT DEFAULT 'medium',
      position     INTEGER DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at    DATETIME,
      is_dirty     INTEGER DEFAULT 0,
      sources_json TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Comments on tasks
    CREATE TABLE IF NOT EXISTS task_comments (
      id           TEXT PRIMARY KEY,
      task_id      TEXT NOT NULL,
      author_id    TEXT NOT NULL,
      author_name  TEXT NOT NULL,
      content      TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Activity log (auto-generated on field changes)
    CREATE TABLE IF NOT EXISTS task_activity (
      id           TEXT PRIMARY KEY,
      task_id      TEXT NOT NULL,
      actor_name   TEXT NOT NULL,
      action       TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Documents / articles
    CREATE TABLE IF NOT EXISTS documents (
      id           TEXT PRIMARY KEY,
      project_id   TEXT,
      title        TEXT NOT NULL,
      content      TEXT,
      doc_type     TEXT DEFAULT 'article',
      author_id    TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at    DATETIME,
      is_dirty     INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
  `)

  // ── Seed local admin account (runs once; safe to re-run) ──────────────────
  const adminExists = db
    .prepare("SELECT 1 FROM settings WHERE key = 'local_admin_email'")
    .get()

  if (!adminExists) {
    const salt = randomBytes(16).toString('hex')
    const hash = hashPassword('Admin123', salt)
    const insertSetting = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `)
    insertSetting.run('local_admin_email', 'doriankantor@gmail.com')
    insertSetting.run('local_admin_name',  'Dorian Kantor')
    insertSetting.run('local_admin_salt',  salt)
    insertSetting.run('local_admin_hash',  hash)
    console.log('[DB] Local admin account created')
  }

  // ── New tables for Step 5 ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_users (
      id                   TEXT PRIMARY KEY,
      email                TEXT NOT NULL UNIQUE,
      full_name            TEXT,
      role                 TEXT DEFAULT 'member',
      status               TEXT DEFAULT 'active',
      password_hash        TEXT NOT NULL,
      password_salt        TEXT NOT NULL,
      must_change_password INTEGER DEFAULT 0,
      anthropic_key_set    INTEGER DEFAULT 0,
      preferences_json     TEXT,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active          DATETIME,
      invited_by           TEXT
    );
    CREATE TABLE IF NOT EXISTS drive_sync_queue (
      id         TEXT PRIMARY KEY,
      task_id    TEXT,
      type       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at  DATETIME
    );
  `)

  // Migrate admin from settings → local_users (idempotent)
  {
    const _gs = (k: string) =>
      (db.prepare('SELECT value FROM settings WHERE key=?').get(k) as {value:string}|undefined)?.value ?? null
    const _aE = _gs('local_admin_email')
    const _aN = _gs('local_admin_name') ?? 'Dorian Kantor'
    const _aS = _gs('local_admin_salt')
    const _aH = _gs('local_admin_hash')
    if (_aE && _aS && _aH) {
      db.prepare(`
        INSERT OR IGNORE INTO local_users
          (id, email, full_name, role, status, password_hash, password_salt, must_change_password)
        VALUES (?, ?, ?, 'admin', 'active', ?, ?, 0)
      `).run('local-admin', _aE, _aN, _aH, _aS)
    }
  }

  console.log(`[DB] Initialized at ${dbPath}`)
}
