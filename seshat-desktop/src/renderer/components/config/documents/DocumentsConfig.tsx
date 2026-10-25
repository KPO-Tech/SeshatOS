import { useCallback, useEffect, useState } from 'react'
import { DocumentReaderCard } from '../knowledge/DocumentReaderCard'
import { fetchDocumentsSnapshot, type DocumentsSnapshot } from '../knowledge/knowledgeApi'
import type { SystemStatus } from '../knowledge/knowledgeTypes'

const emptySnapshot: DocumentsSnapshot = { documentReader: null, system: null }

// How SeshatOS reads documents: the reading of scanned pages on this computer (its models and the languages it reads), and a document
// server to use instead. It is the card of the Knowledge section, shown on its own because reading a scan is not only for knowledge
// bases: the chat and the attachments use the same reader.
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

  return (
    <div className="grid gap-4">
      {loading && <div className="text-[12px] font-semibold text-[var(--text-muted)]">Loading...</div>}

      {error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      {!loading && (
        <DocumentReaderCard
          config={snapshot.documentReader}
          system={snapshot.system}
          onSaved={(documentReader) => setSnapshot((current) => ({ ...current, documentReader }))}
          onSystemChanged={(system) =>
            setSnapshot((current) => ({
              ...current,
              system: current.system ? { ...current.system, ...system } : ({ mode: 'standalone', ...system } as SystemStatus)
            }))
          }
        />
      )}
    </div>
  )
}
