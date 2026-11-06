import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { highlightLine, type PieceKind } from '@renderer/components/chat/richblocks/lang/highlight'

// The source of an example, with colour codes: the name of a statement, the component, the strings, the numbers and the words true, false
// and null each have their colour, and the lines are numbered. The colours are the stock hues the app already uses for its tones, which read
// on a dark and on a light page.
const COLOURS: Record<PieceKind, string> = {
  name: 'text-pink-500',
  component: 'text-[var(--accent-primary)] font-semibold',
  string: 'text-emerald-500',
  number: 'text-sky-500',
  keyword: 'text-violet-500',
  ref: 'text-[var(--text-primary)]',
  punct: 'text-[var(--text-muted)]',
  space: ''
}

export function UiCode({ code }: { code: string }) {
  const { t } = useTranslation('generative')
  const [copied, setCopied] = useState(false)
  const lines = code.split('\n')

  function copy() {
    try {
      void navigator.clipboard.writeText(code).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
    } catch {
      // The clipboard may be refused: the code stays selectable.
    }
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)]">
      <div className="flex items-center justify-between gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-3 py-1.5 text-[11.5px] text-[var(--text-muted)]">
        <span className="flex items-center gap-2">
          <span className="rounded bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] px-1.5 py-px font-semibold text-[var(--accent-primary)]">seshat-ui</span>
          {t('gallery.code.lines', { count: lines.length })}
        </span>
        <button type="button" onClick={copy} className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-0.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
          {copied ? t('gallery.code.copied') : t('gallery.code.copy')}
        </button>
      </div>
      <pre className="no-scrollbar m-0 max-h-[26rem] overflow-y-auto overflow-x-hidden p-0 font-mono text-[12px] leading-[1.7]">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="w-9 shrink-0 select-none pr-3 text-right text-[11px] text-[var(--text-muted)] opacity-60">{index + 1}</span>
            <code className="min-w-0 flex-1 whitespace-pre-wrap pr-4 [overflow-wrap:anywhere]">
              {highlightLine(line).map((piece, at) => (
                <span key={at} className={COLOURS[piece.kind]}>
                  {piece.text}
                </span>
              ))}
            </code>
          </div>
        ))}
      </pre>
    </div>
  )
}
