import { SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'

export type WhisperModel = { id: string; label: string; approxSizeBytes: number; description: string }
export type WhisperState = { supported: boolean; running: boolean; port?: number; activeModelId: string; downloadedModelIds: string[] }
export type WhisperProgress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}

type Props = {
  models: WhisperModel[]
  state: WhisperState
  progress: WhisperProgress | null
  busy: boolean
  onDownload: (id: string) => void
  onUse: (id: string) => void
  onDelete: (id: string) => void
}

// The models of the local server: which one answers, which are on the disk, and the download of a new one.
export function WhisperModels({ models, state, progress, busy, onDownload, onUse, onDelete }: Props) {
  return (
    <div className="grid gap-2">
      {models.map((model) => {
        const downloaded = state.downloadedModelIds.includes(model.id)
        const active = downloaded && state.activeModelId === model.id
        const downloading = progress?.phase === 'model' && progress.modelId === model.id
        const percent = downloading && progress.totalBytes > 0 ? Math.round((progress.receivedBytes / progress.totalBytes) * 100) : null
        return (
          <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">{model.label}</span>
                <span className="text-[11.5px] text-[var(--text-muted)]">{formatSize(model.approxSizeBytes)}</span>
                {active && <StatusPill tone="ok">In use</StatusPill>}
                {downloaded && !active && <StatusPill tone="muted">On this computer</StatusPill>}
              </div>
              <div className="mt-0.5 text-[12px] leading-4 text-[var(--text-muted)]">{model.description}</div>
              {downloading && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-panel)]">
                  <div className="h-full bg-[var(--accent-primary)] transition-[width]" style={{ width: `${percent ?? 5}%` }} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {!downloaded && (
                <SoftButton type="button" tone="primary" disabled={busy} onClick={() => onDownload(model.id)}>
                  {downloading ? `Downloading${percent !== null ? ` ${percent}%` : '...'}` : 'Download'}
                </SoftButton>
              )}
              {downloaded && !active && (
                <SoftButton type="button" disabled={busy} onClick={() => onUse(model.id)}>
                  Use
                </SoftButton>
              )}
              {downloaded && !active && (
                <SoftButton type="button" tone="danger" disabled={busy} onClick={() => onDelete(model.id)}>
                  Delete
                </SoftButton>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
