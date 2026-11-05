import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { api } from '@renderer/api/client'
import type { UserPreferences } from '@renderer/api/types'
import { currentLanguage } from '@renderer/i18n'
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
  const { t } = useTranslation('settings')
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
      setError(err instanceof Error ? err.message : t('memories.errors.saveSetting'))
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
        if (!cancelled) setError(err instanceof Error ? err.message : t('memories.errors.load'))
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
      setError(err instanceof Error ? err.message : t('memories.errors.save'))
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
      setError(err instanceof Error ? err.message : t('memories.errors.delete'))
    } finally {
      setDeletingId(null)
    }
  }

  const typeOptions = memoryTypes.filter((type) => type !== 'all').map((type) => ({ value: type, label: memoryTypeLabel(type, t) }))
  const filterOptions = memoryTypes.map((type) => ({ value: type, label: t('memories.filterOption', { type: memoryTypeLabel(type, t), count: type === 'all' ? memories.length : memories.filter((memory) => memory.type === type).length }) }))

  return (
    <SettingsPage id="memories" badge={<StatusBadge tone={autoMemory ? 'ok' : 'muted'}>{autoMemory ? t('memories.learning') : t('memories.manualOnly')}</StatusBadge>}>
      {error && <Notice tone="error">{error}</Notice>}

      <SettingsCard>
        <SettingRow title={t('memories.learnTitle')} hint={t('memories.learnHint')}>
          <Toggle label={t('memories.learnTitle')} enabled={autoMemory} onChange={(enabled) => void handleAutoMemory(enabled)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={t('memories.addCard')} padded>
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <div className="w-[150px] shrink-0">
              <SelectField value={form.type} options={typeOptions} onChange={(value) => setForm((current) => ({ ...current, type: value }))} />
            </div>
            <div className="min-w-0 flex-1">
              <input
                value={form.key}
                aria-label={t('memories.memoryAria')}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                onKeyDown={(event) => event.key === 'Enter' && void handleCreate()}
                placeholder={t('memories.memoryPlaceholder')}
                className="h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
              />
            </div>
            <ActionButton type="button" tone="primary" onClick={() => void handleCreate()} disabled={!canSave || saving}>
              {saving ? t('memories.saving') : t('memories.add')}
            </ActionButton>
          </div>
          <input
            value={form.value}
            aria-label={t('memories.detailsAria')}
            onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
            placeholder={t('memories.detailsPlaceholder')}
            className="h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('memories.yourMemories')}
        action={
          <div className="w-[170px]">
            <SelectField value={filter} options={filterOptions} onChange={setFilter} />
          </div>
        }
      >
        {!loading && shown.length === 0 && <SettingRow title={t('memories.none')} hint={t('memories.noneHint')} />}
        {shown.map((memory) => (
          <SettingRow key={memory.id} title={memory.key} hint={memory.value || undefined}>
            <Chip>{memoryTypeLabel(memory.type, t)}</Chip>
            <span className="text-[11.5px] text-[var(--text-muted)]">{formatMemoryDate(memory.updated_at || memory.created_at)}</span>
            <ActionButton type="button" tone="danger" onClick={() => void handleDelete(memory.id)} disabled={deletingId === memory.id}>
              {deletingId === memory.id ? '...' : t('memories.delete')}
            </ActionButton>
          </SettingRow>
        ))}
      </SettingsCard>
    </SettingsPage>
  )
}

// The types are what the server stores; only their names are translated, and one the server adds later is shown as it came.
const MEMORY_TYPE_KEYS: Record<string, string> = {
  all: 'settings:memories.types.all',
  preference: 'settings:memories.types.preference',
  instruction: 'settings:memories.types.instruction',
  pattern: 'settings:memories.types.pattern',
  fact: 'settings:memories.types.fact',
  context: 'settings:memories.types.context'
}

function memoryTypeLabel(type: string, t: TFunction) {
  const key = MEMORY_TYPE_KEYS[type]
  return key ? t(key) : type.charAt(0).toUpperCase() + type.slice(1)
}

function formatMemoryDate(value: number) {
  if (!value) return ''
  return new Date(value * 1000).toLocaleDateString(currentLanguage(), { month: 'short', day: 'numeric' })
}
