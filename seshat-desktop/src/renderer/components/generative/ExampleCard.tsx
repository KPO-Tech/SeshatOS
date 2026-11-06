import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import type { Family } from './families'
import { UiCode } from './UiCode'

export type View = 'preview' | 'code' | 'both'

// A hue for each family, so that a card says at a glance what it shows.
const FAMILY_TONE: Record<Family, string> = {
  basics: 'bg-[var(--surface-hover)] text-[var(--text-secondary)]',
  charts: 'bg-blue-500/12 text-blue-500',
  forms: 'bg-emerald-500/12 text-emerald-500',
  design: 'bg-violet-500/12 text-violet-500',
  architecture: 'bg-orange-500/12 text-orange-500'
}

type Props = {
  code: string
  index: number
  title: string
  families: Family[]
  /** What the families are called, in the language of the person. */
  familyLabels: Record<Family, string>
  /** The parser errors of the example, for the people who write components. */
  errors?: string[]
  /** What the card starts on. */
  initialView?: View
}

/** One example of the catalogue: its title and families, then its drawing, its source, or both side by side. */
export function ExampleCard({ code, index, title, families, familyLabels, errors = [], initialView = 'preview' }: Props) {
  const { t } = useTranslation('generative')
  const [view, setView] = useState<View>(initialView)
  const views: Array<{ id: View; label: string }> = [
    { id: 'preview', label: t('gallery.view.preview') },
    { id: 'code', label: t('gallery.view.code') },
    { id: 'both', label: t('gallery.view.both') }
  ]

  return (
    <section className="@container rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-0 border-b border-solid border-[var(--border-soft)] px-4 py-2.5">
        <span className="rounded-md bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-primary)]">{index + 1}</span>
        <h3 className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <span className="flex flex-wrap gap-1.5">
          {families.map((id) => (
            <span key={id} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FAMILY_TONE[id]}`}>
              {familyLabels[id]}
            </span>
          ))}
        </span>
        <div role="tablist" aria-label={title} className="flex shrink-0 gap-0.5 rounded-lg bg-[var(--surface-hover)] p-0.5">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              onClick={() => setView(item.id)}
              className={`cursor-pointer rounded-md border-0 px-2.5 py-1 text-[12px] font-medium ${view === item.id ? 'bg-[var(--accent-primary)] text-white' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div className={`grid gap-3 p-4 ${view === 'both' ? '@5xl:grid-cols-2' : ''}`}>
        {view !== 'code' && (
          <div className="min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-4 py-1">
            <RichBlock code={code} streaming={false} fallback={<pre className="text-xs">{code}</pre>} />
          </div>
        )}
        {view !== 'preview' && <UiCode code={code} />}
        {errors.length > 0 && <pre className="m-0 whitespace-pre-wrap text-[11.5px] text-red-500">{errors.join('\n')}</pre>}
      </div>
    </section>
  )
}
