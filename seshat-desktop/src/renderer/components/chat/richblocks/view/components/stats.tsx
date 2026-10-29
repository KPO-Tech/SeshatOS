import type { ComponentType } from 'react'
import type { ComponentProps } from '../NodeView'
import { Axes, plotArea } from '../charts/Axes'
import { ChartShell } from '../charts/ChartShell'
import { finite, numbers, strings, text } from '../charts/readers'
import { formatTick, linear, niceDomain, niceTicks } from '../charts/scale'
import { seriesAccent } from '../charts/seriesTone'

function Empty({ what }: { what: string }) {
  return <div className="my-3 rounded-lg border border-dashed border-app-border-subtle px-3 py-2 text-xs text-app-text-muted">{what}</div>
}

export type Bin = { from: number; to: number; count: number }

/** Equal bins over the range of the values; Sturges' rule gives the number of bins when none is asked. */
export function histogramBins(values: number[], asked?: number): Bin[] {
  const data = values.filter(Number.isFinite)
  if (data.length === 0) return []
  const min = Math.min(...data)
  const max = Math.max(...data)
  const count = Math.max(1, Math.min(200, Math.round(asked ?? Math.ceil(Math.log2(data.length)) + 1)))
  const span = max - min || 1
  const width = span / count
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }))
  for (const value of data) bins[Math.min(count - 1, Math.floor((value - min) / width))].count++
  return bins
}

function Histogram({ props }: ComponentProps) {
  const values = numbers(props.values)
  const bins = histogramBins(values, finite(props.bins))
  if (bins.length === 0) return <Empty what="A histogram needs numbers." />
  const top = Math.max(...bins.map((bin) => bin.count))
  const [yLow, yHigh] = niceDomain(0, top, 5)
  const accent = seriesAccent(0, props.tone)

  return (
    <ChartShell title={text(props.title)}>
      {(size) => {
        const area = plotArea(size, { xLabel: text(props.xLabel), yLabel: 'Count' })
        const x = linear([bins[0].from, bins[bins.length - 1].to], [area.left, area.left + area.width])
        const y = linear([yLow, yHigh], [area.top + area.height, area.top])
        return (
          <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Histogram'}>
            <Axes area={area} size={size} xLabel={text(props.xLabel)} yLabel="Count" x={{ scale: x, ticks: niceTicks(bins[0].from, bins[bins.length - 1].to, 8) }} y={{ scale: y, ticks: niceTicks(yLow, yHigh, 5) }} />
            {bins.map((bin, i) => (
              <rect key={i} x={x(bin.from) + 0.5} y={y(bin.count)} width={Math.max(0, x(bin.to) - x(bin.from) - 1)} height={Math.max(0, y(0) - y(bin.count))} fill="currentColor" className={accent} opacity="0.85">
                <title>{`${formatTick(Number(bin.from.toPrecision(4)))} to ${formatTick(Number(bin.to.toPrecision(4)))}: ${bin.count}`}</title>
              </rect>
            ))}
          </svg>
        )
      }}
    </ChartShell>
  )
}

/** How strongly a cell is shaded: the share of the way from the smallest value to the largest, with a floor so no cell is blank. */
export function shadeOf(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  const share = max > min ? (value - min) / (max - min) : 1
  return Math.round(8 + share * 62)
}

function Heatmap({ props }: ComponentProps) {
  const rows = strings(props.rows)
  const cols = strings(props.cols)
  const values = (Array.isArray(props.values) ? props.values : []).map((row) => numbers(row))
  const flat = values.flat().filter(Number.isFinite)
  if (rows.length === 0 || cols.length === 0 || flat.length === 0) return <Empty what="A heatmap needs row labels, column labels and a grid of numbers." />
  const min = Math.min(...flat)
  const max = Math.max(...flat)
  const decimals = Math.max(0, Math.min(6, Math.round(finite(props.decimals) ?? (flat.every(Number.isInteger) ? 0 : 2))))
  const accent = seriesAccent(0, props.tone)

  return (
    <figure className="m-0 my-3 overflow-x-auto rounded-lg border border-app-border-subtle bg-app-surface p-3">
      {text(props.title) && <figcaption className="mb-2 text-[13px] font-semibold text-app-text">{text(props.title)}</figcaption>}
      <div className="grid w-fit min-w-full gap-1" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(3.2rem, 1fr))` }}>
        <span />
        {cols.map((col, c) => (
          <span key={c} className="truncate px-1 pb-0.5 text-center text-[11px] font-medium text-app-text-muted" title={col}>{col}</span>
        ))}
        {rows.map((row, r) => (
          <div key={r} className="contents">
            <span className="flex items-center justify-end pr-2 text-[11px] font-medium text-app-text-muted">{row}</span>
            {cols.map((_, c) => {
              const value = values[r]?.[c]
              return (
                <span
                  key={c}
                  className={`flex min-h-[2rem] items-center justify-center rounded-md text-[12px] font-medium tabular-nums text-app-text ${accent}`}
                  style={{ backgroundColor: `color-mix(in srgb, currentColor ${shadeOf(value, min, max)}%, transparent)` }}
                  title={`${row} / ${cols[c]}: ${Number.isFinite(value) ? value : 'no value'}`}
                >
                  <span className="text-app-text">{Number.isFinite(value) ? value.toFixed(decimals) : ''}</span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </figure>
  )
}

export const statsComponents: Record<string, ComponentType<ComponentProps>> = { Histogram, Heatmap }
