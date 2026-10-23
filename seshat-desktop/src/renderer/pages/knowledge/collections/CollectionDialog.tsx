import { useEffect, useRef, useState, type FormEvent } from 'react'

type Props = {
  title: string
  submitLabel: string
  initialName?: string
  initialDescription?: string
  onSubmit: (name: string, description: string) => Promise<void>
  onClose: () => void
}

const FIELD = 'w-full rounded-[10px] border border-app-border-subtle bg-[var(--surface-root)] px-3 py-2 text-[13px] text-app-text outline-none transition-[border-color] placeholder:text-app-text-muted focus:border-[color-mix(in_srgb,var(--accent-primary)_55%,var(--border-soft))]'

/** Creates a collection, or renames one. */
export function CollectionDialog({ title, submitLabel, initialName = '', initialDescription = '', onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameField.current?.focus()
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(name.trim(), description.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The collection could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]"
        style={{ animation: 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <h2 className="m-0 text-[17px] font-medium text-[var(--text-primary)]">{title}</h2>
        <label className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="collection-name">
          Name
        </label>
        <input id="collection-name" ref={nameField} value={name} maxLength={255} onChange={(event) => setName(event.target.value)} placeholder="Contracts" className={`${FIELD} mt-1.5`} />
        <label className="mt-3.5 block text-[12px] font-medium text-[var(--text-secondary)]" htmlFor="collection-description">
          Description <span className="font-normal text-[var(--text-muted)]">(optional)</span>
        </label>
        <textarea
          id="collection-description"
          value={description}
          maxLength={1024}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What these documents are about"
          className={`${FIELD} mt-1.5 resize-none leading-[1.5]`}
        />
        {error && (
          <p className="mb-0 mt-3 text-[12.5px] text-[var(--accent-danger)]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-[9px] border border-app-border-subtle bg-transparent px-3.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="cursor-pointer rounded-[9px] border-0 bg-[var(--accent-primary)] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
