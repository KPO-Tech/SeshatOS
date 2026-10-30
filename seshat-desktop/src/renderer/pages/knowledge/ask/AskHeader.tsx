import { Message, Plus } from '@icon-park/react'
import { HowItWorks } from './HowItWorks'

type Props = {
  // A conversation is open: the header shrinks to one line to leave the room to the messages.
  compact: boolean
  historyOpen: boolean
  onToggleHistory: () => void
  onNew: () => void
}

// The top of the Ask card. The chat icon opens the history of the questions asked here; once a conversation is open the header
// keeps only the title, a button to start another question, and the icon.
export function AskHeader({ compact, historyOpen, onToggleHistory, onNew }: Props) {
  return (
    <header className={`flex shrink-0 items-center justify-between gap-4 px-5 ${compact ? 'py-2.5' : 'pb-3 pt-4'}`}>
      <div className="flex min-w-0 items-center gap-3.5">
        <button
          type="button"
          aria-label="History of questions"
          aria-expanded={historyOpen}
          title="History of questions"
          onClick={onToggleHistory}
          className={`flex shrink-0 cursor-pointer items-center justify-center border-0 text-[var(--accent-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_22%,transparent)] ${historyOpen ? 'bg-[color-mix(in_srgb,var(--accent-primary)_22%,transparent)]' : 'bg-[var(--accent-subtle)]'} ${compact ? 'size-8 rounded-[10px]' : 'size-11 rounded-[14px]'}`}
        >
          <Message size={compact ? 16 : 22} />
        </button>
        <div className="min-w-0">
          <h1 className={`m-0 font-semibold leading-[1.2] text-[var(--text-primary)] ${compact ? 'text-[15px]' : 'text-[22px]'}`}>Ask Seshat</h1>
          {!compact && <p className="m-0 truncate text-[12.5px] text-[var(--text-muted)]">Get answers from your documents, data and connected sources.</p>}
        </div>
      </div>
      {compact ? (
        <button
          type="button"
          onClick={onNew}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border border-solid border-app-border-subtle bg-transparent px-3 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={14} />
          New question
        </button>
      ) : (
        <HowItWorks />
      )}
    </header>
  )
}
