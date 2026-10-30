import { ArrowRight, CheckCorrect, Data, Info, Light } from '@icon-park/react'
import { EXAMPLES, TIPS } from './askContent'

type Props = {
  onPick: (prompt: string) => void
}

const CARD = 'rounded-[16px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]'

// The column on the right of the Ask screen before any question: what Ask draws on, questions to start from, and a few tips.
export function AskSidebar({ onPick }: Props) {
  return (
    <aside aria-label="Help to ask" className="no-scrollbar flex min-h-0 w-[300px] shrink-0 flex-col gap-3 overflow-y-auto">
      <section className={`${CARD} flex items-start gap-3 p-3.5`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
          <Data size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-[13.5px] font-semibold text-[var(--text-primary)]">Ask with your sources</h2>
          <p className="m-0 mt-1 text-[12px] leading-[18px] text-[var(--text-muted)]">Seshat can use your collections and documents to give contextual answers.</p>
        </div>
      </section>

      <section className={`${CARD} p-3`}>
        <h2 className="m-0 mb-2 flex items-center gap-2 px-1 text-[13.5px] font-semibold text-[var(--text-primary)]">
          <span className="text-[var(--accent-primary)]">
            <Light size={15} />
          </span>
          Example questions
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {EXAMPLES.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                onClick={() => onPick(example.prompt)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-app-border-subtle bg-transparent px-3 py-2 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <span className="min-w-0">{example.label}</span>
                <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${CARD} p-3`}>
        <h2 className="m-0 mb-2 flex items-center gap-2 px-1 text-[13.5px] font-semibold text-[var(--text-primary)]">
          <span className="text-[var(--accent-info)]">
            <Info size={15} />
          </span>
          Tips
        </h2>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {TIPS.map((tip) => (
            <li key={tip} className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[12.5px] text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">
                <CheckCorrect size={14} />
              </span>
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
