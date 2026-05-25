import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc'

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

  // ── Auto-updater (production only) ──────────────────────────────────────
  if (!is.dev) {
    autoUpdater.autoDownload        = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('updater:available', { version: info.version })
    })
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('updater:progress', { percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('updater:ready', { version: info.version })
    })
    autoUpdater.on('error', (err) => {
      console.error('[Updater]', err.message)
    })

    // First check 8 s after launch, then every 4 hours
    setTimeout(() => autoUpdater.checkForUpdates(), 8000)
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
  }

  // Renderer can request an immediate install (quit + install downloaded update)
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
