import { Download, Power, Translate } from '@icon-park/react'
import { IndraPanel } from '../knowledge/IndraPanel'
import { NativeModelsPanel } from '../knowledge/NativeModelsPanel'
import { packOptions } from '../knowledge/ocrPacks'
import type { NativeDocDownloadState } from '../knowledge/knowledgeTypes'
import { ActionButton, SelectField, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import type { DocumentReaderState } from './useDocumentReader'

function percent(download: NativeDocDownloadState): number {
  const files = download.file_count || 0
  if (files <= 0) return 0
  if (download.status === 'completed') return 100
  const done = Math.max(0, (download.file_index || download.files_completed || 1) - 1)
  const current = download.bytes_total && download.bytes_total > 0 ? (download.bytes_downloaded || 0) / download.bytes_total : 0
  return Math.max(0, Math.min(100, Math.round(((done + current) / files) * 100)))
}

const glyph = (Icon: typeof Power) => <Icon theme="outline" size={16} />

/** The second tab: reading scanned pages on this computer, with the built-in OCR (its models and languages) or the optional Indra reader. */
export function LocalOcrPanel({ reader }: { reader: DocumentReaderState }) {
  const native = reader.native
  const download = native.download

  return (
    <>
      <SettingsCard title="Scanned pages" badge={<StatusBadge tone={native.ready ? 'ok' : 'muted'}>{native.ready ? 'Ready' : 'Not started'}</StatusBadge>}>
        {native.packs.length > 1 && (
          <SettingRow title="Languages" icon={glyph(Translate)}>
            <div className="w-[240px]">
              <SelectField value={native.selectedPack ?? ''} options={packOptions(native.packs)} onChange={native.selectPack} disabled={native.downloading} />
            </div>
          </SettingRow>
        )}
        <SettingRow title="Models" icon={glyph(Download)}>
          <ActionButton type="button" onClick={() => void native.startDownload()} disabled={!native.canDownload}>
            {native.buttonLabel}
          </ActionButton>
        </SettingRow>
        <SettingRow title="Reader" icon={glyph(Power)}>
          {native.initError && <span className="max-w-[260px] truncate text-[12px] text-[var(--accent-danger)]">{native.initError}</span>}
          <ActionButton type="button" tone={native.ready ? 'success' : 'primary'} onClick={() => void native.initialize()} disabled={!native.canInitialize || native.initializing}>
            {native.initializing ? 'Starting...' : native.ready ? 'Ready' : 'Start'}
          </ActionButton>
        </SettingRow>
        {download?.status === 'running' && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-muted)]">
              <span className="truncate">{download.current_file || 'Downloading models'}</span>
              <span>{percent(download)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]" style={{ width: `${percent(download)}%` }} />
            </div>
          </div>
        )}
      </SettingsCard>

      <NativeModelsPanel statuses={native.models} folder={native.modelDir} />

      <IndraPanel />
    </>
  )
}
