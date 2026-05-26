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
  created_at: string
  updated_at: string
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

interface Window {
  api: {
    auth: {
      localSignIn:         (email: string, password: string) => Promise<{ ok?: boolean; user?: LocalAuthUser; error?: string; mustChangePassword?: boolean; anthropicKeySet?: boolean }>
      changeLocalPassword: (current: string, next: string)  => Promise<{ ok?: boolean; error?: string }>
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
      list:            ()                                                                    => Promise<LocalTeamMember[]>
      invite:          (p: { email: string; full_name: string; role?: string })             => Promise<{ ok?: boolean; id?: string; tempPassword?: string; emailSent?: boolean; emailError?: string; error?: string }>
      remove:          (id: string)                                                          => Promise<{ ok?: boolean }>
      edit:            (p: { id: string; full_name?: string; email?: string; role?: string }) => Promise<{ ok?: boolean; error?: string }>
      heartbeat:       (userId: string)                                                      => Promise<boolean>
      changePassword:  (userId: string, cur: string, next: string)                          => Promise<{ ok?: boolean; error?: string }>
      markApiKeySet:   (userId: string)                                                      => Promise<boolean>
      savePreferences: (userId: string, prefs: Record<string, unknown>)                     => Promise<boolean>
    }
    drive: {
      getStatus:      () => Promise<string>
      getAuthUrl:     () => Promise<string | null>
      exchangeCode:   (code: string) => Promise<{ ok: boolean; error?: string }>
      syncNow:        () => Promise<{ ok: boolean; error?: string }>
      disconnect:     () => Promise<boolean>
      isConnected:    () => Promise<boolean>
      reinit:         () => Promise<string>
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
    }
    dialog: {
      openFile: () => Promise<{ canceled: boolean; filePaths: string[] }>
    }
    workspace: {
      getColumns:   ()                                        => Promise<import('./types').Column[]>
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
      list:   ()                                              => Promise<TaskTemplate[]>
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
    analytics: {
      getData:   () => Promise<{ tasks: Record<string,unknown>[]; activity: Record<string,unknown>[]; comments: Record<string,unknown>[]; stageActivity: Record<string,unknown>[] }>
      exportPDF: () => Promise<{ ok: boolean; filePath?: string; error?: string }>
    }
    updater: {
      onAvailable: (cb: (info: { version: string }) => void) => void
      onProgress:  (cb: (p: { percent: number }) => void)    => void
      onReady:     (cb: (info: { version: string }) => void) => void
      install:     () => Promise<void>
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
  }
}
