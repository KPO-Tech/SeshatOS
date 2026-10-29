import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'
import { isNode } from '../../lang/parseUi'
import type { ComponentProps } from '../NodeView'
import { NodeList, NodeView } from '../NodeView'

type Column = { label: string; kind: string; align: string }

function columnsOf(value: unknown): Column[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNode).map((col) => {
    const kind = typeof col.props.kind === 'string' ? col.props.kind : 'text'
    const numeric = kind === 'number' || kind === 'percent' || kind === 'money'
    return {
      label: String(col.props.label),
      kind,
      align: typeof col.props.align === 'string' ? col.props.align : numeric ? 'right' : 'left'
    }
  })
}

function formatCell(value: unknown, kind: string): string {
  if (typeof value === 'number') {
    return kind === 'percent' ? `${value.toLocaleString()}%` : value.toLocaleString()
  }
  return String(value)
}

const ALIGN: Record<string, string> = { left: 'text-left', right: 'text-right', center: 'text-center' }

function sortKey(cell: unknown): string | number {
  if (isNode(cell)) return String(cell.props.text ?? cell.props.label ?? '')
  if (typeof cell === 'number') return cell
  return String(cell ?? '')
}

function Table({ props }: ComponentProps) {
  const columns = columnsOf(props.columns)
  const rows = useMemo(() => (Array.isArray(props.rows) ? (props.rows as unknown[][]) : []), [props.rows])
  const sortable = props.sortable === true
  const [sort, setSort] = useState<{ index: number; down: boolean } | null>(null)

  const shown = useMemo(() => {
    if (!sort) return rows
    return [...rows].sort((a, b) => {
      const x = sortKey(a[sort.index])
      const y = sortKey(b[sort.index])
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.down ? -order : order
    })
  }, [rows, sort])

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-app-border-subtle">
      <table className="w-full border-collapse text-[13px]">
        {typeof props.caption === 'string' && <caption className="px-3 py-2 text-left text-xs text-app-text-muted">{props.caption}</caption>}
        <thead>
          <tr className="bg-app-surface">
            {columns.map((column, index) => (
              <th key={index} scope="col" className={`border-0 border-b border-app-border-subtle px-3 py-2 font-medium text-app-text-secondary ${ALIGN[column.align]}`}>
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => setSort((current) => (current?.index === index ? { index, down: !current.down } : { index, down: false }))}
                    className="cursor-pointer border-0 bg-transparent p-0 font-medium text-inherit"
                  >
                    {column.label}
                    {sort?.index === index && <span aria-hidden="true">{sort.down ? ' v' : ' ^'}</span>}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="border-0 border-b border-app-border-subtle last:border-b-0">
              {columns.map((column, c) => (
                <td key={c} className={`px-3 py-2 align-top text-app-text ${ALIGN[column.align]}`}>
                  <Cell value={row[c]} kind={column.kind} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ value, kind }: { value: unknown; kind: string }) {
  if (value === undefined || value === null) return null
  if (isNode(value)) return <NodeView node={value} />
  return <>{formatCell(value, kind)}</>
}

const TREND = { up: '^', down: 'v', flat: '-' } as const
const TREND_CLASS = { up: 'text-app-success', down: 'text-app-error', flat: 'text-app-text-muted' } as const

function Metric({ props }: ComponentProps) {
  const trend = props.trend as keyof typeof TREND | undefined
  return (
    <div className="flex min-w-[8rem] flex-1 flex-col gap-0.5 rounded-lg border border-app-border-subtle bg-app-surface px-3.5 py-2.5">
      <div className="text-xs text-app-text-muted">{String(props.label)}</div>
      <div className="text-[22px] font-semibold leading-tight text-app-text">
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

export const dataComponents: Record<string, ComponentType<ComponentProps>> = { Table, Metric, MetricRow }
