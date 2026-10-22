import { Copy, Edit, Refresh, Share } from '@icon-park/react'

const BUTTON_CSS = 'flex size-6 cursor-pointer items-center justify-center rounded-app-xs border-0 bg-transparent p-0 text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text-secondary disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-muted'

type Props = {
  text: string
  align: 'start' | 'end'
  // Assistant messages: ask the model again from the prompt that led to this answer.
  onRegenerate?: () => void
  // User messages: change the prompt, then send it again.
  onEdit?: () => void
}

// Copy, share and regenerate under an answer; copy, share and edit under a prompt. Share is shown but not available yet.
export function MessageActions({ text, align, onRegenerate, onEdit }: Props) {
  return (
    <div
      className={`-mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 ${align === 'end' ? 'justify-end' : ''}`}
    >
      <button className={BUTTON_CSS} type="button" aria-label="Copy" title="Copy" onClick={() => void navigator.clipboard.writeText(text)}>
        <Copy size={14} />
      </button>
      <button className={BUTTON_CSS} type="button" aria-label="Share" title="Sharing is not available yet" disabled>
        <Share size={14} />
      </button>
      {onRegenerate && (
        <button className={BUTTON_CSS} type="button" aria-label="Regenerate" title="Regenerate" onClick={onRegenerate}>
          <Refresh size={14} />
        </button>
      )}
      {onEdit && (
        <button className={BUTTON_CSS} type="button" aria-label="Edit prompt" title="Edit prompt" onClick={onEdit}>
          <Edit size={14} />
        </button>
      )}
    </div>
  )
}
