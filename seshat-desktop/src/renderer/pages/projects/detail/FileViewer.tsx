import { useEffect, useMemo, useState } from 'react'
import { CodeBox } from '@renderer/components/chat/tools/common'
import { languageForPath } from '@renderer/components/chat/tools/helpers'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { parseNotebook, type Notebook } from '@renderer/lib/notebook'
import { extensionOf, fileKindOf, parseDelimited } from '@renderer/lib/projectFiles'
import { Copy, FolderOpen } from '../icons'
import { NotebookView } from './NotebookView'

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'text'; text: string }
  | { state: 'image'; src: string }

type Props = {
  path: string
  /** The path relative to the project, for the title. */
  relativePath: string
  onOpenSystem: (path: string) => void
}

const MESSAGES: Record<string, string> = {
  'File is too large to preview': 'This file is too large to show here (2 MB at most).',
  'File does not look like text': 'This file is not text, so it cannot be shown here.',
  'Picture is too large to preview': 'This picture is too large to show here (10 MB at most).'
}

function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  for (const [fragment, message] of Object.entries(MESSAGES)) if (text.includes(fragment)) return message
  return 'This file could not be read.'
}

function Table({ text, delimiter }: { text: string; delimiter: string }) {
  const { rows, truncated } = useMemo(() => parseDelimited(text, delimiter), [text, delimiter])
  if (rows.length === 0) return <div className="p-6 text-[13px] text-[var(--text-muted)]">This file is empty.</div>
  const [head, ...body] = rows
  return (
    <div className="px-4 py-3">
      <div className="overflow-auto rounded-lg border border-[var(--border-soft)]">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-[var(--surface-muted)]">
            <tr>
              {head.map((cell, index) => (
                <th key={index} className="whitespace-nowrap border-b border-[var(--border-soft)] px-3 py-1.5 font-semibold text-[var(--text-primary)]">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-[var(--border-soft)] last:border-b-0">
                {row.map((cell, index) => (
                  <td key={index} className="max-w-[320px] truncate px-3 py-1 text-[var(--text-secondary)]" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && <p className="m-0 mt-2 text-[11.5px] text-[var(--text-muted)]">The first {rows.length} rows are shown.</p>}
    </div>
  )
}

/** A file of the project, to read: Markdown drawn, code highlighted, notebooks laid out, tables and pictures. Nothing here changes a file. */
export function FileViewer({ path, relativePath, onOpenSystem }: Props) {
  const kind = fileKindOf(path)
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [source, setSource] = useState(false)

  useEffect(() => {
    let current = true
    setSource(false)
    if (kind === 'document') {
      setLoaded({ state: 'error', message: '' })
      return
    }
    setLoaded({ state: 'loading' })
    const read = kind === 'image' ? window.seshat?.fs?.readImage(path).then((src) => ({ state: 'image' as const, src })) : window.seshat?.fs?.readTextFile(path).then((text) => ({ state: 'text' as const, text }))
    read?.then((result) => current && setLoaded(result)).catch((error) => current && setLoaded({ state: 'error', message: explain(error) }))
    return () => {
      current = false
    }
  }, [path, kind])

  const notebook = useMemo<Notebook | Error | null>(() => {
    if (kind !== 'notebook' || loaded.state !== 'text') return null
    try {
      return parseNotebook(loaded.text)
    } catch (error) {
      return error instanceof Error ? error : new Error('This notebook could not be read.')
    }
  }, [kind, loaded])

  const name = path.split(/[\\/]/).pop() ?? path
  const message = (text: string) => <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-[var(--text-muted)]">{text}</div>

  function body() {
    if (kind === 'document') return message(`The ${extensionOf(path).toUpperCase()} files are not drawn in this view yet. Open it with the program of your system.`)
    if (loaded.state === 'loading') return message('Loading...')
    if (loaded.state === 'error') return message(loaded.message)
    if (loaded.state === 'image') return <div className="flex min-h-full items-center justify-center p-6"><img src={loaded.src} alt={name} className="max-h-full max-w-full rounded-md bg-[var(--surface-muted)] object-contain" /></div>
    // The new line that ends a file is not a line of it: it would show as an empty last line.
    const text = loaded.text.replace(/\r?\n$/, '')
    switch (kind) {
      case 'markdown':
        return source ? <CodeBox content={text || ' '} language="markdown" lineNumbers expanded bare /> : <div className="mx-auto max-w-[860px] px-6 py-5"><MarkdownView variant="document">{loaded.text}</MarkdownView></div>
      case 'notebook':
        if (notebook instanceof Error) return message(notebook.message)
        return notebook ? <NotebookView notebook={notebook} /> : null
      case 'table':
        return <Table text={loaded.text} delimiter={extensionOf(path) === 'tsv' ? '\t' : ','} />
      case 'code':
        return <CodeBox content={text || ' '} language={languageForPath(path)} lineNumbers expanded bare />
      default:
        return <CodeBox content={text || ' '} lineNumbers expanded bare />
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-soft)] px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]" title={name}>
            {name}
          </div>
          <div className="truncate font-mono text-[10.5px] text-[var(--text-muted)]" title={path}>
            {relativePath}
          </div>
        </div>
        {kind === 'markdown' && loaded.state === 'text' && (
          <div className="flex rounded-lg border border-[var(--border-soft)] p-0.5 text-[11.5px]" role="group" aria-label="View">
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className={`cursor-pointer rounded-md border-0 px-2 py-0.5 ${source === value ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {value ? 'Source' : 'Preview'}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => void navigator.clipboard.writeText(path)} aria-label="Copy the path" title="Copy the path" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
          <Copy size={13} />
        </button>
        <button type="button" onClick={() => onOpenSystem(path)} className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-soft)] bg-transparent px-2 text-[11.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          <FolderOpen size={13} />
          Open
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
    </div>
  )
}

