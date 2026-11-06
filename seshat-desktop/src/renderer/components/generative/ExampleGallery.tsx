import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { COMPONENT_SPECS } from '@renderer/components/chat/richblocks/catalog/specs'
import { PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { parseUi } from '@renderer/components/chat/richblocks/lang/parseUi'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'

// Every example of the catalogue, drawn as the chat draws it, with its source, and a line that shows what a click on a form, a quiz or a
// button would send: nothing leaves this page, the message is only shown. It is what the model is taught from, so it is also what it can do.

/** The families a person recognises, over the groups of the catalogue. */
export const FAMILIES = ['basics', 'charts', 'forms', 'design', 'architecture'] as const
export type Family = (typeof FAMILIES)[number]

const GROUP_FAMILY: Record<string, Family> = { Charts: 'charts', Forms: 'forms', Design: 'design', Architecture: 'architecture', Relations: 'architecture' }
const FAMILY_OF_COMPONENT = new Map(COMPONENT_SPECS.map((spec) => [spec.name, GROUP_FAMILY[spec.group] ?? 'basics'] as const))

/** The families an example draws from: those of the components it calls. */
export function familiesOf(code: string): Family[] {
  const found = new Set<Family>()
  for (const match of code.matchAll(/\b([A-Z][A-Za-z]+)\(/g)) {
    const family = FAMILY_OF_COMPONENT.get(match[1])
    if (family && family !== 'basics') found.add(family)
  }
  return found.size > 0 ? [...found] : ['basics']
}

function titleOf(code: string): string {
  const first = code.split('\n').find((line) => /^\w+\s*=/.test(line)) ?? ''
  return first.replace(/\s*=\s*/, ' = ').slice(0, 90)
}

type Props = {
  /** The examples to show; the catalogue's by default. */
  examples?: string[]
  /** Show the errors the parser finds: for the people who write components. */
  showErrors?: boolean
  /** The family to start from. */
  initialFamily?: Family | 'all'
  initialFilter?: string
}

export function ExampleGallery({ examples = PROMPT_EXAMPLES, showErrors = false, initialFamily = 'all', initialFilter = '' }: Props) {
  const { t } = useTranslation('generative')
  const [family, setFamily] = useState<Family | 'all'>(initialFamily)
  const [filter, setFilter] = useState(initialFilter)
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
  const shown = items.filter(({ code, families }) => (family === 'all' || families.includes(family)) && code.toLowerCase().includes(filter.toLowerCase()))

  return (
    <RichActionProvider ask={(message) => setSent((previous) => [...previous.slice(-9), message])} busy={false}>
      <div className="flex flex-col gap-4">
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
            className="ml-auto min-w-48 rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        {shown.length === 0 && <div className="text-[13px] text-[var(--text-muted)]">{t('gallery.none')}</div>}

        {shown.map(({ code, index, families }) => {
          const errors = showErrors ? parseUi(code, { streaming: false }).errors : []
          return (
            <section key={index} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--text-muted)]">
                <span className="min-w-0 truncate">{`#${index + 1} · ${titleOf(code)}`}</span>
                <span className="shrink-0">{families.map((id) => labels[id]).join(' · ')}</span>
              </div>
              <RichBlock code={code} streaming={false} fallback={<pre className="text-xs">{code}</pre>} />
              {errors.length > 0 && <pre className="m-0 whitespace-pre-wrap text-[11.5px] text-[var(--danger,#dc2626)]">{errors.map((error) => error.message).join('\n')}</pre>}
              <details className="text-[12px] text-[var(--text-muted)]">
                <summary className="cursor-pointer">{t('gallery.source')}</summary>
                <pre className="whitespace-pre-wrap">{code}</pre>
              </details>
            </section>
          )
        })}

        <div className="sticky bottom-0 -mx-1 mt-2 max-h-32 overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface-menu)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
          <div className="mb-1 font-semibold text-[var(--text-primary)]">{t('gallery.wouldReceive', { count: sent.length })}</div>
          {sent.length === 0 ? <div className="text-[var(--text-muted)]">{t('gallery.nothingSent')}</div> : sent.map((message, i) => <pre key={i} className="m-0 mb-1 whitespace-pre-wrap">{message}</pre>)}
        </div>
      </div>
    </RichActionProvider>
  )
}
