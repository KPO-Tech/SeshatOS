import { useEffect, useMemo, useRef, useState } from 'react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { SelectorMenu, SelectorPill, type SelectorOption } from '@renderer/components/ui/SelectorPill'
import { providerDisplayName, providerInitials, type ModelChoice } from '@renderer/components/chat/conversation/useConversationModels'
import { modelAlias } from '@renderer/lib/modelAlias'

type Props = {
  choices: ModelChoice[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

// The model that writes the answers: the same pill and menu as the model selector of the chat input, in the input of the Ask view.
export function ModelSelect({ choices, selectedId, loading, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = choices.find((choice) => choice.id === selectedId) ?? null

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
    () =>
      choices.map((choice) => ({
        id: choice.id,
        label: modelAlias(choice.model.display_name || choice.model.model_id),
        description: providerDisplayName(choice.providerName, choice.providerKind),
        icon: <ProviderIcon provider={choice.providerKind} size={17} />,
        prefix: providerInitials(choice.providerName, choice.providerKind)
      })),
    [choices]
  )

  const label = current ? modelAlias(current.model.display_name || current.model.model_id) : loading ? 'Loading models' : 'No model'

  return (
    <div ref={root} className="relative min-w-0 max-w-[min(240px,32vw)]">
      <SelectorPill
        label={label}
        icon={current ? <ProviderIcon provider={current.providerKind} size={13} /> : undefined}
        onClick={() => setOpen((value) => !value)}
        disabled={choices.length === 0}
        active={open}
        className="h-7 max-w-full !gap-1.5 !px-[9px] !py-0"
      />
      {open && (
        <SelectorMenu
          placement="up"
          align="right"
          className="min-w-[330px]"
          searchable
          options={options}
          selectedId={selectedId}
          onSelect={(id) => {
            setOpen(false)
            onSelect(id)
          }}
        />
      )}
    </div>
  )
}
