import { CodeBox } from '@renderer/components/chat/tools/common'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import type { Notebook, NotebookCell, NotebookOutput } from '@renderer/lib/notebook'

function Output({ output }: { output: NotebookOutput }) {
  switch (output.kind) {
    case 'text':
      return (
        <pre className={`m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-[1.5] ${output.stream === 'stderr' ? 'text-[var(--accent-warning)]' : 'text-[var(--text-secondary)]'}`}>{output.text}</pre>
      )
    case 'image':
      return (
        <div className="px-3 py-2">
          <img src={output.src} alt="Output of the cell" className="max-h-[480px] max-w-full rounded-md bg-white" />
        </div>
      )
    case 'error':
      return (
        <div className="px-3 py-2">
          <div className="font-mono text-[12px] font-semibold text-[var(--accent-danger)]">
            {output.name}
            {output.message ? `: ${output.message}` : ''}
          </div>
          {output.traceback && <pre className="m-0 mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.45] text-[var(--text-muted)]">{output.traceback}</pre>}
        </div>
      )
    case 'unsupported':
      return <div className="px-3 py-2 text-[12px] italic text-[var(--text-muted)]">An output of type {output.mime} is not shown here.</div>
  }
}

function Cell({ cell, language }: { cell: NotebookCell; language: string }) {
  if (cell.kind === 'markdown') {
    return (
      <div className="px-1 py-2">
        <MarkdownView variant="document">{cell.source}</MarkdownView>
      </div>
    )
  }
  if (cell.kind === 'raw') {
    return <pre className="m-0 whitespace-pre-wrap break-words rounded-md bg-[var(--surface-muted)] px-3 py-2 font-mono text-[12px] text-[var(--text-secondary)]">{cell.source}</pre>
  }
  return (
    <div className="flex gap-2">
      <div className="w-[52px] shrink-0 pt-2 text-right font-mono text-[11px] text-[var(--text-muted)]">{cell.executionCount !== null ? `[${cell.executionCount}]` : '[ ]'}</div>
      <div className="min-w-0 flex-1">
        <CodeBox content={cell.source || ' '} language={language} expanded />
        {cell.outputs.length > 0 && (
          <div className="mt-1 divide-y divide-[var(--border-soft)] overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-root)]">
            {cell.outputs.map((output, index) => (
              <Output key={index} output={output} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** A notebook to read: its text and its code, with what each cell printed and drew. Nothing in it is run. */
export function NotebookView({ notebook }: { notebook: Notebook }) {
  if (notebook.cells.length === 0) return <div className="p-6 text-[13px] text-[var(--text-muted)]">This notebook has no cells.</div>
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-3 px-5 py-4">
      {notebook.cells.map((cell, index) => (
        <Cell key={index} cell={cell} language={notebook.language} />
      ))}
    </div>
  )
}
