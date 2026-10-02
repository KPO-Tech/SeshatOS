import { contextBridge, ipcRenderer } from 'electron'

type WhisperStatus = {
  supported: boolean
  running: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
}

type WhisperModelInfo = {
  id: string
  filename: string
  label: string
  approxSizeBytes: number
  description: string
}

type WhisperProgress = {
  phase: 'binary' | 'model'
  modelId?: string
  receivedBytes: number
  totalBytes: number
}

type LlamaModelInfo = {
  id: string
  label: string
  repo: string
  filename: string
  approxSizeBytes: number
  description: string
  custom?: boolean
}

type LlamaStatus = {
  supported: boolean
  binaryReady: boolean
  running: boolean
  enabled: boolean
  provisioned: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
  models: LlamaModelInfo[]
}

type LlamaProgress = {
  phase: 'binary' | 'model'
  modelId?: string
  receivedBytes: number
  totalBytes: number
}

type EnvVarDef = {
  key: string
  label: string
  description: string
  group: string
  groupLabel: string
  helpUrl?: string
}

type BrowserPanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserPanelState = {
  activeTabId: string | null
  tabs: Array<{
    id: string
    label: string
    url: string
    status: 'loading' | 'ready'
    canGoBack: boolean
    canGoForward: boolean
  }>
}

type TerminalEvent = {
  id: string
  type: 'started' | 'data' | 'error' | 'exit'
  stream?: 'stdout' | 'stderr'
  data?: string
  message?: string
  shell?: string
  cwd?: string
  pid?: number
  code?: number | null
  signal?: string | null
}

// terminal-relay is separate from `terminal` above: `terminal` is a
// general-purpose interactive shell session (not yet wired to any UI);
// terminal-relay carries the agent's own bash-tool commands per session,
// bridged to seshat-backend's TerminalRelay so the user watches them run
// live - see main/ipc/terminal-relay.ts.
type TerminalRelayEvent = {
  sessionId: string
  type: string
  commandId?: string
  command?: string
  cwd?: string
  stream?: 'stdout' | 'stderr'
  data?: string
  message?: string
  exitCode?: number
  durationMs?: number
}

