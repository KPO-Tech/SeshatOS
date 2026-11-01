import { useCallback, useEffect, useState } from 'react'
import { fetchDocumentsSnapshot, type DocumentsSnapshot } from '../knowledge/knowledgeApi'
import type { SystemStatus } from '../knowledge/knowledgeTypes'
import { DocumentsOverview } from './DocumentsOverview'
import { LocalOcrPanel } from './LocalOcrPanel'
import { useDocumentReader } from './useDocumentReader'

const emptySnapshot: DocumentsSnapshot = { documentReader: null, system: null }

type Tab = 'overview' | 'ocr'
const TABS: Array<{ id: Tab; label: string }> = [
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

  if (loading) return <div className="text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)]">
        <div role="tablist" className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-4 py-2.5 text-[13px] font-medium ${tab === item.id ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          {reader.saveError && <span className="text-[12px] text-[var(--accent-danger)]">{reader.saveError}</span>}
          <button
            type="button"
            disabled={!reader.dirty || reader.saving}
            onClick={() => void reader.save()}
            className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-45"
          >
            {reader.saving ? 'Saving...' : reader.dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}

      <div className="mt-4 min-w-0">{tab === 'overview' ? <DocumentsOverview reader={reader} /> : <LocalOcrPanel reader={reader} />}</div>
    </div>
  )
}
