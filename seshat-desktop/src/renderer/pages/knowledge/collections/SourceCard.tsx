import type { ReactNode } from 'react'
import { Right } from '@icon-park/react'
import { plural } from './fileStatus'

type Props = { icon: ReactNode; title: string; detail: string; collections: number; onOpen: () => void }

/** A place collections come from: its icon, its name, where it is, and how many collections it holds. */
export function SourceCard({ icon, title, detail, collections, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] leading-[16px] text-[var(--text-muted)]" title={detail}>
          {detail}
        </span>
      </span>
      <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">{plural(collections, 'collection', 'collections')}</span>
      <span className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
        <Right size={14} />
      </span>
    </button>
  )
}
