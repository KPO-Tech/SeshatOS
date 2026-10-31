import { Close, Redo } from '@icon-park/react'
import { kindOfFile } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import type { CollectionFile } from './collectionsApi'
import { plural, type FileState } from './fileStatus'

const TONES: Record<FileState['tone'], string> = {
  ready: 'text-[var(--accent-success)]',
  working: 'text-[var(--accent-primary)]',
  queued: 'text-[var(--text-muted)]',
  failed: 'text-[var(--accent-danger)]',
  waiting: 'text-[var(--text-muted)]'
}

type Props = {
  file: CollectionFile
  state: FileState
  onOpen: () => void
  onRetry: () => void
  onRemove: () => void
}

export function DocumentRow({ file, state, onOpen, onRetry, onRemove }: Props) {
  const canRetry = state.tone === 'failed' || state.tone === 'waiting'
  return (
    <li className="group flex items-center gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-1 py-2.5 last:border-b-0">
      <button type="button" onClick={onOpen} title={`Read ${file.name}`} aria-label={`Read ${file.name}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left">
      <FileKindIcon kind={kindOfFile(file.name)} size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-[var(--text-primary)]" title={file.name}>
          {file.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          <span className={`inline-flex items-center gap-1.5 ${TONES[state.tone]}`} title={state.detail}>
            {state.tone === 'working' && <span className="size-1.5 rounded-full bg-current" style={{ animation: 'pulse-opacity 1.1s ease-in-out infinite' }} />}
            {state.label}
            {state.note && (
              <span className="rounded-[4px] border border-app-border-subtle px-1.5 py-px text-[11px] font-normal leading-[15px] text-[var(--text-muted)]" title={state.detail}>
                {state.note}
              </span>
            )}
          </span>
          {file.status === 'ingested' && <span>{plural(file.chunkCount, 'passage', 'passages')}</span>}
          {state.detail && state.tone === 'failed' && <span className="min-w-0 truncate">{state.detail}</span>}
        </div>
      </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {canRetry && (
          <button
            type="button"
            onClick={onRetry}
            title="Try indexing again"
            aria-label={`Index ${file.name} again`}
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <Redo size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove from the collection"
          aria-label={`Remove ${file.name}`}
          className="flex size-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)]"
        >
          <Close size={14} />
        </button>
      </div>
    </li>
  )
}
