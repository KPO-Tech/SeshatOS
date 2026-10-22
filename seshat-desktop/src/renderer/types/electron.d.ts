interface Window {
  seshat: {
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
      continueWithoutAccount: () => Promise<{ user: { id: string; email: string; display_name: string; status: string }; roles: string[]; isAuthenticated: boolean }>
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
    setup?: {
      state: () => Promise<{ completed: boolean }>
      plan: () => Promise<SetupPlan>
      run: (selection: SetupSelection) => Promise<void>
      complete: () => Promise<void>
      onProgress: (listener: (progress: SetupProgress) => void) => () => void
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
      getSettings: () => Promise<{ threads: number | null; automaticThreads: number; cores: number }>
      setSettings: (settings: { threads: number | null }) => Promise<{ threads: number | null; automaticThreads: number; cores: number }>
      onProgress: (listener: (progress: { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }) => void) => () => void
    }
    llama?: {
      status: () => Promise<LlamaStatus>
      provision: () => Promise<LlamaStatus>
      downloadModel: (modelId: string) => Promise<LlamaStatus>
      addCustomModel: (repo: string, filename: string) => Promise<LlamaStatus>
      activateModel: (modelId: string) => Promise<LlamaStatus>
      deleteModel: (modelId: string) => Promise<LlamaStatus>
      enable: () => Promise<LlamaStatus>
      disable: () => Promise<LlamaStatus>
      onProgress: (listener: (progress: { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }) => void) => () => void
    }
    sandbox?: {
      // passive: answer from what is known without starting a command; refresh: probe again. Null when nothing is known.
      srtStatus: (options?: { passive?: boolean; refresh?: boolean }) => Promise<SrtStatus | null>
      srtEnable: () => Promise<SrtStatus>
    }
    appearance?: {
      setZoom: (factor: number) => void
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
    shell?: {
      start: (payload: { id: string; cwd: string; cols: number; rows: number }) => Promise<{ id: string; shell: string; cwd: string; pid?: number }>
      write: (id: string, data: string) => Promise<void>
      resize: (id: string, cols: number, rows: number) => Promise<void>
      stop: (id: string) => Promise<void>
      onData: (id: string, listener: (event: ShellDataEvent) => void) => () => void
      onExit: (id: string, listener: (event: ShellExitEvent) => void) => () => void
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

type SrtStatus = {
  state: 'ready' | 'needs-setup' | 'unavailable' | 'not-needed'
  platform: string
  detail?: string
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

type SetupOption = { id: string; label: string; sizeBytes: number; description: string; recommended: boolean }
type SetupPlan = {
  components: Array<{ id: 'title' | 'speech'; available: boolean; unavailableReason?: string; options: SetupOption[] }>
  freeDiskBytes: number | null
}
type SetupSelection = Partial<Record<'title' | 'speech', { install: boolean; modelId: string }>>
type SetupProgress = { component: 'title' | 'speech'; status: 'running' | 'done' | 'error'; receivedBytes?: number; totalBytes?: number; message?: string }

type ShellDataEvent = { id: string; data: string }
type ShellExitEvent = { id: string; exitCode: number; signal?: number }

interface LlamaModelInfo {
  id: string
  label: string
  repo: string
  filename: string
  approxSizeBytes: number
  description: string
  custom?: boolean
}

interface LlamaStatus {
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
