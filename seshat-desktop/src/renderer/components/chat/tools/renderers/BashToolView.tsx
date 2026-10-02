import { Copy } from '@icon-park/react'
import { fmtDuration, parseBashResult } from '../helpers'
import type { ToolViewProps } from '../types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function BashPanel({
  label,
  content,
  tone = 'default',
  copyable = false,
}: {
  label: string
  content: string
  tone?: 'default' | 'error'
  copyable?: boolean
}) {
  if (!content) return null
  const isError = tone === 'error'
  return (
    <div
      className={cx(
        'group relative grid grid-cols-[78px_minmax(0,1fr)] items-start gap-2.5 border-t border-app-border-subtle py-[9px] pl-[11px] pr-[34px] first:border-t-0',
        isError && 'bg-[color-mix(in_srgb,rgba(var(--color-error-rgb),0.065)_64%,transparent)]',
      )}
    >
      <div className="pt-px text-[9px] font-[750] uppercase tracking-[0.04em] text-app-text-muted">{label}</div>
      <pre
        className={cx(
          'm-0 min-w-0 max-h-[150px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.45] [scrollbar-width:thin]',
          isError ? 'text-[color-mix(in_srgb,var(--accent-danger)_82%,var(--text-primary))]' : 'text-app-text-secondary',
        )}
      >
        {content}
      </pre>
      {copyable && (
        <button
          className="absolute right-2 top-1.5 inline-flex size-5 items-center justify-center rounded border-0 bg-transparent p-0 text-app-text-muted opacity-0 transition-[opacity,color,background] duration-[120ms] group-hover:opacity-100 hover:bg-[var(--surface-hover)] hover:text-app-text"
          type="button"
          aria-label="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

export function BashToolView({ tool, result }: ToolViewProps) {
  const command = (tool.input.command as string) ?? ''
  const parsed = parseBashResult(result)
  const showResultError = Boolean(result?.isError && result.content && result.content !== parsed?.stderr)

  return (
    <div className="flex flex-col overflow-hidden rounded-b-md border border-t-0 border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_88%,var(--surface-panel))]">
      <BashPanel label="Command" content={command} copyable />

      {parsed?.stdout != null && (
        <BashPanel label="Output" content={parsed.stdout || '(no output)'} copyable />
      )}

      {parsed?.stderr && (
        <BashPanel label="Error" content={parsed.stderr} tone="error" copyable />
      )}

      {parsed != null && parsed.exitCode != null && (
        <div className="flex items-center justify-end gap-2.5 border-t border-app-border-subtle px-[11px] pb-[7px] pt-[5px] font-mono text-[10px] text-app-text-muted">
          <span>Exit code: {parsed.exitCode}</span>
          {result?.durationMs != null && <span>Duration: {fmtDuration(result.durationMs)}</span>}
        </div>
      )}

      {showResultError && <BashPanel label="Error" content={result?.content ?? ''} tone="error" copyable />}
    </div>
  )
}
