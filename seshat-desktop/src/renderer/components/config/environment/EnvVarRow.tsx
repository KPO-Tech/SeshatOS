import { useState } from 'react'
import { ActionButton, SettingRow, StatusBadge, TextField } from '../../settings/kit'
import type { EnvVarDef } from './environmentTypes'

export function EnvVarRow({ def, configured, onChanged }: { def: EnvVarDef; configured: boolean; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(!configured)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!value.trim()) return
    setSaving(true)
    try {
      await window.seshat?.envVars?.set(def.key, value.trim())
      setValue('')
      setEditing(false)
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await window.seshat?.envVars?.delete(def.key)
      setValue('')
      setEditing(true)
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingRow title={def.label || def.key} hint={def.key}>
      {configured && !editing ? (
        <>
          <StatusBadge tone="ok">Set</StatusBadge>
          <ActionButton onClick={() => setEditing(true)}>Change</ActionButton>
          <ActionButton tone="danger" onClick={() => void remove()} disabled={saving}>
            Remove
          </ActionButton>
        </>
      ) : (
        <>
          {def.helpUrl && (
            <button type="button" onClick={() => void window.seshat?.openExternal(def.helpUrl!)} className="cursor-pointer border-0 bg-transparent text-[12px] font-semibold text-[var(--accent-primary)] hover:underline">
              Get one
            </button>
          )}
          <TextField label={def.label || def.key} type="password" value={value} onChange={setValue} placeholder="Value" width={220} />
          <ActionButton tone="primary" onClick={() => void save()} disabled={saving || !value.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </ActionButton>
          {configured && (
            <ActionButton
              onClick={() => {
                setEditing(false)
                setValue('')
              }}
              disabled={saving}
            >
              Cancel
            </ActionButton>
          )}
        </>
      )}
    </SettingRow>
  )
}
