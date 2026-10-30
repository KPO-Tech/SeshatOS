import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'
import { isNode } from '../../lang/parseUi'
import type { ComponentProps } from '../NodeView'
import { NodeList, NodeView } from '../NodeView'
import { Expandable, useExpanded } from '../expand/Expandable'
import { hasMarkdown, MarkdownText } from '../text/MarkdownText'
import { buildTableModel, type Align, type BodyCell, type BodyRow, type HeaderCell } from '../table/tableModel'
import { TONES, toneOrNull } from '../tones'

function formatCell(value: unknown, kind: string): string {
  if (typeof value === 'number') {
    return kind === 'percent' ? `${value.toLocaleString()}%` : value.toLocaleString()
  }
  return String(value)
}

/** A table with more rows or columns than these is offered in the large view even when it fits the column. */
const LONG_TABLE = 12
const WIDE_TABLE = 6

const ALIGN: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' }

function sortKey(content: unknown): string | number {
  if (isNode(content)) return String(content.props.text ?? content.props.label ?? '')
  if (typeof content === 'number') return content
  return String(content ?? '')
}

const softOf = (tone: string | undefined) => {
  const known = toneOrNull(tone)
  return known && known !== 'neutral' ? TONES[known].soft : ''
}
const strongOf = (tone: string | undefined) => {
  const known = toneOrNull(tone)
  return known ? TONES[known].strong : TONES.neutral.strong
}

function CellContent({ cell }: { cell: Pick<BodyCell, 'content' | 'column'> }) {
  const { content } = cell
  if (content === undefined || content === null) return null
  if (isNode(content)) return <NodeView node={content} />
  const text = formatCell(content, cell.column?.kind ?? 'text')
  if (typeof content === 'string' && hasMarkdown(content)) return <MarkdownText text={content} />
  return text.includes('\n') ? <span className="whitespace-pre-line">{text}</span> : <>{text}</>
}

function HeaderRow({ cells, padding, sortable, sort, onSort }: {
  cells: HeaderCell[]
  padding: string
  sortable: boolean
  sort: { index: number; down: boolean } | null
  onSort: (index: number) => void
}) {
  const expanded = useExpanded()
  return (
    <tr>
      {cells.map((cell, index) => (
        <th
          key={index}
          scope="col"
          colSpan={cell.colSpan}
          rowSpan={cell.rowSpan}
          className={`${expanded ? 'sticky top-0 z-10 bg-[var(--surface-panel)]' : ''} border-0 border-b border-app-border-subtle font-medium text-app-text-secondary ${padding} ${ALIGN[cell.align]} ${strongOf(cell.tone)}`}
        >
          {sortable && cell.leaf !== undefined ? (
            <button type="button" onClick={() => onSort(cell.leaf as number)} className="cursor-pointer border-0 bg-transparent p-0 font-medium text-inherit">
              {cell.label}
              {sort?.index === cell.leaf && <span aria-hidden="true">{sort.down ? ' v' : ' ^'}</span>}
            </button>
          ) : (
            cell.label
          )}
        </th>
      ))}
    </tr>
  )
}

function BodyRowView({ row, padding, striped }: { row: BodyRow; padding: string; striped: boolean }) {
  const rowFill = row.kind === 'section' ? strongOf(row.tone) : softOf(row.tone)
  const rowClass = [
    'border-0 border-b border-app-border-subtle last:border-b-0',
    row.kind === 'total' ? 'border-t-2 border-t-app-border font-semibold' : '',
    row.kind === 'header' ? 'font-medium text-app-text-secondary' : '',
    row.kind === 'section' ? 'font-semibold' : '',
    striped && row.kind === 'normal' && !row.tone ? 'even:bg-app-surface/60' : '',
    rowFill
  ].join(' ')
  return (
    <tr className={rowClass}>
      {row.cells.map((cell, index) => {
        const fill = softOf(cell.tone ?? (row.kind === 'normal' ? cell.column?.tone : undefined))
        return (
          <td
            key={index}
            colSpan={cell.colSpan}
            rowSpan={cell.rowSpan}
            className={`align-top text-app-text ${padding} ${ALIGN[cell.align]} ${cell.bold ? 'font-semibold' : ''} ${fill}`}
          >
            <CellContent cell={cell} />
          </td>
        )
      })}
    </tr>
  )
}

