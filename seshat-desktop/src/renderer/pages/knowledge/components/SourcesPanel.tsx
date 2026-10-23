import type { ReactNode } from 'react'

// The column beside the conversation that keeps the sources of the latest answer in view while it is read.
export function SourcesPanel({ count, children }: { count: number; children: ReactNode }) {
  return (
    <aside className="hidden w-[344px] shrink-0 flex-col border-0 border-l border-solid border-[var(--border-soft)] min-[1500px]:flex">
      <header className="flex h-12 shrink-0 items-center gap-2 px-5">
        <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">Sources</h2>
        {count > 0 && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">{count}</span>}
      </header>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {count === 0 ? (
          <p className="m-0 px-1 pt-2 text-[12.5px] leading-[19px] text-[var(--text-muted)]">
            The passages an answer rests on appear here, each with its document and page.
          </p>
        ) : (
          children
        )}
      </div>
    </aside>
  )
}
