import { app, BrowserWindow, Menu, shell, ipcMain, globalShortcut, dialog, session } from 'electron'
import { join } from 'path'
import { registerSystemHandlers } from './ipc/system'
import { registerFilesystemHandlers } from './ipc/filesystem'
import { registerSecureStoreHandlers } from './ipc/secure-store'
import { registerBackendHandlers } from './ipc/backend'
import { registerWhisperHandlers } from './ipc/whisper'
import { registerSetupHandlers } from './ipc/setup'
import { broadcastLlamaProgress, registerLlamaHandlers } from './ipc/llama'
import { registerEnvVarsHandlers } from './ipc/env-vars'
import { registerSandboxHandlers } from './ipc/sandbox'
import { resolveRuntimeRoot } from './runtime'
import { startBackendSidecar, stopBackendSidecar } from './backend-process'
import { isSetupCompleted } from './setup-manager'
import { resumeLocalWhisperOnLaunch, stopWhisperServerProcess } from './whisper-manager'
import { startLlamaOnLaunch, stopLlamaServerProcess } from './llama-manager'
import { setupAutoUpdater } from './auto-update'
import { isExternalOpenAllowed } from './url-safety'
import {
  LOAD_WATCHDOG_MS,
  SHOW_FALLBACK_MS,
  buildLoadFailureUrl,
  createLoadRetry,
  isRetryNavigation
} from './renderer-load-retry'
import { applyContentSecurityPolicy } from './content-security-policy'
import { createBrowserPanel } from './browser-panel'
import { createBrowserBridgeServer } from './browser-bridge'
import { registerShellHandlers, stopAllShellSessions } from './ipc/shell'
import { createBackground } from './background'

/** How long after the window has loaded the local title model starts. */
const LLAMA_START_DELAY_MS = 10_000

function configureRuntimePaths() {
  const runtimeRoot = resolveRuntimeRoot()
  app.setPath('userData', join(runtimeRoot, 'electron', 'user-data'))
  app.setPath('sessionData', join(runtimeRoot, 'electron', 'session-data'))
  app.setPath('crashDumps', join(runtimeRoot, 'electron', 'crash-dumps'))
  app.setPath('temp', join(runtimeRoot, 'tmp', 'electron'))
  app.setAppLogsPath(join(runtimeRoot, 'electron', 'logs'))
}

let mainWindow: BrowserWindow | null = null

// Window and taskbar icon. The executable icon is not edited on Windows
// (signAndEditExecutable is false), so the window carries the icon itself:
// .ico on Windows, .png elsewhere. Packaged builds read it from the resources
// folder (see extraResources); dev runs read it from build/.
function resolveWindowIcon(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return app.isPackaged ? join(process.resourcesPath, file) : join(__dirname, '../../build', file)
}

const background = createBackground({ getWindow: () => mainWindow, iconPath: resolveWindowIcon })

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    icon: resolveWindowIcon(),
    autoHideMenuBar: true,
    frame: false,
    // Windows 11's DWM rounds a frameless window's corners by default; this
    // is the dedicated Electron option controlling that (no-op on platforms
    // without the compositor behavior). Kept on deliberately - if the native
    // WebContentsView (BrowserPanel) ends up square-cornered poking past the
    // window's rounded edge, that's this setting's effect showing up there,
    // not a bug in the panel itself.
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow = win

  win.removeMenu()
  // The window is shown once the renderer has painted. If the first load fails the paint never comes, so a timer shows the window
  // anyway and the load is retried (see renderer-load-retry.ts).
  // The window opens maximized, on every launch: the app is made for a large window, and 1280 x 820 above is only the size it goes back to.
  const showMaximized = () => {
    if (win.isDestroyed()) return
    if (!win.isMaximized()) win.maximize()
    win.show()
  }
  const showFallback = setTimeout(() => {
    if (!win.isVisible()) showMaximized()
  }, SHOW_FALLBACK_MS)
  win.on('ready-to-show', () => {
    clearTimeout(showFallback)
    showMaximized()
  })
  // Closing the window while a task runs hides it instead, and an icon near the clock brings it back (see background.ts).
  win.on('close', (event) => background.onWindowClose(event, win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // DevTools access via a global (OS-wide, works even without window focus)
  // shortcut is a dev convenience, not something a packaged production build
  // should expose — restrict it to unpackaged/dev runs, same guard as
  // setupAutoUpdater's no-op-in-dev check in auto-update.ts (the inverse
  // condition, for the inverse reason).
  if (!app.isPackaged) {
    globalShortcut.register('F12', () => {
      win.webContents.toggleDevTools()
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Chat content (web search results, fetched pages) can put target="_blank" links
    // in front of the user with an attacker-controlled href. shell.openExternal hands
    // the URL to the OS, which resolves non-http(s) schemes via registered protocol
    // handlers (e.g. Windows search-ms:) - a known Electron RCE-chain vector. Restrict
    // to the schemes a browser link is actually supposed to open.
    if (isExternalOpenAllowed(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  let lastFailure = 'The app did not finish loading.'
  let watchdog: ReturnType<typeof setTimeout> | null = null
  const loadRenderer = () => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      lastFailure = 'The app took too long to load.'
      loadRetry.failed()
    }, LOAD_WATCHDOG_MS)
    const loading = process.env.ELECTRON_RENDERER_URL
      ? win.loadURL(process.env.ELECTRON_RENDERER_URL)
      : win.loadFile(join(__dirname, '../renderer/index.html'))
    // A failed load is handled by did-fail-load below.
    loading.catch(() => {})
  }
  const loadRetry = createLoadRetry({
    load: loadRenderer,
    onGiveUp: () => {
      if (win.isDestroyed()) return
      if (watchdog) clearTimeout(watchdog)
      void win.loadURL(buildLoadFailureUrl(lastFailure))
      if (!win.isVisible()) win.show()
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    // -3 is a load that was replaced by another navigation, not a failure.
    if (!isMainFrame || errorCode === -3) return
    lastFailure = `${errorDescription} (${errorCode})`
    loadRetry.failed()
  })
  win.webContents.on('did-finish-load', () => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = null
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isRetryNavigation(url)) return
    event.preventDefault()
    loadRetry.reset()
    loadRenderer()
  })
  win.on('closed', () => {
    if (watchdog) clearTimeout(watchdog)
    loadRetry.cancel()
  })

  loadRenderer()
}

configureRuntimePaths()

app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('use-angle', 'gl')
const remoteDebugPort = Number.parseInt(process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT || '9333', 10)
if (Number.isFinite(remoteDebugPort) && remoteDebugPort > 0) {
  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebugPort))
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT = String(remoteDebugPort)
}

