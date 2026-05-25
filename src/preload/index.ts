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
    add:    (c: { task_id: string; author_id: string; author_name: string; content: string; task_title?: string; assignee_ids?: string[] }) => ipcRenderer.invoke('comments:add', c),
    delete: (id: string)        => ipcRenderer.invoke('comments:delete', id),
    update: (id: string, content: string) => ipcRenderer.invoke('comments:update', id, content),
  },
  activity: {
    get:     (taskId: string) => ipcRenderer.invoke('activity:get', taskId),
    add:     (e: { task_id: string; actor_name: string; action: string }) => ipcRenderer.invoke('activity:add', e),
    getFeed: ()               => ipcRenderer.invoke('activity:getFeed'),
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
  areas: {
    list:   ()                                          => ipcRenderer.invoke('areas:list'),
    create: (name: string, color: string)              => ipcRenderer.invoke('areas:create', name, color),
    update: (id: string, name: string, color: string)  => ipcRenderer.invoke('areas:update', id, name, color),
    delete: (id: string)                               => ipcRenderer.invoke('areas:delete', id),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  claude: {
    sendMessage: (params: { messages: { role: 'user' | 'assistant'; content: string }[]; taskContext: Record<string, string | null>; userId?: string }) =>
      ipcRenderer.invoke('claude:sendMessage', params),
    onChunk:         (cb: (text: string) => void) => ipcRenderer.on('claude:chunk', (_e, text) => cb(text)),
    onDone:          (cb: () => void)              => ipcRenderer.on('claude:done', () => cb()),
    onError:         (cb: (err: string) => void)   => ipcRenderer.on('claude:error', (_e, err) => cb(err)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('claude:chunk')
      ipcRenderer.removeAllListeners('claude:done')
      ipcRenderer.removeAllListeners('claude:error')
    },
    saveUserKey:      (userId: string, apiKey: string) => ipcRenderer.invoke('claude:saveUserKey', userId, apiKey),
    removeUserKey:    (userId: string)                 => ipcRenderer.invoke('claude:removeUserKey', userId),
    getUserKeyStatus: (userId: string)                 => ipcRenderer.invoke('claude:getUserKeyStatus', userId),
  },
  labels: {
    list:   ()                                          => ipcRenderer.invoke('labels:list'),
    create: (name: string, color: string)              => ipcRenderer.invoke('labels:create', name, color),
    update: (id: string, name: string, color: string)  => ipcRenderer.invoke('labels:update', id, name, color),
    delete: (id: string)                               => ipcRenderer.invoke('labels:delete', id),
  },
  taskLabels: {
    get: (taskId: string)                => ipcRenderer.invoke('taskLabels:get', taskId),
    set: (taskId: string, ids: string[]) => ipcRenderer.invoke('taskLabels:set', taskId, ids),
  },
  checklists: {
    get:    (taskId: string)                    => ipcRenderer.invoke('checklists:get', taskId),
    create: (taskId: string, title: string)     => ipcRenderer.invoke('checklists:create', taskId, title),
    delete: (checklistId: string)               => ipcRenderer.invoke('checklists:delete', checklistId),
  },
  checklistItems: {
    add:    (checklistId: string, taskId: string, text: string) => ipcRenderer.invoke('checklistItems:add', checklistId, taskId, text),
    toggle: (itemId: string, checked: boolean)                   => ipcRenderer.invoke('checklistItems:toggle', itemId, checked),
    delete: (itemId: string)                                     => ipcRenderer.invoke('checklistItems:delete', itemId),
    update: (itemId: string, text: string)                       => ipcRenderer.invoke('checklistItems:update', itemId, text),
  },
  attachments: {
    get:     (taskId: string)                                                                                         => ipcRenderer.invoke('attachments:get', taskId),
    addFile: (taskId: string, authorId: string, authorName: string)                                                  => ipcRenderer.invoke('attachments:addFile', taskId, authorId, authorName),
    addUrl:  (taskId: string, name: string, url: string, type: string, authorId: string, authorName: string)        => ipcRenderer.invoke('attachments:addUrl', taskId, name, url, type, authorId, authorName),
    delete:  (id: string)                                                                                             => ipcRenderer.invoke('attachments:delete', id),
    open:    (attachmentId: string)                                                                                   => ipcRenderer.invoke('attachments:open', attachmentId),
  },
  notifications: {
    get:         (userId: string)  => ipcRenderer.invoke('notifications:get', userId),
    unreadCount: (userId: string)  => ipcRenderer.invoke('notifications:unreadCount', userId),
    markRead:    (id: string)      => ipcRenderer.invoke('notifications:markRead', id),
    markAllRead: (userId: string)  => ipcRenderer.invoke('notifications:markAllRead', userId),
    create:      (n: { user_id: string; type: string; title: string; body?: string; task_id?: string; task_title?: string; actor_name?: string }) => ipcRenderer.invoke('notifications:create', n),
  },
  chat: {
    getMessages: (limit?: number) => ipcRenderer.invoke('chat:getMessages', limit ?? 100),
    send:        (msg: { author_id: string; author_name: string; content: string }) => ipcRenderer.invoke('chat:send', msg),
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
  },
  workspace: {
    getColumns:   ()                                      => ipcRenderer.invoke('workspace:getColumns'),
    getTasks:     ()                                      => ipcRenderer.invoke('workspace:getTasks'),
    createTask:   (t: Record<string, unknown>)            => ipcRenderer.invoke('workspace:createTask', t),
    updateTask:   (id: string, p: Record<string, unknown>) => ipcRenderer.invoke('workspace:updateTask', id, p),
    deleteTask:   (id: string)                            => ipcRenderer.invoke('workspace:deleteTask', id),
    addColumn:    (c: Record<string, unknown>)            => ipcRenderer.invoke('workspace:addColumn', c),
    updateColumn: (id: string, p: Record<string, unknown>) => ipcRenderer.invoke('workspace:updateColumn', id, p),
  },
  clients: {
    list:          ()                                         => ipcRenderer.invoke('clients:list'),
    get:           (id: string)                              => ipcRenderer.invoke('clients:get', id),
    create:        (data: Record<string, unknown>)           => ipcRenderer.invoke('clients:create', data),
    update:        (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('clients:update', id, data),
    delete:        (id: string)                              => ipcRenderer.invoke('clients:delete', id),
    addContact:    (clientId: string, c: Record<string, unknown>) => ipcRenderer.invoke('clients:addContact', clientId, c),
    deleteContact: (contactId: string)                       => ipcRenderer.invoke('clients:deleteContact', contactId),
  },
  templates: {
    list:   ()                                              => ipcRenderer.invoke('templates:list'),
    create: (data: Record<string, unknown>)                 => ipcRenderer.invoke('templates:create', data),
    update: (id: string, data: Record<string, unknown>)    => ipcRenderer.invoke('templates:update', id, data),
    delete: (id: string)                                    => ipcRenderer.invoke('templates:delete', id),
  },
  contacts: {
    list:              ()                                              => ipcRenderer.invoke('contacts:list'),
    get:               (id: string)                                   => ipcRenderer.invoke('contacts:get', id),
    create:            (data: Record<string, unknown>)                => ipcRenderer.invoke('contacts:create', data),
    update:            (id: string, data: Record<string, unknown>)    => ipcRenderer.invoke('contacts:update', id, data),
    delete:            (id: string)                                   => ipcRenderer.invoke('contacts:delete', id),
    addInteraction:    (data: Record<string, unknown>)                => ipcRenderer.invoke('contacts:addInteraction', data),
    updateInteraction: (id: string, data: Record<string, unknown>)    => ipcRenderer.invoke('contacts:updateInteraction', id, data),
    deleteInteraction: (id: string)                                   => ipcRenderer.invoke('contacts:deleteInteraction', id),
    linkTask:          (contactId: string, taskId: string)            => ipcRenderer.invoke('contacts:linkTask', contactId, taskId),
    unlinkTask:        (contactId: string, taskId: string)            => ipcRenderer.invoke('contacts:unlinkTask', contactId, taskId),
  },
  analytics: {
    getData:   ()  => ipcRenderer.invoke('analytics:getData'),
    exportPDF: ()  => ipcRenderer.invoke('analytics:exportPDF'),
  },
  updater: {
    onAvailable: (cb: (info: { version: string }) => void) =>
      ipcRenderer.on('updater:available', (_e, info) => cb(info)),
    onProgress:  (cb: (p: { percent: number }) => void) =>
      ipcRenderer.on('updater:progress', (_e, p) => cb(p)),
    onReady:     (cb: (info: { version: string }) => void) =>
      ipcRenderer.on('updater:ready', (_e, info) => cb(info)),
    install: () => ipcRenderer.invoke('updater:install'),
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
