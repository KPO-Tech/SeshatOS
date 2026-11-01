import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { UserPreferences } from '@renderer/api/types'
import { ActionButton, Chip, Notice, SelectField, SettingRow, SettingsCard, SettingsPage, StatusBadge, Toggle } from './kit'

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
  const [autoMemory, setAutoMemory] = useState(false)
  const [autoMemoryBusy, setAutoMemoryBusy] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<UserPreferences>('/users/me/preferences')
      .then((prefs) => {
        if (!cancelled) setAutoMemory(prefs.memory_enabled === true)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAutoMemoryBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAutoMemory(enabled: boolean) {
    if (autoMemoryBusy) return
    setAutoMemoryBusy(true)
    setError(null)
    try {
      // The save replaces the whole record, so send back what is stored with only this choice changed.
      const current = await api.get<UserPreferences>('/users/me/preferences')
      const saved = await api.put<UserPreferences>('/users/me/preferences', { ...current, memory_enabled: enabled })
      setAutoMemory(saved.memory_enabled === true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the memory setting')
    } finally {
      setAutoMemoryBusy(false)
    }
  }

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

  const typeOptions = memoryTypes.filter((type) => type !== 'all').map((type) => ({ value: type, label: memoryTypeLabel(type) }))
  const filterOptions = memoryTypes.map((type) => ({ value: type, label: `${memoryTypeLabel(type)} (${type === 'all' ? memories.length : memories.filter((memory) => memory.type === type).length})` }))

  return (
    <SettingsPage id="memories" badge={<StatusBadge tone={autoMemory ? 'ok' : 'muted'}>{autoMemory ? 'Learning' : 'Manual only'}</StatusBadge>}>
      {error && <Notice tone="error">{error}</Notice>}

      <SettingsCard>
        <SettingRow title="Learn from my conversations" hint="Off by default. What you add below is always used.">
          <Toggle label="Learn from my conversations" enabled={autoMemory} onChange={(enabled) => void handleAutoMemory(enabled)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Add a memory" padded>
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <div className="w-[150px] shrink-0">
              <SelectField value={form.type} options={typeOptions} onChange={(value) => setForm((current) => ({ ...current, type: value }))} />
            </div>
            <div className="min-w-0 flex-1">
              <input
                value={form.key}
                aria-label="Memory"
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                onKeyDown={(event) => event.key === 'Enter' && void handleCreate()}
                placeholder="Prefers concise summaries"
                className="h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
              />
            </div>
            <ActionButton type="button" tone="primary" onClick={() => void handleCreate()} disabled={!canSave || saving}>
              {saving ? 'Saving...' : 'Add'}
            </ActionButton>
          </div>
          <input
            value={form.value}
            aria-label="Details"
            onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
            placeholder="Details (optional)"
            className="h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Your memories"
        action={
          <div className="w-[170px]">
            <SelectField value={filter} options={filterOptions} onChange={setFilter} />
          </div>
        }
      >
        {!loading && shown.length === 0 && <SettingRow title="No memories yet" hint="What you add above is used in every chat." />}
        {shown.map((memory) => (
          <SettingRow key={memory.id} title={memory.key} hint={memory.value || undefined}>
            <Chip>{memoryTypeLabel(memory.type)}</Chip>
            <span className="text-[11.5px] text-[var(--text-muted)]">{formatMemoryDate(memory.updated_at || memory.created_at)}</span>
            <ActionButton type="button" tone="danger" onClick={() => void handleDelete(memory.id)} disabled={deletingId === memory.id}>
              {deletingId === memory.id ? '...' : 'Delete'}
            </ActionButton>
          </SettingRow>
        ))}
      </SettingsCard>
    </SettingsPage>
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
