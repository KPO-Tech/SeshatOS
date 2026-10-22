import { useEffect, useRef, useState } from 'react'

type Props = {
  initialText: string
  onCancel: () => void
  onSend: (text: string) => void
}

// Replaces a prompt's bubble while it is being changed. Sending asks again with the new text, as a new message.
export function PromptEditor({ initialText, onCancel, onSend }: Props) {
  const [text, setText] = useState(initialText)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const field = ref.current
    if (!field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }, [])

  useEffect(() => {
    const field = ref.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 320)}px`
  }, [text])

  const canSend = text.trim().length > 0 && text.trim() !== initialText.trim()

  return (
    <div className="flex w-full flex-col gap-2 rounded-[14px] border border-app-border-subtle bg-app-surface p-3">
      <textarea
        ref={ref}
        className="w-full resize-none border-0 bg-transparent text-[length:var(--chat-font-size)] leading-[1.6] text-app-text outline-none"
        value={text}
        rows={2}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) onSend(text.trim())
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-full border border-app-border-subtle bg-transparent px-3.5 py-1.5 text-[13px] text-app-text-secondary hover:bg-[var(--surface-hover)]"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-full border-0 bg-[var(--accent-primary)] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:cursor-default disabled:opacity-40"
          disabled={!canSend}
          onClick={() => onSend(text.trim())}
        >
          Send
        </button>
      </div>
    </div>
  )
}
