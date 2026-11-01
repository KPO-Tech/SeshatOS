import { useEffect, useId, useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard } from '../../settings/kit'
import type { CapabilityOptionValues } from './capabilityOptions'

export type OptionDefinition = {
  name: string
  label: string
  hint: string
  placeholder: string
  // A fixed list the choice is made from; without one the field takes any name, with the suggestions offered.
  choices?: ReadonlyArray<{ value: string; label: string }>
  suggestions?: readonly string[]
}

const DEFAULT_CHOICE = '__default__'

// A card of named choices of a capability (a model, a voice, a format) saved together. An empty field keeps the provider default.
export function OptionsCard({
  title,
  options,
  saved,
  loading,
  onSave
}: {
  title: string
  options: readonly OptionDefinition[]
  /** Everything saved for the capability: a card saves its own names without touching another card's. */
  saved: CapabilityOptionValues
  loading: boolean
  onSave: (all: CapabilityOptionValues) => Promise<void>
}) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()

  useEffect(() => {
    setForm(Object.fromEntries(options.map((option) => [option.name, saved[option.name] ?? ''])))
    setDirty(false)
  }, [saved, options])

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
    setDirty(true)
  }

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      // The other names of the capability (another card's) are kept: a save replaces them all.
      const names = new Set(options.map((option) => option.name))
      const kept = Object.fromEntries(Object.entries(saved).filter(([name]) => !names.has(name)))
      await onSave({ ...kept, ...form })
      setDirty(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save these settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard
        title={title}
        action={
          <ActionButton type="button" tone={dirty ? 'primary' : 'default'} onClick={() => void submit()} disabled={!dirty || saving}>
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </ActionButton>
        }
      >
        {options.map((option) => (
          <SettingRow key={option.name} title={option.label} hint={option.hint}>
            {option.choices ? (
              <div className="w-[210px]">
                <SelectField
                  value={form[option.name] || DEFAULT_CHOICE}
                  options={[{ value: DEFAULT_CHOICE, label: 'Provider default' }, ...option.choices]}
                  onChange={(value) => update(option.name, value === DEFAULT_CHOICE ? '' : value)}
                />
              </div>
            ) : (
              <>
                <input
                  value={form[option.name] ?? ''}
                  aria-label={option.label}
                  onChange={(event) => update(option.name, event.target.value)}
                  placeholder={option.placeholder}
                  list={option.suggestions ? `${listId}-${option.name}` : undefined}
                  disabled={loading}
                  style={{ width: 240 }}
                  className="h-9 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
                />
                {option.suggestions && (
                  <datalist id={`${listId}-${option.name}`}>
                    {option.suggestions.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </SettingRow>
        ))}
      </SettingsCard>
    </>
  )
}
