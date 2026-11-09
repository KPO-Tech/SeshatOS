import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen } from '@icon-park/react'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { CodeBox } from '@renderer/components/chat/tools/common'
import { languageForPath } from '@renderer/components/chat/tools/helpers'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { parseNotebook, type Notebook } from '@renderer/lib/notebook'
import { extensionOf, fileKindOf, parseDelimited, resolveRelativePath } from '@renderer/lib/projectFiles'
import { useTranslation } from 'react-i18next'
import { splitFrontmatter } from './frontmatter'
import { NotebookView } from './NotebookView'

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'text'; text: string }
  | { state: 'image'; src: string }

type Props = {
  path: string
  /** The path shown under the name, relative to the folder the files come from. */
  relativePath: string
  /** Reads a text file; rejects with an Error whose message tells why it cannot be shown (too large, not text). */
  readText: (path: string) => Promise<string>
  /** Reads a picture as an address an img can show; without it, pictures are not drawn. */
  readImage?: (path: string) => Promise<string>
  /** Gives the button that opens the file with the program of the system. */
  onOpenSystem?: (path: string) => void
  /** Gives the button that copies the path. */
  copyPath?: boolean
  /** Shows the YAML front matter of a markdown file as its own block (a skill's SKILL.md). */
  frontmatter?: boolean
}

// The messages of the IPC that reads a file of the computer, told in words of the interface.
const KNOWN_ERRORS: Array<[fragment: string, key: string]> = [
  ['File is too large to preview', 'files:fileViewer.tooLarge'],
  ['File does not look like text', 'files:fileViewer.notText'],
  ['Picture is too large to preview', 'files:fileViewer.pictureTooLarge']
]

function Table({ text, delimiter }: { text: string; delimiter: string }) {
  const { t } = useTranslation('files')
  const { rows, truncated } = useMemo(() => parseDelimited(text, delimiter), [text, delimiter])
  if (rows.length === 0) return <div className="p-6 text-[13px] text-[var(--text-muted)]">{t('fileViewer.thisFileIsEmpty')}</div>
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
      {truncated && <p className="m-0 mt-2 text-[11.5px] text-[var(--text-muted)]">{t('fileViewer.firstRows', { rows: rows.length })}</p>}
    </div>
  )
}

/** A file to read: Markdown drawn, code highlighted, notebooks laid out, tables and pictures. Nothing here changes a file. */
export function FileContentView({ path, relativePath, readText, readImage, onOpenSystem, copyPath = false, frontmatter = false }: Props) {
  const { t } = useTranslation('files')
  const kind = fileKindOf(path)
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [source, setSource] = useState(false)
  // The readers are kept apart from the effect: a new function with each render of the page must not read the file again.
  const readers = useRef({ readText, readImage })
  readers.current = { readText, readImage }

  const explain = useCallback(
    (error: unknown): string => {
      const text = error instanceof Error ? error.message : ''
      for (const [fragment, key] of KNOWN_ERRORS) if (text.includes(fragment)) return t(key)
      return t('fileViewer.couldNotRead')
    },
    [t]
  )

  useEffect(() => {
    let current = true
    setSource(false)
    const { readText: text, readImage: image } = readers.current
    if (kind === 'document' || (kind === 'image' && !image)) {
      setLoaded({ state: 'error', message: '' })
      return
    }
    setLoaded({ state: 'loading' })
    const read = kind === 'image' && image ? image(path).then((src) => ({ state: 'image' as const, src })) : text(path).then((content) => ({ state: 'text' as const, text: content }))
    read.then((result) => current && setLoaded(result)).catch((error) => current && setLoaded({ state: 'error', message: explain(error) }))
    return () => {
      current = false
    }
  }, [path, kind, explain])

  const notebook = useMemo<Notebook | Error | null>(() => {
    if (kind !== 'notebook' || loaded.state !== 'text') return null
    try {
      return parseNotebook(loaded.text)
    } catch (error) {
      return error instanceof Error ? error : new Error(t('fileViewer.notebookUnreadable'))
    }
  }, [kind, loaded, t])

  // The pictures a page names by a relative path are read from its folder.
  const imageLoader = useCallback(
    (target: string) => {
      const read = readers.current.readImage
      return read ? read(resolveRelativePath(path, target)) : Promise.reject(new Error('unavailable'))
    },
    [path]
  )

  const name = path.split(/[\\/]/).pop() ?? path
  const message = (text: string) => <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-[var(--text-muted)]">{text}</div>

  function body() {
    if (kind === 'document' || (kind === 'image' && !readImage)) {
      return message(onOpenSystem ? t('fileViewer.notDrawnOpen', { type: extensionOf(path).toUpperCase() }) : t('fileViewer.notDrawn', { type: extensionOf(path).toUpperCase() }))
    }
    if (loaded.state === 'loading') return message(t('fileViewer.loading'))
    if (loaded.state === 'error') return message(loaded.message)
    if (loaded.state === 'image') return <div className="flex min-h-full items-center justify-center p-6"><img src={loaded.src} alt={name} className="max-h-full max-w-full rounded-md bg-[var(--surface-muted)] object-contain" /></div>
    // The new line that ends a file is not a line of it: it would show as an empty last line.
    const text = loaded.text.replace(/\r?\n$/, '')
    switch (kind) {
      case 'markdown': {
        if (source) return <CodeBox content={text || ' '} language="markdown" lineNumbers expanded bare />
        const parts = frontmatter ? splitFrontmatter(loaded.text) : { frontmatter: '', body: loaded.text }
        return (
          <div className="mx-auto max-w-[860px] px-6 py-5">
            {parts.frontmatter && <pre className="mb-5 whitespace-pre-wrap break-words rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-4 py-3 font-mono text-[12px] leading-5 text-[var(--text-secondary)]">{parts.frontmatter}</pre>}
            <MarkdownView variant="document" imageLoader={readImage ? imageLoader : undefined}>{parts.body}</MarkdownView>
          </div>
        )
      }
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
          <div className="flex rounded-lg border border-[var(--border-soft)] p-0.5 text-[11.5px]" role="group" aria-label={t('fileViewer.view')}>
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className={`cursor-pointer rounded-md border-0 px-2 py-0.5 ${source === value ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {value ? t('fileViewer.source') : t('fileViewer.preview')}
              </button>
            ))}
          </div>
        )}
        {copyPath && (
          <CopyButton text={path} label={t('fileViewer.copyThePath')} className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]" size={13} withTitle />
        )}
        {onOpenSystem && (
          <button type="button" onClick={() => onOpenSystem(path)} className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-soft)] bg-transparent px-2 text-[11.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            <FolderOpen size={13} />
            {t('fileViewer.open')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
    </div>
  )
}
