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
    app: {
      getVersion: () => Promise<string>
    }
    claude: {
      sendMessage: (params: { messages: { role: 'user' | 'assistant'; content: string }[]; taskContext: Record<string, string | null> }) => Promise<{ started?: boolean; error?: string }>
      onChunk:         (cb: (text: string) => void) => void
      onDone:          (cb: () => void) => void
      onError:         (cb: (err: string) => void) => void
      removeListeners: () => void
    }
  }
}
