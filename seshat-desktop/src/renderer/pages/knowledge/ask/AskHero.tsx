import type { ReactNode } from 'react'
import { ChartHistogram, Code, FileText, Light, Message, ShareOne, Scale } from '@icon-park/react'
import { AskIllustration } from './AskIllustration'
import { CAPABILITIES, SUGGESTIONS, type CapabilityId } from './askContent'

const ICONS: Record<CapabilityId, ReactNode> = {
  answer: <Message size={20} />,
  summarize: <FileText size={20} />,
  analyze: <ChartHistogram size={20} />,
  generate: <Light size={20} />,
  data: <Code size={20} />,
  sources: <ShareOne size={20} />
}

type Props = {
  // Puts the beginning of a question in the input.
  onPick: (prompt: string) => void
}

// The middle of the Ask screen before any question: the picture, what Ask can do as six cards, and four questions to start from.
export function AskHero({ onPick }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col items-center px-6 pb-4 pt-2" style={{ animation: 'slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <div className="w-full max-w-[460px]">
        <AskIllustration />
      </div>
      <h2 className="m-0 mt-1 text-center text-[30px] font-normal leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        Ask anything about your knowledge
      </h2>
      <p className="m-0 mt-2.5 max-w-[520px] text-center text-[13.5px] leading-[21px] text-[var(--text-muted)]">Seshat reads your documents and connected sources to give you accurate, contextual and actionable answers.</p>

      <ul className="m-0 mt-6 grid w-full list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {CAPABILITIES.map((capability) => (
          <li key={capability.id}>
            <button
              type="button"
              disabled={capability.soon}
              onClick={() => onPick(capability.prompt)}
              title={capability.soon ? 'Not available yet' : undefined}
              className={[
                'flex h-full w-full items-start gap-3 rounded-[14px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] px-3.5 py-3 text-left transition-colors',
                capability.soon ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--surface-hover)]'
              ].join(' ')}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{ICONS[capability.id]}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--text-primary)]">
                  {capability.title}
                  {capability.soon && <span className="rounded-md bg-[var(--surface-hover)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Soon</span>}
                </span>
                <span className="mt-0.5 block text-[12px] leading-[17px] text-[var(--text-muted)]">{capability.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <ul className="m-0 mt-4 flex w-full list-none flex-wrap items-center justify-center gap-2 p-0">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion.id}>
            <button
              type="button"
              onClick={() => onPick(suggestion.prompt)}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-app-border-subtle bg-transparent px-3.5 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <span className="text-[var(--accent-primary)]">{SUGGESTION_ICONS[suggestion.id]}</span>
              {suggestion.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SUGGESTION_ICONS: Record<string, ReactNode> = {
  summarize: <Light size={14} />,
  compare: <Scale size={14} />,
  insights: <ChartHistogram size={14} />,
  report: <FileText size={14} />
}

