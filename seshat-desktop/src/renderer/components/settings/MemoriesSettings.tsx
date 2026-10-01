import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import { Panel } from './SettingsPrimitives'

type UserMemory = {
  id: string
  type: string
  key: string
  value: string
  importance: number
  source?: string
  created_at: number
  updated_at: number
}

const memoryTypes = ['all', 'preference', 'instruction', 'pattern', 'fact', 'context']

const emptyMemoryForm = {
  type: 'fact',
  key: '',
  value: '',
  source: 'manual',
  importance: 0.5
}

export function MemoriesSettings() {
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(emptyMemoryForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get<{ memories: UserMemory[]; count: number }>('/memories')
      .then((data) => {
        if (!cancelled) setMemories(data.memories ?? [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load memories')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = filter === 'all' ? memories : memories.filter((memory) => memory.type === filter)
  const canSave = form.key.trim().length > 0 || form.value.trim().length > 0

  async function handleCreate() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.post<UserMemory>('/memories', form)
      setMemories((current) => [created, ...current])
      setForm(emptyMemoryForm)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return
    setDeletingId(id)
    setError(null)
    try {
      await api.delete(`/memories/${id}`)
      setMemories((current) => current.filter((memory) => memory.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete memory')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Panel title="Memories">
      <div className="max-w-[860px] space-y-5">
        <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">Type</span>
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] font-semibold text-[var(--text-primary)] outline-none"
              >
                {memoryTypes.filter((type) => type !== 'all').map((type) => (
                  <option key={type} value={type}>{memoryTypeLabel(type)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">Memory</span>
              <input
                value={form.key}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="e.g. Prefers concise implementation summaries"
                className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex items-end gap-3">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">Details</span>
              <textarea
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                rows={3}
                placeholder="Optional detail Seshat can reuse later."
                className="resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[13px] leading-[var(--leading-copy)] text-[var(--text-primary)] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!canSave || saving}
              className="h-9 rounded-md bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-[var(--surface-root)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-[var(--accent-danger)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {memoryTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={[
                'h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors',
                filter === type
                  ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                  : 'border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              ].join(' ')}
            >
              {memoryTypeLabel(type)} ({type === 'all' ? memories.length : memories.filter((memory) => memory.type === type).length})
            </button>
          ))}
        </div>

        <section className="overflow-hidden rounded-lg border border-[var(--border-soft)]">
          {loading ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">Loading memories...</div>
          ) : shown.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">No memories yet.</div>
          ) : (
            shown.map((memory) => (
              <div key={memory.id} className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                      {memoryTypeLabel(memory.type)}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{formatMemoryDate(memory.updated_at || memory.created_at)}</span>
                  </div>
                  <div className="mt-2 text-[13px] font-semibold text-[var(--text-primary)]">{memory.key}</div>
                  {memory.value && <div className="mt-1 line-clamp-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{memory.value}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(memory.id)}
                  className="rounded-md border border-[var(--border-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent-danger)] hover:text-[var(--accent-danger)]"
                >
                  {deletingId === memory.id ? '...' : 'Delete'}
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </Panel>
  )
}

function memoryTypeLabel(type: string) {
  if (type === 'all') return 'All'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function formatMemoryDate(value: number) {
  if (!value) return ''
  return new Date(value * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
