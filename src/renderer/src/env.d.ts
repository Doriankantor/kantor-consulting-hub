/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface LocalAuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
}

interface Area {
  id: string
  name: string
  color: string
  is_default: number
  position: number
  created_at: string
}

interface LocalTeamMember {
  id: string
  email: string
  full_name: string | null
  role: string
  status: string
  must_change_password: number
  anthropic_key_set: number
  created_at: string
  last_active: string | null
}

interface Label {
  id: string
  name: string
  color: string
  position: number
  created_at: string
}

interface Checklist {
  id: string
  task_id: string
  title: string
  position: number
  created_at: string
  items: ChecklistItem[]
}

interface ChecklistItem {
  id: string
  checklist_id: string
  task_id: string
  text: string
  checked: number
  position: number
  created_at: string
}

interface TaskAttachment {
  id: string
  task_id: string
  name: string
  type: 'file' | 'gdoc' | 'url'
  local_path: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  author_id: string
  author_name: string
  created_at: string
}

interface AppNotification {
  id: string
  user_id: string
  type: 'comment' | 'mention' | 'assignment' | 'deadline' | 'stage_change' | 'attachment'
  title: string
  body: string | null
  task_id: string | null
  task_title: string | null
  actor_name: string | null
  read: number
  created_at: string
}

