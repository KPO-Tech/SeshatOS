import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fillSheetReport, filledRows, SHEET_LIMITS, sheetOf } from '../../lang/sheet'
import { text } from '../charts/readers'
import { useRichBlockKey } from '../forms/FormContext'
import { blockHash, loadSheet, saveSheet } from '../forms/formStorage'
import type { ComponentProps } from '../NodeView'
import { SendReport } from './quiz'

// A table the reader fills in (ADR 0020): the agent gives the columns and, if it wants, some rows; the reader edits cells, adds and removes
// rows. What they type stays in the block (and in this computer's storage, like a form); only the report they choose to send leaves it.

const BOX = 'my-3 rounded-2xl border border-app-border-subtle bg-app-surface p-4'
const CELL = 'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] text-app-text outline-none placeholder:text-app-text-muted hover:border-app-border-subtle focus:border-[var(--accent-primary)]'

function Sheet({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const blockKey = useRichBlockKey()
  const spec = useMemo(() => sheetOf({ props }), [props])
  const storeKey = blockKey ? `${blockKey}.sheet.${blockHash(spec.columns.join('|'))}` : undefined
  const [rows, setRows] = useState<string[][]>(() => {
    const stored = storeKey ? loadSheet(storeKey, spec.columns.length) : null
    return stored ?? (spec.rows.length > 0 ? spec.rows : [spec.columns.map(() => '')])
  })
  useEffect(() => {
    if (storeKey) saveSheet(storeKey, rows)
  }, [storeKey, rows])
  if (spec.columns.length === 0) return null

  const template = typeof props.report === 'string' ? props.report.slice(0, SHEET_LIMITS.report) : ''
  const report = template && filledRows(rows).length > 0 ? fillSheetReport(template, spec.columns, rows) : ''
  const edit = (r: number, c: number, value: string) =>
    setRows((current) => current.map((row, at) => (at === r ? row.map((cellValue, k) => (k === c ? value.slice(0, SHEET_LIMITS.cell) : cellValue)) : row)))

  return (
    <div className={BOX}>
      {text(props.title) && <div className="mb-3 text-[14px] font-semibold text-app-text">{text(props.title)}</div>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {spec.columns.map((column, index) => (
                <th key={index} className="border-0 border-b border-solid border-app-border-subtle px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-app-text-muted">
                  {column}
                </th>
              ))}
              <th className="w-8 border-0 border-b border-solid border-app-border-subtle" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) => (
                  <td key={c} className="border-0 border-b border-solid border-app-border-subtle p-0.5">
                    <input type="text" value={value} aria-label={`${spec.columns[c]}, ${r + 1}`} maxLength={SHEET_LIMITS.cell} onChange={(event) => edit(r, c, event.target.value)} className={CELL} />
                  </td>
                ))}
                <td className="w-8 border-0 border-b border-solid border-app-border-subtle p-0.5 text-center">
                  <button
                    type="button"
                    aria-label={t('chat.richblocks.view.components.forms.sheetRemove', { n: r + 1 })}
                    title={t('chat.richblocks.view.components.forms.sheetRemove', { n: r + 1 })}
                    onClick={() => setRows((current) => (current.length > 1 ? current.filter((_, at) => at !== r) : [spec.columns.map(() => '')]))}
                    className="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-[14px] leading-none text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={rows.length >= SHEET_LIMITS.rows}
          onClick={() => setRows((current) => [...current, spec.columns.map(() => '')])}
          className="cursor-pointer rounded-lg border border-app-border-subtle bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('chat.richblocks.view.components.forms.sheetAdd')}
        </button>
        {report && <SendReport message={report} label={t('chat.richblocks.view.components.forms.sheetSend')} />}
      </div>
    </div>
  )
}

export const sheetComponents: Record<string, ComponentType<ComponentProps>> = { Sheet }
