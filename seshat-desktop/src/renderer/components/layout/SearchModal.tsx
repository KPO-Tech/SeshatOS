import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Sync } from '@icon-park/react'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'
import { api } from '@renderer/api/client'
import type { SessionSearchResult } from '@renderer/api/types'
import type { ChatSession } from '@renderer/stores/session'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function relativeDate(value: string | number | undefined): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  const diff = Date.now() - date.getTime()
  const mins = diff / 60_000
  if (mins < 2) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = hours / 24
  if (days < 2) return 'yesterday'
  if (days < 7) return `${Math.floor(days)}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function lastUserText(session: ChatSession): string {
  const userMessages = session.messages.filter((m) => m.role === 'user')
  const last = userMessages[userMessages.length - 1]
  if (!last) return ''
  for (const block of last.content) {
    if (block.type === 'text' && block.text.trim()) return block.text.trim()
  }
  return ''
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-app-primary-subtle px-0.5 text-inherit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

type SearchRow = {
  id: string
  title: string
  preview: string
  createdAt?: string | number
  updatedAt?: string | number
}

type Props = {
  open: boolean
  sessions: ChatSession[]
  onClose: () => void
  onSelect: (id: string) => void
}

export function SearchModal({ open, sessions, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const [remoteResults, setRemoteResults] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const recentResults: SearchRow[] = [...sessions]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 10)
    .map((session) => ({
      id: session.id,
      title: session.title || UNTITLED_SESSION_TITLE,
      preview: lastUserText(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }))

  const results = query.trim() ? remoteResults : recentResults

  useEffect(() => {
    if (open) {
      setQuery('')
      setFocused(0)
      setRemoteResults([])
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => { setFocused(0) }, [query])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setRemoteResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timeout = window.setTimeout(() => {
      api.get<{ results: SessionSearchResult[] }>(`/sessions/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (cancelled) return
          setRemoteResults((data.results ?? []).map((result) => ({
            id: result.session_id,
            title: result.title || UNTITLED_SESSION_TITLE,
            preview: result.preview ?? '',
            createdAt: result.created_at,
            updatedAt: result.updated_at,
          })))
        })
        .catch(() => {
          if (!cancelled) setRemoteResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [open, query])

  const select = useCallback((id: string) => {
    onSelect(id)
    onClose()
  }, [onSelect, onClose])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocused((f) => Math.min(f + 1, Math.max(results.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocused((f) => Math.max(f - 1, 0))
      } else if (e.key === 'Enter') {
        const s = results[focused]
        if (s) select(s.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, focused, select, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${focused}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/45 pt-[12vh] backdrop-blur-[3px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-[560px] animate-[fade-in_0.15s_ease-out] flex-col overflow-hidden rounded-app-xl border border-app-border bg-app-bg shadow-[0_24px_64px_rgba(0,0,0,0.32)]"
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-app-border-subtle px-3 py-2.5">
          <Search size={15} className="shrink-0 text-app-text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-0 bg-transparent font-app-sans text-[var(--font-size-md)] font-medium text-app-text outline-none placeholder:text-app-text-muted"
            placeholder="Search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {loading ? <Sync size={11} className="animate-spin text-app-text-muted" /> : null}
          <button
            className="flex shrink-0 cursor-pointer items-center rounded-[5px] border border-app-border bg-app-surface px-1.5 py-[3px] text-app-text-muted hover:bg-[var(--surface-hover)]"
            onClick={onClose}
            tabIndex={-1}
            type="button"
          >
            <WindowCloseIcon />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1" ref={listRef}>
          {results.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-[var(--font-size-2xs)] text-app-text-muted">
              {loading ? 'Searching...' : 'No conversations found'}
            </div>
          ) : results.map((result, idx) => {
            const date = relativeDate(result.updatedAt || result.createdAt)
            return (
              <button
                key={result.id}
                data-idx={idx}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-app-md border-0 bg-transparent px-2 py-[7px] text-left transition-colors duration-75 hover:bg-app-surface',
                  idx === focused && 'bg-app-surface outline outline-[1.5px] -outline-offset-1 outline-app-primary',
                )}
                onMouseEnter={() => setFocused(idx)}
                onMouseDown={(e) => { e.preventDefault(); select(result.id) }}
                type="button"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-sm)] font-semibold text-app-text">
                    {highlight(result.title, query)}
                  </span>
                  {result.preview && (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-app-text-muted">
                      {highlight(result.preview.slice(0, 140), query)}
                    </span>
                  )}
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-app-text-muted">{date}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-app-border-subtle px-3 py-2 text-[10px] text-app-text-muted">
          <span><kbd className="rounded-[5px] border border-app-border bg-app-surface px-1 py-0.5 font-mono">up/down</kbd> navigate</span>
          <span><kbd className="rounded-[5px] border border-app-border bg-app-surface px-1 py-0.5 font-mono">Enter</kbd> open</span>
          <span><kbd className="rounded-[5px] border border-app-border bg-app-surface px-1 py-0.5 font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