const browserPanel = createBrowserPanel({
  getWindow: () => mainWindow,
  remoteDebugPort,
})

// Lets seshat-backend ask "give me the visible tab for session X" so an
// agent's browser_* tool calls can attach to it directly - see
// browser-bridge.ts and resolveElectronBrowserSessionTarget in
// seshat-backend. Same shared-default-port convention as remoteDebugPort
// above: works in dev mode (backend run manually) without needing this env
// var explicitly set, as long as neither side overrides it.
const bridgePort = Number.parseInt(process.env.SESHAT_ELECTRON_BRIDGE_PORT || '9334', 10)
if (Number.isFinite(bridgePort) && bridgePort > 0) {
  process.env.SESHAT_ELECTRON_BRIDGE_PORT = String(bridgePort)
}
const browserBridge = createBrowserBridgeServer({
  port: bridgePort,
  resolveSessionTarget: (sessionId) => browserPanel.resolveSessionTarget(sessionId),
})

app.whenReady().then(async () => {
  // Without it Windows does not name the app on its notifications; it is the appId of the installer.
  if (process.platform === 'win32') app.setAppUserModelId('com.seshat.os')
  Menu.setApplicationMenu(null)
  applyContentSecurityPolicy()
  registerSystemHandlers(ipcMain)
  registerFilesystemHandlers(ipcMain)
  registerSecureStoreHandlers(ipcMain)
  registerBackendHandlers(ipcMain)
  registerWhisperHandlers(ipcMain)
  registerSetupHandlers(ipcMain)
  registerLlamaHandlers(ipcMain)
  registerEnvVarsHandlers(ipcMain)
  registerSandboxHandlers(ipcMain)
  browserPanel.registerIpc(ipcMain)
  browserBridge.start()
  registerShellHandlers(ipcMain)
  background.register(ipcMain)

  // Packaged Electron apps deny every permission request by default when no
  // handler is registered. The voice-input control needs the renderer's
  // navigator.mediaDevices.getUserMedia({ audio: true }) to actually reach
  // the OS mic prompt instead of silently failing, so allow 'media'
  // (mic/camera) here. Every copy-to-clipboard button in the app (message
  // copy, tool output copy, diff copy) uses navigator.clipboard.writeText,
  // which Chromium gates behind 'clipboard-sanitized-write' (and
  // 'clipboard-read' for paste) - without allowing those too, every one of
  // those buttons silently no-ops. Everything else stays denied.
  const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))

  try {
    await startBackendSidecar()
  } catch (error) {
    dialog.showErrorBox(
      'SeshatOS backend failed to start',
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
    return
  }

  createWindow()
  setupAutoUpdater()
  // Installs llama.cpp and the default title model on first launch, in the
  // background; chat works meanwhile and titles fall back to the chat model.
  // It waits for the window to have loaded: starting a model server (a few
  // hundred MB read from disk) while the interface is still loading slows both.
  // On a computer that was never set up the first-run wizard decides what is downloaded, so nothing starts by itself here.
  const startLlama = () => {
    void isSetupCompleted().then((completed) => {
      if (!completed) return
      return startLlamaOnLaunch(broadcastLlamaProgress)
    }).catch((error) => {
      console.warn('[llama] local title model unavailable:', error instanceof Error ? error.message : error)
    })
  }
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(startLlama, LLAMA_START_DELAY_MS))
  } else {
    startLlama()
  }
  void resumeLocalWhisperOnLaunch().catch((error) => {
    console.warn('[whisper] could not resume local transcription:', error instanceof Error ? error.message : error)
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => background.markQuitting())

app.on('will-quit', () => {
  browserBridge.stop()
  browserPanel.destroy()
  stopAllShellSessions()
  stopWhisperServerProcess()
  stopLlamaServerProcess()
  void stopBackendSidecar()
})
