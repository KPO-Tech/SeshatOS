import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Send } from '@icon-park/react'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'
import { ScopeSelect } from '../components/ScopeSelect'
import type { AskScope, KnowledgeCollection } from '../chat/useCollections'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  collections: KnowledgeCollection[]
  scope: AskScope
  busy: boolean
  placeholder?: string
  autoFocus?: boolean
  onScopeChange: (scope: AskScope) => void
  onSubmit: (question: string) => void
  onStop: () => void
}

// The input of the Ask view, made like the chat input: the same card, text size, selector pill and send button.
export function AskComposer({ collections, scope, busy, placeholder = 'Ask about your documents', autoFocus, onScopeChange, onSubmit, onStop }: Props) {
  const [value, setValue] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim() !== '' && !busy

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [value])

  function send() {
    if (!canSend) return
    onSubmit(value.trim())
    setValue('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="relative rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] px-3.5 pb-2.5 pt-3 shadow-[0_14px_34px_rgba(31,27,23,0.09)] transition-[border-color,box-shadow] duration-[180ms] ease-in-out focus-within:border-[color-mix(in_srgb,var(--accent-primary)_42%,var(--border-soft))] focus-within:shadow-[0_18px_42px_rgba(31,27,23,0.12),0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_14%,transparent)]">
      <textarea
        ref={field}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Your question"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-5 w-full resize-none border-0 bg-transparent text-[13px] leading-[1.55] text-app-text outline-none [font-family:inherit] placeholder:text-app-text-muted"
      />

      <div className="mt-2.5 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ScopeSelect collections={collections} scope={scope} onChange={onScopeChange} />
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {busy ? (
            <button
              className="flex size-[30px] items-center justify-center rounded-[9px] border border-[var(--accent-hover)] bg-[var(--accent-subtle)] text-[var(--accent-primary)] transition-all duration-200 hover:bg-[var(--accent-hover)]"
              onClick={onStop}
              type="button"
              aria-label="Stop"
            >
              <WindowCloseIcon size={14} />
            </button>
          ) : (
            <button
              className={cx(
                'flex size-[30px] items-center justify-center rounded-[9px] border-0 transition-all duration-200',
                canSend
                  ? 'cursor-pointer bg-[var(--accent-primary)] text-white hover:-translate-y-px hover:bg-[var(--accent-hover)]'
                  : 'cursor-not-allowed bg-[color-mix(in_srgb,var(--surface-panel)_82%,var(--surface-root))] text-app-text-muted'
              )}
              onClick={send}
              type="button"
              aria-label="Ask"
            >
              <Send size={14} theme={canSend ? 'filled' : 'outline'} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
