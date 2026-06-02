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

  // ── Source Intelligence review extensions (gate proposals + tagging) ──────
  // NOTE: relevance_score / region / gate_processed / gate_reasoning / geography
  // were expected to already exist on intelligence_sources but did not — the
  // Claude relevance gate that produced those lives in scripts/ and writes to
  // Supabase cs_articles, NOT this local table. We add them here (idempotent,
  // ADD-IF-MISSING) so the in-app gate (gateClassifyArticle) can populate them
  // and the review card can show + human-confirm them. Never duplicated.
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN relevance_score INTEGER;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN region TEXT;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN geography TEXT;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN geography_confirmed INTEGER DEFAULT 0;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN gate_processed INTEGER DEFAULT 0;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN gate_reasoning TEXT;') } catch {}
  // relevance_type: in-region | supply-side | precedent | escalation-signal | none
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN relevance_type TEXT;') } catch {}
  // disposition_tags / thematic_tags: JSON arrays, same pattern as categories_json
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN disposition_tags TEXT;') } catch {}
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN thematic_tags TEXT;') } catch {}
  // language: best-guess ISO code inferred from domain/title ('es'|'pt'|'en'). Nullable.
  try { db.exec('ALTER TABLE intelligence_sources ADD COLUMN language TEXT;') } catch {}

  // Known-tags registry (controlled-but-growable vocabularies). The (name,type)
  // unique index prevents storing the same tag twice / near-duplicates.
  db.exec(`
    CREATE TABLE IF NOT EXISTS known_tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('disposition','thematic')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_known_tags_name_type ON known_tags(name, type);
  `)

  // Seed the registry once (only if empty). Seeds are inserted verbatim; only
  // NEW user-created tags get normalized (trim / lowercase / spaces→hyphens).
  {
    const tagCount = (db.prepare('SELECT COUNT(*) as c FROM known_tags').get() as { c: number }).c
    if (tagCount === 0) {
      const seedTag = db.prepare('INSERT OR IGNORE INTO known_tags (name, type) VALUES (?, ?)')
      const seedDisposition = ['contested-skies', 'client-advisory', 'latam-brief', 'comparative-analysis', 'internal-only']
      const seedThematic = ['BANOT-parallel', 'cartel-drones', 'chinese-supplier', 'counter-uas-procurement', 'technology-transfer']
      for (const n of seedDisposition) seedTag.run(n, 'disposition')
      for (const n of seedThematic) seedTag.run(n, 'thematic')
    }
  }

  // Decision log — capture-only corpus for a later learning step. NOTHING reads
  // it yet. One row per Approve / Reject / Save(correct) review action.
  db.exec(`
    CREATE TABLE IF NOT EXISTS intelligence_decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id  TEXT,
      action      TEXT,
      ai_proposed TEXT,
      human_final TEXT,
      reason      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
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

  // ── Source pipeline lifecycle (Phases 1-6: two-stage commit) ──────────────
  // info_page_sources: tracks each approved intelligence article through the
  // new→review→committed lifecycle for a specific info page.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS info_page_sources (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id   TEXT NOT NULL,
        info_page    TEXT NOT NULL,
        stage        TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','review','committed')),
        design_notes TEXT,
        added_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        committed_at DATETIME,
        UNIQUE(article_id, info_page)
      );
    `)
  } catch {}
  // info_page_changes: append-only audit log of every stage transition.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS info_page_changes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id  TEXT NOT NULL,
        info_page   TEXT NOT NULL,
        from_stage  TEXT,
        to_stage    TEXT NOT NULL,
        note        TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
  } catch {}

  // Seed Info Page boards
  try {
    db.exec("INSERT OR IGNORE INTO workspace_boards (id,name,position,board_type,board_config) VALUES ('board-info-latam','LATAM Drone Threat',50,'info-page','{\"repo\":\"Doriankantor/contested-skies-monitor\",\"live_url\":\"contestedskies.kantor-consulting.com\",\"keywords\":\"drone proliferation,drone strikes,drone purchases,counter drone,civilian drone use,criminal drone use,weaponized drones,DJI drones,drone warfare,loitering munitions,kamikaze drones,FPV drones,drone swarms,autonomous weapons,UAV,MALE drones,drone jamming,anti-drone systems,drone export controls,drone regulation,drones Latin America,drones Colombia,drones Venezuela,drones Mexico,drones Brazil,cartel drones,narco drones,DJI export restrictions,Iranian drones,Turkish Bayraktar,Chinese drone exports,drone proliferation non-state actors\",\"status\":\"active\",\"pipeline\":true}')")
    db.exec("INSERT OR IGNORE INTO workspace_boards (id,name,position,board_type,board_config) VALUES ('board-info-trump','Trump Immigration',51,'info-page','{\"repo\":\"Doriankantor/Trump-immigration\",\"live_url\":\"\",\"keywords\":\"trump immigration,immigration policy,mass deportation,deportation,ICE raids,ICE,border security,border wall,asylum,refugees,migrants,visa policy,H-1B,green card,DACA,birthright citizenship,immigration enforcement,CBP,Title 42,sanctuary cities,immigration courts,undocumented immigrants,work permits,travel ban,immigrant detention,migrant caravan\",\"file\":\"index.html\",\"status\":\"active\",\"pipeline\":false}')")
  } catch {}

  // Link the Trump Immigration page to its GitHub repo on existing installs that
  // were seeded before the repo existed. Only runs while the page is still
  // unlinked (empty repo) so it never overwrites a manual Edit settings change.
  try {
    db.exec("UPDATE workspace_boards SET board_config='{\"repo\":\"Doriankantor/Trump-immigration\",\"live_url\":\"\",\"keywords\":\"trump immigration,immigration policy,mass deportation,deportation,ICE raids,ICE,border security,border wall,asylum,refugees,migrants,visa policy,H-1B,green card,DACA,birthright citizenship,immigration enforcement,CBP,Title 42,sanctuary cities,immigration courts,undocumented immigrants,work permits,travel ban,immigrant detention,migrant caravan\",\"file\":\"index.html\",\"status\":\"active\"}', updated_at=datetime('now') WHERE id='board-info-trump' AND board_config LIKE '%\"repo\":\"\"%'")
  } catch {}

  // Pipeline routing fix: ensure LATAM Drone Threat is the ONLY automated
  // article-pull destination. Runs on every startup but only writes when the
  // pipeline flag is missing or wrong — safe to run repeatedly.
  try {
    const pipelineRows = db.prepare(
      "SELECT id, board_config FROM workspace_boards WHERE id IN ('board-info-latam','board-info-trump')"
    ).all() as { id: string; board_config: string }[]
    for (const row of pipelineRows) {
      let cfg: Record<string, unknown> = {}
      try { cfg = JSON.parse(row.board_config || '{}') } catch { cfg = {} }
      const wantPipeline = row.id === 'board-info-latam'
      if (cfg.pipeline !== wantPipeline) {
        cfg.pipeline = wantPipeline
        db.prepare(
          "UPDATE workspace_boards SET board_config=?, updated_at=datetime('now') WHERE id=?"
        ).run(JSON.stringify(cfg), row.id)
      }
    }
  } catch {}

  // ── Source Intelligence → Info Pages pipeline ─────────────────────────────
  // Link an info_page_item back to the intelligence source it was created from.
  try { db.exec("ALTER TABLE info_page_items ADD COLUMN origin_source_id TEXT;") } catch {}
  // Feedback loop: mark an intelligence source as published/used in an info page.
  try { db.exec("ALTER TABLE intelligence_sources ADD COLUMN used_in_page TEXT;") } catch {}
  try { db.exec("ALTER TABLE intelligence_sources ADD COLUMN used_in_page_at TEXT;") } catch {}

  // ── Seed the Contested Skies Source Archive into Source Intelligence ──────────
  // The sources the live Contested Skies page is built on. FRAMEWORK references
  // (Kantor + FIU/Santofimio) are FIXED/authoritative — they are NOT graded and
  // are inserted pre-approved with confidence locked. Journalistic sources are
  // pre-graded by how solid the outlet is (high = wires / major intl / official /
  // top think tanks; medium = credible trade / regional / specialized; low =
  // single-outlet / sensational / advocacy) and inserted as NEW, unreviewed
  // "articles" the team can re-grade in Intelligence → News before they're pushed
  // to the live site. All carry queue_section='source-archive' so the existing
  // pushToContestedSkies renders them into the Source Archive with confidence
  // badges. Idempotent: INSERT OR IGNORE keyed on the UNIQUE url + a stable id.
  try {
    const csArchive: Array<{
      id: string; date: string; pub: string; title: string; url: string;
      blurb: string; loc: string; conf: 'high' | 'medium' | 'low'; fixed?: boolean; cats: string[]
    }> = [
      // ── FRAMEWORK REFERENCES (fixed / authoritative — not graded) ──
      { id: 'csa-fw-01', date: '', pub: 'Jack D. Gordon Institute for Public Policy (FIU)', title: 'Contested Skies — Part I', url: 'https://digitalcommons.fiu.edu/record/31523?v=pdf', blurb: `Foundational report on UAS proliferation among violent non-state actors in Latin America.`, loc: 'Framework', conf: 'high', fixed: true, cats: ['Policy & Regulation'] },
      { id: 'csa-fw-02', date: '', pub: 'Jack D. Gordon Institute for Public Policy (FIU)', title: 'Contested Skies — Part II', url: 'https://digitalcommons.fiu.edu/record/31533?ln=en&v=pdf', blurb: `Companion report extending the Contested Skies framework.`, loc: 'Framework', conf: 'high', fixed: true, cats: ['Policy & Regulation'] },
      { id: 'csa-fw-03', date: '', pub: 'Kantor Consulting', title: 'Publications portfolio', url: 'https://www.kantor-consulting.com/publications-kc', blurb: `Producer of the monitor.`, loc: 'Framework', conf: 'high', fixed: true, cats: ['Policy & Regulation'] },
      { id: 'csa-fw-04', date: '', pub: 'Kantor Consulting', title: 'Areas of analysis', url: 'https://www.kantor-consulting.com/areas-of-analysis', blurb: `Editorial context for the monitor.`, loc: 'Framework', conf: 'high', fixed: true, cats: ['Policy & Regulation'] },

      // ── COLOMBIA (Threat: Severe) ──
      { id: 'csa-co-01', date: '2026-04-05', pub: 'Infobae', title: 'Escuelas de drones: el nuevo campo de batalla del conflicto armado en Colombia', url: 'https://www.infobae.com/colombia/2026/04/05/escuelas-de-drones-el-nuevo-campo-de-batalla-del-conflicto-armado-en-colombia/', blurb: `Clandestine drone schools in Colombian and Venezuelan territory professionalize EMC and ELN unmanned operations. Includes Tibú attack that killed a 12-year-old.`, loc: 'Colombia', conf: 'medium', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-co-02', date: '2025-12-19', pub: 'CNN', title: 'Seven Colombian soldiers killed in guerrilla attack with drones and explosives', url: 'https://www.cnn.com/2025/12/19/americas/colombia-eln-guerrilla-drone-attack-military-base-latam-intl', blurb: `ELN attack during a nationwide armed strike kills seven soldiers; Petro announces emergency C-UAS procurement.`, loc: 'Colombia', conf: 'high', cats: ['Incident', 'Counter-drone / C-UAS'] },
      { id: 'csa-co-03', date: '2025-12-19', pub: 'Colombia One', title: 'Colombia Moves to Acquire Anti-Drone Systems After ELN Attack Kills Six Soldiers', url: 'https://colombiaone.com/2025/12/19/colombia-acquire-anti-drone-systems-after-eln-attack/', blurb: `Defense Minister Pedro Sánchez confirms existing C-UAS is insufficient; presidential announcement of broader acquisition plan.`, loc: 'Colombia', conf: 'medium', cats: ['Counter-drone / C-UAS', 'Investment & Procurement'] },
      { id: 'csa-co-04', date: '2025-08-29', pub: 'NBC News', title: 'Growing use of deadly drones by Colombian militants terrifies residents', url: 'https://www.nbcnews.com/news/latino/deadly-drones-colombia-militants-terrifies-residents-rcna228009', blurb: `Verified social-media footage shows armed groups using drones for surveillance, intimidation, and bombing campaigns in Catatumbo.`, loc: 'Colombia', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-co-05', date: '2025-08-22', pub: 'Al Jazeera', title: 'At least 18 killed in Colombia in drone attack on helicopter, car bombing', url: 'https://www.aljazeera.com/news/2025/8/22/at-least-18-killed-in-colombia-in-drone-attack-on-helicopter-car-bombing', blurb: `FARC-EMC dissidents down a Black Hawk helicopter via drone over coca-eradication operation in Antioquia; 12 officers killed. Same week as the Cali truck-bomb.`, loc: 'Colombia', conf: 'high', cats: ['Incident'] },
      { id: 'csa-co-06', date: '2025-08-14', pub: 'The Defense Post', title: 'Three Colombian Soldiers Killed in Guerrilla Drone Attack', url: 'https://thedefensepost.com/2025/08/14/colombia-guerrilla-drone-attack/', blurb: `Navy patrol on the Naya River struck by explosive drone; FARC dissident group under Iván Mordisco blamed.`, loc: 'Colombia', conf: 'medium', cats: ['Incident', 'Criminal & VNSA Activity'] },
      { id: 'csa-co-07', date: '2025-07-22', pub: 'The City Paper Bogotá', title: `ELN Modifies Drones To Target Colombia's Security Forces`, url: 'https://thecitypaperbogota.com/news/eln-modifies-drones-to-target-colombias-security-forces/', blurb: `2025 government data: 230+ explosive incidents documented, ~670 grenades deployed, many drone-launched. Third Division (Cauca/Nariño) reports highest concentration. Improvised mortar grenades cited.`, loc: 'Colombia', conf: 'medium', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-co-08', date: '2025-06-11', pub: 'CSIS', title: 'Illicit Innovation: Latin America Is Not Prepared to Fight Criminal Drones', url: 'https://www.csis.org/analysis/illicit-innovation-latin-america-not-prepared-fight-criminal-drones', blurb: `Henry Ziemer's regional overview placing Colombia's first lethal drone attack (July 2024) in hemispheric context.`, loc: 'Colombia', conf: 'high', cats: ['Policy & Regulation', 'Counter-drone / C-UAS'] },
      { id: 'csa-co-09', date: '2025-03-05', pub: 'Latin America Reports', title: `Drone attacks increasingly affect civilians in Colombia's conflict`, url: 'https://latinamericareports.com/drone-attacks-increasingly-affect-civilians-in-colombias-conflict/10839/', blurb: `ELN vs Frente 33 air competition in Norte de Santander; Popayán mayor's office temporarily bans private drone use after police station attack.`, loc: 'Colombia', conf: 'medium', cats: ['Incident'] },

      // ── MEXICO (Threat: High) ──
      { id: 'csa-mx-01', date: '2026-04-07', pub: 'HSToday', title: `Mexico's Escalating Cartel Violence and Expanding Cross-Border Threats`, url: 'https://www.hstoday.us/subject-matter-areas/border-security/mexicos-escalating-cartel-violence-and-expanding-cross-border-threats/', blurb: `October 2025 Tijuana attack on a state government compound housing the attorney general's office, first major urban border-zone offensive UAS use.`, loc: 'Mexico', conf: 'medium', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-mx-02', date: '2026-02-25', pub: 'Small Wars Journal / NCITE', title: 'Mapping Weaponized Drone Attacks Attributed to Mexican Drug Cartels', url: 'https://smallwarsjournal.com/2026/02/16/mexican-cartel-drone-attacks-report/', blurb: `NCITE/ACLED dataset: 221 weaponized cartel drone incidents 2021–2025, 77 fatalities. CJNG accounts for ~19% of attributed attacks. Air-dropped grenades, munitions, IEDs.`, loc: 'Mexico', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-mx-03', date: '2026-02-16', pub: 'Cronkite News (ASU)', title: 'Concerns grow as Mexican cartels embrace drones for drug smuggling, attacks on rivals', url: 'https://cronkitenews.azpbs.org/2026/02/14/drones-mexican-cartels-border/', blurb: `CBP discloses 34,682 drone flights detected within 500m of US-Mexico border in FY2025. First confirmed cartel FPV identified as DJI Avata 2 (~$600).`, loc: 'Mexico', conf: 'medium', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-mx-04', date: '2025-02-18', pub: 'Small Wars Journal', title: 'Criminal Groups Are Ramping Up Explosives in Mexico', url: 'https://smallwarsjournal.com/2025/02/18/criminal-groups-are-ramping-up-explosives-in-mexico-dr-bunker-of-swj-gives-insights-for-insight-crime/', blurb: `IED seizures grew from 3 in 2020–21 to 1,375 in 2022. Dr. Robert Bunker tracks parallel drone-borne payload normalization.`, loc: 'Mexico', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-mx-05', date: '2024-12-01', pub: 'CBS News', title: `Hometown of notorious cartel leader 'El Chapo' hit by drone attacks, forcing residents to flee`, url: 'https://www.cbsnews.com/news/drug-lord-el-chapo-hometown-hit-by-drone-attacks-residents-flee', blurb: `Badiraguato (Sinaloa) struck by explosive-laden drones; Gov. Rocha confirms displacement. Sinaloa Cartel internal conflict context.`, loc: 'Mexico', conf: 'high', cats: ['Incident', 'Criminal & VNSA Activity'] },
      { id: 'csa-mx-06', date: '2024-01-08', pub: 'InSight Crime', title: 'Mexico Drone Attacks Spike After CJNG, Familia Michoacana Alliance', url: 'https://insightcrime.org/news/mexico-drone-attacks-spike-after-cjng-familia-michoacana-alliance/', blurb: `CJNG providing increasingly sophisticated drones to LFM under territorial-control alliance; thermal-camera, explosive-release modifications documented.`, loc: 'Mexico', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-mx-07', date: '2024-01-01', pub: 'Fox News', title: 'Deadly cartel drone attack strikes remote Mexican village', url: 'https://foxnews.com/world/deadly-cartel-drone-attack-strikes-remote-mexican-village.amp', blurb: `Guerrero state prosecutor confirms five burned dead in a January 2024 cartel drone-supported attack on a remote community.`, loc: 'Mexico', conf: 'medium', cats: ['Incident'] },

      // ── VENEZUELA (Threat: High) ──
      { id: 'csa-ve-01', date: '2026-01-01', pub: 'Military Watch Magazine', title: 'Venezuela Deploys Combat Tested Iranian Long Range Strike Drones to Respond to U.S. Military Buildup', url: 'https://militarywatchmagazine.com/article/venezuela-receives-iranian-drones-respond', blurb: `Mohajer-6 deployment in context of US destroyer / Marine deployments to the Caribbean since August 2025.`, loc: 'Venezuela', conf: 'low', cats: ['State Military Activity', 'Extra-regional Supplier'] },
      { id: 'csa-ve-02', date: '2025-12-31', pub: 'The War Zone', title: 'Iranian Strike-Surveillance Drones Are Now Operating In Venezuela', url: 'https://www.twz.com/news-features/iranian-mohajer-6-drones-now-operating-in-venezuela', blurb: `First unambiguous visual confirmation of Mohajer-6 in Venezuelan Air Force colors at El Libertador Air Base; Qaem munition compatibility noted.`, loc: 'Venezuela', conf: 'high', cats: ['State Military Activity', 'Extra-regional Supplier'] },
      { id: 'csa-ve-03', date: '2025-12-31', pub: 'Defence Security Asia', title: 'Iranian Mohajer-6 Armed Drone Confirmed in Venezuelan Air Force Service', url: 'https://defencesecurityasia.com/en/iran-mohajer-6-drone-venezuela-air-force-confirmed/', blurb: `Ground support vehicles and routine handling visible in image; assessed as embedded in daily operational cycles, not ceremonial.`, loc: 'Venezuela', conf: 'medium', cats: ['State Military Activity', 'Extra-regional Supplier'] },
      { id: 'csa-ve-04', date: '2025-12-30', pub: 'U.S. Treasury / OFAC', title: 'Treasury Targets Iran-Venezuela Weapons Trade', url: 'https://home.treasury.gov/news/press-releases/sb0347', blurb: `OFAC sanctions 10 individuals and entities including a Venezuelan company linked to multi-million dollar combat drone sales to Caracas.`, loc: 'Venezuela', conf: 'high', cats: ['Finance & Sanctions', 'Extra-regional Supplier'] },
      { id: 'csa-ve-05', date: '2025-09-04', pub: 'Iran International', title: 'Iranians control Venezuelan drone facilities as US warships deployed', url: 'https://www.iranintl.com/en/202509044107', blurb: `Iranian specialists still oversee assembly at El Libertador; access blocked for unauthorized Venezuelan staff. CAVIM facilities detailed. Mohajer-2 kits cited.`, loc: 'Venezuela', conf: 'medium', cats: ['State Military Activity', 'Extra-regional Supplier'] },
      { id: 'csa-ve-06', date: '2025-09-03', pub: 'Army Recognition', title: 'Analysis: How Venezuela uses Iranian drones to boost precision strikes and coastal defenses', url: 'https://www.armyrecognition.com/news/army-news/2025/analysis-discover-how-venezuela-uses-iranian-drones-to-boost-precision-strikes-and-coastal-defenses', blurb: `Two decades of Iran–Venezuela drone cooperation; Mohajer-2/6, Shahed-136 derivative, Qaem munitions detailed.`, loc: 'Venezuela', conf: 'medium', cats: ['State Military Activity', 'Extra-regional Supplier'] },
      { id: 'csa-ve-07', date: '2025-09-01', pub: 'DroneXL', title: 'Venezuela Prepares For U.S. Attack With Armed Drones', url: 'https://dronexl.co/2025/09/01/venezuela-prepares-for-us-attack-with-drones/', blurb: `Maduro regime UCAV buildup; Miami Herald / InfoDefensa source imagery referenced.`, loc: 'Venezuela', conf: 'low', cats: ['State Military Activity'] },

      // ── BRAZIL (Threat: Moderate) ──
      { id: 'csa-br-01', date: '2025-07-14', pub: 'DefesaNet', title: 'Sistema Antidron reforça poder de defesa do Exército', url: 'https://www.defesanet.com.br/vant/sistema-antidrone-reforca-poder-de-defesa-do-exercito/', blurb: `Brazilian Army's SCE-0100 publicized as precision RF-jamming neutralization solution integrated with command-and-control under SISFRON.`, loc: 'Brazil', conf: 'medium', cats: ['Counter-drone / C-UAS', 'State Military Activity'] },
      { id: 'csa-br-02', date: '2025-03-06', pub: 'InSight Crime', title: 'Drones Fuel Criminal Arms Race in Latin America', url: 'https://insightcrime.org/news/drones-fuel-criminal-arms-race-latin-america/', blurb: `Regional roundup including 2014 São José dos Campos and 2019 Rio Grande do Sul prison drone seizures (43 units, ~4 kg narcotics).`, loc: 'Brazil', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-br-03', date: '2024-11-11', pub: 'DroneLife', title: `Brazilian Drone Industry Takes Flight: BIRDS' VEGA UTM Selected for National Airspace Modernization`, url: 'https://dronelife.com/2024/11/11/brazilian-drone-industry-takes-flight-birds-vega-utm-selected-for-national-airspace-modernization-project/', blurb: `DECEA authorizes BIRDS (Speedbird Aero, High Lander, Cando) to use BR-UTM for coordinated BVLOS counter-drone services.`, loc: 'Brazil', conf: 'medium', cats: ['Innovation & Technology', 'Counter-drone / C-UAS'] },

      // ── ARGENTINA (Threat: Low) ──
      { id: 'csa-ar-01', date: '2025-01-16', pub: 'C-UAS Hub', title: `Argentina's Ministry of Security to acquire classified anti-UAS system`, url: 'https://www.cuashub.com/en/content/argentina-s-ministry-of-security-to-acquire-classified-anti-uas-system/', blurb: `Classified anti-drone procurement driven by smuggling, terrorism, prison-contraband concerns.`, loc: 'Argentina', conf: 'medium', cats: ['Counter-drone / C-UAS', 'Investment & Procurement'] },
      { id: 'csa-ar-02', date: '2024-07-23', pub: 'Boletín Oficial', title: 'Aviación Civil No Tripulada — Decreto 663/2024', url: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/311129/20240724', blurb: `Milei administration deregulation removing oversight for sub-250g and licensing for sub-25kg drones.`, loc: 'Argentina', conf: 'high', cats: ['Policy & Regulation'] },

      // ── PANAMA (Threat: Moderate) ──
      { id: 'csa-pa-01', date: '2020-11-26', pub: 'InSight Crime', title: 'Drones Used to Drop Contraband into Panama Prison', url: 'https://insightcrime.org/news/drones-contraband-panama-prison/', blurb: `La Joya seizures of cell phones, narcotics, pistol parts, and 'crispi' (coca-marijuana mix) — 1,587 drones seized across Panamanian prisons cited.`, loc: 'Panama', conf: 'high', cats: ['Criminal & VNSA Activity'] },

      // ── REGIONAL & CROSS-CUTTING (Multi-country) ──
      { id: 'csa-rg-01', date: '2025-09-15', pub: 'Reuters', title: 'US reinterprets arms control pact to ease military drone exports', url: 'https://www.reuters.com/business/aerospace-defense/us-reinterprets-arms-control-pact-ease-military-drone-exports-2025-09-15/', blurb: `Reclassification of MQ-9 Reaper-class systems as 'aircraft' rather than 'missile systems' for export-control purposes.`, loc: 'Regional', conf: 'high', cats: ['Policy & Regulation', 'Extra-regional Supplier'] },
      { id: 'csa-rg-02', date: '2025-09-01', pub: 'DroneXL', title: 'Cartels Deploy FPV Drones and Anti-UAS Systems in Criminal Arms Race', url: 'https://dronexl.co/2025/09/01/cartels-deploy-fpv-drones-anti-uas-systems/', blurb: `FPV adoption by both CJNG and Sinaloa cartel; emergence of criminal counter-UAS capability. DJI Avata 2 referenced as documented platform.`, loc: 'Regional', conf: 'low', cats: ['Criminal & VNSA Activity', 'Counter-drone / C-UAS'] },
      { id: 'csa-rg-03', date: '2025-07-29', pub: 'Intelligence Online', title: 'Ukraine Counterintelligence Investigates Presence of Sicarios on Front Line', url: 'https://www.intelligenceonline.com/government-intelligence/2025/07/29/ukraine-counterintelligence-investigates-presence-of-sicarios-on-front-line,110496139-eve', blurb: `Spanish-speaking volunteers in the International Legion suspected of cartel ties seeking FPV drone training transferable to Latin America.`, loc: 'Regional', conf: 'medium', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-rg-04', date: '2025-07-07', pub: 'France 24', title: `Drones: A new weapon for Colombia's guerrillas`, url: 'https://www.france24.com/en/americas/20250707-colombia-drones-armed-conflict-guerrillas-projectiles-human-rights-farc-eln', blurb: `On-the-ground reporting on the diffusion of weaponized drones across FARC dissident and ELN factions.`, loc: 'Regional', conf: 'high', cats: ['Criminal & VNSA Activity'] },
      { id: 'csa-rg-05', date: '2025-03-03', pub: 'Drone Wars UK', title: 'Armed Drone Proliferation: Continued Exports Leading to Civilian Casualties', url: 'https://dronewars.net/2025/03/03/armed-drone-proliferation-continued-exports-leading-to-civilian-casualties/', blurb: `Global mapping of armed MALE drone proliferation, including Iran→Venezuela transfer in the regional context.`, loc: 'Regional', conf: 'medium', cats: ['Policy & Regulation', 'Extra-regional Supplier'] },
    ]

    const insertCs = db.prepare(`
      INSERT OR IGNORE INTO intelligence_sources
        (id, type, title, content, url, source_name, published_at, status, confidence,
         confidence_override, categories_json, snippet, location_mentioned, added_by_name, queue_section)
      VALUES (?, 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'source-archive')
    `)
    for (const s of csArchive) {
      insertCs.run(
        s.id, s.title, s.blurb, s.url, s.pub,
        s.date || null,
        s.fixed ? 'approved' : 'unreviewed',
        s.conf,
        s.fixed ? 1 : 0,
        JSON.stringify(s.cats),
        s.blurb.slice(0, 300),
        s.loc,
        s.fixed ? 'Kantor Framework' : 'Contested Skies Archive',
      )
    }
  } catch (e) {
    console.warn('[DB] Contested Skies source-archive seed skipped:', e)
  }

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
