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

  // Migrate: add column_id column if it doesn't exist yet
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN column_id TEXT;')
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

  // ── Areas table ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#6366f1',
      is_default  INTEGER DEFAULT 0,
      position    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO areas (id, name, color, is_default, position) VALUES
      ('latin-america',          'Latin America',          '#22c55e', 1, 0),
      ('us-foreign-policy',      'US Foreign Policy',      '#3b82f6', 1, 1),
      ('european-politics',      'European Politics',      '#a855f7', 1, 2),
      ('international-security', 'International Security', '#ef4444', 1, 3),
      ('security-technology',    'Security Technology',    '#06b6d4', 1, 4);
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

  // ── New tables: labels, checklists, attachments, notifications, chat ─────
  db.exec(`
    -- Labels (workspace-level, admin-creatable)
    CREATE TABLE IF NOT EXISTS labels (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      position   INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    -- Seed default labels
    INSERT OR IGNORE INTO labels (id, name, color, position) VALUES
      ('label-urgent',    'Urgent',     '#ef4444', 0),
      ('label-review',    'Review',     '#f59e0b', 1),
      ('label-approved',  'Approved',   '#22c55e', 2),
      ('label-draft',     'Draft',      '#6366f1', 3),
      ('label-blocked',   'Blocked',    '#dc2626', 4);

    -- Task ↔ Label many-to-many
    CREATE TABLE IF NOT EXISTS task_labels (
      task_id  TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (task_id, label_id)
    );

    -- Checklists (a task can have multiple checklists)
    CREATE TABLE IF NOT EXISTS task_checklists (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT 'Checklist',
      position   INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Checklist items
    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id           TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL,
      task_id      TEXT NOT NULL,
      text         TEXT NOT NULL,
      checked      INTEGER DEFAULT 0,
      position     INTEGER DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Attachments (persisted, replaces in-memory React state)
    CREATE TABLE IF NOT EXISTS task_attachments (
      id          TEXT PRIMARY KEY,
      task_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'file',
      local_path  TEXT,
      url         TEXT,
      mime_type   TEXT,
      size_bytes  INTEGER,
      author_id   TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Notifications (per-user inbox)
    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      task_id     TEXT,
      task_title  TEXT,
      actor_name  TEXT,
      read        INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat messages (team-wide)
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          TEXT PRIMARY KEY,
      author_id   TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // ── Workspace columns + tasks (local-only, full schema) ──────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_columns (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      color    TEXT DEFAULT 'bg-slate-500'
    );

    INSERT OR IGNORE INTO workspace_columns (id, name, position, color) VALUES
      ('col-scoping',   'Scoping',        0, 'bg-slate-500'),
      ('col-research',  'Research',       1, 'bg-blue-500'),
      ('col-drafting',  'Drafting',       2, 'bg-yellow-500'),
      ('col-review',    'Review',         3, 'bg-orange-500'),
      ('col-delivery',  'Client Delivery',4, 'bg-purple-500'),
      ('col-published', 'Published',      5, 'bg-green-500');

    CREATE TABLE IF NOT EXISTS workspace_tasks (
      id               TEXT PRIMARY KEY,
      column_id        TEXT NOT NULL DEFAULT 'col-scoping',
      title            TEXT NOT NULL,
      content_type     TEXT NOT NULL DEFAULT 'policy-brief',
      client           TEXT,
      area_of_analysis TEXT,
      assignees_json   TEXT DEFAULT '[]',
      due_date         TEXT,
      start_date       TEXT,
      priority         TEXT NOT NULL DEFAULT 'medium',
      description      TEXT,
      notes            TEXT,
      sources_json     TEXT,
      position         INTEGER DEFAULT 0,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // ── Seed workspace_tasks on first run (only if table is empty) ───────────
  {
    const empty = (db.prepare('SELECT COUNT(*) as c FROM workspace_tasks').get() as {c: number}).c === 0
    if (empty) {
      function daysFromNow(offset: number): string {
        const dt = new Date()
        dt.setDate(dt.getDate() + offset)
        return dt.toISOString().slice(0, 10)
      }
      const seedTasks = [
        { id:'task-1',  col:'col-scoping',   title:'Colombia 2026 Electoral Risk Brief',         type:'policy-brief',          client:'Private Equity Client',         area:'latin-america',          due: daysFromNow(28), start: daysFromNow(3),   pri:'high',   pos:0 },
        { id:'task-2',  col:'col-scoping',   title:'Trump Immigration Policy Client Advisory',   type:'client-advisory',       client:'Financial Services Firm',        area:'us-foreign-policy',      due: daysFromNow(14), start: daysFromNow(1),   pri:'urgent', pos:1 },
        { id:'task-3',  col:'col-scoping',   title:'Dual-Use Technology Policy Brief',           type:'policy-brief',          client:'Defense Tech Startup',           area:'security-technology',    due: daysFromNow(35), start: daysFromNow(7),   pri:'medium', pos:2 },
        { id:'task-4',  col:'col-research',  title:'Drone Proliferation Report for FIU',         type:'research-report',       client:'Florida International University',area:'security-technology',   due: daysFromNow(18), start: daysFromNow(-4),  pri:'high',   pos:0 },
        { id:'task-5',  col:'col-research',  title:'Europe Security Autonomy Research Report',   type:'research-report',       client:'European Policy Institute',      area:'european-politics',      due: daysFromNow(22), start: daysFromNow(-6),  pri:'high',   pos:1 },
        { id:'task-6',  col:'col-research',  title:'Mexico Cartel Dynamics Briefing Note',       type:'briefing-note',         client:'Financial Intelligence Unit',    area:'latin-america',          due: daysFromNow(10), start: daysFromNow(-2),  pri:'high',   pos:2 },
        { id:'task-7',  col:'col-drafting',  title:'NATO Deterrence Strategy Report',            type:'research-report',       client:'European Security Think Tank',  area:'international-security', due: daysFromNow(16), start: daysFromNow(-8),  pri:'medium', pos:0 },
        { id:'task-8',  col:'col-drafting',  title:'LATAM Political Risk Advisory Op-Ed',        type:'op-ed',                 client:'Internal Publication',          area:'latin-america',          due: daysFromNow(7),  start: daysFromNow(-3),  pri:'low',    pos:1 },
        { id:'task-9',  col:'col-review',    title:'Venezuela Intervention Policy Brief',        type:'policy-brief',          client:'Confidential Government Client', area:'latin-america',          due: daysFromNow(4),  start: daysFromNow(-12), pri:'urgent', pos:0 },
        { id:'task-10', col:'col-review',    title:'Sanctions Enforcement Research Report',      type:'research-report',       client:'Compliance Advisory Firm',       area:'international-security', due: daysFromNow(9),  start: daysFromNow(-10), pri:'high',   pos:1 },
        { id:'task-11', col:'col-delivery',  title:'US–LATAM Strategy Note for Private Client',  type:'briefing-note',         client:'Confidential Private Client',    area:'us-foreign-policy',      due: daysFromNow(2),  start: daysFromNow(-14), pri:'high',   pos:0 },
        { id:'task-12', col:'col-published', title:'Hungary Post-Election Client Advisory',      type:'client-advisory',       client:'European Family Office',         area:'european-politics',      due: daysFromNow(-8), start: daysFromNow(-25), pri:'medium', pos:0 },
      ]
      const ins = db.prepare(`INSERT OR IGNORE INTO workspace_tasks
        (id,column_id,title,content_type,client,area_of_analysis,assignees_json,due_date,start_date,priority,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      for (const t of seedTasks) {
        ins.run(t.id, t.col, t.title, t.type, t.client, t.area, '[]', t.due, t.start, t.pri, t.pos)
      }
    }
  }

  // Remove legacy 'inactive' (soft-deleted) users — team:remove now hard-deletes
  db.exec("DELETE FROM local_users WHERE status = 'inactive'")

  // ── Clients + task_templates tables ─────────────────────────────────────
  db.exec(`
    -- Clients database
    CREATE TABLE IF NOT EXISTS clients (
      id                      TEXT PRIMARY KEY,
      name                    TEXT NOT NULL,
      type                    TEXT DEFAULT 'Private',
      country                 TEXT,
      region                  TEXT,
      status                  TEXT DEFAULT 'Active',
      primary_contact_name    TEXT,
      primary_contact_email   TEXT,
      primary_contact_phone   TEXT,
      notes                   TEXT,
      area_tags_json          TEXT DEFAULT '[]',
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_contacts (
      id         TEXT PRIMARY KEY,
      client_id  TEXT NOT NULL,
      name       TEXT NOT NULL,
      role       TEXT,
      email      TEXT,
      phone      TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    -- Task templates
    CREATE TABLE IF NOT EXISTS task_templates (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      content_type   TEXT NOT NULL DEFAULT 'policy-brief',
      duration_days  INTEGER DEFAULT 7,
      checklist_json TEXT DEFAULT '[]',
      is_builtin     INTEGER DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO task_templates (id, name, content_type, duration_days, checklist_json, is_builtin) VALUES
      ('tpl-policy-brief',        'Policy Brief',          'policy-brief',          14, '["Define scope and key questions","Literature review","Map policy landscape","Draft analysis","Write recommendations","Executive summary","Final review"]',          1),
      ('tpl-research-report',     'Research Report',       'research-report',       28, '["Research question & hypothesis","Methodology design","Data collection","Analysis","Key findings","Conclusions","Formatting & citations"]',                         1),
      ('tpl-op-ed',               'Op-Ed',                 'op-ed',                  7, '["Select angle & argument","Outline","First draft","Fact-check","Edit & refine","Submission-ready version"]',                                                        1),
      ('tpl-briefing-note',       'Briefing Note',         'briefing-note',          3, '["Context & background","Key facts","Implications","Recommendations","Final review"]',                                                                               1),
      ('tpl-consulting-engagement','Consulting Engagement','consulting-engagement',  42, '["Kickoff call","Scope document","Research phase","Draft delivery","Client feedback","Revisions","Final delivery"]',                                                 1),
      ('tpl-client-advisory',     'Client Advisory',       'client-advisory',        7, '["Situation assessment","Risk analysis","Strategic options","Recommendations","Client review"]',                                                                     1);
  `)

  // Migrate workspace_tasks: add client_id and recurrence_json columns
  try { db.exec('ALTER TABLE workspace_tasks ADD COLUMN client_id TEXT;') } catch {}
  try { db.exec('ALTER TABLE workspace_tasks ADD COLUMN recurrence_json TEXT;') } catch {}

  // Migrate task_comments: add updated_at and mentions_json columns
  try { db.exec('ALTER TABLE task_comments ADD COLUMN updated_at DATETIME;') } catch {}
  try { db.exec('ALTER TABLE task_comments ADD COLUMN mentions_json TEXT;') } catch {}

  // Migrate tasks: add start_date, assignees_json columns
  try { db.exec('ALTER TABLE tasks ADD COLUMN start_date TEXT;') } catch {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN assignees_json TEXT;') } catch {}

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
