import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get:    (key: string)              => ipcRenderer.invoke('settings:get', key),
    set:    (key: string, val: string) => ipcRenderer.invoke('settings:set', key, val),
    delete: (key: string)              => ipcRenderer.invoke('settings:delete', key),
    getAll: ()                         => ipcRenderer.invoke('settings:getAll'),
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  projects: {
    getAll:  ()                                     => ipcRenderer.invoke('projects:getAll'),
    upsert:  (p: Record<string, unknown>)           => ipcRenderer.invoke('projects:upsert', p),
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks: {
    getByProject: (projectId: string) => ipcRenderer.invoke('tasks:getByProject', projectId),
  },

  // ── Comments ───────────────────────────────────────────────────────────────
  comments: {
    get:    (taskId: string)    => ipcRenderer.invoke('comments:get', taskId),
    add:    (c: {
      task_id: string; author_id: string; author_name: string; content: string
    })                          => ipcRenderer.invoke('comments:add', c),
    delete: (commentId: string) => ipcRenderer.invoke('comments:delete', commentId),
  },

  // ── Activity ───────────────────────────────────────────────────────────────
  activity: {
    get: (taskId: string)       => ipcRenderer.invoke('activity:get', taskId),
    add: (e: {
      task_id: string; actor_name: string; action: string
    })                          => ipcRenderer.invoke('activity:add', e),
  },

  // ── Local auth ────────────────────────────────────────────────────────────
  auth: {
    localSignIn: (email: string, password: string) =>
      ipcRenderer.invoke('auth:localSignIn', email, password),
    changeLocalPassword: (current: string, next: string) =>
      ipcRenderer.invoke('auth:changeLocalPassword', current, next),
  },

  // ── Claude AI (streaming) ──────────────────────────────────────────────────
  claude: {
    sendMessage: (params: {
      messages:    { role: 'user' | 'assistant'; content: string }[]
      taskContext: Record<string, string | null>
    }) => ipcRenderer.invoke('claude:sendMessage', params),

    onChunk: (cb: (text: string) => void) =>
      ipcRenderer.on('claude:chunk', (_e, text) => cb(text)),

    onDone: (cb: () => void) =>
      ipcRenderer.on('claude:done', () => cb()),

    onError: (cb: (err: string) => void) =>
      ipcRenderer.on('claude:error', (_e, err) => cb(err)),

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
