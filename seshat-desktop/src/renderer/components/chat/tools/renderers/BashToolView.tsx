import { CopyButton } from '@renderer/components/ui/CopyButton'
import { fmtDuration, parseBashResult } from '../helpers'
import type { ToolViewProps } from '../types'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('chat')
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
        <CopyButton
          text={content}
          label={t('chat.tools.renderers.bashToolView.copy')}
          className="absolute right-2 top-1.5 inline-flex size-5 items-center justify-center rounded border-0 bg-transparent p-0 text-app-text-muted opacity-0 transition-[opacity,color,background] duration-[120ms] group-hover:opacity-100 hover:bg-[var(--surface-hover)] hover:text-app-text"
        />
      )}
    </div>
  )
}

export function BashToolView({ tool, result }: ToolViewProps) {
  const { t } = useTranslation('chat')
  const command = (tool.input.command as string) ?? ''
  const parsed = parseBashResult(result)
  const showResultError = Boolean(result?.isError && result.content && result.content !== parsed?.stderr)

  return (
    <div className="flex flex-col overflow-hidden rounded-b-md border border-t-0 border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_88%,var(--surface-panel))]">
      <BashPanel label={t('chat.tools.renderers.bashToolView.command')} content={command} copyable />

      {parsed?.stdout != null && (
        <BashPanel label={t('chat.tools.renderers.bashToolView.output')} content={parsed.stdout || '(no output)'} copyable />
      )}

      {parsed?.stderr && (
        <BashPanel label={t('chat.tools.renderers.bashToolView.error')} content={parsed.stderr} tone="error" copyable />
      )}

      {parsed != null && parsed.exitCode != null && (
        <div className="flex items-center justify-end gap-2.5 border-t border-app-border-subtle px-[11px] pb-[7px] pt-[5px] font-mono text-[10px] text-app-text-muted">
          <span>{t('chat.tools.renderers.bashToolView.exitCode', { code: parsed.exitCode })}</span>
          {result?.durationMs != null && <span>{t('chat.tools.renderers.bashToolView.duration', { value: fmtDuration(result.durationMs) })}</span>}
        </div>
      )}

      {showResultError && <BashPanel label={t('chat.tools.renderers.bashToolView.error')} content={result?.content ?? ''} tone="error" copyable />}
    </div>
  )
}
