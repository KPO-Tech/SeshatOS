import { useState } from 'react'
import { SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import type { EnvVarDef } from './environmentTypes'

export function EnvVarRow({
  def,
  configured,
  onChanged
}: {
  def: EnvVarDef
  configured: boolean
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(!configured)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!value.trim()) return
    setSaving(true)
    try {
      await window.nexus?.envVars?.set(def.key, value.trim())
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
      await window.nexus?.envVars?.delete(def.key)
      setValue('')
      setEditing(true)
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-[12px] font-semibold text-[var(--text-primary)]">{def.key}</code>
          {configured && <StatusPill tone="ok">Configured</StatusPill>}
        </div>
        <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          {def.description}
          {def.helpUrl && (
            <button type="button" onClick={() => void window.nexus?.openExternal(def.helpUrl!)} className="ml-1 font-semibold text-[var(--accent-primary)] hover:underline">
              Get one
            </button>
          )}
        </p>
      </div>

      {configured && !editing ? (
        <div className="flex shrink-0 items-center gap-2">
          <SoftButton onClick={() => setEditing(true)}>Change</SoftButton>
          <SoftButton tone="danger" onClick={() => void remove()} disabled={saving}>Remove</SoftButton>
        </div>
      ) : (
        <div className="flex min-w-[330px] shrink-0 items-center gap-2">
          <TextInput type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder={def.label} className="flex-1" />
          <SoftButton tone="primary" onClick={() => void save()} disabled={saving || !value.trim()}>{saving ? 'Saving...' : 'Save'}</SoftButton>
          {configured && <SoftButton onClick={() => { setEditing(false); setValue('') }} disabled={saving}>Cancel</SoftButton>}
        </div>
      )}
    </div>
  )
}