interface ChatMessage {
  id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

interface ClientRecord {
  id: string
  name: string
  type: string
  country: string | null
  region: string | null
  status: string
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_phone: string | null
  notes: string | null
  area_tags_json: string
  created_at: string
  updated_at: string
}

interface ClientContact {
  id: string
  client_id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  created_at: string
}

interface WorkspaceTaskSummary {
  id: string
  title: string
  column_id: string
  due_date: string | null
  priority: string
  content_type: string
}

interface Contact {
  id: string
  full_name: string
  job_title: string | null
  organization: string | null
  contact_types_json: string
  email_primary: string | null
  email_secondary: string | null
  phone_primary: string | null
  phone_mobile: string | null
  phone_secondary: string | null
  linkedin_url: string | null
  twitter_handle: string | null
  telegram_username: string | null
  website_url: string | null
  country: string | null
  city: string | null
  languages_json: string
  org_type: string | null
  expertise_areas_json: string
  security_sensitivity: string
  how_we_met: string | null
  how_we_met_note: string | null
  assigned_to: string | null
  last_contacted_date: string | null
  confidential: number
  do_not_contact: number
  internal_notes: string | null
  notes_updated_by: string | null
  notes_updated_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ContactInteraction {
  id: string
  contact_id: string
  date: string
  type: string
  summary: string
  logged_by_id: string | null
  logged_by_name: string | null
  follow_up: number
  follow_up_date: string | null
  created_at: string
  updated_at: string
}

interface TaskTemplate {
  id: string
  name: string
  content_type: string
  duration_days: number
  checklist_json: string
  is_builtin: number
  board_id?: string
  created_at: string
  updated_at: string
}

interface InfoPage {
  id: string
  name: string
  position: number
  archived: number
  board_type: string
  board_config: string | null
  created_at: string
  updated_at: string
}

interface InfoPageConfig {
  repo?: string
  live_url?: string
  keywords?: string
  file?: string
  branch?: string
  status?: 'active' | 'setup-pending'
  pipeline?: boolean   // when true, the source-commit pipeline tabs are shown
}

interface InfoPageItem {
  id: string
  page_id: string
  tab: string
  sub_type: string | null
  title: string | null
  content_json: string
  status: string
  priority: string
  proposed_section: string | null
  confidence: string | null
  source_ref: string | null
  analysis_json: string | null
  origin_source_id?: string | null
  created_by_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

// A source item flowing through the Sources tab (intelligence → info page).
interface InfoPageSourceItem extends InfoPageItem {
  origin_source_id: string | null
  used_in_page: string | null
  used_in_page_at: string | null
  source_status: string | null
}

interface InfoPageChatMessage {
  id: string
  page_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface InfoPageCommit {
  id: string
  page_id: string
  item_id: string
  title: string | null
  tab: string | null
  sub_type: string | null
  confidence: string | null
  proposed_section: string | null
  content_json: string | null
  submitted_by_id: string | null
  submitted_by_name: string | null
  submitted_at: string
  status: string
  reviewed_by_id: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  rejection_note: string | null
  admin_approved: number
}

interface InfoPagePublished {
  id: string
  page_id: string
  what_changed: string
  date_implemented: string
  committed_by_id: string | null
  committed_by_name: string | null
  approved_by_id: string | null
  approved_by_name: string | null
  prompt_used: string | null
  item_ids_json: string
  commit_count: number
}

interface TrashItem {
  id: string
  item_type: 'task' | 'board' | 'contact' | 'comment'
  item_id: string
  item_name: string
  item_data_json: string
  deleted_by_id: string | null
  deleted_by_name: string | null
  deleted_at: string
  expires_at: string
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string
  all_day: number
  color: string
  visibility: string
  created_by_id: string | null
  created_by_name: string | null
  attendees_json: string
  linked_task_id: string | null
  google_event_id: string | null
  created_at: string
  updated_at: string
  recurrence_json?: string | null
  recurrence_parent_id?: string | null
  meeting_link?: string | null
  meeting_type?: string | null
  external_attendees_json?: string | null
}

interface FileRecord {
  id: string
  task_id: string
  name: string
  type: string
  local_path: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  author_id: string
  author_name: string
  created_at: string
  task_title: string | null
  board_id: string | null
  board_name: string | null
  column_id: string | null
}

interface IntelligenceSource {
  id: string
  type: 'article' | 'social' | 'document'
  title: string | null
  content: string | null
  url: string | null
  source_name: string | null
  published_at: string | null
  added_at: string
  added_by_id: string | null
  added_by_name: string | null
  status: 'unreviewed' | 'approved' | 'rejected' | 'saved' | 'pushed' | 'imported'
  confidence: 'high' | 'medium' | 'low' | null
  confidence_override: number
  categories_json: string
  snippet: string | null
  image_url: string | null
  platform: string | null
  handle: string | null
  location_mentioned: string | null
  actors_mentioned: string | null
  file_name: string | null
  local_path: string | null
  drive_url: string | null
  analysis_json: string | null
  reviewed_by_id: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_notes: string | null
  queue_section: string | null
  queued_at: string | null
  queued_by_id: string | null
  queued_by_name: string | null
  used_in_page: string | null
  used_in_page_at: string | null
  // ── Source Intelligence review extensions (gate proposals + tagging) ──
  relevance_score: number | null
  relevance_type: 'in-region' | 'supply-side' | 'precedent' | 'escalation-signal' | 'none' | null
  region: string | null
  geography: string | null
  geography_confirmed: number          // 0 = AI proposal, 1 = human-confirmed
  gate_processed: number               // 0 = not yet gated, 1 = gated
  gate_reasoning: string | null
  disposition_tags: string | null      // JSON array
  thematic_tags: string | null         // JSON array
  language: string | null              // inferred: 'es' | 'pt' | 'en' | null
}

// Source pipeline row — joined from info_page_sources + intelligence_sources.
interface InfoPageSourceRow {
  pipeline_id: number
  article_id: string
  info_page: string
  stage: 'new' | 'review' | 'committed'
  design_notes: string | null
  added_at: string
  committed_at: string | null
  // From intelligence_sources:
  title: string | null
  url: string | null
  source_name: string | null
  published_at: string | null
  snippet: string | null
  relevance_score: number | null
  relevance_type: string | null
  geography: string | null
  language: string | null
  categories_json: string | null
  thematic_tags: string | null
  confidence: string | null
  review_notes: string | null
  disposition_tags: string | null
}

// Audit log entry from info_page_changes.
interface InfoPageChangeRow {
  id: number
  article_id: string
  info_page: string
  from_stage: string | null
  to_stage: string
  note: string | null
  created_at: string
  title: string | null
  source_name: string | null
}

interface IntelligencePushLog {
  id: string
  pushed_at: string
  pushed_by_id: string
  pushed_by_name: string | null
  items_count: number
  sections_json: string
  success: number
  error_message: string | null
}

interface Window {
  api: {
    auth: {
      localSignIn:         (email: string, password: string) => Promise<{ ok?: boolean; user?: LocalAuthUser; error?: string; mustChangePassword?: boolean; anthropicKeySet?: boolean }>
      changeLocalPassword: (current: string, next: string)  => Promise<{ ok?: boolean; error?: string }>
      syncAllToSupabase:   ()                                => Promise<{ ok: boolean; created: number; existing: number; failed: number; total: number }>
    }
    settings: {
      get:    (key: string) => Promise<string | null>
      set:    (key: string, val: string) => Promise<boolean>
      delete: (key: string) => Promise<boolean>
      getAll: () => Promise<Record<string, string>>
    }
    projects: {
      getAll:  () => Promise<unknown[]>
      upsert:  (p: Record<string, unknown>) => Promise<boolean>
    }
    tasks: {
      getByProject: (projectId: string) => Promise<unknown[]>
    }
    comments: {
      get:    (taskId: string) => Promise<import('./types').TaskComment[]>
      add:    (c: { task_id: string; author_id: string; author_name: string; content: string; task_title?: string; assignee_ids?: string[] }) => Promise<import('./types').TaskComment>
      delete: (commentId: string, deletedById?: string, deletedByName?: string) => Promise<boolean>
      update: (id: string, content: string) => Promise<{ ok?: boolean }>
    }
    activity: {
      get:     (taskId: string) => Promise<import('./types').ActivityEntry[]>
      add:     (e: { task_id: string; actor_name: string; action: string }) => Promise<import('./types').ActivityEntry>
      getFeed: () => Promise<Array<{ id: string; task_id: string; actor_name: string; action: string; created_at: string; source: 'activity' | 'comment'; task_title: string | null }>>
    }
    team: {
      list:            (includeAdmin?: boolean)                                              => Promise<LocalTeamMember[]>
      invite:          (p: { email: string; full_name: string; role?: string })             => Promise<{ ok?: boolean; id?: string; tempPassword?: string; emailSent?: boolean; emailError?: string; error?: string }>
      remove:          (id: string)                                                          => Promise<{ ok?: boolean }>
      edit:            (p: { id: string; full_name?: string; email?: string; role?: string }) => Promise<{ ok?: boolean; error?: string }>
      heartbeat:       (userId: string)                                                      => Promise<boolean>
      changePassword:  (userId: string, cur: string, next: string)                          => Promise<{ ok?: boolean; error?: string }>
      setInitialPassword: (userId: string, next: string)                                     => Promise<{ ok?: boolean; error?: string }>
      getLoginCode:    (email: string)                                                       => Promise<{ code: string }>
      markActive:      (id: string)                                                          => Promise<{ ok?: boolean }>
      markApiKeySet:   (userId: string)                                                      => Promise<boolean>
      savePreferences: (userId: string, prefs: Record<string, unknown>)                     => Promise<boolean>
    }
    drive: {
      connect:        () => Promise<{ ok: boolean; error?: string }>
      getStatus:      () => Promise<string>
      getAuthUrl:     () => Promise<string | null>
      exchangeCode:   (code: string) => Promise<{ ok: boolean; error?: string }>
      syncNow:        () => Promise<{ ok: boolean; error?: string }>
      disconnect:     () => Promise<boolean>
      isConnected:    () => Promise<boolean>
      reinit:         () => Promise<string>
      listFolder:     (folderPath: string) => Promise<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[]>
      onStatusChange: (cb: (status: string) => void) => void
    }
    areas: {
      list:   ()                                          => Promise<Area[]>
      create: (name: string, color: string)              => Promise<{ ok?: boolean; id?: string; error?: string }>
      update: (id: string, name: string, color: string)  => Promise<{ ok?: boolean; error?: string }>
      delete: (id: string)                               => Promise<{ ok?: boolean; error?: string }>
    }
    app: {
      getVersion: () => Promise<string>
    }
    claude: {
      sendMessage: (params: { messages: { role: 'user' | 'assistant'; content: string }[]; taskContext: Record<string, string | null>; userId?: string }) => Promise<{ started?: boolean; error?: string }>
      onChunk:         (cb: (text: string) => void) => void
      onDone:          (cb: () => void) => void
      onError:         (cb: (err: string) => void) => void
      removeListeners: () => void
      saveUserKey:      (userId: string, apiKey: string) => Promise<{ ok?: boolean }>
      removeUserKey:    (userId: string)                 => Promise<{ ok?: boolean }>
      getUserKeyStatus: (userId: string)                 => Promise<{ hasKey: boolean }>
    }
    labels: {
      list:   ()                                          => Promise<Label[]>
      create: (name: string, color: string)              => Promise<{ ok?: boolean; id?: string }>
      update: (id: string, name: string, color: string)  => Promise<{ ok?: boolean }>
      delete: (id: string)                               => Promise<{ ok?: boolean }>
    }
    taskLabels: {
      get: (taskId: string)                => Promise<Label[]>
      set: (taskId: string, ids: string[]) => Promise<{ ok?: boolean }>
    }
    checklists: {
      get:    (taskId: string)                    => Promise<Checklist[]>
      create: (taskId: string, title: string)    => Promise<{ ok?: boolean; id?: string }>
      delete: (checklistId: string)              => Promise<{ ok?: boolean }>
    }
    checklistItems: {
      add:    (checklistId: string, taskId: string, text: string) => Promise<{ ok?: boolean; id?: string }>
      toggle: (itemId: string, checked: boolean)                   => Promise<{ ok?: boolean }>
      delete: (itemId: string)                                     => Promise<{ ok?: boolean }>
      update: (itemId: string, text: string)                       => Promise<{ ok?: boolean }>
    }
    attachments: {
      get:     (taskId: string)                                                                             => Promise<TaskAttachment[]>
      addFile: (taskId: string, authorId: string, authorName: string)                                     => Promise<{ ok?: boolean; id?: string; name?: string; local_path?: string; canceled?: boolean }>
      addUrl:  (taskId: string, name: string, url: string, type: string, authorId: string, authorName: string) => Promise<{ ok?: boolean; id?: string }>
      delete:  (id: string)                                                                                 => Promise<{ ok?: boolean }>
      open:    (attachmentId: string)                                                                       => Promise<{ ok?: boolean; error?: string }>
    }
    notifications: {
      get:         (userId: string) => Promise<AppNotification[]>
      unreadCount: (userId: string) => Promise<number>
      markRead:    (id: string)     => Promise<{ ok?: boolean }>
      markAllRead: (userId: string) => Promise<{ ok?: boolean }>
      create:      (n: { user_id: string; type: string; title: string; body?: string; task_id?: string; task_title?: string; actor_name?: string }) => Promise<{ ok?: boolean; id?: string }>
    }
    chat: {
      getMessages: (limit?: number) => Promise<ChatMessage[]>
      send:        (msg: { author_id: string; author_name: string; content: string }) => Promise<ChatMessage>
      seedToCloud: (requestEmail: string) => Promise<{ ok: boolean; uploaded: number; reason?: string }>
    }
    dialog: {
      openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>
    }
    workspace: {
      getColumns:   (boardId?: string)                        => Promise<import('./types').Column[]>
      getTasks:     ()                                        => Promise<import('./types').Task[]>
      createTask:   (t: Record<string, unknown>)              => Promise<{ ok?: boolean }>
      updateTask:   (id: string, p: Record<string, unknown>)  => Promise<{ ok?: boolean }>
      deleteTask:   (id: string, deletedById?: string, deletedByName?: string) => Promise<{ ok?: boolean }>
      archiveTask:      (id: string) => Promise<{ ok?: boolean }>
      getArchivedTasks: ()           => Promise<unknown[]>
      restoreTask:      (id: string) => Promise<{ ok?: boolean }>
      addColumn:    (c: Record<string, unknown>)              => Promise<{ ok?: boolean }>
      updateColumn: (id: string, p: Record<string, unknown>)  => Promise<{ ok?: boolean }>
    }
    clients: {
      list:          ()                                          => Promise<ClientRecord[]>
      get:           (id: string)                               => Promise<{ client: ClientRecord; contacts: ClientContact[]; tasks: WorkspaceTaskSummary[] }>
      create:        (data: Record<string, unknown>)            => Promise<{ ok?: boolean; id?: string }>
      update:        (id: string, data: Record<string, unknown>) => Promise<{ ok?: boolean }>
      delete:        (id: string)                               => Promise<{ ok?: boolean }>
      addContact:    (clientId: string, c: Record<string, unknown>) => Promise<{ ok?: boolean; id?: string }>
      deleteContact: (contactId: string)                         => Promise<{ ok?: boolean }>
    }
    templates: {
      list:   (boardId?: string)                             => Promise<TaskTemplate[]>
      create: (data: Record<string, unknown>)                => Promise<{ ok?: boolean; id?: string }>
      update: (id: string, data: Record<string, unknown>)   => Promise<{ ok?: boolean }>
      delete: (id: string)                                   => Promise<{ ok?: boolean }>
    }
    boards: {
      list:         (includeArchived?: boolean)         => Promise<import('./types').Board[]>
      listArchived: ()                                   => Promise<import('./types').Board[]>
      create:       (name: string)                       => Promise<{ ok: boolean; id: string }>
      rename:       (id: string, name: string)           => Promise<{ ok: boolean }>
      archive:      (id: string, archivedBy: string)     => Promise<{ ok: boolean }>
      restore:      (id: string)                         => Promise<{ ok: boolean }>
      delete:       (id: string, deletedById?: string, deletedByName?: string) => Promise<{ ok: boolean }>
      duplicate:    (id: string, newName: string)        => Promise<{ ok: boolean; id: string }>
      taskCount:    (id: string)                         => Promise<number>
    }
    updater: {
      onAvailable:    (cb: (info: { version: string; releaseNotes?: string | null }) => void) => void
      onProgress:     (cb: (p: { percent: number }) => void) => void
      onReady:        (cb: (info: { version: string }) => void) => void
      onNotAvailable: (cb: () => void) => void
      onChecking:     (cb: () => void) => void
      onError:        (cb: (err: string) => void) => void
      install:            () => Promise<void>
      openTerminalUpdate: () => Promise<void>
      checkNow:           () => Promise<{ ok: boolean; error?: string }>
      downloadNow:        () => Promise<{ ok: boolean; error?: string }>
      getLastChecked:     () => Promise<number | null>
      setAutoInstall:     (val: boolean) => Promise<boolean>
      getAutoInstall:     () => Promise<boolean>
    }
    contacts: {
      list:              ()                                              => Promise<Contact[]>
      get:               (id: string)                                   => Promise<{ contact: Contact; interactions: ContactInteraction[]; tasks: WorkspaceTaskSummary[] }>
      create:            (data: Record<string, unknown>)                => Promise<{ ok?: boolean; id?: string }>
      update:            (id: string, data: Record<string, unknown>)    => Promise<{ ok?: boolean }>
      delete:            (id: string, deletedById?: string, deletedByName?: string) => Promise<{ ok?: boolean }>
      addInteraction:    (data: Record<string, unknown>)                => Promise<{ ok?: boolean; id?: string }>
      updateInteraction: (id: string, data: Record<string, unknown>)    => Promise<{ ok?: boolean }>
      deleteInteraction: (id: string)                                   => Promise<{ ok?: boolean }>
      linkTask:          (contactId: string, taskId: string)            => Promise<{ ok?: boolean }>
      unlinkTask:        (contactId: string, taskId: string)            => Promise<{ ok?: boolean }>
    }
    trash: {
      list:              ()           => Promise<TrashItem[]>
      count:             ()           => Promise<number>
      restore:           (id: string) => Promise<{ ok?: boolean; error?: string }>
      deletePermanently: (id: string) => Promise<{ ok?: boolean; error?: string }>
      emptyTrash:        ()           => Promise<{ ok?: boolean }>
      restoreAll:        ()           => Promise<{ ok?: boolean }>
    }
    calendar: {
      list:   (startDate: string, endDate: string) => Promise<CalendarEvent[]>
      get:    (id: string)                         => Promise<CalendarEvent | null>
      create: (data: Record<string, unknown>)      => Promise<{ ok?: boolean; id?: string }>
      update: (id: string, data: Record<string, unknown>) => Promise<{ ok?: boolean }>
      delete: (id: string)                         => Promise<{ ok?: boolean }>
    }
    files: {
      listAll: () => Promise<FileRecord[]>
    }
    boardMembers: {
      list:        (boardId: string) => Promise<{ user_id: string; full_name: string; email: string; role: string; added_at: string }[]>
      add:         (boardId: string, userId: string, addedByName: string) => Promise<{ ok: boolean; error?: string }>
      remove:      (boardId: string, userId: string) => Promise<{ ok: boolean }>
      check:       (boardId: string, userId: string) => Promise<{ hasAccess: boolean }>
      taskCount:   (boardId: string, userId: string) => Promise<number>
      listForUser: (userId: string) => Promise<string[]>
    }
    userGoogle: {
      connect:           (userId: string) => Promise<{ ok: boolean; error?: string }>
      getStatus:         (userId: string) => Promise<{ connected: boolean }>
      disconnect:        (userId: string) => Promise<{ ok: boolean }>
      getCalendars:      (userId: string) => Promise<{ id: string; summary: string; backgroundColor: string; foregroundColor: string; primary: boolean; accessRole: string }[] | { needsReauth: true } | { apiError: string }>
      getCalendarEvents: (userId: string, calendarId: string, startDate: string, endDate: string, calendarColor?: string) => Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean; color: string; location?: string; meetingLink?: string; calendarId: string }[]>
      diagnose:          (userId: string) => Promise<{ ok: boolean; storedScopes: string | null; calendarError: string | null; tokenExists: boolean }>
    }
    personalTodo: {
      list:       (userId: string) => Promise<{ id:string; user_id:string; title:string; due_date:string|null; due_time:string|null; completed:number; completed_at:string|null; created_at:string }[]>
      create:     (item: { id:string; user_id:string; title:string; due_date?:string; due_time?:string }) => Promise<{ ok:boolean }>
      complete:   (id: string) => Promise<{ ok:boolean }>
      uncomplete: (id: string) => Promise<{ ok:boolean }>
      delete:     (id: string) => Promise<{ ok:boolean }>
    }
    notificationPrefs: {
      get:  (userId: string) => Promise<{ first_reminder_min: number; second_reminder_min: number; apply_calendar: number; apply_tasks: number; apply_personal: number; email_prefs_json: string }>
      save: (userId: string, prefs: Record<string,unknown>) => Promise<{ ok: boolean }>
    }
    analytics: {
      getData:   () => Promise<{
        tasks: Record<string,unknown>[];
        activity: Record<string,unknown>[];
        comments: Record<string,unknown>[];
        stageActivity: Record<string,unknown>[];
        completions?: {
          total: number;
          today: number;
          thisWeek: number;
          lastWeek: number;
          memberStats: { id: string; name: string; assigned: number; completed: number; overdue: number; pct: number }[];
          avgTimeByType: { contentType: string; avgDays: number | null; count: number }[];
          timeline: { date: string; count: number }[];
          todayList: { id: string; title: string; content_type: string }[];
        }
      }>
      exportPDF: () => Promise<{ ok: boolean; filePath?: string; error?: string }>
    }
    todo: {
      getMyTasks:   (userId: string) => Promise<any[]>
      complete:     (taskId: string, userId: string, userName: string) => Promise<{ ok: boolean }>
      dismiss:      (userId: string, taskId: string) => Promise<{ ok: boolean }>
      getDismissed: (userId: string) => Promise<string[]>
      uncomplete:   (taskId: string) => Promise<{ ok: boolean }>
    }
    infoPages: {
      list:              ()                                                    => Promise<InfoPage[]>
      getConfig:         (pageId: string)                                      => Promise<InfoPageConfig>
      saveConfig:        (pageId: string, config: Record<string,unknown>)      => Promise<{ ok: boolean }>
      updateMeta:        (pageId: string, meta: { name?: string; config?: Record<string,unknown> }) => Promise<{ ok: boolean }>
      create:            (params: { name: string; config: Record<string,unknown> }) => Promise<{ ok: boolean; id: string }>
      delete:            (pageId: string)                                      => Promise<{ ok: boolean }>
      getLastCommit:     (repo: string)                                        => Promise<{ date: string; message: string } | null>
      getOwners:         (pageId: string)                                      => Promise<Array<{ user_id: string; full_name: string | null; email: string; assigned_at: string }>>
      addOwner:          (pageId: string, userId: string, by: string)          => Promise<{ ok: boolean }>
      removeOwner:       (pageId: string, userId: string)                      => Promise<{ ok: boolean }>
      isOwner:           (pageId: string, userId: string)                      => Promise<boolean>
      getItems:          (pageId: string, tab?: string)                        => Promise<InfoPageItem[]>
      addItem:           (item: Record<string,unknown>)                        => Promise<{ ok: boolean; id: string }>
      updateItem:        (id: string, updates: Record<string,unknown>)         => Promise<{ ok: boolean }>
      deleteItem:        (id: string)                                          => Promise<{ ok: boolean }>
      commitItems:       (params: { pageId: string; itemIds: string[]; submittedById: string; submittedByName: string }) => Promise<{ ok: boolean }>
      getCommits:        (pageId: string, status?: string)                     => Promise<InfoPageCommit[]>
      reviewCommit:      (commitId: string, action: 'approve'|'reject', params: Record<string,unknown>) => Promise<{ ok: boolean }>
      adminReviewCommit: (commitId: string, action: 'approve'|'reject', params: Record<string,unknown>) => Promise<{ ok: boolean }>
      getPublished:      (pageId: string)                                      => Promise<InfoPagePublished[]>
      logPublished:      (entry: Record<string,unknown>)                       => Promise<{ ok: boolean }>
      publishToRepo:     (params: { pageId: string; pushedById: string; pushedByName: string; whatChanged?: string }) => Promise<{ ok: boolean; count?: number; repo?: string; url?: string; error?: string }>
      analyzeWithClaude: (params: Record<string,unknown>)                      => Promise<{ ok: boolean; items?: Array<{ action: string; section: string; detail: string; confidence: string; source: string; priority: string }>; error?: string }>
      generatePrompt:    (params: Record<string,unknown>)                      => Promise<{ ok: boolean; prompt?: string }>
      syncSources:          (pageId: string)                                   => Promise<{ added: number }>
      getSourceItems:       (pageId: string)                                   => Promise<InfoPageSourceItem[]>
      sendSourcesToAnalysis:(itemIds: string[])                                => Promise<{ ok: boolean; count: number }>
      getSourceStats:       (pageId: string)                                   => Promise<{ newAvailable: number; inAnalysis: number }>
      getAnalysisSources:   (pageId: string)                                   => Promise<IntelligenceSource[]>
      getChat:              (pageId: string)                                   => Promise<InfoPageChatMessage[]>
      clearChat:            (pageId: string)                                   => Promise<{ ok: boolean }>
      chat:                 (params: { pageId: string; pageName: string; userId?: string; message: string }) => Promise<{ ok: boolean; reply?: string; error?: string }>
      summarizeAnalysis:    (params: { pageId: string; pageName: string; userId?: string }) => Promise<{ ok: boolean; summary?: string; recommendations?: Array<{ section: string; action: string; detail: string; confidence: string }>; error?: string }>
      // Source pipeline
      getSourcePipeline:    (pageId: string) => Promise<InfoPageSourceRow[]>
      sendToReview:         (pageId: string, articleIds: string[]) => Promise<{ ok: boolean; moved: number }>
      backSourceToNew:      (pageId: string, articleId: string) => Promise<{ ok: boolean }>
      commitSources:        (pageId: string, designNotes: string) => Promise<{ ok: boolean; committed: number }>
      saveReviewNotes:      (pageId: string, designNotes: string) => Promise<{ ok: boolean; saved: number }>
      getSourceChanges:     (pageId: string) => Promise<InfoPageChangeRow[]>
      getSourcePipelineCounts: (pageId: string) => Promise<{ new: number; review: number; committed: number }>
    }
    intelligence: {
      getSources:           (params?: { type?: string; status?: string; confidence?: string; category?: string; search?: string; limit?: number; offset?: number }) => Promise<IntelligenceSource[]>
      getUnreviewedCount:   ()                                 => Promise<number>
      updateStatus:         (id: string, status: string, notes?: string, byId?: string, byName?: string) => Promise<{ ok: boolean; addedToPages?: string[] }>
      updateConfidence:     (id: string, confidence: string)   => Promise<{ ok: boolean }>
      updateGeography:      (id: string, geography: string)    => Promise<{ ok: boolean }>
      getKnownTags:         (type: string)                     => Promise<string[]>
      createTag:            (name: string, type: string)       => Promise<{ ok: boolean; name: string }>
      deleteTag:            (name: string, type: string)       => Promise<{ ok: boolean }>
      setArticleTags:       (id: string, type: string, tags: string[]) => Promise<{ ok: boolean; tags: string[] }>
      logDecision:          (payload: { articleId: string; action: string; aiProposed?: unknown; humanFinal?: unknown; reason?: string | null }) => Promise<{ ok: boolean }>
      updateQueueSection:   (id: string, section: string)      => Promise<{ ok: boolean }>
      removeFromQueue:      (id: string)                       => Promise<{ ok: boolean }>
      deleteSource:         (id: string)                       => Promise<{ ok: boolean }>
      addSocial:            (post: Record<string, unknown>)    => Promise<{ ok: boolean; id?: string }>
      fetchNews:            ()                                 => Promise<{ ok: boolean; count?: number; error?: string }>
      uploadDocument:       (params: { userId?: string; addedByName?: string }) => Promise<{ ok: boolean; canceled?: boolean; results?: Array<{ id: string; file_name: string }>; error?: string }>
      getQueue:             ()                                 => Promise<IntelligenceSource[]>
      pushToContestedSkies: (params: { pushedById: string; pushedByName: string }) => Promise<{ ok: boolean; count?: number; sections?: string[]; error?: string }>
      getPushLog:           ()                                 => Promise<IntelligencePushLog[]>
      getPipelineStats:     ()                                 => Promise<{ pending: number; sentToPages: number }>
      getStatusCounts:      ()                                 => Promise<{ unreviewed: number; approved: number; rejected: number }>
      getUnscoredCount:     ()                                 => Promise<number>
      rescoreUnscored:      ()                                 => Promise<{ ok: boolean; processed: number; relevant: number; failed: number; remaining: number; error?: string }>
      importFromContestedSkies: (params: { userId?: string; addedByName?: string }) => Promise<{ ok: boolean; imported?: number; total?: number; error?: string }>
      getImportedCount:     ()                                 => Promise<number>
      confirmImported:      (params: { confidence?: string; reviewedById?: string; reviewedByName?: string }) => Promise<{ ok: boolean; count: number; addedToPages: string[] }>
    }
  }
}
