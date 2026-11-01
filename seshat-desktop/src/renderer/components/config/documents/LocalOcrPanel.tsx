import { Download, Power, Translate } from '@icon-park/react'
import { IndraPanel } from '../knowledge/IndraPanel'
import { NativeModelsPanel } from '../knowledge/NativeModelsPanel'
import { packOptions } from '../knowledge/ocrPacks'
import type { NativeDocDownloadState } from '../knowledge/knowledgeTypes'
import { ActionButton, ProgressRow, SelectField, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
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
  const needsModels = native.canDownload && !native.ready
  const label = native.ready ? 'Ready' : !native.compiled ? 'Not in this version' : needsModels ? 'Needs models' : 'Not started'

  return (
    <>
      <SettingsCard title="Built-in reader" badge={<StatusBadge tone={native.ready ? 'ok' : 'muted'}>{label}</StatusBadge>}>
        {!native.compiled ? (
          <SettingRow title="Not in this version" hint="Indra, below, can read scanned pages." />
        ) : (
          <>
            {native.packs.length > 1 && (
              <SettingRow title="Languages" icon={glyph(Translate)}>
                <div className="w-[240px]">
                  <SelectField value={native.selectedPack ?? ''} options={packOptions(native.packs)} onChange={native.selectPack} disabled={native.downloading} />
                </div>
              </SettingRow>
            )}
            <SettingRow
              title={native.ready ? 'Reading scanned pages' : needsModels ? 'Download the models' : 'Start the reader'}
              icon={glyph(native.ready ? Power : needsModels ? Download : Power)}
              hint={native.initError ?? undefined}
            >
              {native.ready ? (
                <StatusBadge tone="ok">Ready</StatusBadge>
              ) : needsModels ? (
                <ActionButton type="button" tone="primary" onClick={() => void native.startDownload()} disabled={!native.canDownload}>
                  {native.buttonLabel}
                </ActionButton>
              ) : (
                <ActionButton type="button" tone="primary" onClick={() => void native.initialize()} disabled={!native.canInitialize || native.initializing}>
                  {native.initializing ? 'Starting...' : 'Start'}
                </ActionButton>
              )}
            </SettingRow>
            {download?.status === 'running' && <ProgressRow label={download.current_file || 'Downloading models'} percent={percent(download)} />}
          </>
        )}
      </SettingsCard>

      {native.compiled && <NativeModelsPanel statuses={native.models} folder={native.modelDir} />}

      <IndraPanel />
    </>
  )
}
