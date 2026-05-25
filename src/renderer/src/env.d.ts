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
      add:    (c: { task_id: string; author_id: string; author_name: string; content: string }) => Promise<import('./types').TaskComment>
      delete: (commentId: string) => Promise<boolean>
      update: (id: string, content: string) => Promise<{ ok?: boolean }>
    }
    activity: {
      get: (taskId: string) => Promise<import('./types').ActivityEntry[]>
      add: (e: { task_id: string; actor_name: string; action: string }) => Promise<import('./types').ActivityEntry>
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
  }
}
