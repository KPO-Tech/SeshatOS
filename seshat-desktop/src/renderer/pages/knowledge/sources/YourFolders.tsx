import { useNavigate } from 'react-router'
import { SourceIconPicker } from '../collections/SourceIcon'
import { plural } from '../collections/fileStatus'
import { removeSource, sourcePath, updateSource, type KnowledgeSource } from '../collections/sourcesApi'

const BUTTON = 'flex h-9 flex-1 cursor-pointer items-center justify-center rounded-xl border text-[13px] font-medium'

type Props = {
  sources: KnowledgeSource[]
  onAnalyse: (source: KnowledgeSource) => void
  onChanged: () => Promise<void>
  onError: (message: string) => void
}

/** The folders of this computer added as sources: their icon, what they hold, and what is done with them (open, analyse, remove). */
export function YourFolders({ sources, onAnalyse, onChanged, onError }: Props) {
  const navigate = useNavigate()

  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action()
      await onChanged()
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : failure)
    }
  }

  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-2.5">
      {sources.map((source) => {
        const empty = source.collectionCount === 0
        return (
          <div key={source.id} className="flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
            <div className="flex items-start gap-3">
              <SourceIconPicker value={source.icon} onChange={(icon) => void run(() => updateSource(source.id, { icon }), 'The icon could not be changed.')} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{source.name}</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{empty ? 'Not analysed yet' : plural(source.collectionCount, 'collection', 'collections')}</div>
              </div>
              {empty && (
                <button
                  type="button"
                  onClick={() => void run(() => removeSource(source.id), 'The source could not be removed.')}
                  title="Remove this source. No file is touched."
                  className="h-7 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-2.5 text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="m-0 mt-3 line-clamp-2 break-all text-[12px] leading-[18px] text-[var(--text-muted)]" title={source.root}>
              {source.root}
            </p>
            <div className="mt-3 flex gap-2">
              {!empty && (
                <button type="button" onClick={() => navigate(sourcePath(source.id))} className={`${BUTTON} border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]`}>
                  Collections
                </button>
              )}
              <button
                type="button"
                onClick={() => onAnalyse(source)}
                className={`${BUTTON} ${empty ? 'border-transparent bg-[var(--accent-primary)] text-white hover:opacity-90' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
              >
                {empty ? 'Analyse' : 'Analyse again'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
