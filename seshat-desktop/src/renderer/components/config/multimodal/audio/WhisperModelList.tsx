import { ActionButton, Chip, SettingRow } from '../../../settings/kit'
import type { WhisperModel, WhisperProgress, WhisperState } from '../multimodalTypes'

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

/** The models of the local speech engine: which one answers, which are on the disk, and the download of a new one. */
export function WhisperModelList({ models, state, progress, busy, onDownload, onUse, onDelete }: Props) {
  return (
    <>
      {models.map((model) => {
        const downloaded = state.downloadedModelIds.includes(model.id)
        const active = downloaded && state.activeModelId === model.id
        const downloading = progress?.phase === 'model' && progress.modelId === model.id
        const percent = downloading && progress.totalBytes > 0 ? Math.round((progress.receivedBytes / progress.totalBytes) * 100) : null
        return (
          <SettingRow key={model.id} title={`${model.label} (${formatSize(model.approxSizeBytes)})`} hint={model.description}>
            {downloading && (
              <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div className="h-full bg-[var(--accent-primary)] transition-[width]" style={{ width: `${percent ?? 5}%` }} />
              </div>
            )}
            {active && <Chip tone="ok">In use</Chip>}
            {downloaded && !active && <Chip>On this computer</Chip>}
            {!downloaded && (
              <ActionButton type="button" tone="primary" disabled={busy} onClick={() => onDownload(model.id)}>
                {downloading ? `Downloading${percent !== null ? ` ${percent}%` : '...'}` : 'Download'}
              </ActionButton>
            )}
            {downloaded && !active && (
              <>
                <ActionButton type="button" disabled={busy} onClick={() => onUse(model.id)}>
                  Use
                </ActionButton>
                <ActionButton type="button" tone="danger" disabled={busy} onClick={() => onDelete(model.id)}>
                  Delete
                </ActionButton>
              </>
            )}
          </SettingRow>
        )
      })}
    </>
  )
}
