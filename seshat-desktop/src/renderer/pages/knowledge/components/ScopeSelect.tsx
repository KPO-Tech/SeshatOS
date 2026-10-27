import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen } from '@icon-park/react'
import { SelectorMenu, SelectorPill, type SelectorOption } from '@renderer/components/ui/SelectorPill'
import type { AskScope, KnowledgeCollection } from '../chat/useCollections'

const ALL = '__all__'

type Props = {
  collections: KnowledgeCollection[]
  scope: AskScope
  onChange: (scope: AskScope) => void
  // Where the menu opens: above the pill (the default, for the input of a page) or below it.
  placement?: 'up' | 'down'
}

// Where a question looks: every collection the person can read, or one. The same pill and menu as the model selector of the chat input.
export function ScopeSelect({ collections, scope, onChange, placement = 'up' }: Props) {
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

  const options = useMemo<SelectorOption[]>(
    () => [
      { id: ALL, label: 'All collections', description: `${collections.length} ${collections.length === 1 ? 'collection' : 'collections'}` },
      ...collections.map((item) => ({
        id: item.id,
        label: item.name,
        description: item.documentCount === null ? undefined : `${item.documentCount} ${item.documentCount === 1 ? 'document' : 'documents'}`
      }))
    ],
    [collections]
  )

  return (
    <div ref={root} className="relative min-w-0 max-w-[min(240px,32vw)]">
      <SelectorPill
        label={current?.name ?? 'All collections'}
        icon={<FolderOpen size={12} />}
        onClick={() => setOpen((value) => !value)}
        active={open}
        className="h-7 max-w-full !gap-1.5 !px-[9px] !py-0"
      />
      {open && (
        <SelectorMenu
          placement={placement}
          className="min-w-[260px]"
          searchable
          options={options}
          selectedId={current?.id ?? ALL}
          onSelect={(id) => {
            setOpen(false)
            onChange({ collectionId: id === ALL ? null : id })
          }}
        />
      )}
    </div>
  )
}
