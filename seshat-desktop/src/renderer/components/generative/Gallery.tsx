import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GALLERIES, type Gallery as GalleryData, type GalleryTone } from '@renderer/components/chat/richblocks/catalog/galleries'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'
import { RichIcon } from '@renderer/components/chat/richblocks/view/icons/RichIcon'
import { ExampleCard } from './ExampleCard'
import { familiesOf, type Family } from './families'

// The galleries: collections of examples, each a grid of cards with a small live picture of the example in a coloured frame. A click on a
// collection opens its cards, a click on a card opens the example large, with its source and the line that shows what a click on it would
// send. Nothing leaves this window.

// Two or three colours for the frame of a picture, so that the grid has colour and each collection has its own.
const FRAME: Record<GalleryTone, string> = {
  blue: 'from-sky-300/70 via-cyan-200/60 to-indigo-200/60',
  green: 'from-emerald-300/70 via-lime-200/60 to-amber-200/60',
  violet: 'from-violet-300/70 via-fuchsia-200/60 to-rose-200/60',
  orange: 'from-orange-300/70 via-amber-200/60 to-rose-300/60',
  rose: 'from-rose-300/70 via-pink-200/60 to-orange-200/60',
  slate: 'from-slate-300/70 via-sky-200/60 to-indigo-200/60'
}

/** The factor that makes a drawing made for `base` pixels fit the width of its box. */
function useFit(base: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const fit = () => setScale(Math.max(0.2, Math.min(1, element.clientWidth / base)))
    const watch = new ResizeObserver(fit)
    watch.observe(element)
    fit()
    return () => watch.disconnect()
  }, [base])
  return { ref, scale }
}

const PICTURE_WIDTH = 600

