import { CustomSelect } from '../knowledge/KnowledgePrimitives'
import { IndraPanel } from '../knowledge/IndraPanel'
import { NativeModelsPanel } from '../knowledge/NativeModelsPanel'
import { packOptions } from '../knowledge/ocrPacks'
import type { NativeDocDownloadState } from '../knowledge/knowledgeTypes'
import { Card } from './DocumentsOverview'
import type { DocumentReaderState } from './useDocumentReader'

function percent(download: NativeDocDownloadState): number {
  const files = download.file_count || 0
  if (files <= 0) return 0
  if (download.status === 'completed') return 100
  const done = Math.max(0, (download.file_index || download.files_completed || 1) - 1)
  const current = download.bytes_total && download.bytes_total > 0 ? (download.bytes_downloaded || 0) / download.bytes_total : 0
  return Math.max(0, Math.min(100, Math.round(((done + current) / files) * 100)))
}

function bytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

const BUTTON = 'h-9 cursor-pointer rounded-lg border px-4 text-[13px] font-medium disabled:cursor-default disabled:opacity-50'

/** The second tab: reading scanned pages on this computer, with the built-in OCR (its models and languages) or the optional Indra reader. */
export function LocalOcrPanel({ reader }: { reader: DocumentReaderState }) {
  const native = reader.native
  const download = native.download

  return (
    <div className="grid gap-4">
      <Card title="Built-in OCR" hint={native.message}>
        {native.packs.length > 1 && (
          <div className="mb-4 max-w-[420px]">
            <div className="mb-1.5 text-[12px] font-semibold text-[var(--text-muted)]">Languages to read</div>
            <CustomSelect value={native.selectedPack ?? ''} options={packOptions(native.packs)} onChange={native.selectPack} disabled={native.downloading} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void native.startDownload()} disabled={!native.canDownload} className={`${BUTTON} border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]`}>
            {native.buttonLabel}
          </button>
          <button
            type="button"
            onClick={() => void native.initialize()}
            disabled={!native.canInitialize || native.initializing}
            className={`${BUTTON} ${native.ready ? 'border-[var(--accent-success)]/40 bg-transparent text-[var(--accent-success)]' : 'border-transparent bg-[var(--accent-primary)] text-white hover:opacity-90'}`}
          >
            {native.initializing ? 'Starting...' : native.ready ? 'Native OCR ready' : 'Start native OCR'}
          </button>
          {native.initError && <span className="min-w-0 truncate text-[12px] font-medium text-[var(--accent-danger)]">{native.initError}</span>}
        </div>

        {download?.status === 'running' && (
          <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-muted)]">
              <span className="truncate">{download.current_file || 'Downloading models'}</span>
              <span>
                {download.file_index ?? download.files_completed ?? 0}/{download.file_count ?? 0}
                {download.bytes_total ? ` · ${bytes(download.bytes_downloaded || 0)}/${bytes(download.bytes_total)}` : ''}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]" style={{ width: `${percent(download)}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4">
          <NativeModelsPanel statuses={native.models} folder={native.modelDir} />
        </div>
      </Card>

      <IndraPanel />
    </div>
  )
}
