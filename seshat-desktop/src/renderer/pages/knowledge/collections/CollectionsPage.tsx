import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Plus } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useDeviceMode } from '../useCanManage'
import { AddSourceDialog } from './AddSourceDialog'
import { plural } from './fileStatus'
import { DEFAULT_SOURCE_ID, sourcePath } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

function SourceCard({ icon, title, detail, count, onOpen }: { icon: React.ReactNode; title: string; detail: string; count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex cursor-pointer flex-col items-start gap-3 rounded-2xl border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-4 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-primary)_40%,var(--border-soft))] hover:shadow-[0_10px_26px_rgba(31,27,23,0.08)]"
    >
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</span>
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-[14.5px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-1 line-clamp-2 min-h-[38px] break-all text-[12.5px] leading-[19px] text-[var(--text-muted)]">{detail}</span>
      </span>
      <span className="text-[12px] text-[var(--text-muted)]">{plural(count, 'collection', 'collections')}</span>
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

  const countIn = (sourceId: string) => collections.filter((c) => c.sourceId === sourceId).length

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <div className="flex items-end justify-between gap-4">
          <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
            Collections
          </h1>
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
              detail="The collections made and filled in the app."
              count={countIn(DEFAULT_SOURCE_ID)}
              onOpen={() => navigate(sourcePath(DEFAULT_SOURCE_ID))}
            />
            {sources.map((source) => (
              <SourceCard key={source.id} icon={<FolderOpen size={18} />} title={source.name} detail={source.root} count={countIn(source.id)} onOpen={() => navigate(sourcePath(source.id))} />
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
