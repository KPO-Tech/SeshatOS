import { useState, type ReactNode } from 'react'
import { LayoutOne, Page, Scan, Table, TextRecognition } from '@icon-park/react'
import { ActionButton, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import type { NativeDocModelStatus } from './knowledgeTypes'
import { useTranslation } from 'react-i18next'

type ModelInfo = { title: string; role: string; icon: ReactNode }

// The models the local reader runs on a scanned page, in the order they work: layout, then the lines of text, their characters, and the
// structure of the tables.
const MODELS: Record<string, ModelInfo> = {
  'layout.ort': { title: 'config:knowledge.nativeModelsPanel.pageLayout', role: 'Finds the titles, paragraphs, pictures and tables of a scanned page.', icon: <LayoutOne size={16} /> },
  'det.ort': { title: 'config:knowledge.nativeModelsPanel.textDetection', role: 'Finds where each line of text sits on the page.', icon: <Scan size={16} /> },
  'rec.ort': { title: 'config:knowledge.nativeModelsPanel.textRecognition', role: 'Reads the characters of each line. It depends on the languages chosen.', icon: <TextRecognition size={16} /> },
  'ocr.res': { title: 'config:knowledge.nativeModelsPanel.characterList', role: 'The characters the recognizer can write.', icon: <Page size={16} /> },
  'tsr.ort': { title: 'config:knowledge.nativeModelsPanel.tableStructure', role: 'Finds the rows and columns of a table, so each cell keeps its own text.', icon: <Table size={16} /> }
}
const ORDER = ['layout.ort', 'det.ort', 'rec.ort', 'ocr.res', 'tsr.ort']

export function orderedModels(statuses: NativeDocModelStatus[]): NativeDocModelStatus[] {
  const rank = (file: string) => {
    const index = ORDER.indexOf(file)
    return index === -1 ? ORDER.length : index
  }
  return [...statuses].sort((a, b) => rank(a.file) - rank(b.file))
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// One row for each model the local reader uses on a scanned page, folded under a summary of how many are on this computer.
export function NativeModelsPanel({ statuses, folder }: { statuses: NativeDocModelStatus[]; folder: string | null }) {
  const { t } = useTranslation('config')
  const [open, setOpen] = useState(false)
  if (statuses.length === 0) return null
  const installed = statuses.filter((model) => model.installed).length
  return (
    <SettingsCard
      title={t('knowledge.nativeModelsPanel.models')}
      icon={<Scan theme="outline" size={16} />}
      badge={<StatusBadge tone={installed === statuses.length ? 'ok' : 'muted'}>{t('knowledge.nativeModelsPanel.installedCount', { installed, total: statuses.length })}</StatusBadge>}
      action={
        <ActionButton type="button" onClick={() => setOpen((current) => !current)}>
          {open ? t('knowledge.nativeModelsPanel.hide') : t('knowledge.nativeModelsPanel.show')}
        </ActionButton>
      }
    >
      {open &&
        orderedModels(statuses).map((model) => {
          const known = MODELS[model.file]
          const info = known ?? { title: model.file, role: '', icon: <Page size={16} /> }
          return (
            <SettingRow key={model.file} title={known ? t(info.title) : info.title} icon={info.icon}>
              {model.installed && <span className="text-[12px] text-[var(--text-faint)]">{size(model.size_bytes)}</span>}
              <StatusBadge tone={model.installed ? 'ok' : 'muted'}>{model.installed ? t('knowledge.nativeModelsPanel.installed') : model.required ? t('knowledge.nativeModelsPanel.missing') : t('knowledge.nativeModelsPanel.notInstalled')}</StatusBadge>
            </SettingRow>
          )
        })}
      {open && folder && (
        <div className="truncate px-4 py-2 text-[11px] text-[var(--text-faint)]" title={folder}>
          {folder}
        </div>
      )}
      {!open && (
        <div className="px-4 py-3 text-[12px] text-[var(--text-muted)]">{t('knowledge.nativeModelsPanel.layoutTextDetectionRecognitionAnd')}</div>
      )}
    </SettingsCard>
  )
}
