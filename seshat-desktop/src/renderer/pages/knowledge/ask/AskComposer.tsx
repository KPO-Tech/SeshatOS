import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp } from '@icon-park/react'
import { ScopeSelect } from '../components/ScopeSelect'
import type { AskScope, KnowledgeCollection } from '../chat/useCollections'

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

export function AskComposer({ collections, scope, busy, placeholder = 'Ask about your documents', autoFocus, onScopeChange, onSubmit, onStop }: Props) {
  const [value, setValue] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [value])

  function send() {
    const question = value.trim()
    if (!question || busy) return
    onSubmit(question)
    setValue('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="rounded-[22px] border border-solid border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 pb-3 pt-3.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-150 focus-within:border-[color-mix(in_srgb,var(--accent-primary)_55%,var(--border-soft))] focus-within:shadow-[0_0_0_3px_var(--accent-subtle),0_10px_30px_-18px_rgba(0,0,0,0.45)]">
      <textarea
        ref={field}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Your question"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="block max-h-[160px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <ScopeSelect collections={collections} scope={scope} onChange={onScopeChange} />
        {busy ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-solid border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <span className="size-2.5 rounded-[2px] bg-current" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Ask"
            disabled={!value.trim()}
            onClick={send}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--accent-primary)] text-white transition-[filter,opacity] hover:brightness-110 disabled:cursor-default disabled:opacity-35 disabled:hover:brightness-100"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
