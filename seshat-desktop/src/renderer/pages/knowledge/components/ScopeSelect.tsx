import { useEffect, useRef, useState } from 'react'
import { Check, Down, FolderOpen } from '@icon-park/react'
import type { AskScope, KnowledgeCollection } from '../chat/useCollections'

type Props = {
  collections: KnowledgeCollection[]
  scope: AskScope
  onChange: (scope: AskScope) => void
}

// Where a question looks: every collection the person can read, or one.
export function ScopeSelect({ collections, scope, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = collections.find((item) => item.id === scope.collectionId)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function pick(collectionId: string | null) {
    onChange({ collectionId })
    setOpen(false)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-solid border-[var(--border-soft)] bg-transparent px-3 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <FolderOpen size={14} />
        <span>{current?.name ?? 'All collections'}</span>
        <Down size={11} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[260px] rounded-xl border border-solid border-[var(--border-soft)] bg-[var(--surface-menu)] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
          style={{ animation: 'slide-up 160ms ease both' }}
        >
          <Option label="All collections" note={`${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}`} selected={!current} onPick={() => pick(null)} />
          {collections.map((item) => (
            <Option key={item.id} label={item.name} note={item.documentCount === null ? '' : `${item.documentCount} ${item.documentCount === 1 ? 'document' : 'documents'}`} selected={current?.id === item.id} onPick={() => pick(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Option({ label, note, selected, onPick }: { label: string; note: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--surface-hover)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">{note}</span>
      </span>
      {selected && <Check size={14} className="text-[var(--accent-primary)]" />}
    </button>
  )
}