/** A small live picture of an example, in the frame of a tone. Nothing in it can be pressed or tabbed to from here. */
function Picture({ code, tone, height = 190 }: { code: string; tone: GalleryTone; height?: number }) {
  const { ref, scale } = useFit(PICTURE_WIDTH)
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br p-4 pb-0 ${FRAME[tone]}`}>
      <div ref={ref} className="relative overflow-hidden rounded-t-xl bg-[var(--surface-root)] shadow-[0_6px_22px_rgba(0,0,0,0.22)]" style={{ height }}>
        <div aria-hidden="true" inert className="pointer-events-none origin-top-left select-none px-4" style={{ width: PICTURE_WIDTH, transform: `scale(${scale})` }}>
          <RichBlock code={code} streaming={false} fallback={null} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--surface-root)] to-transparent" />
      </div>
    </div>
  )
}

type View = { kind: 'hub' } | { kind: 'collection'; id: string } | { kind: 'example'; id: string; index: number }

type Props = {
  galleries?: GalleryData[]
  /** Open a collection, and one of its examples, at the start: for the people who work on the galleries. */
  initialCollection?: string
  initialExample?: number
}

export function Gallery({ galleries = GALLERIES, initialCollection, initialExample }: Props) {
  const { t } = useTranslation('generative')
  const [view, setView] = useState<View>(
    initialCollection ? (initialExample === undefined ? { kind: 'collection', id: initialCollection } : { kind: 'example', id: initialCollection, index: initialExample }) : { kind: 'hub' }
  )
  const [filter, setFilter] = useState('')
  const [sent, setSent] = useState<string[]>([])

  // The name and the line of each collection, in the language of the person.
  const words: Record<string, { title: string; description: string }> = {
    landing: { title: t('collections.landing.title'), description: t('collections.landing.description') },
    mobile: { title: t('collections.mobile.title'), description: t('collections.mobile.description') },
    dashboards: { title: t('collections.dashboards.title'), description: t('collections.dashboards.description') },
    brand: { title: t('collections.brand.title'), description: t('collections.brand.description') },
    math: { title: t('collections.math.title'), description: t('collections.math.description') },
    calculators: { title: t('collections.calculators.title'), description: t('collections.calculators.description') },
    data: { title: t('collections.data.title'), description: t('collections.data.description') },
    cloud: { title: t('collections.cloud.title'), description: t('collections.cloud.description') },
    schemas: { title: t('collections.schemas.title'), description: t('collections.schemas.description') },
    learning: { title: t('collections.learning.title'), description: t('collections.learning.description') },
    work: { title: t('collections.work.title'), description: t('collections.work.description') },
    core: { title: t('collections.core.title'), description: t('collections.core.description') }
  }
  const labels: Record<Family, string> = {
    basics: t('gallery.families.basics'),
    charts: t('gallery.families.charts'),
    forms: t('gallery.families.forms'),
    design: t('gallery.families.design'),
    diagrams: t('gallery.families.diagrams'),
    architecture: t('gallery.families.architecture')
  }
  const nameOf = (gallery: GalleryData) => words[gallery.id]?.title ?? gallery.title
  const collection = view.kind === 'hub' ? null : galleries.find((gallery) => gallery.id === view.id) ?? null
  const cards = useMemo(() => (collection ? collection.examples.map((example, index) => ({ example, index })) : []), [collection])

  const back = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 py-1 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  )

  // One example, large.
  if (view.kind === 'example' && collection) {
    const example = collection.examples[view.index]
    if (example) {
      return (
        <RichActionProvider ask={(message) => setSent((previous) => [...previous.slice(-9), message])} busy={false}>
          <div className="flex flex-col gap-4">
            {back(nameOf(collection), () => {
              setView({ kind: 'collection', id: collection.id })
              setSent([])
            })}
            <ExampleCard key={`${collection.id}-${view.index}`} code={example.code} index={view.index} title={example.title} families={familiesOf(example.code)} familyLabels={labels} />
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
  }

  // The cards of one collection.
  if (collection) {
    const shown = cards.filter(({ example }) => `${example.title} ${example.about} ${example.code}`.toLowerCase().includes(filter.toLowerCase()))
    return (
      <div className="flex flex-col gap-5">
        {back(t('gallery.hub.back'), () => {
          setView({ kind: 'hub' })
          setFilter('')
        })}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="m-0 text-[17px] font-semibold text-[var(--text-primary)]">{nameOf(collection)}</h2>
            <p className="m-0 text-[12.5px] leading-5 text-[var(--text-muted)]">{words[collection.id]?.description ?? collection.description}</p>
          </div>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('gallery.filter')}
            aria-label={t('gallery.filter')}
            className="min-w-48 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
        {shown.length === 0 && <div className="text-[13px] text-[var(--text-muted)]">{t('gallery.none')}</div>}
        <div className="@container">
          <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
            {shown.map(({ example, index }) => (
              // A div, not a button: the picture holds real components, some of which are buttons, and a button cannot hold a button.
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => setView({ kind: 'example', id: collection.id, index })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setView({ kind: 'example', id: collection.id, index })
                  }
                }}
                aria-label={example.title}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-0 text-left outline-none transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.22)] focus-visible:border-[var(--accent-primary)]"
              >
                <Picture code={example.code} tone={collection.tone} />
                <span className="flex flex-col gap-1.5 border-0 border-t border-solid border-[var(--border-soft)] px-4 py-3">
                  <span className="text-[14px] font-semibold leading-snug text-[var(--text-primary)]">{example.title}</span>
                  {example.about && <span className="text-[12px] leading-snug text-[var(--text-muted)]">{example.about}</span>}
                  <span className="text-[12.5px] text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]">{t('gallery.view.open')} →</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // The collections.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
        {galleries.map((gallery) => (
          <div
            key={gallery.id}
            role="button"
            tabIndex={0}
            onClick={() => setView({ kind: 'collection', id: gallery.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setView({ kind: 'collection', id: gallery.id })
              }
            }}
            aria-label={nameOf(gallery)}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-0 text-left outline-none transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.22)] focus-visible:border-[var(--accent-primary)]"
          >
            <Picture code={gallery.examples[0]?.code ?? ''} tone={gallery.tone} height={150} />
            <span className="flex flex-col gap-1.5 border-0 border-t border-solid border-[var(--border-soft)] px-4 py-3">
              <span className="flex items-center gap-2 text-[14px] font-semibold leading-snug text-[var(--text-primary)]">
                <RichIcon name={gallery.icon} size={16} className="text-[var(--accent-primary)]" />
                {nameOf(gallery)}
              </span>
              <span className="text-[12px] leading-snug text-[var(--text-muted)]">{words[gallery.id]?.description ?? gallery.description}</span>
              <span className="text-[12.5px] text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]">{t('gallery.hub.count', { count: gallery.examples.length })} →</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