const nexusBridge = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  openPath: (p: string) => ipcRenderer.invoke('system:open-path', p),
  openLocalPath: (p: string) => ipcRenderer.invoke('system:open-local-path', p),
  openTerminal: (p: string) => ipcRenderer.invoke('system:open-terminal', p),
  showFile: (p: string) => ipcRenderer.invoke('system:show-file', p),
  readFileDataURL: (p: string): Promise<string> => ipcRenderer.invoke('system:read-file-data-url', p),
  hasProjectContextFile: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('project:has-context-file', projectPath),
  projectPathExists: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('project:path-exists', projectPath),
  fs: {
    listDirectory: (directoryPath: string): Promise<Array<{ name: string; isDirectory: boolean }>> =>
      ipcRenderer.invoke('fs:list-directory', directoryPath),
    readTextFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:read-text-file', filePath),
  },
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
  selectFile: (opts?: Electron.OpenDialogOptions) => ipcRenderer.invoke('system:select-file', opts),
  saveFile: (defaultName: string, content: string): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('system:save-file', defaultName, content),
  dialog: {
    openDirectory: (): Promise<Electron.OpenDialogReturnValue> => ipcRenderer.invoke('dialog:openDirectory'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
  secureStore: {
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secure-store:set', key, value),
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-store:get', key),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-store:delete', key),
  },
  auth: {
    login: (credentials: { email: string; password: string }) => ipcRenderer.invoke('auth:login', credentials),
    register: (payload: { name: string; email: string; password: string }) => ipcRenderer.invoke('auth:register', payload),
    continueWithoutAccount: () => ipcRenderer.invoke('auth:continue-without-account'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    restoreSession: () => ipcRenderer.invoke('auth:restore-session'),
    clearSession: () => ipcRenderer.invoke('auth:clear-session'),
    updateUser: (user: { id: string; email: string; display_name: string; status: string }) => ipcRenderer.invoke('auth:update-user', user),
  },
  http: {
    request: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:request', payload),
    fileContent: (path: string) => ipcRenderer.invoke('http:file-content', path),
    fileRange: (path: string, start: number, end: number) => ipcRenderer.invoke('http:file-range', { path, start, end }),
    backendOrigin: () => ipcRenderer.invoke('http:backend-origin') as Promise<string>,
    upload: (payload: {
      path: string
      fields?: Array<{ name: string; value: string }>
      files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
    }) => ipcRenderer.invoke('http:upload', payload),
    startStream: (payload: { path: string; method?: string; body?: unknown }) => ipcRenderer.invoke('http:stream:start', payload),
    cancelStream: (streamId: string) => ipcRenderer.invoke('http:stream:cancel', streamId),
    onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { streamId: string; name: string; data: Record<string, unknown> }) => {
        if (payload.streamId !== streamId) return
        listener({ name: payload.name, data: payload.data })
      }
      ipcRenderer.on('http:stream:event', handler)
      return () => ipcRenderer.removeListener('http:stream:event', handler)
    },
  },
  whisper: {
    status: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:status'),
    models: (): Promise<WhisperModelInfo[]> => ipcRenderer.invoke('whisper:models'),
    downloadDefaults: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:download-defaults'),
    downloadModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:download-model', modelId),
    activateModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:activate-model', modelId),
    deleteModel: (modelId: string): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:delete-model', modelId),
    enable: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:enable'),
    disable: (): Promise<WhisperStatus> => ipcRenderer.invoke('whisper:disable'),
    onProgress: (listener: (progress: WhisperProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: WhisperProgress) => listener(progress)
      ipcRenderer.on('whisper:progress', handler)
      return () => ipcRenderer.removeListener('whisper:progress', handler)
    },
  },
  llama: {
    status: (): Promise<LlamaStatus> => ipcRenderer.invoke('llama:status'),
    provision: (): Promise<LlamaStatus> => ipcRenderer.invoke('llama:provision'),
    downloadModel: (modelId: string): Promise<LlamaStatus> => ipcRenderer.invoke('llama:download-model', modelId),
    addCustomModel: (repo: string, filename: string): Promise<LlamaStatus> => ipcRenderer.invoke('llama:add-custom-model', repo, filename),
    activateModel: (modelId: string): Promise<LlamaStatus> => ipcRenderer.invoke('llama:activate-model', modelId),
    deleteModel: (modelId: string): Promise<LlamaStatus> => ipcRenderer.invoke('llama:delete-model', modelId),
    enable: (): Promise<LlamaStatus> => ipcRenderer.invoke('llama:enable'),
    disable: (): Promise<LlamaStatus> => ipcRenderer.invoke('llama:disable'),
    onProgress: (listener: (progress: LlamaProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: LlamaProgress) => listener(progress)
      ipcRenderer.on('llama:progress', handler)
      return () => ipcRenderer.removeListener('llama:progress', handler)
    },
  },
  envVars: {
    catalog: (): Promise<EnvVarDef[]> => ipcRenderer.invoke('env-vars:catalog'),
    status: (): Promise<Record<string, boolean>> => ipcRenderer.invoke('env-vars:status'),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('env-vars:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('env-vars:delete', key),
    restartBackend: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('env-vars:restart-backend'),
  },
  browser: {
    show: (contextId: string, bounds?: BrowserPanelBounds): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:show', contextId, bounds),
    hide: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:hide', contextId),
    openUrl: (url: string, provider = 'builtin', sessionId?: string) => ipcRenderer.invoke('seshat:browser:openUrl', url, provider, sessionId),
    navigate: (contextId: string, url: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:navigate', contextId, url),
    back: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:back', contextId),
    forward: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:forward', contextId),
    reload: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:reload', contextId),
    setBounds: (contextId: string, bounds: BrowserPanelBounds): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:bounds', contextId, bounds),
    getState: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:state', contextId),
    destroy: (contextId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:destroy', contextId),
    newTab: (contextId: string, url?: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:new-tab', contextId, url),
    closeTab: (contextId: string, tabId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:close-tab', contextId, tabId),
    switchTab: (contextId: string, tabId: string): Promise<BrowserPanelState> => ipcRenderer.invoke('seshat:browser:switch-tab', contextId, tabId),
    onStateChange: (contextId: string, listener: (state: BrowserPanelState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { contextId: string; state: BrowserPanelState }) => {
        if (payload.contextId !== contextId) return
        listener(payload.state)
      }
      ipcRenderer.on('seshat:browser:state', handler)
      return () => ipcRenderer.removeListener('seshat:browser:state', handler)
    },
    onPanelOpened: (contextId: string, listener: (state: BrowserPanelState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { contextId: string; state: BrowserPanelState }) => {
        if (payload.contextId !== contextId) return
        listener(payload.state)
      }
      ipcRenderer.on('seshat:browser:panel-opened', handler)
      return () => ipcRenderer.removeListener('seshat:browser:panel-opened', handler)
    },
    onPanelClosed: (contextId: string, listener: (state: BrowserPanelState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { contextId: string; state: BrowserPanelState }) => {
        if (payload.contextId !== contextId) return
        listener(payload.state)
      }
      ipcRenderer.on('seshat:browser:panel-closed', handler)
      return () => ipcRenderer.removeListener('seshat:browser:panel-closed', handler)
    },
  },
  terminal: {
    start: (payload: { id: string; cwd: string }): Promise<{ ok: boolean; id: string; shell: string; cwd: string; pid?: number }> =>
      ipcRenderer.invoke('terminal:start', payload),
    write: (id: string, data: string): Promise<void> => ipcRenderer.invoke('terminal:write', { id, data }),
    stop: (id: string): Promise<void> => ipcRenderer.invoke('terminal:stop', id),
    onEvent: (id: string, listener: (event: TerminalEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalEvent) => {
        if (payload.id !== id) return
        listener(payload)
      }
      ipcRenderer.on('terminal:event', handler)
      return () => ipcRenderer.removeListener('terminal:event', handler)
    },
  },
  terminalRelay: {
    connect: (sessionId: string): Promise<{ ok: boolean; connected: boolean }> =>
      ipcRenderer.invoke('terminal-relay:connect', sessionId),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('terminal-relay:disconnect', sessionId),
    status: (sessionId: string): Promise<{ connected: boolean }> => ipcRenderer.invoke('terminal-relay:status', sessionId),
    onEvent: (sessionId: string, listener: (event: TerminalRelayEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalRelayEvent) => {
        if (payload.sessionId !== sessionId) return
        listener(payload)
      }
      ipcRenderer.on('terminal-relay:event', handler)
      return () => ipcRenderer.removeListener('terminal-relay:event', handler)
    },
  },
  updates: {
    checkNow: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updates:check-now'),
    quitAndInstall: () => ipcRenderer.invoke('updates:quit-and-install'),
    onAvailable: (listener: (payload: { version: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { version: string }) => listener(payload)
      ipcRenderer.on('updates:available', handler)
      return () => ipcRenderer.removeListener('updates:available', handler)
    },
    onNotAvailable: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on('updates:not-available', handler)
      return () => ipcRenderer.removeListener('updates:not-available', handler)
    },
    onDownloaded: (listener: (payload: { version: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { version: string }) => listener(payload)
      ipcRenderer.on('updates:downloaded', handler)
      return () => ipcRenderer.removeListener('updates:downloaded', handler)
    },
    onError: (listener: (payload: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { message: string }) => listener(payload)
      ipcRenderer.on('updates:error', handler)
      return () => ipcRenderer.removeListener('updates:error', handler)
    },
  },
}

contextBridge.exposeInMainWorld('nexus', nexusBridge)

export type NexusBridge = typeof nexusBridge
