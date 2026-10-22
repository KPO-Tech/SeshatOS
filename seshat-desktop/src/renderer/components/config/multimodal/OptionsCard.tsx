import { useEffect, useId, useState } from 'react'
import { ConfigCard, CustomSelect, Field, SoftButton, TextInput } from '../knowledge/KnowledgePrimitives'
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

function Suggestions({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  )
}

// A card of named choices of a capability (a model, a voice, a format) saved together. An empty field keeps the provider default.
export function OptionsCard({
  title,
  description,
  options,
  saved,
  loading,
  onSave
}: {
  title: string
  description: string
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
    <ConfigCard title={title} description={description}>
      <div className="grid gap-4">
        {options.map((option) => (
          <Field key={option.name} label={option.label}>
            {option.choices ? (
              <CustomSelect
                value={form[option.name] || DEFAULT_CHOICE}
                options={[{ value: DEFAULT_CHOICE, label: 'Provider default' }, ...option.choices]}
                onChange={(value) => update(option.name, value === DEFAULT_CHOICE ? '' : value)}
              />
            ) : (
              <>
                <TextInput
                  value={form[option.name] ?? ''}
                  onChange={(event) => update(option.name, event.target.value)}
                  placeholder={option.placeholder}
                  list={option.suggestions ? `${listId}-${option.name}` : undefined}
                  disabled={loading}
                />
                {option.suggestions && <Suggestions id={`${listId}-${option.name}`} values={option.suggestions} />}
              </>
            )}
            <div className="mt-1 text-[12px] leading-4 text-[var(--text-muted)]">{option.hint}</div>
          </Field>
        ))}

        {error && (
          <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <SoftButton type="button" tone={dirty ? 'primary' : 'success'} onClick={() => void submit()} disabled={!dirty || saving}>
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}
