import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    localSignIn:         (email: string, password: string) => ipcRenderer.invoke('auth:localSignIn', email, password),
    changeLocalPassword: (current: string, next: string)   => ipcRenderer.invoke('auth:changeLocalPassword', current, next),
  },
  settings: {
    get:    (key: string)              => ipcRenderer.invoke('settings:get', key),
    set:    (key: string, val: string) => ipcRenderer.invoke('settings:set', key, val),
    delete: (key: string)              => ipcRenderer.invoke('settings:delete', key),
    getAll: ()                         => ipcRenderer.invoke('settings:getAll'),
  },
  projects: {
    getAll:  ()                            => ipcRenderer.invoke('projects:getAll'),
    upsert:  (p: Record<string, unknown>) => ipcRenderer.invoke('projects:upsert', p),
  },
  tasks: {
    getByProject: (projectId: string) => ipcRenderer.invoke('tasks:getByProject', projectId),
  },
  comments: {
    get:    (taskId: string)    => ipcRenderer.invoke('comments:get', taskId),
    add:    (c: { task_id: string; author_id: string; author_name: string; content: string }) => ipcRenderer.invoke('comments:add', c),
    delete: (id: string)        => ipcRenderer.invoke('comments:delete', id),
  },
  activity: {
    get: (taskId: string) => ipcRenderer.invoke('activity:get', taskId),
    add: (e: { task_id: string; actor_name: string; action: string }) => ipcRenderer.invoke('activity:add', e),
  },
  team: {
    list:            ()                                                                    => ipcRenderer.invoke('team:list'),
    invite:          (p: { email: string; full_name: string; role?: string })             => ipcRenderer.invoke('team:invite', p),
    remove:          (id: string)                                                          => ipcRenderer.invoke('team:remove', id),
    edit:            (p: { id: string; full_name?: string; email?: string; role?: string }) => ipcRenderer.invoke('team:edit', p),
    heartbeat:       (userId: string)                                                      => ipcRenderer.invoke('team:heartbeat', userId),
    changePassword:  (userId: string, cur: string, next: string)                          => ipcRenderer.invoke('team:changePassword', userId, cur, next),
    markApiKeySet:   (userId: string)                                                      => ipcRenderer.invoke('team:markApiKeySet', userId),
    savePreferences: (userId: string, prefs: Record<string, unknown>)                     => ipcRenderer.invoke('team:savePreferences', userId, prefs),
  },
  drive: {
    getStatus:      ()              => ipcRenderer.invoke('drive:getStatus'),
    getAuthUrl:     ()              => ipcRenderer.invoke('drive:getAuthUrl'),
    exchangeCode:   (code: string)  => ipcRenderer.invoke('drive:exchangeCode', code),
    syncNow:        ()              => ipcRenderer.invoke('drive:syncNow'),
    disconnect:     ()              => ipcRenderer.invoke('drive:disconnect'),
    isConnected:    ()              => ipcRenderer.invoke('drive:isConnected'),
    reinit:         ()              => ipcRenderer.invoke('drive:reinit'),
    onStatusChange: (cb: (s: string) => void) => ipcRenderer.on('drive:status', (_e, s) => cb(s)),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  claude: {
    sendMessage: (params: { messages: { role: 'user' | 'assistant'; content: string }[]; taskContext: Record<string, string | null> }) =>
      ipcRenderer.invoke('claude:sendMessage', params),
    onChunk:         (cb: (text: string) => void) => ipcRenderer.on('claude:chunk', (_e, text) => cb(text)),
    onDone:          (cb: () => void)              => ipcRenderer.on('claude:done', () => cb()),
    onError:         (cb: (err: string) => void)   => ipcRenderer.on('claude:error', (_e, err) => cb(err)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('claude:chunk')
      ipcRenderer.removeAllListeners('claude:done')
      ipcRenderer.removeAllListeners('claude:error')
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('[Preload] contextBridge error:', error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
