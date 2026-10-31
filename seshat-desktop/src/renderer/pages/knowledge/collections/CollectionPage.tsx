import { useRef, useState, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Delete, Edit, Left, Upload } from '@icon-park/react'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { CollectionDialog } from './CollectionDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { addDocument, deleteCollection, indexCollection, removeDocument, retryIndexing, updateCollection, type CollectionFile } from './collectionsApi'
import { DocumentRow } from './DocumentRow'
import { DocumentToolbar } from './DocumentToolbar'
import { arrange, DEFAULT_VIEW, failedFiles, type DocumentView } from './documentOrder'
import { openDocument } from './openDocument'
import { fileState, plural } from './fileStatus'
import { IndexingNotice } from './IndexingNotice'
import { DEFAULT_SOURCE_ID, sourcePath } from './sourcesApi'
import { useCollectionDetail } from './useCollectionDetail'

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

export function CollectionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { collection, files, jobOf, indexingConfigured, loading, failed, reload } = useCollectionDetail(id)
  const { toasts, show } = useToast()
  const [renaming, setRenaming] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<DocumentView>(DEFAULT_VIEW)
  const [retryingAll, setRetryingAll] = useState(false)
  const [confirming, setConfirming] = useState<{ title: string; message: string; label: string; run: () => Promise<void> } | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  // Back to the source the collection is in.
  const back = () => navigate(sourcePath(collection?.sourceId || DEFAULT_SOURCE_ID))

  async function add(list: File[]) {
    for (const file of list) {
      setUploading((names) => [...names, file.name])
      try {
        await addDocument(id, file)
      } catch (error) {
        show(`${file.name}: ${message(error, 'could not be added')}`, 'err')
      } finally {
        setUploading((names) => names.filter((name, index) => index !== names.indexOf(file.name)))
        await reload()
      }
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void add(Array.from(event.dataTransfer.files))
  }

  function askRemove(fileId: string, name: string) {
    setConfirming({ title: 'Remove the document', message: `${name} will be removed from this collection and no longer used to answer.`, label: 'Remove', run: () => remove(fileId) })
  }

  async function indexWaiting() {
    setIndexing(true)
    try {
      const queued = await indexCollection(id)
      show(queued === 0 ? 'Nothing is waiting to be indexed' : `${plural(queued, 'document', 'documents')} queued for indexing`, 'ok')
      await reload()
    } catch (error) {
      show(message(error, 'The indexing could not be started'), 'err')
    } finally {
      setIndexing(false)
    }
  }

  async function read(file: CollectionFile) {
    try {
      if (!(await openDocument(file, id))) show(`There is no preview for this kind of file yet: ${file.name}`, 'err')
    } catch (error) {
      show(message(error, 'The document could not be opened'), 'err')
    }
  }

  async function remove(fileId: string) {
    try {
      await removeDocument(id, fileId)
      await reload()
    } catch (error) {
      show(message(error, 'The document could not be removed'), 'err')
    }
  }

  async function retry(fileId: string) {
    try {
      await retryIndexing(id, fileId, jobOf(fileId))
      await reload()
    } catch (error) {
      show(message(error, 'Indexing could not be started'), 'err')
    }
  }

  // Every failed document is started again, one after the other: the queue runs them in order anyway.
  async function retryFailed() {
    setRetryingAll(true)
    let started = 0
    let refused = 0
    try {
      for (const file of failedFiles(files, (item) => fileState(item, jobOf(item.fileId)))) {
        try {
          await retryIndexing(id, file.fileId, jobOf(file.fileId))
          started += 1
        } catch {
          refused += 1
        }
      }
      show(refused === 0 ? `${plural(started, 'document', 'documents')} started again` : `${started} started again, ${refused} could not be started`, refused === 0 ? 'ok' : 'err')
      await reload()
    } finally {
      setRetryingAll(false)
    }
  }

  function askRemoveCollection() {
    if (!collection) return
    setConfirming({
      title: 'Delete the collection',
      message: `${collection.name} and its ${plural(files.length, 'document', 'documents')} will be deleted. This cannot be undone.`,
      label: 'Delete',
      run: removeCollection
    })
  }

  async function removeCollection() {
    try {
      await deleteCollection(id)
      back()
    } catch (error) {
      show(message(error, 'The collection could not be deleted'), 'err')
    }
  }

  async function rename(name: string, description: string) {
    await updateCollection(id, name, description)
    setRenaming(false)
    await reload()
  }

  if (failed && !collection) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
          This collection could not be read.
        </p>
        <button type="button" onClick={back} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--accent-primary)] underline">
          Back
        </button>
      </div>
    )
  }

  const passages = files.reduce((total, file) => total + file.chunkCount, 0)
  const indexed = files.filter((file) => file.status === 'ingested').length
  const failedCount = files.filter((file) => fileState(file, jobOf(file.fileId)).tone === 'failed').length
  // Documents of a folder source are indexed on request: the ones with no indexing job yet.
  const waiting = collection?.sourceId ? files.filter((file) => file.status === 'pending' && fileState(file, jobOf(file.fileId)).tone === 'waiting').length : 0
  const shownFiles = arrange(files, (file) => fileState(file, jobOf(file.fileId)), view)

  return (
    <div
      className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-8"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <button type="button" onClick={back} className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Left size={13} />
          Collections
        </button>

        {collection && (
          <>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="m-0 truncate text-[28px] font-normal leading-[1.2] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
                  {collection.name}
                </h1>
                {collection.description && <p className="mb-0 mt-2 max-w-[600px] text-[13.5px] leading-[21px] text-[var(--text-muted)]">{collection.description}</p>}
                <p className="mb-0 mt-2.5 text-[12px] text-[var(--text-muted)]">
                  {plural(files.length, 'document', 'documents')}
                  {passages > 0 && `   ${plural(passages, 'passage', 'passages')}`}
                  {indexed > 0 && indexed < files.length && `   ${indexed} indexed`}
                  {failedCount > 0 && `   ${failedCount} failed`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  title="Rename"
                  aria-label="Rename the collection"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-app-border-subtle bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  <Edit size={14} />
                </button>
                <button
                  type="button"
                  onClick={askRemoveCollection}
                  title="Delete the collection"
                  aria-label="Delete the collection"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-app-border-subtle bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)]"
                >
                  <Delete size={14} />
                </button>
                {waiting > 0 && (
                  <button
                    type="button"
                    onClick={() => void indexWaiting()}
                    disabled={indexing}
                    className="ml-1 flex cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {indexing ? 'Starting...' : `Index ${plural(waiting, 'document', 'documents')}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => picker.current?.click()}
                  className={`ml-1 flex cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors ${waiting > 0 ? 'border border-app-border-subtle bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]' : 'border-0 bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]'}`}
                >
                  <Upload size={14} />
                  Add documents
                </button>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const list = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    void add(list)
                  }}
                />
              </div>
            </div>

            {indexingConfigured === false && (
              <div className="mt-5">
                <IndexingNotice />
              </div>
            )}

            {files.length > 1 && (
              <DocumentToolbar view={view} onChange={setView} shown={shownFiles.length} total={files.length} failed={failedCount} retrying={retryingAll} onRetryFailed={() => void retryFailed()} />
            )}

            <ul className={`m-0 ${files.length > 1 ? 'mt-3' : 'mt-6'} list-none p-0`}>
              {uploading.map((name, index) => (
                <li key={`${name}-${index}`} className="flex items-center gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-1 py-2.5 text-[13.5px] text-[var(--text-muted)]">
                  <span className="size-[30px] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="text-[12px] text-[var(--accent-primary)]">Uploading</span>
                </li>
              ))}
              {shownFiles.map((file) => (
                <DocumentRow
                  key={file.fileId}
                  file={file}
                  state={fileState(file, jobOf(file.fileId))}
                  onOpen={() => void read(file)}
                  onRetry={() => void retry(file.fileId)}
                  onRemove={() => askRemove(file.fileId, file.name)}
                />
              ))}
            </ul>

            {files.length > 0 && shownFiles.length === 0 && (
              <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
                No document matches this filter.{' '}
                <button type="button" onClick={() => setView(DEFAULT_VIEW)} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--accent-primary)] underline">
                  Show all
                </button>
              </p>
            )}

            {!loading && files.length === 0 && uploading.length === 0 && (
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="mt-6 flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-transparent px-6 py-14 text-center transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Upload size={20} className="text-[var(--text-muted)]" />
                <span className="text-[14px] text-[var(--text-primary)]">Drop documents here, or choose files</span>
                <span className="text-[12.5px] text-[var(--text-muted)]">PDF, Word, PowerPoint, Excel, text and Markdown</span>
              </button>
            )}
          </>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[1400] flex items-center justify-center bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]">
          <div className="rounded-2xl border-2 border-dashed border-[var(--accent-primary)] bg-[var(--surface-panel)] px-10 py-8 text-[14px] text-[var(--text-primary)]">Drop to add to {collection?.name ?? 'the collection'}</div>
        </div>
      )}

      {renaming && collection && (
        <CollectionDialog
          title="Rename the collection"
          submitLabel="Save"
          initialName={collection.name}
          initialDescription={collection.description}
          onSubmit={rename}
          onClose={() => setRenaming(false)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          message={confirming.message}
          confirmLabel={confirming.label}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const { run } = confirming
            setConfirming(null)
            void run()
          }}
        />
      )}
      <ToastStack toasts={toasts} />
    </div>
  )
}
