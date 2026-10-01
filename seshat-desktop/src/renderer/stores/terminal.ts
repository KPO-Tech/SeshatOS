import { create } from 'zustand'

export type TerminalLine = {
  id: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export type TerminalCommandRun = {
  id: string
  command: string
  cwd?: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  endedAt?: number
  exitCode?: number
  durationMs?: number
  lines: TerminalLine[]
}

type TerminalSessionState = {
  connected: boolean
  commands: TerminalCommandRun[]
}

type TerminalRelayEventPayload = {
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

type TerminalState = {
  sessions: Record<string, TerminalSessionState>
  attachSession: (sessionId: string) => Promise<void>
  getSession: (sessionId?: string) => TerminalSessionState | null
  ingestEvent: (event: TerminalRelayEventPayload) => void
  resetSession: (sessionId: string) => void
}

const attachedSessions = new Set<string>()

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: {},
  attachSession: async (sessionId) => {
    const id = sessionId.trim()
    if (!id || attachedSessions.has(id) || !window.nexus?.terminalRelay) return
    attachedSessions.add(id)
    try {
      window.nexus.terminalRelay.onEvent(id, (event) => get().ingestEvent(event))
      const status = await window.nexus.terminalRelay.connect(id)
      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: {
            connected: status.connected,
            commands: state.sessions[id]?.commands ?? [],
          },
        },
      }))
    } catch (err) {
      attachedSessions.delete(id)
      const message = err instanceof Error ? err.message : 'Terminal relay failed'
      get().ingestEvent({ sessionId: id, type: 'error', message })
    }
  },
  getSession: (sessionId) => {
    if (!sessionId) return null
    return get().sessions[sessionId] ?? null
  },
  ingestEvent: (event) => set((state) => {
    const session = state.sessions[event.sessionId] ?? { connected: false, commands: [] }
    if (event.type === 'connected') {
      return { sessions: { ...state.sessions, [event.sessionId]: { ...session, connected: true } } }
    }
    if (event.type === 'disconnected') {
      return { sessions: { ...state.sessions, [event.sessionId]: { ...session, connected: false } } }
    }

    const commands = updateCommands(session.commands, event)
    return {
      sessions: {
        ...state.sessions,
        [event.sessionId]: { ...session, commands },
      },
    }
  }),
  resetSession: (sessionId) => set((state) => ({
    sessions: {
      ...state.sessions,
      [sessionId]: { connected: state.sessions[sessionId]?.connected ?? false, commands: [] },
    },
  })),
}))

function updateCommands(commands: TerminalCommandRun[], event: TerminalRelayEventPayload) {
  if (event.type === 'command_start') {
    const commandId = event.commandId || `terminal-${Date.now()}`
    const next: TerminalCommandRun = {
      id: commandId,
      command: event.command || 'Command',
      cwd: event.cwd,
      status: 'running',
      startedAt: Date.now(),
      lines: [{ id: `${commandId}-start`, stream: 'system', text: 'Command started' }],
    }
    // Caps retained command history per session - this is a live activity
    // feed, not a transcript; older entries scroll out rather than growing
    // this array forever across a long-lived conversation.
    return [...commands.filter((command) => command.id !== commandId), next].slice(-12)
  }

  if (event.type === 'data') {
    return patchCommand(commands, event.commandId, (command) => ({
      ...command,
      lines: [...command.lines, {
        id: `${event.commandId || command.id}-${command.lines.length}`,
        stream: event.stream === 'stderr' ? 'stderr' : 'stdout',
        text: event.data || '',
      }],
    }))
  }

  if (event.type === 'command_end') {
    return patchCommand(commands, event.commandId, (command) => {
      const exitCode = event.exitCode ?? 1
      return {
        ...command,
        status: exitCode === 0 ? 'completed' : 'failed',
        endedAt: Date.now(),
        exitCode,
        durationMs: event.durationMs,
        lines: [...command.lines, {
          id: `${event.commandId || command.id}-end`,
          stream: 'system',
          text: `Finished with exit ${exitCode}`,
        }],
      }
    })
  }

  if (event.type === 'error') {
    return patchCommand(commands, event.commandId, (command) => ({
      ...command,
      status: 'failed',
      lines: [...command.lines, {
        id: `error-${command.lines.length}`,
        stream: 'stderr',
        text: event.message || 'Terminal relay error',
      }],
    }))
  }

  return commands
}

function patchCommand(commands: TerminalCommandRun[], commandId: string | undefined, patch: (command: TerminalCommandRun) => TerminalCommandRun) {
  const index = commandId
    ? commands.findIndex((command) => command.id === commandId)
    : commands.length - 1
  if (index < 0) return commands
  return commands.map((command, currentIndex) => currentIndex === index ? patch(command) : command)
}
