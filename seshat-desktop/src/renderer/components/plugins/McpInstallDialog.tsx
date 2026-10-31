import { useEffect, useState } from 'react'
import { createMCPServer, reloadMCPServers } from '@renderer/components/config/mcp/mcpApi'
import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import { BrandIcon } from './catalog/BrandIcon'
import { mcpLogo } from './catalog/mcpLogos'
import { buildServer, commandLine, missingInputs, type McpCatalogEntry } from './mcpCatalog'

type Props = {
  entry: McpCatalogEntry
  /** Called once the server is installed, so that the page lists it. */
  onInstalled: (started: boolean) => void
  onClose: () => void
}

/**
 * Shown before an MCP server is installed: what will run and where, what it needs, and what it asks for. A server of the list is a
 * program from the internet that runs here with the person's permissions, so nothing is added until they have seen that.
 */
export function McpInstallDialog({ entry, onInstalled, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedToStart, setFailedToStart] = useState<string | null>(null)
  const missing = missingInputs(entry, values)
  const remote = entry.server_type === 'http'

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [busy, onClose])

  async function install() {
    setBusy(true)
    setError(null)
    try {
      await createMCPServer(buildServer(entry, values))
      // The server starts now: the person learns at once whether it could, not at their next message.
      const reloaded = await reloadMCPServers()
      const status = reloaded.servers?.find((server) => server.name === entry.name)
      if (status && !status.ok) {
        setFailedToStart(status.error || 'The server did not start.')
        onInstalled(false)
      } else {
        onInstalled(true)
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not install this server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Install ${entry.title}`} className="flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
        <div className="flex items-start gap-3">
          <BrandIcon brand={entry.brand} src={mcpLogo(entry.brand)} title={entry.title} size={48} />
          <div className="min-w-0">
            <h2 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">Install {entry.title}</h2>
            <p className="m-0 mt-1 text-[12.5px] leading-5 text-[var(--text-muted)]">{entry.description}</p>
          </div>
        </div>

        <div className="no-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {failedToStart ? (
            <div className="rounded-xl border border-[var(--accent-danger)]/40 p-3">
              <div className="text-[13px] font-semibold text-[var(--accent-danger)]">Installed, but it did not start</div>
              <pre className="m-0 mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-4 text-[var(--text-secondary)]">{failedToStart}</pre>
              <p className="m-0 mt-2 text-[12px] text-[var(--text-muted)]">It stays in the list so that you can fix it from Create &gt; Custom MCP, or remove it.</p>
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] p-3">
                <div className="text-[12px] font-semibold text-[var(--text-muted)]">{remote ? 'Connects to' : 'Starts'}</div>
                <code className="mt-1 block break-all font-mono text-[12px] leading-5 text-[var(--text-primary)]">{commandLine(entry, values)}</code>
                <p className="m-0 mt-2 text-[11.5px] leading-4 text-[var(--text-muted)]">
                  {remote
                    ? 'Your agents send their requests to this address when they use it.'
                    : 'A program of the internet, downloaded the first time it starts and run on this machine with your permissions.'}
                </p>
              </section>

              {entry.needs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                  Needs
                  {entry.needs.map((need) => (
                    <span key={need} className="rounded-md border border-[var(--border-soft)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                      {need}
                    </span>
                  ))}
                </div>
              )}

              {entry.inputs.map((input) => (
                <label key={input.id} className="grid gap-1.5">
                  <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                    {input.label}
                    {input.required ? ' *' : ''}
                  </span>
                  <input
                    type={input.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={values[input.id] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [input.id]: event.target.value }))}
                    placeholder={input.placeholder}
                    className="h-10 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                </label>
              ))}
              {error && <p className="m-0 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => openInAppBrowser(entry.docs)} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline">
            Read about it
          </button>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="h-9 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
              {failedToStart ? 'Close' : 'Cancel'}
            </button>
            {!failedToStart && (
              <button type="button" disabled={busy || missing.length > 0} onClick={() => void install()} className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50">
                {busy ? 'Installing...' : 'Install'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
