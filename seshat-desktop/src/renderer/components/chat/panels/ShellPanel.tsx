import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '@renderer/stores/session'
import { EmptyState } from './EmptyState'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ShellStatus = 'idle' | 'starting' | 'running' | 'exited'

// A real terminal for the user, as opposed to TerminalPanel, which is a
// read-only live view of the commands the agent runs. Both exist on purpose:
// the agent's own commands stay traceable on their own, and this one is a
// shell the user drives.
//
// It is a real PTY (main/ipc/shell.ts, node-pty) rendered by xterm.js, so
// colour, line editing, job control and full-screen programs all work the way
// they do in a normal terminal. What the renderer sends back is the raw
// keystroke stream, which is why there is no input field here.
export function ShellPanel({ sessionId }: { sessionId?: string }) {
  const session = useSessionStore((s) => (sessionId ? s.sessions.find((item) => item.id === sessionId) : undefined))
  const cwd = session?.workspacePath
  const [status, setStatus] = useState<ShellStatus>('idle')
  const [shellLabel, setShellLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const idRef = useRef<string | null>(null)
  const disposersRef = useRef<Array<() => void>>([])

  const detach = useCallback(() => {
    for (const dispose of disposersRef.current) dispose()
    disposersRef.current = []
  }, [])

  const stop = useCallback(() => {
    const id = idRef.current
    idRef.current = null
    detach()
    if (id) void window.seshat?.shell?.stop(id).catch(() => undefined)
  }, [detach])

  const start = useCallback(() => {
    const bridge = window.seshat?.shell
    if (!sessionId || !cwd) return
    if (!bridge) {
      setError('This build has no shell bridge.')
      return
    }

    const term = termRef.current
    const id = `shell:${sessionId}`
    detach()
    idRef.current = id
    setError(null)
    setStatus('starting')
    setShellLabel('')
    term?.reset()

    disposersRef.current.push(
      bridge.onData(id, (event) => termRef.current?.write(event.data)),
      bridge.onExit(id, (event) => {
        idRef.current = null
        detach()
        termRef.current?.write(`\r\n\x1b[2m[exited with code ${event.exitCode}]\x1b[0m\r\n`)
        setStatus('exited')
      }),
    )

    void bridge
      .start({ id, cwd, cols: term?.cols ?? 80, rows: term?.rows ?? 24 })
      .then((info) => {
        setShellLabel(info.shell)
        setStatus('running')
        termRef.current?.focus()
      })
      .catch((err: unknown) => {
        idRef.current = null
        detach()
        setError(err instanceof Error ? err.message : 'The shell could not start.')
        setStatus('exited')
      })
  }, [cwd, detach, sessionId])

  // The terminal is created before the shell starts (this effect is declared
  // first), because the shell is spawned with the size the terminal measured.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11.5,
      theme: terminalTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // The panel can mount with no measurable size yet.
    }
    termRef.current = term
    fitRef.current = fit

    const input = term.onData((data) => {
      const id = idRef.current
      if (id) void window.seshat?.shell?.write(id, data).catch(() => undefined)
    })

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // Same as above: nothing to fit while the panel is collapsed.
      }
      const id = idRef.current
      if (id) void window.seshat?.shell?.resize(id, term.cols, term.rows).catch(() => undefined)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      input.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessionId || !cwd) return
    start()
    return () => stop()
  }, [cwd, sessionId, start, stop])

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
            onClick={() => termRef.current?.clear()}
            type="button"
          >
            Clear
          </button>
          <button
            className="cursor-pointer rounded-[5px] border border-app-border-subtle bg-transparent px-1.5 py-[2px] text-[10.5px] text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text"
            onClick={() => {
              stop()
              start()
            }}
            type="button"
          >
            Restart
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-app-border-subtle px-3 py-1.5 font-mono text-[10.5px] text-app-error">{error}</div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-2" ref={containerRef} />
    </div>
  )
}

// xterm needs concrete colours, so the app's own code tokens are read off the
// document rather than duplicated here.
function terminalTheme() {
  const styles = getComputedStyle(document.documentElement)
  const background = styles.getPropertyValue('--color-code-bg').trim() || '#1a1a1a'
  const foreground = styles.getPropertyValue('--color-code-fg').trim() || '#d6d3d1'
  return {
    background,
    foreground,
    cursor: styles.getPropertyValue('--accent-primary').trim() || foreground,
    selectionBackground: 'rgba(239, 124, 47, 0.3)',
  }
}
