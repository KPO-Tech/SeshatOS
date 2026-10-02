import { useEffect, useMemo, useRef, useState } from 'react'
import { useTerminalStore, type TerminalCommandRun } from '@renderer/stores/terminal'
import { useSessionStore, EMPTY_STREAMING } from '@renderer/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// The relay generates its own id per command run (sessionID-N, see
// terminal_relay.go's Run) - it has no idea which chat tool_use it's
// executing for, so there's no shared id to match a clicked bash row
// against. The command TEXT is the only thing both sides agree on; search
// from the most recent end first, since a repeated command's latest run is
// almost always the one a click meant.
function findCommandByText(commands: TerminalCommandRun[], text: string): TerminalCommandRun | null {
  for (let i = commands.length - 1; i >= 0; i--) {
    if (commands[i].command === text) return commands[i]
  }
  return null
}

// Live view of the agent's bash-tool commands for this session, bridged
// through main/ipc/terminal-relay.ts to seshat-backend's TerminalRelay -
// see SDKRuntime.applyRemoteExecutor. Opening this panel is what attaches
// the relay (see attachSession below); closing it does not disconnect it,
// since a command already routed through the relay for this turn needs
// somewhere to report back to even if the user isn't looking anymore.
//
// Rendered as one continuous shell scrollback (prompt line + output + a
// trailing exit/duration line per command, all in a single buffer) rather
// than segmented per-command tabs - chosen over the tabbed log view for a
// more authentic "real terminal" feel.
export function TerminalPanel({ sessionId, focusToolId }: { sessionId?: string; focusToolId?: string }) {
  const attachSession = useTerminalStore((s) => s.attachSession)
  const relaySession = useTerminalStore((s) => (sessionId ? s.sessions[sessionId] : null))
  const session = useSessionStore((s) => (sessionId ? s.sessions.find((item) => item.id === sessionId) : undefined))
  const streaming = useSessionStore((s) => (sessionId ? s.getStreaming(sessionId) : EMPTY_STREAMING))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId) void attachSession(sessionId)
  }, [sessionId, attachSession])

  const commands = relaySession?.commands ?? []
  const connected = Boolean(relaySession?.connected)
  const lastCommand = commands[commands.length - 1] ?? null
  const isRunning = lastCommand?.status === 'running'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [commands])

  // A bash row clicked in the chat transcript (ToolLineItem/SilentToolView)
  // opens/updates this panel with a new focusToolId - find that tool's
  // command text in the session and jump to its match here.
  const focusCommandText = useMemo(() => {
    if (!focusToolId || !session) return null
    for (const message of session.messages) {
      for (const block of message.content) {
        if (block.type === 'tool_use' && block.id === focusToolId) {
          return typeof block.input.command === 'string' ? block.input.command : null
        }
      }
    }
    for (const block of streaming) {
      if (block.type === 'tool_use' && block.id === focusToolId) {
        return typeof block.input.command === 'string' ? block.input.command : null
      }
    }
    return null
  }, [focusToolId, session, streaming])

  useEffect(() => {
    // Only a genuinely new click (focusToolId itself changing) should
    // re-trigger this - not every new line of live output, which would
    // otherwise fight the auto-scroll-to-bottom effect above on every
    // single chunk of a still-running command.
    if (!focusToolId || !focusCommandText) return
    const match = findCommandByText(commands, focusCommandText)
    if (!match) return
    const el = scrollRef.current?.querySelector(`[data-command-id="${CSS.escape(match.id)}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightedId(match.id)
    const timer = setTimeout(() => setHighlightedId(null), 1600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToolId])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-bg">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app-border-subtle px-3 py-2">
        <div className="text-[11px] font-semibold text-app-text-muted">Terminal</div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold">
          <span className={cx('size-1.5 rounded-full', connected ? 'bg-app-success' : 'bg-app-text-muted')} />
          <span className={connected ? 'text-app-success' : 'text-app-text-muted'}>{connected ? 'live' : 'not connected'}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-[var(--color-code-bg)] p-3 font-mono text-[11px] leading-5"
      >
        {commands.length === 0 ? (
          <div className="flex items-center gap-2 text-app-text-muted">
            <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />
            {connected ? 'Waiting for the agent to run a command...' : 'Connecting...'}
          </div>
        ) : (
          commands.map((command, index) => (
            <CommandBlock
              key={command.id}
              command={command}
              showCursor={connected && index === commands.length - 1 && command.status === 'running'}
              highlighted={command.id === highlightedId}
            />
          ))
        )}
        {connected && !isRunning && commands.length > 0 && (
          <div className="flex items-baseline gap-1.5 pt-1">
            <PromptLabel cwd={lastCommand?.cwd} />
            <Cursor />
          </div>
        )}
      </div>
    </div>
  )
}

function CommandBlock({ command, showCursor, highlighted }: { command: TerminalCommandRun; showCursor: boolean; highlighted?: boolean }) {
  return (
    <div
      data-command-id={command.id}
      className={cx('-mx-2 rounded-md px-2 pb-2 transition-colors duration-500', highlighted && 'bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)]')}
    >
      <div className="flex items-baseline gap-1.5">
        <PromptLabel cwd={command.cwd} />
        <span className="whitespace-pre-wrap text-app-text">{command.command}</span>
      </div>
      {command.lines.map((line) => (
        <pre key={line.id} className={lineClass(line.stream)}>{line.text}</pre>
      ))}
      {showCursor && <Cursor />}
      {typeof command.exitCode === 'number' && (
        <div className="mt-0.5 text-[10.5px] text-app-text-muted">
          <span className={command.exitCode === 0 ? 'text-app-success' : 'text-app-error'}>exit {command.exitCode}</span>
          {command.durationMs != null && <span> · {formatMs(command.durationMs)}</span>}
        </div>
      )}
    </div>
  )
}

function PromptLabel({ cwd }: { cwd?: string | null }) {
  return (
    <span className="shrink-0 whitespace-nowrap font-semibold text-[var(--accent-primary)]">
      {cwd ? <span className="font-normal text-app-text-muted">{cwd} </span> : null}
      $
    </span>
  )
}

function Cursor() {
  return <span className="inline-block h-3 w-[6px] translate-y-[2px] animate-pulse bg-app-text" />
}

function lineClass(stream: 'stdout' | 'stderr' | 'system') {
  if (stream === 'stderr') return 'whitespace-pre-wrap text-app-error'
  if (stream === 'system') return 'whitespace-pre-wrap text-app-text-muted'
  return 'whitespace-pre-wrap text-[var(--color-code-fg)]'
}

function formatMs(value: number) {
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}
