import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EXAMPLE_TITLES, PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { parseUi } from '@renderer/components/chat/richblocks/lang/parseUi'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'
import { ExampleCard, type View } from './ExampleCard'
import { FAMILIES, familiesOf, type Family } from './families'

export { FAMILIES, familiesOf, type Family } from './families'

// Every example of the catalogue, drawn as the chat draws it, with its source, and a line that shows what a click on a form, a quiz or a
// button would send: nothing leaves this page, the message is only shown. It is what the model is taught from, so it is also what it can do.

type Props = {
  /** The examples to show; the catalogue's by default. */
  examples?: string[]
  /** A name for each example, in the same order; the catalogue's by default. */
  titles?: string[]
  /** Show the errors the parser finds: for the people who write components. */
  showErrors?: boolean
  /** Show only the examples of this family, and no family chips: the page lists the families in its own navigation. */
  family?: Family | 'all'
  /** The family to start from, when the chips are shown. */
  initialFamily?: Family | 'all'
  initialFilter?: string
  /** What each card starts on. */
  initialView?: View
}

export function ExampleGallery({ examples = PROMPT_EXAMPLES, titles = EXAMPLE_TITLES, showErrors = false, family: fixedFamily, initialFamily = 'all', initialFilter = '', initialView }: Props) {
  const { t } = useTranslation('generative')
  const [chosen, setChosen] = useState<Family | 'all'>(initialFamily)
  const [filter, setFilter] = useState(initialFilter)
  const [sent, setSent] = useState<string[]>([])
  const family = fixedFamily ?? chosen
  const labels: Record<Family | 'all', string> = {
    all: t('gallery.families.all'),
    basics: t('gallery.families.basics'),
    charts: t('gallery.families.charts'),
    forms: t('gallery.families.forms'),
    design: t('gallery.families.design'),
    architecture: t('gallery.families.architecture')
  }
  const items = useMemo(() => examples.map((code, index) => ({ code, index, families: familiesOf(code) })), [examples])
  const shown = items.filter(({ code, families }) => (family === 'all' || families.includes(family)) && code.toLowerCase().includes(filter.toLowerCase()))

  return (
    <RichActionProvider ask={(message) => setSent((previous) => [...previous.slice(-9), message])} busy={false}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {!fixedFamily &&
            (['all', ...FAMILIES] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setChosen(id)}
                aria-pressed={chosen === id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium ${chosen === id ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
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

        {shown.map(({ code, index, families }, position) => (
          <ExampleCard
            key={index}
            code={code}
            index={position}
            title={titles[index] ?? `#${index + 1}`}
            families={families}
            familyLabels={labels}
            initialView={initialView}
            errors={showErrors ? parseUi(code, { streaming: false }).errors.map((error) => error.message) : []}
          />
        ))}

        <section className="sticky bottom-0 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-menu)] shadow-[0_-8px_24px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-4 py-2">
            <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{t('gallery.wouldReceive', { count: sent.length })}</span>
            {sent.length > 0 && (
              <button type="button" onClick={() => setSent([])} className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-0.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                {t('gallery.clear')}
              </button>
            )}
          </div>
          <div className="max-h-28 overflow-auto px-4 py-2 text-[12px] text-[var(--text-secondary)]">
            {sent.length === 0 ? <span className="text-[var(--text-muted)]">{t('gallery.nothingSent')}</span> : sent.map((message, i) => <pre key={i} className="m-0 mb-1 whitespace-pre-wrap font-sans">{message}</pre>)}
          </div>
        </section>
      </div>
    </RichActionProvider>
  )
}
