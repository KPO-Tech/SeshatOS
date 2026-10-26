import { useEffect, useState } from 'react'
import { SoftButton } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import {
  analyseFolder,
  collectionFiles,
  mergeCollections,
  removeCollection,
  renameCollection,
  type FolderPlan,
  type FolderPlanCollection
} from './folderPlanApi'
import { formatSize, planSentence, plural, reasonLabel, reasonsOf, shortPath, suggestedMergeName } from './folderPlanFormat'

type LoadedFiles = { files: string[]; total: number }

const inputClass =
  'h-9 min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]'

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

// Proposes the collections of a folder of this computer, and lets the person adjust them. The folder is listed, not read, and nothing is
// created here yet: the plan lives on the backend until it is thrown away or used.
export function FolderPlanModal({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('')
  const [plan, setPlan] = useState<FolderPlan | null>(null)
  const [busy, setBusy] = useState<'analysing' | 'editing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null)
  const [merging, setMerging] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number[]>([])
  const [files, setFiles] = useState<Record<number, LoadedFiles>>({})
  const [showLeftOut, setShowLeftOut] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !renaming && merging === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, renaming, merging])

  function showPlan(next: FolderPlan) {
    setPlan(next)
    // Indexes may have moved: what referred to the old ones is dropped.
    setSelected([])
    setRenaming(null)
    setMerging(null)
    setExpanded([])
    setFiles({})
  }

  async function browse() {
    const result = await window.seshat?.dialog?.openDirectory?.()
    if (result && !result.canceled && result.filePaths[0]) setPath(result.filePaths[0])
  }

  async function analyse() {
    if (!path.trim() || busy) return
    setBusy('analysing')
    setError(null)
    try {
      showPlan(await analyseFolder(path.trim()))
    } catch (err) {
      setError(errorText(err, 'The folder could not be analysed.'))
    } finally {
      setBusy(null)
    }
  }

  async function edit(run: () => Promise<FolderPlan>) {
    if (busy) return
    setBusy('editing')
    setError(null)
    try {
      showPlan(await run())
    } catch (err) {
      setError(errorText(err, 'The change could not be made.'))
    } finally {
      setBusy(null)
    }
  }

  async function loadFiles(index: number, offset: number) {
    if (!plan) return
    try {
      const page = await collectionFiles(plan.id, index, offset)
      setFiles((current) => ({ ...current, [index]: { total: page.total, files: [...(offset === 0 ? [] : (current[index]?.files ?? [])), ...page.files] } }))
    } catch (err) {
      setError(errorText(err, 'The files could not be listed.'))
    }
  }

  function toggleExpanded(index: number) {
    if (expanded.includes(index)) {
      setExpanded(expanded.filter((i) => i !== index))
      return
    }
    setExpanded([...expanded, index])
    if (!files[index]) void loadFiles(index, 0)
  }

  function toggleSelected(index: number) {
    setSelected(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index])
    setMerging(null)
  }

  function commitRename() {
    if (!plan || !renaming) return
    const current = plan.collections.find((c) => c.index === renaming.index)
    const value = renaming.value.trim()
    setRenaming(null)
    if (current && value && value !== current.name) void edit(() => renameCollection(plan.id, renaming.index, value))
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="relative flex max-h-[85vh] w-full max-w-[780px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Propose collections from a folder"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Collections from a folder</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
              Seshat lists the files of a folder of this computer and proposes collections. It does not read, copy or send the files.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void analyse()}
              placeholder="Folder, for example C:\Users\you\Documents\Archive"
              aria-label="Folder to analyse"
              className={`${inputClass} flex-1`}
              spellCheck={false}
            />
            {typeof window.seshat?.dialog?.openDirectory === 'function' && <SoftButton onClick={() => void browse()} disabled={busy !== null}>Browse...</SoftButton>}
            <SoftButton tone="primary" onClick={() => void analyse()} disabled={!path.trim() || busy !== null}>
              {busy === 'analysing' ? 'Analysing...' : plan ? 'Analyse again' : 'Analyse'}
            </SoftButton>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-root)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--accent-danger)]">
              {error}
            </div>
          )}

          {plan && (
            <>
              <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-4 py-3">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{planSentence(plan)}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]" title={plan.root}>
                  {plan.root} · {plural(plan.listed, 'entry', 'entries')} listed
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-muted)]">
                  This is a proposal and nothing has been created. Rename, merge or remove collections until it suits you. Creating and indexing them is the next step, not built yet.
                </p>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Proposed collections</h3>
                  {selected.length >= 2 && merging === null && (
                    <SoftButton onClick={() => setMerging(suggestedMergeName(plan, selected))} disabled={busy !== null}>
                      Merge {selected.length} selected
                    </SoftButton>
                  )}
                </div>

                {merging !== null && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/8 px-3 py-2.5">
                    <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">Merge {selected.length} collections into</span>
                    <input
                      autoFocus
                      value={merging}
                      onChange={(event) => setMerging(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && merging.trim()) void edit(() => mergeCollections(plan.id, selected, merging.trim()))
                        if (event.key === 'Escape') setMerging(null)
                      }}
                      aria-label="Name of the merged collection"
                      className={`${inputClass} flex-1`}
                    />
                    <SoftButton tone="primary" onClick={() => void edit(() => mergeCollections(plan.id, selected, merging.trim()))} disabled={!merging.trim() || busy !== null}>
                      Merge
                    </SoftButton>
                    <SoftButton onClick={() => setMerging(null)}>Cancel</SoftButton>
                  </div>
                )}

                {plan.collections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-soft)] px-4 py-6 text-center text-[12.5px] text-[var(--text-muted)]">
                    No collection left in the plan. Analyse the folder again to start over.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {plan.collections.map((c) => (
                      <CollectionRow
                        key={`${c.index}:${c.name}`}
                        collection={c}
                        busy={busy !== null}
                        selected={selected.includes(c.index)}
                        expanded={expanded.includes(c.index)}
                        loaded={files[c.index]}
                        renaming={renaming?.index === c.index ? renaming.value : null}
                        onSelect={() => toggleSelected(c.index)}
                        onExpand={() => toggleExpanded(c.index)}
                        onStartRename={() => setRenaming({ index: c.index, value: c.name })}
                        onRenameChange={(value) => setRenaming({ index: c.index, value })}
                        onRenameCommit={commitRename}
                        onRenameCancel={() => setRenaming(null)}
                        onRemove={() => void edit(() => removeCollection(plan.id, c.index))}
                        onMore={() => void loadFiles(c.index, files[c.index]?.files.length ?? 0)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {(plan.excluded_count > 0 || plan.duplicate_count > 0) && (
                <section>
                  <button type="button" onClick={() => setShowLeftOut(!showLeftOut)} aria-expanded={showLeftOut} className="flex w-full items-center justify-between rounded-lg border border-[var(--border-soft)] px-4 py-2.5 text-left hover:bg-[var(--surface-muted)]">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      Left out: {plan.excluded_count} {plan.excluded_count === 1 ? 'file' : 'files'}
                      {plan.duplicate_count > 0 ? `, ${plural(plan.duplicate_count, 'duplicate')}` : ''}
                    </span>
                    <span className="text-[12px] text-[var(--text-muted)]">{showLeftOut ? 'Hide' : 'Show'}</span>
                  </button>
                  {showLeftOut && <LeftOut plan={plan} />}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-soft)] px-5 py-3">
          <span className="text-[11.5px] text-[var(--text-muted)]">{plan ? 'The plan is kept for an hour.' : 'Choose a folder to begin.'}</span>
          <SoftButton tone="primary" disabled title="Creating and indexing the collections is not built yet">Create collections</SoftButton>
        </footer>
      </div>
    </div>
  )
}

type RowProps = {
  collection: FolderPlanCollection
  busy: boolean
  selected: boolean
  expanded: boolean
  loaded: LoadedFiles | undefined
  renaming: string | null
  onSelect: () => void
  onExpand: () => void
  onStartRename: () => void
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onRemove: () => void
  onMore: () => void
}

function CollectionRow(props: RowProps) {
  const { collection: c, busy, selected, expanded, loaded, renaming } = props
  return (
    <li className={['rounded-lg border bg-[var(--surface-root)]', selected ? 'border-[var(--accent-primary)]/50' : 'border-[var(--border-soft)]'].join(' ')}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input type="checkbox" checked={selected} onChange={props.onSelect} aria-label={`Select ${c.name}`} className="size-4 shrink-0 accent-[var(--accent-primary)]" />
        <button type="button" onClick={props.onExpand} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} the files of ${c.name}`} className="flex size-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={expanded ? 'rotate-90' : ''}><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          {renaming !== null ? (
            <input
              autoFocus
              value={renaming}
              onChange={(event) => props.onRenameChange(event.target.value)}
              onBlur={props.onRenameCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.onRenameCommit()
                if (event.key === 'Escape') props.onRenameCancel()
              }}
              aria-label={`New name of ${c.name}`}
              className={`${inputClass} h-8 w-full`}
            />
          ) : (
            <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]" title={c.name}>{c.name}</div>
          )}
          <div className="truncate text-[11.5px] text-[var(--text-muted)]" title={c.folders.join(', ')}>
            {plural(c.file_count, 'file')} · {formatSize(c.bytes)}
            {c.folders.length > 0 ? ` · from ${c.folders.map((f) => (f === '' ? 'the root' : shortPath(f))).slice(0, 3).join(', ')}${c.folders.length > 3 ? ', ...' : ''}` : ''}
          </div>
        </div>
        <SoftButton onClick={props.onStartRename} disabled={busy || renaming !== null} className="!h-8">Rename</SoftButton>
        <SoftButton tone="danger" onClick={props.onRemove} disabled={busy} className="!h-8" title="Take this collection out of the plan; no file is touched">Remove</SoftButton>
      </div>
      {expanded && (
        <div className="border-t border-[var(--border-soft)] px-4 py-2.5">
          {!loaded ? (
            <div className="text-[12px] text-[var(--text-muted)]">Loading...</div>
          ) : (
            <>
              <ul className="space-y-0.5">
                {loaded.files.map((file) => (
                  <li key={file} className="truncate font-mono text-[11.5px] text-[var(--text-secondary)]" title={file}>{file}</li>
                ))}
              </ul>
              {loaded.files.length < loaded.total && (
                <button type="button" onClick={props.onMore} className="mt-2 text-[12px] font-semibold text-[var(--accent-primary)] hover:underline">
                  Show more ({loaded.total - loaded.files.length} left)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

function LeftOut({ plan }: { plan: FolderPlan }) {
  const reasons = reasonsOf(plan)
  const listed = plan.excluded.length
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-4 py-3">
      {reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.map((r) => (
            <li key={r.reason} className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--text-secondary)]">{r.label}</span>
              <span className="font-semibold text-[var(--text-primary)]">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
      {listed > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-[var(--text-muted)]">
            {listed < plan.excluded_count ? `First ${listed} of ${plan.excluded_count}` : 'Files left out'}
          </div>
          <ul className="space-y-0.5">
            {plan.excluded.map((e) => (
              <li key={e.path} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                <span className="truncate font-mono text-[var(--text-secondary)]" title={e.path}>{e.path}</span>
                <span className="shrink-0 text-[var(--text-muted)]">{reasonLabel(e.reason)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.duplicates.length > 0 && (
        <div>
          <div className="mb-1 text-[11.5px] font-semibold text-[var(--text-muted)]">
            {plan.duplicates.length < plan.duplicate_count ? `Duplicates: first ${plan.duplicates.length} of ${plan.duplicate_count}` : 'Duplicates (same content, only the first is kept)'}
          </div>
          <ul className="space-y-0.5">
            {plan.duplicates.map((d) => (
              <li key={d.path} className="truncate font-mono text-[11.5px] text-[var(--text-secondary)]" title={`${d.path} is the same as ${d.of}`}>
                {d.path} <span className="text-[var(--text-muted)]">= {d.of}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
