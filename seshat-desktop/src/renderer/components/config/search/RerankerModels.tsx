import { useCallback, useEffect, useState } from 'react'
import { ActionButton, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import { listRerankerSetups, removeRerankerSetup, useRerankerSetup } from '@renderer/components/config/knowledge/knowledgeApi'
import type { RerankerModel } from '@renderer/components/config/knowledge/knowledgeTypes'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// The rerank models the person has set up, to pick the one the search uses. Nothing shows until there is one.
export function RerankerModels({ version, onChanged }: { version: string; onChanged: () => void }) {
  const [models, setModels] = useState<RerankerModel[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listRerankerSetups()
      .then((result) => setModels(result.models ?? []))
      .catch(() => setModels([]))
  }, [])

  // Read again when the configuration changes: a model saved in the form below joins the list.
  useEffect(load, [load, version])

  async function run(id: string, action: () => Promise<{ models: RerankerModel[] }>) {
    setBusy(id)
    setError(null)
    try {
      setModels((await action()).models ?? [])
      onChanged()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  if (models.length === 0) return null

  return (
    <SettingsCard title="Your rerank models">
      {error && <div className="px-4 py-3 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
      {models.map((item) => (
        <SettingRow key={item.id} title={item.model || 'Default model'} hint={hostOf(item.base_url)}>
          {item.active ? (
            <StatusBadge tone="ok">In use</StatusBadge>
          ) : (
            <ActionButton type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => useRerankerSetup(item.id))}>
              Use
            </ActionButton>
          )}
          <ActionButton type="button" tone="danger" disabled={busy === item.id} aria-label={`Forget ${item.model}`} onClick={() => void run(item.id, () => removeRerankerSetup(item.id))}>
            Forget
          </ActionButton>
        </SettingRow>
      ))}
    </SettingsCard>
  )
}
