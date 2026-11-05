import { useCallback, useEffect, useRef, useState } from 'react'
import { Down, Refresh, Right, Search } from '../icons'
import { FileIcon, FolderIcon } from '@renderer/components/ui/FileIcon'
import { joinPath } from '@renderer/lib/projectFiles'
import { useTranslation } from 'react-i18next'

type Entry = { name: string; isDirectory: boolean }
type Listing = Entry[] | 'loading' | 'error'
type Found = { path: string; relativePath: string; name: string; isDirectory: boolean }

type Props = {
  rootPath: string
  selectedPath: string | null
  onOpenFile: (path: string) => void
  /** Changes when the tree must be read again (the project's folder changed). */
  refreshKey: number
  onRefresh: () => void
}

// Hidden because it is not the person's files: the folder of the version control.
const HIDDEN = new Set(['.git'])
const INDENT = 14

/** The files of a project as a tree that opens by folder, with a search over the names of the whole project. */
export function FileTree({ rootPath, selectedPath, onOpenFile, refreshKey, onRefresh }: Props) {
  const { t } = useTranslation('shell')
  const [listings, setListings] = useState<Record<string, Listing>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({ [rootPath]: true })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Found[] | 'searching' | null>(null)
  const requested = useRef(new Set<string>())

  const load = useCallback((path: string) => {
    if (requested.current.has(path)) return
    requested.current.add(path)
    setListings((current) => ({ ...current, [path]: 'loading' }))
    window.seshat?.fs
      ?.listDirectory(path)
      .then((entries) => setListings((current) => ({ ...current, [path]: entries.filter((entry) => !HIDDEN.has(entry.name)) })))
      .catch(() => setListings((current) => ({ ...current, [path]: 'error' })))
  }, [])

  // The root, and every folder that was open, are read again when the tree is refreshed.
  useEffect(() => {
    requested.current = new Set()
    setListings({})
    setOpen((current) => ({ ...current, [rootPath]: true }))
    load(rootPath)
    for (const path of Object.keys(open)) if (open[path] && path !== rootPath) load(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, refreshKey])

  // The search waits for a short pause in the typing, and drops an answer that a newer one has replaced.
  useEffect(() => {
    const text = query.trim()
    if (!text) {
      setResults(null)
      return
    }
    setResults('searching')
    let current = true
    const timer = window.setTimeout(() => {
      window.seshat?.fs
        ?.searchFiles(rootPath, text)
        .then((found) => current && setResults(found))
        .catch(() => current && setResults([]))
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query, rootPath])

  function toggle(path: string) {
    const willOpen = !open[path]
    setOpen((current) => ({ ...current, [path]: willOpen }))
    if (willOpen) load(path)
  }

  // A folder found by the search is shown in the tree: every folder on the way to it is opened.
  function reveal(path: string) {
    const parts = path.slice(rootPath.length).split(/[\\/]+/).filter(Boolean)
    let current = rootPath
    const opened: Record<string, boolean> = {}
    for (const part of parts) {
      current = joinPath(current, part)
      opened[current] = true
      load(current)
    }
    setOpen((state) => ({ ...state, ...opened }))
    setQuery('')
  }

  function renderDirectory(path: string, depth: number) {
    const listing = listings[path]
    if (listing === undefined || listing === 'loading') return <div style={{ paddingLeft: 12 + depth * INDENT }} className="py-1 text-[11.5px] text-[var(--text-muted)]">{t('pages.projects.detail.fileTree.loading')}</div>
    if (listing === 'error') return <div style={{ paddingLeft: 12 + depth * INDENT }} className="py-1 text-[11.5px] text-[var(--accent-danger)]">{t('pages.projects.detail.fileTree.thisFolderCannotBeRead')}</div>
    if (listing.length === 0) return <div style={{ paddingLeft: 12 + depth * INDENT }} className="py-1 text-[11.5px] text-[var(--text-muted)]">{t('pages.projects.detail.fileTree.empty')}</div>
    return listing.map((entry) => {
      const entryPath = joinPath(path, entry.name)
      if (entry.isDirectory) {
        const isOpen = open[entryPath] === true
        return (
          <div key={entryPath}>
            <button
              type="button"
              onClick={() => toggle(entryPath)}
              aria-expanded={isOpen}
              style={{ paddingLeft: 6 + depth * INDENT }}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent py-1 pr-2 text-left text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center text-[var(--text-muted)]">{isOpen ? <Down size={11} /> : <Right size={11} />}</span>
              <FolderIcon path={entry.name} open={isOpen} size={16} className="shrink-0" />
              <span className="truncate">{entry.name}</span>
            </button>
            {isOpen && renderDirectory(entryPath, depth + 1)}
          </div>
        )
      }
      const selected = selectedPath === entryPath
      return (
        <button
          key={entryPath}
          type="button"
          onClick={() => onOpenFile(entryPath)}
          title={entry.name}
          style={{ paddingLeft: 6 + depth * INDENT + 20 }}
          className={`flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 py-1 pr-2 text-left text-[12.5px] ${selected ? 'bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}
        >
          <FileIcon path={entry.name} size={16} className="shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
      )
    })
  }

  const rootName = rootPath.split(/[\\/]+/).filter(Boolean).pop() ?? rootPath

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pb-2 pt-3">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{t('pages.projects.detail.fileTree.projectFiles')}</span>
        <button type="button" onClick={onRefresh} aria-label={t('pages.projects.detail.fileTree.readTheFilesAgain')} title={t('pages.projects.detail.fileTree.refresh')} className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
          <Refresh size={13} />
        </button>
      </div>
      <div className="relative mx-3 shrink-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <Search size={13} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('pages.projects.detail.fileTree.searchFiles')}
          aria-label={t('pages.projects.detail.fileTree.searchTheFilesOfThe')}
          className="h-8 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] pl-8 pr-2 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="no-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {results === null ? (
          <>
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] font-medium text-[var(--text-primary)]">
              <FolderIcon path={rootName} open size={16} className="shrink-0" />
              <span className="truncate">{rootName}</span>
            </div>
            {renderDirectory(rootPath, 0)}
          </>
        ) : results === 'searching' ? (
          <div className="px-3 py-2 text-[12px] text-[var(--text-muted)]">{t('pages.projects.detail.fileTree.searching')}</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[var(--text-muted)]">{t('pages.projects.detail.fileTree.noFileOrFolderHas')}</div>
        ) : (
          results.map((found) => (
            <button
              key={found.path}
              type="button"
              onClick={() => (found.isDirectory ? reveal(found.path) : onOpenFile(found.path))}
              title={found.relativePath}
              className="flex w-full cursor-pointer flex-col rounded-md border-0 bg-transparent px-2 py-1 text-left hover:bg-[var(--surface-hover)]"
            >
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-primary)]">
                {found.isDirectory ? <FolderIcon path={found.name} open={false} size={16} className="shrink-0" /> : <FileIcon path={found.name} size={16} className="shrink-0" />}
                <span className="truncate">{found.name}</span>
              </span>
              <span className="truncate pl-5 font-mono text-[10.5px] text-[var(--text-muted)]">{found.relativePath}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
