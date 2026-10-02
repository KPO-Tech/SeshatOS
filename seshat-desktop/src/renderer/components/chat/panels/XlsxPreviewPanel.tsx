import { useEffect, useState } from 'react'
import ExcelJS from 'exceljs'
import { api, ApiError } from '@renderer/api/client'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  fileId: string
  filename: string
}

type SheetData = { name: string; rows: string[][] }

// Caps how many rows get turned into real DOM <tr>s - a preview panel isn't
// a spreadsheet editor, and a multi-thousand-row sheet rendered as one flat
// HTML table would be a real jank/freeze risk for no benefit over showing
// the first slice with a clear "there's more" notice.
const MAX_PREVIEW_ROWS = 1000

function base64ToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return bytes.buffer
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toLocaleDateString()
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as { text: string }[]).map((t) => t.text).join('')
    if ('result' in v) return String((v as { result?: unknown }).result ?? '')
    if ('text' in v) return String((v as { text?: unknown }).text ?? '')
    if ('error' in v) return String((v as { error?: unknown }).error ?? '#ERROR')
    return ''
  }
  return String(v)
}

// Renders a .xlsx workbook's real content directly in the browser. exceljs
// parses the workbook client-side, then this panel exposes the sheets as
// scrollable HTML tables.
export function XlsxPreviewPanel({ fileId, filename }: Props) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null)
  const [activeSheet, setActiveSheet] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    setSheets(null)
    setActiveSheet(0)

    async function open() {
      try {
        const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
        if (cancelled) return
        const buffer = base64ToArrayBuffer(dataUrl)
        const workbook = new ExcelJS.Workbook()
        // exceljs's own type declares Buffer, but its doc comment confirms
        // an ArrayBuffer works at runtime - there's no Node Buffer in this
        // sandboxed Electron renderer (contextIsolation/no nodeIntegration).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await workbook.xlsx.load(buffer as any)
        if (cancelled) return

        const parsed: SheetData[] = workbook.worksheets.map((ws) => {
          const rows: string[][] = []
          const colCount = Math.max(ws.actualColumnCount || 0, ws.columnCount || 0, 1)
          ws.eachRow({ includeEmpty: true }, (row) => {
            if (rows.length >= MAX_PREVIEW_ROWS) return
            const cells: string[] = []
            for (let c = 1; c <= colCount; c++) {
              cells.push(cellText(row.getCell(c)))
            }
            rows.push(cells)
          })
          return { name: ws.name || 'Sheet', rows }
        })
        setSheets(parsed)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to render spreadsheet'
        setErrorMessage(message)
        setStatus('error')
      }
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [fileId])

  const current = sheets?.[activeSheet]
  const truncated = (current?.rows.length ?? 0) >= MAX_PREVIEW_ROWS

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {sheets && sheets.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-app-border-subtle px-2 py-1.5">
          {sheets.map((sheet, i) => {
            const active = i === activeSheet
            return (
              <button
                key={sheet.name + i}
                type="button"
                className={cx(
                  'cursor-pointer rounded-md border px-2.5 py-1 text-[11px]',
                  active
                    ? 'border-[var(--accent-primary,var(--accent-primary))] bg-[color-mix(in_srgb,var(--accent-primary,var(--accent-primary))_12%,var(--surface-panel))] text-app-text'
                    : 'border-app-border-subtle bg-app-surface text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text',
                )}
                onClick={() => setActiveSheet(i)}
              >
                {sheet.name}
              </button>
            )
          })}
        </div>
      )}
      <div className="xlsx-preview-scroll min-h-0 flex-1 overflow-auto bg-white">
        {current && current.rows.length > 0 ? (
          <>
            <table className="border-collapse whitespace-nowrap text-[12px] text-[#1c1a17]">
              <tbody>
                {current.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-[#e4dfd4] px-2 py-1">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated && <div className="px-3.5 py-2.5 text-[11px] text-app-text-muted">Showing the first {MAX_PREVIEW_ROWS} rows.</div>}
          </>
        ) : current ? (
          <div className="px-3.5 py-2.5 text-[11px] text-app-text-muted">This sheet is empty.</div>
        ) : null}
      </div>
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-text-muted">Loading {filename}…</div>
      )}
      {status === 'error' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-surface px-5 text-center text-[12px] text-app-error">Couldn't load this spreadsheet: {errorMessage}</div>
      )}
    </div>
  )
}
