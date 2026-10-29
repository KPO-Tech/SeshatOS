import { useCallback, useEffect, useState } from 'react'
import { SoftButton, StatusPill } from '@renderer/components/config/knowledge/KnowledgePrimitives'
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
    <div className="grid gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Your rerank models</div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {models.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-md border border-[var(--border-soft)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.model || 'Default model'}</div>
              <div className="truncate text-[11.5px] text-[var(--text-muted)]">{hostOf(item.base_url)}</div>
            </div>
            {item.active ? (
              <StatusPill tone="ok">In use</StatusPill>
            ) : (
              <SoftButton type="button" className="!h-7" disabled={busy === item.id} onClick={() => void run(item.id, () => useRerankerSetup(item.id))}>
                Use
              </SoftButton>
            )}
            <SoftButton type="button" tone="danger" className="!h-7" disabled={busy === item.id} aria-label={`Forget ${item.model}`} onClick={() => void run(item.id, () => removeRerankerSetup(item.id))}>
              Forget
            </SoftButton>
          </li>
        ))}
      </ul>
      {error && <div className="text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
    </div>
  )
}
