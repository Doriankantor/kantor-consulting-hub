import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawnSync, spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase, getDatabase } from './db'
import { registerIpcHandlers, startIntelligenceAutoRefresh, triggerInitialNewsFetch } from './ipc'
import { initRealtime, teardownAll as teardownRealtime } from './cloud/realtimeManager'
import { registerBoardsRealtime } from './cloud/boardsRealtime'

// Module-level reference so the updater can push events to the window
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    // macOS native look
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#0f1624',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kantorconsulting.hub')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Boot local SQLite DB
  initDatabase()

  // Register all IPC handlers
  registerIpcHandlers()

  createWindow()

  // ── Realtime: wire the manager to this window and declare the boards source.
  // Channels only OPEN once the acting user is known (app:setActingUser →
  // startRealtime), and are re-scoped on user switch / torn down on logout/quit.
  initRealtime(() => mainWindow)
  registerBoardsRealtime()

  // ── Intelligence: start auto-refresh and trigger initial fetch ─────────
  startIntelligenceAutoRefresh()
  setTimeout(() => triggerInitialNewsFetch(), 5000)

  // ── Auto-updater (production only) ──────────────────────────────────────
  function saveLastChecked() {
    try { getDatabase().prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('updater_last_checked',?,CURRENT_TIMESTAMP)").run(String(Date.now())) } catch {}
  }
  function getAutoInstallPref(): boolean {
    try { const r = getDatabase().prepare("SELECT value FROM settings WHERE key='updater_auto_install'").get() as { value: string } | undefined; return r?.value !== '0' } catch { return true }
  }

  if (!is.dev) {
    autoUpdater.autoDownload         = false   // user chooses "Update now"
    autoUpdater.autoInstallOnAppQuit = getAutoInstallPref()
    autoUpdater.allowPrerelease      = false
    // Pipe electron-updater logs to console so we can diagnose issues
    autoUpdater.logger = {
      info:  (...args: unknown[]) => console.log('[Updater]',  ...args),
      warn:  (...args: unknown[]) => console.warn('[Updater]', ...args),
      error: (...args: unknown[]) => console.error('[Updater]',...args),
      debug: (...args: unknown[]) => console.log('[Updater:debug]', ...args),
    } as any

    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] checking-for-update')
      mainWindow?.webContents.send('updater:checking')
    })
    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] update-available', info.version)
      saveLastChecked()
      mainWindow?.webContents.send('updater:available', { version: info.version, releaseNotes: info.releaseNotes ?? null })
    })
    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] up to date')
      saveLastChecked()
      mainWindow?.webContents.send('updater:notAvailable')
    })
    autoUpdater.on('download-progress', (progress) => {
      console.log(`[Updater] download-progress ${Math.round(progress.percent)}% (${progress.transferred}/${progress.total})`)
      mainWindow?.webContents.send('updater:progress', { percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] update-downloaded', info.version)
      // Strip macOS quarantine so Gatekeeper doesn't block installation on unsigned builds
      if (process.platform === 'darwin' && (info as any).downloadedFile) {
        try {
          spawnSync('xattr', ['-cr', (info as any).downloadedFile])
          console.log('[Updater] stripped quarantine from', (info as any).downloadedFile)
        } catch (e) {
          console.warn('[Updater] xattr strip failed:', e)
        }
      }
      mainWindow?.webContents.send('updater:ready', { version: info.version })
    })
    autoUpdater.on('error', (err) => {
      console.error('[Updater] error:', err.message)
      mainWindow?.webContents.send('updater:error', err.message)
    })

    // Background recheck every 8 hours (renderer triggers first check after login)
    setInterval(() => autoUpdater.checkForUpdates(), 8 * 60 * 60 * 1000)
  }

  // ── Updater IPC ─────────────────────────────────────────────────────────
  ipcMain.handle('updater:install', () => {
    // Strip quarantine from the cached update directory before installing (unsigned builds)
    if (process.platform === 'darwin') {
      try {
        const updateDir = app.getPath('userData').replace(/[^/]+$/, '') + 'electron-updater'
        spawnSync('xattr', ['-cr', updateDir])
      } catch {}
    }
    autoUpdater.quitAndInstall()
  })
  // Opens Terminal and runs the install script — bypasses Gatekeeper entirely for unsigned builds
  ipcMain.handle('updater:openTerminalUpdate', () => {
    try {
      // Write a .command file — macOS opens these directly in Terminal via `open`
      const scriptPath = join(tmpdir(), 'kch-update.command')
      writeFileSync(scriptPath, [
        '#!/bin/bash',
        'echo ""',
        'echo "  Updating Kantor Consulting Hub..."',
        'echo ""',
        'curl -sL https://raw.githubusercontent.com/Doriankantor/kantor-consulting-hub/main/install.sh | bash',
        'echo ""',
        'echo "  ✓ Update complete. You can close this window now."',
        'echo ""',
      ].join('\n'), { mode: 0o755 })
      // Strip quarantine so macOS doesn't block it
      spawnSync('xattr', ['-cr', scriptPath])
      // open the .command file — macOS routes it to Terminal automatically
      const child = spawn('open', [scriptPath], { detached: true, stdio: 'ignore' })
      child.unref()
      console.log('[Updater] opened Terminal with install script:', scriptPath)
    } catch (e) {
      console.warn('[Updater] openTerminalUpdate failed:', e)
    }
    // Quit after a short delay so Terminal has time to open
    setTimeout(() => app.quit(), 2500)
  })
  ipcMain.handle('updater:checkNow', async () => {
    if (is.dev) { mainWindow?.webContents.send('updater:notAvailable'); return { ok: true } }
    try { await autoUpdater.checkForUpdates(); return { ok: true } }
    catch (e: any) { console.error('[Updater] checkNow:', e.message); return { ok: false, error: e.message } }
  })
  ipcMain.handle('updater:downloadNow', async () => {
    if (is.dev) return { ok: true }
    try { await autoUpdater.downloadUpdate(); return { ok: true } }
    catch (e: any) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('updater:getLastChecked', () => {
    try { const r = getDatabase().prepare("SELECT value FROM settings WHERE key='updater_last_checked'").get() as { value: string } | undefined; return r?.value ? parseInt(r.value) : null } catch { return null }
  })
  ipcMain.handle('updater:setAutoInstall', (_e, val: boolean) => {
    autoUpdater.autoInstallOnAppQuit = val
    try { getDatabase().prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('updater_auto_install',?,CURRENT_TIMESTAMP)").run(val ? '1' : '0') } catch {}
    return true
  })
  ipcMain.handle('updater:getAutoInstall', () => getAutoInstallPref())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  teardownRealtime()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  teardownRealtime()
})
