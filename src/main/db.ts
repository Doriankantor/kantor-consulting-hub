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

  // ── Contacts, interactions, and task links ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id                    TEXT PRIMARY KEY,
      full_name             TEXT NOT NULL,
      job_title             TEXT,
      organization          TEXT,
      contact_types_json    TEXT DEFAULT '[]',
      email_primary         TEXT,
      email_secondary       TEXT,
      phone_primary         TEXT,
      phone_mobile          TEXT,
      phone_secondary       TEXT,
      linkedin_url          TEXT,
      twitter_handle        TEXT,
      telegram_username     TEXT,
      website_url           TEXT,
      country               TEXT,
      city                  TEXT,
      languages_json        TEXT DEFAULT '[]',
      org_type              TEXT,
      expertise_areas_json  TEXT DEFAULT '[]',
      security_sensitivity  TEXT DEFAULT 'none',
      how_we_met            TEXT,
      how_we_met_note       TEXT,
      assigned_to           TEXT,
      last_contacted_date   TEXT,
      confidential          INTEGER DEFAULT 0,
      do_not_contact        INTEGER DEFAULT 0,
      internal_notes        TEXT,
      notes_updated_by      TEXT,
      notes_updated_at      DATETIME,
      created_by            TEXT,
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_interactions (
      id              TEXT PRIMARY KEY,
      contact_id      TEXT NOT NULL,
      date            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'Meeting',
      summary         TEXT NOT NULL,
      logged_by_id    TEXT,
      logged_by_name  TEXT,
      follow_up       INTEGER DEFAULT 0,
      follow_up_date  TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_task_links (
      contact_id  TEXT NOT NULL,
      task_id     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (contact_id, task_id)
    );
  `)

  // ── Workspace boards ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_boards (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      position    INTEGER DEFAULT 0,
      archived    INTEGER DEFAULT 0,
      archived_at DATETIME,
      archived_by TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO workspace_boards (id, name, position)
      VALUES ('board-main', 'Main Board', 0);
  `)

  // Migrate: add board_id to workspace_tasks
  try { db.exec("ALTER TABLE workspace_tasks ADD COLUMN board_id TEXT DEFAULT 'board-main';") } catch {}
  db.exec("UPDATE workspace_tasks SET board_id = 'board-main' WHERE board_id IS NULL;")

  // Migrate: add board_id to workspace_columns (columns are now board-scoped)
  try { db.exec("ALTER TABLE workspace_columns ADD COLUMN board_id TEXT DEFAULT 'board-main';") } catch {}
  db.exec("UPDATE workspace_columns SET board_id = 'board-main' WHERE board_id IS NULL;")

  // Migrate: add archived column to workspace_tasks (per-task archiving)
  try { db.exec('ALTER TABLE workspace_tasks ADD COLUMN archived INTEGER DEFAULT 0;') } catch {}
  db.exec('UPDATE workspace_tasks SET archived = 0 WHERE archived IS NULL;')

  // Migrate: add deleted column to workspace_boards for trash support
  try { db.exec('ALTER TABLE workspace_boards ADD COLUMN deleted INTEGER DEFAULT 0;') } catch {}

  // ── Trash table ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id              TEXT PRIMARY KEY,
      item_type       TEXT NOT NULL,
      item_id         TEXT NOT NULL,
      item_name       TEXT NOT NULL,
      item_data_json  TEXT NOT NULL,
      deleted_by_id   TEXT,
      deleted_by_name TEXT,
      deleted_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at      DATETIME NOT NULL
    );
  `)

  // ── Calendar events table ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      description      TEXT,
      location         TEXT,
      start_date       TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      all_day          INTEGER DEFAULT 0,
      color            TEXT DEFAULT '#6366f1',
      visibility       TEXT DEFAULT 'team',
      created_by_id    TEXT,
      created_by_name  TEXT,
      attendees_json   TEXT DEFAULT '[]',
      linked_task_id   TEXT,
      google_event_id  TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // ── New migrations for features ────────────────────────────────────────────
  // Recurring calendar events
  try { db.exec("ALTER TABLE calendar_events ADD COLUMN recurrence_json TEXT;") } catch {}
  try { db.exec("ALTER TABLE calendar_events ADD COLUMN recurrence_parent_id TEXT;") } catch {}

  // Meeting links on calendar events
  try { db.exec("ALTER TABLE calendar_events ADD COLUMN meeting_link TEXT;") } catch {}
  try { db.exec("ALTER TABLE calendar_events ADD COLUMN meeting_type TEXT;") } catch {}

  // External attendees on calendar events
  try { db.exec("ALTER TABLE calendar_events ADD COLUMN external_attendees_json TEXT DEFAULT '[]';") } catch {}

  // Per-user Google OAuth tokens
  try { db.exec(`CREATE TABLE IF NOT EXISTS user_google_tokens (
    user_id TEXT PRIMARY KEY, access_token TEXT, refresh_token TEXT NOT NULL,
    scopes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`) } catch {}
  // Add scopes column to existing installs that pre-date it
  try { db.exec(`ALTER TABLE user_google_tokens ADD COLUMN scopes TEXT`) } catch {}

  // ── Board membership ─────────────────────────────────────────────────────
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS board_members (
        board_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        added_by   TEXT,
        added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, user_id)
      );
    `)
    // Seed admin into all existing boards (idempotent)
    db.exec(`
      INSERT OR IGNORE INTO board_members (board_id, user_id, added_by)
        SELECT id, 'local-admin', 'system' FROM workspace_boards;
    `)
    // One-time setup banner flag
    db.exec(`
      INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('board_membership_setup_dismissed', '0', CURRENT_TIMESTAMP);
    `)
  } catch (err) {
    console.warn('[DB] board_members migration warning:', err)
  }

  // To-Do: completed_at for workspace tasks
  try { db.exec('ALTER TABLE workspace_tasks ADD COLUMN completed_at DATETIME;') } catch {}

  // Client field now pulls from Contacts — store the contact's organization
  // alongside the name so the Kanban card can show a distinct org badge.
  try { db.exec('ALTER TABLE workspace_tasks ADD COLUMN client_org TEXT;') } catch {}

  // One-time cleanup: the system admin account (doriankantor@gmail.com) must
  // never be a task assignee. Strip its id from every task's assignee list
  // while leaving all other assignees (incl. dk@kantor-consulting.com) intact.
  try {
    const adminRow = db.prepare("SELECT id FROM local_users WHERE LOWER(email)='doriankantor@gmail.com'").get() as { id: string } | undefined
    if (adminRow?.id) {
      const rows = db.prepare("SELECT id, assignees_json FROM workspace_tasks WHERE assignees_json LIKE ?").all(`%"${adminRow.id}"%`) as { id: string; assignees_json: string }[]
      const upd = db.prepare('UPDATE workspace_tasks SET assignees_json=? WHERE id=?')
      for (const r of rows) {
        try {
          const ids: string[] = JSON.parse(r.assignees_json || '[]')
          const filtered = ids.filter(id => id !== adminRow.id)
          if (filtered.length !== ids.length) upd.run(JSON.stringify(filtered), r.id)
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    console.warn('[DB] admin-assignee cleanup warning:', err)
  }

  // One-time fix: Leonardo set up his account but his local record still shows
  // "invited". Flip him to active so the Team page reflects reality.
  try {
    db.prepare("UPDATE local_users SET status='active', must_change_password=0 WHERE LOWER(email)='leonardocs@kantor-consulting.com' AND status='invited'").run()
  } catch (err) {
    console.warn('[DB] leonardo status fix warning:', err)
  }

  // To-Do: dismissed tasks per user
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_dismissed (
      user_id    TEXT NOT NULL,
      task_id    TEXT NOT NULL,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, task_id)
    );
  `)

  // Personal to-do items (per user, not shared)
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_todos (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      title       TEXT NOT NULL,
      due_date    TEXT,
      due_time    TEXT,
      completed   INTEGER DEFAULT 0,
      completed_at DATETIME,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Notification preferences (per user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id           TEXT PRIMARY KEY,
      first_reminder_min  INTEGER DEFAULT 60,
      second_reminder_min INTEGER DEFAULT 30,
      apply_calendar      INTEGER DEFAULT 1,
      apply_tasks         INTEGER DEFAULT 1,
      apply_personal      INTEGER DEFAULT 1,
      email_prefs_json    TEXT DEFAULT '{}'
    );
  `)

  // Ensure the primary admin account always has role='admin'
  // (guards against accidental role downgrade or DB inconsistency)
  try {
    db.exec("UPDATE local_users SET role='admin' WHERE id='local-admin'")
    // Also ensure the configured admin email has admin role, whatever its id
    const adminEmailRow = db.prepare("SELECT value FROM settings WHERE key='local_admin_email'").get() as { value: string } | undefined
    if (adminEmailRow?.value) {
      db.prepare("UPDATE local_users SET role='admin' WHERE LOWER(email)=?").run(adminEmailRow.value.toLowerCase())
    }
  } catch {}

  // ── Intelligence system ───────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS intelligence_sources (
      id                  TEXT PRIMARY KEY,
      type                TEXT NOT NULL,
      title               TEXT,
      content             TEXT,
      url                 TEXT UNIQUE,
      source_name         TEXT,
      published_at        TEXT,
      added_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      added_by_id         TEXT,
      added_by_name       TEXT,
      status              TEXT NOT NULL DEFAULT 'unreviewed',
      confidence          TEXT,
      confidence_override INTEGER DEFAULT 0,
      categories_json     TEXT DEFAULT '[]',
      snippet             TEXT,
      image_url           TEXT,
      platform            TEXT,
      handle              TEXT,
      location_mentioned  TEXT,
      actors_mentioned    TEXT,
      file_name           TEXT,
      local_path          TEXT,
      drive_url           TEXT,
      analysis_json       TEXT,
      reviewed_by_id      TEXT,
      reviewed_by_name    TEXT,
      reviewed_at         TEXT,
      review_notes        TEXT,
      queue_section       TEXT,
      queued_at           TEXT,
      queued_by_id        TEXT,
      queued_by_name      TEXT
    );
    CREATE TABLE IF NOT EXISTS intelligence_push_log (
      id              TEXT PRIMARY KEY,
      pushed_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      pushed_by_id    TEXT NOT NULL,
      pushed_by_name  TEXT,
      items_count     INTEGER NOT NULL DEFAULT 0,
      sections_json   TEXT DEFAULT '[]',
      success         INTEGER NOT NULL DEFAULT 1,
      error_message   TEXT
    );
  `)

  // ── Subscription Model board setup ────────────────────────────────────────
  // Ensure Subscription Model board exists with fixed ID
  try {
    db.exec("INSERT OR IGNORE INTO workspace_boards (id,name,position) VALUES ('board-subscription','Subscription Model',1)")
  } catch {}

  // Add board_id to task_templates if not already there
  try { db.exec("ALTER TABLE task_templates ADD COLUMN board_id TEXT;") } catch {}

  // Set up Subscription Model columns (replace any existing columns for this board)
  {
    const existingSubCols = db.prepare("SELECT COUNT(*) as c FROM workspace_columns WHERE board_id='board-subscription'").get() as { c: number }
    if (existingSubCols.c === 0) {
      const subCols = [
        { id:'sub-col-1',  name:'Search new clients',  pos:0 },
        { id:'sub-col-2',  name:'Reach out',           pos:1 },
        { id:'sub-col-3',  name:'Discuss product',     pos:2 },
        { id:'sub-col-4',  name:'Prepare proposal',    pos:3 },
        { id:'sub-col-5',  name:'Send proposal',       pos:4 },
        { id:'sub-col-6',  name:'Follow-up',           pos:5 },
        { id:'sub-col-7',  name:'Contract negotiation',pos:6 },
        { id:'sub-col-8',  name:'Onboarding',          pos:7 },
        { id:'sub-col-9',  name:'Active subscriber',   pos:8 },
        { id:'sub-col-10', name:'Renewal',             pos:9 },
      ]
      const insertCol = db.prepare("INSERT OR IGNORE INTO workspace_columns (id,name,position,color,board_id) VALUES (?,?,?,?,?)")
      for (const c of subCols) insertCol.run(c.id, c.name, c.pos, 'bg-indigo-500', 'board-subscription')
    }
  }

  // Seed Subscription Model board-specific templates
  const SUB_TEMPLATES = [
    { id:'tpl-sub-1', name:'Reach out to new client',     days:3,  checklist:'["Research contact background","Draft personalized outreach message","Send initial email","Log contact in Contacts database","Follow up if no response after 5 days"]' },
    { id:'tpl-sub-2', name:'Discuss product',              days:5,  checklist:'["Schedule introductory call","Prepare talking points and product overview","Conduct meeting","Send follow-up summary email","Note client feedback and objections","Assess fit for subscription service"]' },
    { id:'tpl-sub-3', name:'Prepare proposal',             days:7,  checklist:'["Define scope of subscription service","Select analysis types to include","Set pricing based on scope","Draft proposal document","Internal review with admin","Send proposal to client"]' },
    { id:'tpl-sub-4', name:'Send proposal',                days:2,  checklist:'["Final review of proposal document","Personalize cover message","Send to client via email","Log send date in card notes","Schedule follow-up reminder for 5 days"]' },
    { id:'tpl-sub-5', name:'Follow-up',                    days:7,  checklist:'["Send follow-up email referencing proposal","Schedule call if client is interested","Address any questions or objections","Revise proposal if needed","Confirm next steps"]' },
    { id:'tpl-sub-6', name:'Contract negotiation',         days:14, checklist:'["Send contract draft","Review client feedback on terms","Agree on delivery schedule","Agree on pricing and payment terms","Final contract signed by both parties","File signed contract in Google Drive"]' },
    { id:'tpl-sub-7', name:'Onboarding new subscriber',   days:7,  checklist:'["Send welcome email with onboarding info","Set up client access if applicable","Introduce assigned team member","Confirm delivery schedule and formats","Send first deliverable on time","Request feedback after first delivery"]' },
    { id:'tpl-sub-8', name:'Renewal check-in',            days:14, checklist:'["Review full engagement history","Prepare renewal offer with updated pricing","Schedule renewal discussion call","Send renewal proposal document","Follow up if no response after 7 days","Confirm renewal or log as churned"]' },
    { id:'tpl-sub-9', name:'Feedback collection',         days:5,  checklist:'["Send structured feedback form to client","Compile and summarize responses","Identify areas for improvement","Log findings in card notes","Share summary with team in comments"]' },
  ]
  const insTpl = db.prepare("INSERT OR IGNORE INTO task_templates (id,name,content_type,duration_days,checklist_json,is_builtin,board_id) VALUES (?,?,?,?,?,1,?)")
  for (const t of SUB_TEMPLATES) insTpl.run(t.id, t.name, 'consulting-engagement', t.days, t.checklist, 'board-subscription')

  // ── Info Pages system ─────────────────────────────────────────────────────
  try { db.exec("ALTER TABLE workspace_boards ADD COLUMN board_type TEXT DEFAULT 'standard';") } catch {}
  try { db.exec("ALTER TABLE workspace_boards ADD COLUMN board_config TEXT;") } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS info_page_owners (
      page_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      assigned_by TEXT,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (page_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS info_page_items (
      id               TEXT PRIMARY KEY,
      page_id          TEXT NOT NULL,
      tab              TEXT NOT NULL,
      sub_type         TEXT,
      title            TEXT,
      content_json     TEXT DEFAULT '{}',
      status           TEXT DEFAULT 'draft',
      priority         TEXT DEFAULT 'medium',
      proposed_section TEXT,
      confidence       TEXT,
      source_ref       TEXT,
      analysis_json    TEXT,
      created_by_id    TEXT,
      created_by_name  TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS info_page_commits (
      id               TEXT PRIMARY KEY,
      page_id          TEXT NOT NULL,
      item_id          TEXT NOT NULL,
      submitted_by_id  TEXT,
      submitted_by_name TEXT,
      submitted_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      status           TEXT DEFAULT 'pending_owner',
      reviewed_by_id   TEXT,
      reviewed_by_name TEXT,
      reviewed_at      DATETIME,
      rejection_note   TEXT,
      admin_approved   INTEGER DEFAULT 0,
      admin_reviewed_by TEXT,
      admin_reviewed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS info_page_published (
      id               TEXT PRIMARY KEY,
      page_id          TEXT NOT NULL,
      what_changed     TEXT NOT NULL,
      date_implemented DATETIME DEFAULT CURRENT_TIMESTAMP,
      committed_by_id  TEXT,
      committed_by_name TEXT,
      approved_by_id   TEXT,
      approved_by_name TEXT,
      prompt_used      TEXT,
      item_ids_json    TEXT DEFAULT '[]',
      commit_count     INTEGER DEFAULT 0
    );
  `)

  // Seed Info Page boards
  try {
    db.exec("INSERT OR IGNORE INTO workspace_boards (id,name,position,board_type,board_config) VALUES ('board-info-latam','LATAM Drone Threat',50,'info-page','{\"repo\":\"Doriankantor/contested-skies-monitor\",\"live_url\":\"contestedskies.kantor-consulting.com\",\"keywords\":\"drone proliferation,drone strikes,drone purchases,counter drone,civilian drone use,criminal drone use,weaponized drones,DJI drones,drone warfare,loitering munitions,kamikaze drones,FPV drones,drone swarms,autonomous weapons,UAV,MALE drones,drone jamming,anti-drone systems,drone export controls,drone regulation,drones Latin America,drones Colombia,drones Venezuela,drones Mexico,drones Brazil,cartel drones,narco drones,DJI export restrictions,Iranian drones,Turkish Bayraktar,Chinese drone exports,drone proliferation non-state actors\",\"status\":\"active\"}')")
    db.exec("INSERT OR IGNORE INTO workspace_boards (id,name,position,board_type,board_config) VALUES ('board-info-trump','Trump Immigration',51,'info-page','{\"repo\":\"\",\"live_url\":\"\",\"keywords\":\"\",\"status\":\"setup-pending\"}')")
  } catch {}

  // ── Source Intelligence → Info Pages pipeline ─────────────────────────────
  // Link an info_page_item back to the intelligence source it was created from.
  try { db.exec("ALTER TABLE info_page_items ADD COLUMN origin_source_id TEXT;") } catch {}
  // Feedback loop: mark an intelligence source as published/used in an info page.
  try { db.exec("ALTER TABLE intelligence_sources ADD COLUMN used_in_page TEXT;") } catch {}
  try { db.exec("ALTER TABLE intelligence_sources ADD COLUMN used_in_page_at TEXT;") } catch {}

  // Per-Info-Page Claude Analysis chat history (full interactive conversation).
  db.exec(`
    CREATE TABLE IF NOT EXISTS info_page_chat (
      id          TEXT PRIMARY KEY,
      page_id     TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  console.log(`[DB] Initialized at ${dbPath}`)
}
