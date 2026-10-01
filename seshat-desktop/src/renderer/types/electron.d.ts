interface Window {
  nexus: {
    getVersion: () => Promise<string>
    openPath: (p: string) => Promise<void>
    openLocalPath: (p: string) => Promise<void>
    openTerminal: (p: string) => Promise<void>
    showFile: (p: string) => Promise<void>
    readFileDataURL: (p: string) => Promise<string>
    hasProjectContextFile: (projectPath: string) => Promise<boolean>
    projectPathExists: (projectPath: string) => Promise<boolean>
    fs: {
      listDirectory: (directoryPath: string) => Promise<Array<{ name: string; isDirectory: boolean }>>
      readTextFile: (filePath: string) => Promise<string>
    }
    openExternal: (url: string) => Promise<void>
    selectFile: (opts?: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
    saveFile: (defaultName: string, content: string) => Promise<{ canceled: boolean; filePath?: string }>
    dialog: {
      openDirectory: () => Promise<Electron.OpenDialogReturnValue>
    }
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
    }
    secureStore: {
      set: (key: string, value: string) => Promise<void>
      get: (key: string) => Promise<string | null>
      delete: (key: string) => Promise<void>
    }
    auth?: {
      login: (credentials: { email: string; password: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean }>
      register: (payload: { name: string; email: string; password: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean }>
      logout: () => Promise<void>
      restoreSession: () => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean } | null>
      clearSession: () => Promise<void>
      updateUser: (user: { id: string; email: string; display_name: string; status: string }) => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean } | null>
    }
    http?: {
      request: (payload: { path: string; method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; data?: unknown; text?: string }>
      fileContent: (path: string) => Promise<{ ok: boolean; status: number; dataUrl?: string; error?: string }>
      fileRange: (path: string, start: number, end: number) => Promise<{ ok: boolean; status: number; data?: ArrayBuffer; totalLength?: number; contentType?: string; error?: string }>
      backendOrigin: () => Promise<string>
      upload: (payload: {
        path: string
        fields?: Array<{ name: string; value: string }>
        files?: Array<{ name: string; filename: string; mimeType?: string; data: ArrayBuffer }>
      }) => Promise<{ ok: boolean; status: number; data?: unknown; text?: string }>
      startStream: (payload: { path: string; method?: string; body?: unknown }) => Promise<{ streamId: string } | { error: string; retryable: boolean; unauthorized?: boolean }>
      cancelStream: (streamId: string) => Promise<void>
      onStreamEvent: (streamId: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => () => void
    }
    whisper?: {
      status: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      models: () => Promise<Array<{ id: string; filename: string; label: string; approxSizeBytes: number; description: string }>>
      downloadDefaults: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      downloadModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      activateModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      deleteModel: (modelId: string) => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      enable: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      disable: () => Promise<{ supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }>
      onProgress: (listener: (progress: { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }) => void) => () => void
    }
    envVars?: {
      catalog: () => Promise<Array<{ key: string; label: string; description: string; group: string; groupLabel: string; helpUrl?: string; hidden?: boolean }>>
      status: () => Promise<Record<string, boolean>>
      set: (key: string, value: string) => Promise<void>
      delete: (key: string) => Promise<void>
      restartBackend: () => Promise<{ ok: boolean; error?: string }>
    }
    browser?: {
      show: (contextId: string, bounds?: { x: number; y: number; width: number; height: number }) => Promise<BrowserPanelState>
      hide: (contextId: string) => Promise<BrowserPanelState>
      openUrl: (url: string, provider?: string, sessionId?: string) => Promise<{ provider: string; browser_url: string; target_id: string; tab_id: string; url: string }>
      navigate: (contextId: string, url: string) => Promise<BrowserPanelState>
      back: (contextId: string) => Promise<BrowserPanelState>
      forward: (contextId: string) => Promise<BrowserPanelState>
      reload: (contextId: string) => Promise<BrowserPanelState>
      setBounds: (contextId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<BrowserPanelState>
      getState: (contextId: string) => Promise<BrowserPanelState>
      destroy: (contextId: string) => Promise<BrowserPanelState>
      newTab: (contextId: string, url?: string) => Promise<BrowserPanelState>
      closeTab: (contextId: string, tabId: string) => Promise<BrowserPanelState>
      switchTab: (contextId: string, tabId: string) => Promise<BrowserPanelState>
      onStateChange: (contextId: string, listener: (state: BrowserPanelState) => void) => () => void
      onPanelOpened: (contextId: string, listener: (state: BrowserPanelState) => void) => () => void
      onPanelClosed: (contextId: string, listener: (state: BrowserPanelState) => void) => () => void
    }
    terminal?: {
      start: (payload: { id: string; cwd: string }) => Promise<{ ok: boolean; id: string; shell: string; cwd: string; pid?: number }>
      write: (id: string, data: string) => Promise<void>
      stop: (id: string) => Promise<void>
      onEvent: (id: string, listener: (event: TerminalEvent) => void) => () => void
    }
    terminalRelay?: {
      connect: (sessionId: string) => Promise<{ ok: boolean; connected: boolean }>
      disconnect: (sessionId: string) => Promise<void>
      status: (sessionId: string) => Promise<{ connected: boolean }>
      onEvent: (sessionId: string, listener: (event: TerminalRelayEvent) => void) => () => void
    }
    updates?: {
      checkNow: () => Promise<{ ok: boolean; error?: string }>
      quitAndInstall: () => Promise<void>
      onAvailable: (listener: (payload: { version: string }) => void) => () => void
      onNotAvailable: (listener: () => void) => () => void
      onDownloaded: (listener: (payload: { version: string }) => void) => () => void
      onError: (listener: (payload: { message: string }) => void) => () => void
    }
  }
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
