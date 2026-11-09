import { CheckOne } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@renderer/stores/ui'

/** The switch under the composer that folds a finished turn's steps behind its header. */
export function CondenseTurnsToggle() {
  const { t } = useTranslation('chat')
  const condenseTurns = useUIStore((state) => state.condenseTurns)
  const setCondenseTurns = useUIStore((state) => state.setCondenseTurns)

  return (
    <button
      type="button"
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-1 py-0.5 text-[11px] text-app-text-muted transition-colors hover:text-app-text-secondary"
      aria-pressed={condenseTurns}
      onClick={() => setCondenseTurns(!condenseTurns)}
    >
      <span className={`inline-flex size-3 items-center justify-center rounded-[3px] border ${condenseTurns ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-[var(--border-strong)]'}`}>
        {condenseTurns && <CheckOne size={8} />}
      </span>
      {t('chat.composer.conversationComposer.condenseTurns')}
    </button>
  )
}
