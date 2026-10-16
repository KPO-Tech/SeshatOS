import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '@renderer/stores/session'
import { EmptyState } from './EmptyState'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ShellLine = { id: number; stream: 'stdout' | 'stderr' | 'system'; text: string }
type ShellStatus = 'idle' | 'starting' | 'running' | 'exited'

// A shell the user drives themselves, as opposed to TerminalPanel, which is a
// read-only live view of the commands the agent runs. Both exist on purpose:
// the agent's own commands stay traceable on their own, and this one is a
// working shell the user can type into.
//
// Backed by main/ipc/system.ts's terminal:* handlers, which run the shell
// with piped stdio rather than a PTY. The shell echoes its own prompt and each
// submitted line, so nothing is echoed locally. The cost of that choice is
// real and worth stating: no ANSI colour, no line editing, and no full-screen
// programs (vim, less, a REPL's own UI). A PTY would need a native module.
export function ShellPanel({ sessionId }: { sessionId?: string }) {
  const session = useSessionStore((s) => (sessionId ? s.sessions.find((item) => item.id === sessionId) : undefined))
  const cwd = session?.workspacePath
  const [lines, setLines] = useState<ShellLine[]>([])
  const [status, setStatus] = useState<ShellStatus>('idle')
  const [shellLabel, setShellLabel] = useState('')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineSeqRef = useRef(0)
  const terminalIdRef = useRef<string | null>(null)
  const startedForRef = useRef<string | null>(null)

  const append = useCallback((stream: ShellLine['stream'], text: string) => {
    if (!text) return
    const id = lineSeqRef.current
    lineSeqRef.current += 1
    setLines((current) => [...current, { id, stream, text }])
  }, [])

  const stop = useCallback(() => {
    const id = terminalIdRef.current
    terminalIdRef.current = null
    setStatus('idle')
    if (id) void window.nexus?.terminal?.stop(id).catch(() => undefined)
  }, [])

  const start = useCallback(() => {
    const bridge = window.nexus?.terminal
    if (!sessionId || !cwd) return
    if (!bridge) {
      setError('This build has no terminal bridge.')
      return
    }

    const id = `shell:${sessionId}`
    terminalIdRef.current = id
    setError(null)
    setStatus('starting')
    setLines([])
    lineSeqRef.current = 0

    bridge.onEvent(id, (event) => {
      if (event.type === 'data') {
        append(event.stream === 'stderr' ? 'stderr' : 'stdout', event.data ?? '')
        return
      }
      if (event.type === 'started') {
        setShellLabel(event.shell ?? '')
        setStatus('running')
        return
      }
      if (event.type === 'exit') {
        append('system', `\nShell exited${typeof event.code === 'number' ? ` with code ${event.code}` : ''}\n`)
        terminalIdRef.current = null
        setStatus('exited')
        return
      }
      if (event.type === 'error') {
        setError(event.message ?? 'The shell could not start.')
        setStatus('exited')
      }
    })

    void bridge.start({ id, cwd }).catch((err: unknown) => {
      terminalIdRef.current = null
      setError(err instanceof Error ? err.message : 'The shell could not start.')
      setStatus('exited')
    })
  }, [append, cwd, sessionId])

  // Started once per session: the workspace path arrives with the session
  // load, so waiting for it is the difference between a shell in the project
  // folder and one in the app's own directory.
  useEffect(() => {
    if (!sessionId || !cwd) return
    if (startedForRef.current === sessionId) return
    startedForRef.current = sessionId
    start()
  }, [cwd, sessionId, start])

  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => () => stopRef.current(), [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  function submit() {
    const bridge = window.nexus?.terminal
    const id = terminalIdRef.current
    if (!bridge || !id || status !== 'running') return
    const command = input
    setInput('')
    void bridge.write(id, `${command}\n`).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'The command could not be sent.')
    })
  }

  function restart() {
    stop()
    startedForRef.current = sessionId ?? null
    start()
  }

  if (!cwd) {
    return (
      <EmptyState
        title="No project folder"
        description="This conversation has no workspace folder yet, so there is nowhere to open a shell."
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-app-bg">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app-border-subtle px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[11px] font-semibold text-app-text-muted">Shell</span>
          {shellLabel && <span className="truncate text-[10.5px] text-app-text-muted">{shellLabel}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cx('size-1.5 rounded-full', status === 'running' ? 'bg-app-success' : 'bg-app-text-muted')} />
          <span className={cx('text-[10.5px] font-semibold', status === 'running' ? 'text-app-success' : 'text-app-text-muted')}>
            {status === 'running' ? 'running' : status === 'starting' ? 'starting' : status === 'exited' ? 'exited' : 'stopped'}
          </span>
          <button
            className="cursor-pointer rounded-[5px] border border-app-border-subtle bg-transparent px-1.5 py-[2px] text-[10.5px] text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text"
            onClick={() => setLines([])}
            type="button"
          >
            Clear
          </button>
          <button
            className="cursor-pointer rounded-[5px] border border-app-border-subtle bg-transparent px-1.5 py-[2px] text-[10.5px] text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text"
            onClick={restart}
            type="button"
          >
            Restart
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-[var(--color-code-bg)] p-3 font-mono text-[11px] leading-5"
      >
        {lines.length === 0 && !error ? (
          <div className="text-app-text-muted">Starting the shell...</div>
        ) : (
          lines.map((line) => (
            <pre key={line.id} className={cx('m-0 whitespace-pre-wrap', lineClass(line.stream))}>{line.text}</pre>
          ))
        )}
        {error && <pre className="m-0 mt-2 whitespace-pre-wrap text-app-error">{error}</pre>}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-app-border-subtle px-3 py-2 font-mono text-[11px]">
        <span className="min-w-0 max-w-[45%] truncate text-app-text-muted" title={cwd}>{cwd}</span>
        <span className="shrink-0 font-semibold text-[var(--accent-primary)]">$</span>
        <input
          aria-label="Shell command"
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[11px] text-app-text outline-none placeholder:text-app-text-muted"
          disabled={status !== 'running'}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={status === 'running' ? 'Type a command and press Enter' : 'Shell is not running'}
          spellCheck={false}
          value={input}
        />
      </div>
    </div>
  )
}

function lineClass(stream: ShellLine['stream']) {
  if (stream === 'stderr') return 'text-app-error'
  if (stream === 'system') return 'text-app-text-muted'
  return 'text-[var(--color-code-fg)]'
}
