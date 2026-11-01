import { useCallback, useEffect, useState } from 'react'
import { ActionButton, SettingsPage, SettingsTabs, StatusBadge, type SettingsTab } from '../../settings/kit'
import { fetchDocumentsSnapshot, type DocumentsSnapshot } from '../knowledge/knowledgeApi'
import type { SystemStatus } from '../knowledge/knowledgeTypes'
import { DocumentsOverview } from './DocumentsOverview'
import { LocalOcrPanel } from './LocalOcrPanel'
import { useDocumentReader } from './useDocumentReader'

const emptySnapshot: DocumentsSnapshot = { documentReader: null, system: null }

type Tab = 'overview' | 'ocr'
const TABS: Array<SettingsTab<Tab>> = [
  { id: 'overview', label: 'Overview' },
  { id: 'ocr', label: 'Scanned pages' }
]

/** How SeshatOS reads documents: which reader goes first and what each can do, and the reading of scanned pages on this computer. */
export function DocumentsConfig() {
  const [snapshot, setSnapshot] = useState<DocumentsSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSnapshot(await fetchDocumentsSnapshot())
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load the document settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <SettingsPage id="documents">{null}</SettingsPage>

  return (
    <Loaded
      snapshot={snapshot}
      error={error}
      onSaved={(documentReader) => setSnapshot((current) => ({ ...current, documentReader }))}
      onSystemChanged={(system) =>
        setSnapshot((current) => ({
          ...current,
          system: current.system ? { ...current.system, ...system } : ({ mode: 'standalone', ...system } as SystemStatus)
        }))
      }
    />
  )
}

function Loaded({ snapshot, error, onSaved, onSystemChanged }: { snapshot: DocumentsSnapshot; error: string | null; onSaved: Parameters<typeof useDocumentReader>[0]['onSaved']; onSystemChanged: (system: Partial<SystemStatus>) => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const reader = useDocumentReader({ config: snapshot.documentReader, system: snapshot.system, onSaved, onSystemChanged })
  const message = error || reader.saveError

  return (
    <SettingsPage
      id="documents"
      badge={reader.form.enabled ? <StatusBadge tone="ok">On</StatusBadge> : <StatusBadge tone="muted">Off</StatusBadge>}
      tabs={<SettingsTabs tabs={TABS} value={tab} onChange={setTab} />}
      actions={
        <>
          {reader.dirty && <span className="text-[12px] text-[var(--text-muted)]">Unsaved changes</span>}
          <ActionButton type="button" tone={reader.dirty ? 'primary' : 'default'} disabled={!reader.dirty || reader.saving} onClick={() => void reader.save()}>
            {reader.saving ? 'Saving...' : reader.dirty ? 'Save changes' : 'Saved'}
          </ActionButton>
        </>
      }
    >
      {message && <div className="rounded-xl border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{message}</div>}
      {tab === 'overview' ? <DocumentsOverview reader={reader} /> : <LocalOcrPanel reader={reader} />}
    </SettingsPage>
  )
}
