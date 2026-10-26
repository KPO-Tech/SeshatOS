import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SourceIconPicker } from './SourceIcon'
import { addFolderSource, type KnowledgeSource } from './sourcesApi'

const FIELD =
  'w-full rounded-[10px] border border-app-border-subtle bg-[var(--surface-root)] px-3 py-2 text-[13px] text-app-text outline-none transition-[border-color] placeholder:text-app-text-muted focus:border-[color-mix(in_srgb,var(--accent-primary)_55%,var(--border-soft))]'

/** Adds a folder of this computer as a source. Nothing is read: the collections are made later, by analysing the source. */
export function AddSourceDialog({ onAdded, onClose }: { onAdded: (source: KnowledgeSource) => void | Promise<void>; onClose: () => void }) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathField = useRef<HTMLInputElement>(null)
  const canBrowse = typeof window.seshat?.dialog?.openDirectory === 'function'

  useEffect(() => {
    pathField.current?.focus()
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  async function browse() {
    const result = await window.seshat?.dialog?.openDirectory?.()
    if (result && !result.canceled && result.filePaths[0]) setPath(result.filePaths[0])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!path.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdded(await addFolderSource(path.trim(), name, icon))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The source could not be added.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Add a source"
        className="w-full max-w-[480px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]"
        style={{ animation: 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <h2 className="m-0 text-[17px] font-medium text-[var(--text-primary)]">Add a source</h2>
        <p className="mb-0 mt-1.5 text-[12.5px] leading-[19px] text-[var(--text-muted)]">
          A folder of this computer. Adding it reads nothing and copies nothing: you choose later whether to analyse it into collections.
        </p>

        <label className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="source-path">
          Folder
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="source-path"
            ref={pathField}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="C:\Users\you\Documents\Archive"
            className={FIELD}
            spellCheck={false}
          />
          {canBrowse && (
            <button type="button" onClick={() => void browse()} className="h-9 shrink-0 cursor-pointer rounded-[10px] border border-app-border-subtle bg-transparent px-3 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
              Browse...
            </button>
          )}
        </div>

        <label className="mt-3.5 block text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="source-name">
          Name and icon <span className="font-normal text-[var(--text-muted)]">(optional, the folder's name by default)</span>
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <SourceIconPicker value={icon} onChange={setIcon} />
          <input id="source-name" value={name} onChange={(event) => setName(event.target.value)} className={FIELD} maxLength={255} />
        </div>

        {error && (
          <p role="alert" className="mb-0 mt-3 text-[12.5px] font-medium text-[var(--accent-danger)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-[10px] border border-app-border-subtle bg-transparent px-3.5 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!path.trim() || busy}
            className="cursor-pointer rounded-[10px] border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Adding...' : 'Add source'}
          </button>
        </div>
      </form>
    </div>
  )
}
