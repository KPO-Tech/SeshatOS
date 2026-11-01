import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Plus, Right } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useDeviceMode } from '../useCanManage'
import { AddSourceDialog } from './AddSourceDialog'
import { plural } from './fileStatus'
import { SourceIcon } from './SourceIcon'
import { DEFAULT_SOURCE_ID, sourcePath } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full bg-[var(--surface-muted)] px-2.5 text-[11.5px] font-medium text-[var(--text-secondary)]">{children}</span>
}

type SourceCardProps = { icon: React.ReactNode; title: string; detail: string; collections: number; documents: number; onOpen: () => void }

function SourceCard({ icon, title, detail, collections, documents, onOpen }: SourceCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex cursor-pointer flex-col items-stretch gap-4 rounded-2xl border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-4 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-primary)_40%,var(--border-soft))] hover:shadow-[0_10px_26px_rgba(31,27,23,0.08)]"
    >
      <span className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</span>
        <span className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
          <Right size={16} />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[var(--text-muted)]" title={detail}>
          {detail}
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        <Pill>{plural(collections, 'collection', 'collections')}</Pill>
        {documents > 0 && <Pill>{plural(documents, 'document', 'documents')}</Pill>}
      </span>
    </button>
  )
}

// The root of Collections: the places collections come from. The collections themselves are inside each source.
export function CollectionsPage() {
  const navigate = useNavigate()
  const { collections, sources, loading, failed, reload } = useCollectionList()
  const deviceMode = useDeviceMode()
  const [addingSource, setAddingSource] = useState(false)
  // Folder sources are kept on this computer: a device connected to an organization takes its collections from the organization's server.
  const canAddSource = deviceMode === 'standalone'

  // The collections made in the app have no source id: it is the default source, as on the page of a source.
  const inSource = (sourceId: string) => collections.filter((c) => c.sourceId === (sourceId === DEFAULT_SOURCE_ID ? '' : sourceId))
  const documentsIn = (sourceId: string) => inSource(sourceId).reduce((total, c) => total + (c.fileCount ?? 0), 0)
  const totalDocuments = collections.reduce((total, c) => total + (c.fileCount ?? 0), 0)

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
              <FolderOpen theme="filled" size={24} fill="currentColor" />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
                Collections
              </h1>
              {!loading && !failed && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Pill>{plural(sources.length + 1, 'source', 'sources')}</Pill>
                  <Pill>{plural(collections.length, 'collection', 'collections')}</Pill>
                  {totalDocuments > 0 && <Pill>{plural(totalDocuments, 'document', 'documents')}</Pill>}
                </div>
              )}
            </div>
          </div>
          {canAddSource && (
            <button
              type="button"
              onClick={() => setAddingSource(true)}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <Plus size={14} />
              Add source
            </button>
          )}
        </div>

        {failed && (
          <p className="mb-0 mt-8 text-[13px] text-[var(--accent-danger)]" role="alert">
            The collections could not be read.
          </p>
        )}

        {!loading && !failed && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SourceCard
              icon={<SeshatLogo size={20} />}
              title="Seshat"
              detail="Made in the app"
              collections={inSource(DEFAULT_SOURCE_ID).length}
              documents={documentsIn(DEFAULT_SOURCE_ID)}
              onOpen={() => navigate(sourcePath(DEFAULT_SOURCE_ID))}
            />
            {sources.map((source) => (
              <SourceCard key={source.id} icon={<SourceIcon icon={source.icon} />} title={source.name} detail={source.root} collections={inSource(source.id).length} documents={documentsIn(source.id)} onOpen={() => navigate(sourcePath(source.id))} />
            ))}
          </div>
        )}
      </div>

      {addingSource && (
        <AddSourceDialog
          onClose={() => setAddingSource(false)}
          onAdded={async () => {
            setAddingSource(false)
            await reload()
          }}
        />
      )}
    </div>
  )
}
