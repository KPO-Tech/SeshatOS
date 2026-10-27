import type { ReactNode } from 'react'
import { LayoutOne, Page, Scan, Table, TextRecognition } from '@icon-park/react'
import { StatusPill } from './KnowledgePrimitives'
import type { NativeDocModelStatus } from './knowledgeTypes'

type ModelInfo = { title: string; role: string; icon: ReactNode }

// The models the local reader runs on a scanned page, in the order they work: layout, then the lines of text, their characters, and the
// structure of the tables.
const MODELS: Record<string, ModelInfo> = {
  'layout.ort': { title: 'Page layout', role: 'Finds the titles, paragraphs, pictures and tables of a scanned page.', icon: <LayoutOne size={16} /> },
  'det.ort': { title: 'Text detection', role: 'Finds where each line of text sits on the page.', icon: <Scan size={16} /> },
  'rec.ort': { title: 'Text recognition', role: 'Reads the characters of each line. It depends on the languages chosen.', icon: <TextRecognition size={16} /> },
  'ocr.res': { title: 'Character list', role: 'The characters the recognizer can write.', icon: <Page size={16} /> },
  'tsr.ort': { title: 'Table structure', role: 'Finds the rows and columns of a table, so each cell keeps its own text.', icon: <Table size={16} /> }
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

// One row for each model the local reader uses on a scanned page, with what it does and whether it is on this computer.
export function NativeModelsPanel({ statuses, folder }: { statuses: NativeDocModelStatus[]; folder: string | null }) {
  if (statuses.length === 0) return null
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="border-b border-[var(--border-soft)] px-3 py-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">Models for scanned pages</div>
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">They work one after the other on each page. PDFs that already hold their text do not need them.</div>
      </div>
      <ul className="m-0 list-none p-0">
        {orderedModels(statuses).map((model) => {
          const info = MODELS[model.file] ?? { title: model.file, role: '', icon: <Page size={16} /> }
          return (
            <li key={model.file} className="flex items-center gap-3 border-b border-[var(--border-soft)] px-3 py-2.5 last:border-b-0">
              <span
                className={[
                  'flex size-8 shrink-0 items-center justify-center rounded-md',
                  model.installed ? 'bg-[var(--accent-success)]/10 text-[var(--accent-success)]' : 'bg-[var(--border-soft)] text-[var(--text-muted)]'
                ].join(' ')}
              >
                {info.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[var(--text-primary)]">{info.title}</span>
                <span className="block text-[11px] leading-[15px] text-[var(--text-muted)]">{info.role}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {model.installed && <span className="text-[11px] text-[var(--text-faint)]">{size(model.size_bytes)}</span>}
                <StatusPill tone={model.installed ? 'ok' : model.required ? 'warn' : 'muted'}>
                  {model.installed ? 'Installed' : model.required ? 'Missing' : 'Not installed'}
                </StatusPill>
              </span>
            </li>
          )
        })}
      </ul>
      {folder && (
        <div className="truncate border-t border-[var(--border-soft)] px-3 py-1.5 text-[10.5px] text-[var(--text-faint)]" title={folder}>
          {folder}
        </div>
      )}
    </div>
  )
}