function Table({ props }: ComponentProps) {
  const model = useMemo(() => buildTableModel(props.columns, props.rows), [props.columns, props.rows])
  const sortable = props.sortable === true && !model.complex
  const [sort, setSort] = useState<{ index: number; down: boolean } | null>(null)
  const expanded = useExpanded()
  const padding = expanded ? 'min-w-[7rem] px-4 py-2.5' : props.compact === true ? 'px-2.5 py-1' : 'px-3 py-2'

  const rows = useMemo(() => {
    if (!sort) return model.rows
    return [...model.rows].sort((a, b) => {
      const x = sortKey(a.cells[sort.index]?.content)
      const y = sortKey(b.cells[sort.index]?.content)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.down ? -order : order
    })
  }, [model.rows, sort])

  const onSort = (index: number) => setSort((current) => (current?.index === index ? { index, down: !current.down } : { index, down: false }))

  return (
    <Expandable label={typeof props.caption === 'string' ? props.caption : 'Table'} force={model.rows.length > LONG_TABLE || model.leaves.length > WIDE_TABLE} scrollX className="my-3 overflow-hidden rounded-lg border border-app-border-subtle">
      <table className={`w-full border-collapse ${expanded || props.compact !== true ? 'text-[13px]' : 'text-[12px]'}`}>
        {typeof props.caption === 'string' && <caption className="px-3 py-2 text-left text-xs text-app-text-muted">{props.caption}</caption>}
        <thead>
          {model.headerRows.map((cells, index) => (
            <HeaderRow key={index} cells={cells} padding={padding} sortable={sortable} sort={sort} onSort={onSort} />
          ))}
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <BodyRowView key={index} row={row} padding={padding} striped={props.striped === true} />
          ))}
        </tbody>
      </table>
    </Expandable>
  )
}

const TREND = { up: '^', down: 'v', flat: '-' } as const
const TREND_CLASS = { up: 'text-app-success', down: 'text-app-error', flat: 'text-app-text-muted' } as const

function Metric({ props }: ComponentProps) {
  const trend = props.trend as keyof typeof TREND | undefined
  const tone = toneOrNull(props.tone)
  return (
    <div className={`flex min-w-[8rem] flex-1 flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 ${tone ? TONES[tone].box : 'border-app-border-subtle bg-app-surface'}`}>
      <div className="text-xs text-app-text-muted">{String(props.label)}</div>
      <div className={`text-[22px] font-semibold leading-tight ${tone && tone !== 'neutral' ? TONES[tone].accent : 'text-app-text'}`}>
        {typeof props.value === 'number' ? props.value.toLocaleString() : String(props.value)}
      </div>
      {(props.delta !== undefined || typeof props.note === 'string') && (
        <div className="flex items-center gap-1.5 text-xs">
          {props.delta !== undefined && (
            <span className={trend ? TREND_CLASS[trend] : 'text-app-text-secondary'}>
              {trend && <span aria-hidden="true">{`${TREND[trend]} `}</span>}
              {String(props.delta)}
            </span>
          )}
          {typeof props.note === 'string' && <span className="text-app-text-muted">{props.note}</span>}
        </div>
      )}
    </div>
  )
}

function MetricRow({ props }: ComponentProps) {
  return (
    <div className="my-3 flex flex-wrap gap-2.5">
      <NodeList nodes={props.metrics} />
    </div>
  )
}

// Cell, Col, ColGroup and Row are read by their Table, which draws them: on their own they draw nothing.
function ReadByTable() {
  return null
}

export const dataComponents: Record<string, ComponentType<ComponentProps>> = { Table, Metric, MetricRow, Cell: ReadByTable, Col: ReadByTable, ColGroup: ReadByTable, Row: ReadByTable }
