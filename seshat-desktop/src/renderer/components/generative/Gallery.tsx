import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EXAMPLE_TITLES, PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'
import { ExampleCard } from './ExampleCard'
import { FAMILIES, familiesOf, type Family } from './families'

// The gallery: every example of the catalogue as a card with a small live picture of it, to look through and pick from; a click opens the
// example large, with its source and the line that shows what a click on it would send. Nothing leaves this window.

// Two colours for the frame of the picture of each family, so that the grid has colour and says at a glance what a card shows.
const FRAME: Record<Family, string> = {
  basics: 'from-slate-300/70 via-sky-200/60 to-indigo-200/60',
  charts: 'from-sky-300/70 via-cyan-200/60 to-emerald-200/60',
  forms: 'from-emerald-300/70 via-lime-200/60 to-amber-200/60',
  design: 'from-violet-300/70 via-fuchsia-200/60 to-rose-200/60',
  architecture: 'from-orange-300/70 via-amber-200/60 to-rose-300/60'
}
const BADGE: Record<Family, string> = {
  basics: 'bg-[var(--surface-hover)] text-[var(--text-secondary)]',
  charts: 'bg-blue-500/12 text-blue-500',
  forms: 'bg-emerald-500/12 text-emerald-500',
  design: 'bg-violet-500/12 text-violet-500',
  architecture: 'bg-orange-500/12 text-orange-500'
}

/** The factor that makes a drawing made for `base` pixels fit the width of its box. */
function useFit(base: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => setScale(Math.max(0.2, Math.min(1, element.clientWidth / base))))
    watch.observe(element)
    setScale(Math.max(0.2, Math.min(1, element.clientWidth / base)))
    return () => watch.disconnect()
  }, [base])
  return { ref, scale }
}

const PICTURE_WIDTH = 600

function Picture({ code, family }: { code: string; family: Family }) {
  const { ref, scale } = useFit(PICTURE_WIDTH)
  return (
    <div className={`relative overflow-hidden rounded-t-2xl bg-gradient-to-br p-4 pb-0 ${FRAME[family]}`}>
      <div ref={ref} className="relative h-[190px] overflow-hidden rounded-t-xl bg-[var(--surface-root)] shadow-[0_6px_22px_rgba(0,0,0,0.22)]">
        {/* The drawing is a real one, made wide and shrunk to fit; nothing in it can be pressed from here. */}
        <div aria-hidden="true" inert className="pointer-events-none origin-top-left select-none px-4" style={{ width: PICTURE_WIDTH, transform: `scale(${scale})` }}>
          <RichBlock code={code} streaming={false} fallback={null} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--surface-root)] to-transparent" />
      </div>
    </div>
  )
}

type Props = {
  examples?: string[]
  titles?: string[]
}

export function Gallery({ examples = PROMPT_EXAMPLES, titles = EXAMPLE_TITLES }: Props) {
  const { t } = useTranslation('generative')
  const [family, setFamily] = useState<Family | 'all'>('all')
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [sent, setSent] = useState<string[]>([])
  const labels: Record<Family | 'all', string> = {
    all: t('gallery.families.all'),
    basics: t('gallery.families.basics'),
    charts: t('gallery.families.charts'),
    forms: t('gallery.families.forms'),
    design: t('gallery.families.design'),
    architecture: t('gallery.families.architecture')
  }
  const items = useMemo(() => examples.map((code, index) => ({ code, index, families: familiesOf(code) })), [examples])
  const shown = items.filter(({ code, index, families }) => (family === 'all' || families.includes(family)) && `${titles[index] ?? ''} ${code}`.toLowerCase().includes(filter.toLowerCase()))
  const current = open === null ? null : items[open]

  if (current) {
    const title = titles[current.index] ?? `#${current.index + 1}`
    return (
      <RichActionProvider ask={(message) => setSent((previous) => [...previous.slice(-9), message])} busy={false}>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => {
              setOpen(null)
              setSent([])
            }}
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <span aria-hidden="true">←</span>
            {t('gallery.back')}
          </button>
          <ExampleCard key={current.index} code={current.code} index={current.index} title={title} families={current.families} familyLabels={labels} />
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
            <div className="flex items-center justify-between gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{t('gallery.wouldReceive', { count: sent.length })}</span>
              {sent.length > 0 && (
                <button type="button" onClick={() => setSent([])} className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-0.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                  {t('gallery.clear')}
                </button>
              )}
            </div>
            <div className="px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
              {sent.length === 0 ? <span className="text-[var(--text-muted)]">{t('gallery.nothingSent')}</span> : sent.map((message, i) => <pre key={i} className="m-0 mb-1.5 whitespace-pre-wrap font-sans">{message}</pre>)}
            </div>
          </section>
        </div>
      </RichActionProvider>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', ...FAMILIES] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFamily(id)}
            aria-pressed={family === id}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium ${family === id ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            {labels[id]}
          </button>
        ))}
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('gallery.filter')}
          aria-label={t('gallery.filter')}
          className="ml-auto min-w-48 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      {shown.length === 0 && <div className="text-[13px] text-[var(--text-muted)]">{t('gallery.none')}</div>}

      <div className="@container">
        <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
          {shown.map(({ code, index, families }) => {
            const main = families.find((id) => id !== 'basics') ?? 'basics'
            const title = titles[index] ?? `#${index + 1}`
            return (
              // A div, not a button: the picture holds real components, some of which are buttons, and a button cannot hold a button.
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => setOpen(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setOpen(index)
                  }
                }}
                aria-label={title}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-0 text-left outline-none transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.22)] focus-visible:border-[var(--accent-primary)]"
              >
                <Picture code={code} family={main} />
                <span className="flex flex-col gap-2 border-0 border-t border-solid border-[var(--border-soft)] px-4 py-3">
                  <span className="text-[14px] font-semibold leading-snug text-[var(--text-primary)]">{title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {families.map((id) => (
                      <span key={id} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[id]}`}>
                        {labels[id]}
                      </span>
                    ))}
                  </span>
                  <span className="text-[12.5px] text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]">{t('gallery.view.open')} →</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
