import type { ComponentType } from 'react'
import type { ComponentProps } from '../NodeView'
import { Axes, plotArea } from '../charts/Axes'
import { ChartShell, type LegendItem } from '../charts/ChartShell'
import { CrosshairOverlay, CrosshairTip, useCrosshair, type Hover } from '../charts/Crosshair'
import { readPoints, readSeries, strings, text, withUnit, type SeriesData } from '../charts/readers'
import { formatTick, linear, niceDomain, niceTicks } from '../charts/scale'
import { seriesAccent } from '../charts/seriesTone'

// A single series needs no legend: its name is the title or the axis.
const legendOf = (series: SeriesData[], swatch: LegendItem['swatch'] = 'line'): LegendItem[] =>
  series.length > 1 ? series.map((item, index) => ({ label: item.name, accent: seriesAccent(index, item.tone), swatch })) : []

function Empty({ what }: { what: string }) {
  return <div className="my-3 rounded-lg border border-dashed border-app-border-subtle px-3 py-2 text-xs text-app-text-muted">{what}</div>
}

function valueRange(series: SeriesData[], stacked: boolean, includeZero: boolean): [number, number] {
  const length = Math.max(0, ...series.map((item) => item.values.length))
  const all: number[] = []
  if (stacked) {
    for (let i = 0; i < length; i++) {
      let up = 0
      let down = 0
      for (const item of series) {
        const v = item.values[i]
        if (Number.isFinite(v)) {
          if (v >= 0) up += v
          else down += v
        }
      }
      all.push(up, down)
    }
  } else {
    series.forEach((item) => item.values.forEach((v) => Number.isFinite(v) && all.push(v)))
  }
  if (includeZero) all.push(0)
  if (all.length === 0) return [0, 1]
  return niceDomain(Math.min(...all), Math.max(...all))
}

function BarChart({ props }: ComponentProps) {
  const labels = strings(props.labels)
  const series = readSeries(props.series)
  const horizontal = props.horizontal === true
  const stacked = props.mode === 'stacked'
  const unit = text(props.unit)
  if (labels.length === 0 || series.length === 0) return <Empty what="A bar chart needs labels and at least one series." />
  const [low, high] = valueRange(series, stacked, true)

  return (
    <ChartShell title={text(props.title)} legend={legendOf(series, 'box')} ratio={horizontal ? Math.min(0.9, 0.12 * labels.length + 0.2) : 0.5} minHeight={horizontal ? 160 : 220}>
      {(size) => {
        const area = plotArea(size, { xLabel: text(props.xLabel), yLabel: text(props.yLabel), left: horizontal ? Math.min(140, 8 + Math.max(...labels.map((label) => label.length)) * 6.2) : 44 })
        const band = (horizontal ? area.height : area.width) / labels.length
        const value = horizontal ? linear([low, high], [area.left, area.left + area.width]) : linear([low, high], [area.top + area.height, area.top])
        const ticks = niceTicks(low, high, horizontal ? 5 : 6)
        const inner = band * 0.72
        const each = stacked ? inner : inner / series.length
        return (
          <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Bar chart'}>
            <Axes
              area={area}
              size={size}
              xLabel={text(props.xLabel)}
              yLabel={text(props.yLabel)}
              horizontal={horizontal}
              y={horizontal ? { scale: linear([0, 1], [0, 0]), ticks: [] } : { scale: value, ticks }}
              x={horizontal ? { scale: value, ticks } : undefined}
              categories={labels.map((label, index) => ({ label, at: (horizontal ? area.top : area.left) + band * (index + 0.5) }))}
              origin
            />
            {labels.map((label, index) => {
              let up = 0
              let down = 0
              return series.map((item, s) => {
                const v = item.values[index]
                if (!Number.isFinite(v)) return null
                const start = stacked ? (v >= 0 ? up : down) : 0
                if (stacked) {
                  if (v >= 0) up += v
                  else down += v
                }
                const a = value(start)
                const b = value(start + v)
                const offset = (horizontal ? area.top : area.left) + band * index + (band - inner) / 2 + (stacked ? 0 : each * s)
                const rect = horizontal
                  ? { x: Math.min(a, b), y: offset, width: Math.abs(b - a), height: each - (stacked ? 0 : 2) }
                  : { x: offset, y: Math.min(a, b), width: each - (stacked ? 0 : 2), height: Math.abs(b - a) }
                return (
                  <rect key={`${index}-${s}`} {...rect} rx="2" fill="currentColor" className={seriesAccent(s, item.tone)} opacity="0.88">
                    <title>{`${label}${series.length > 1 ? ` - ${item.name}` : ''}: ${withUnit(v, unit)}`}</title>
                  </rect>
                )
              })
            })}
          </svg>
        )
      }}
    </ChartShell>
  )
}

function lineLike(props: ComponentProps['props'], filled: boolean) {
  const labels = strings(props.labels)
  const series = readSeries(props.series)
  const unit = text(props.unit)
  const stacked = filled && props.stacked === true
  if (labels.length === 0 || series.length === 0) return <Empty what="A line chart needs labels and at least one series." />
  const [low, high] = valueRange(series, stacked, filled)
  const ticks = niceTicks(low, high, 6)

  return (
    <ChartShell title={text(props.title)} legend={legendOf(series)}>
      {(size) => <LineBody size={size} props={props} labels={labels} series={series} unit={unit} stacked={stacked} filled={filled} low={low} high={high} ticks={ticks} />}
    </ChartShell>
  )
}

function LineBody({ size, props, labels, series, unit, stacked, filled, low, high, ticks }: {
  size: { width: number; height: number }
  props: ComponentProps['props']
  labels: string[]
  series: SeriesData[]
  unit?: string
  stacked: boolean
  filled: boolean
  low: number
  high: number
  ticks: number[]
}) {
  const area = plotArea(size, { xLabel: text(props.xLabel), yLabel: text(props.yLabel) })
  const y = linear([low, high], [area.top + area.height, area.top])
  const step = area.width / labels.length
  const xAt = (index: number) => area.left + step * (index + 0.5)
  const running = labels.map(() => 0)
  const lines = series.map((item, s) => {
    const base = stacked ? [...running] : labels.map(() => 0)
    const tops = labels.map((_, i) => {
      const v = item.values[i]
      const value = Number.isFinite(v) ? v : NaN
      if (stacked && Number.isFinite(value)) running[i] += value
      return stacked ? running[i] : value
    })
    return { item, s, base, tops }
  })
  const every = labels.length <= 40
  const crosshair = useCrosshair((px): Hover | null => {
    const index = Math.min(labels.length - 1, Math.max(0, Math.round((px - area.left) / step - 0.5)))
    if (px < area.left || px > area.left + area.width) return null
    return {
      px: xAt(index),
      heading: labels[index],
      rows: series.map((item, s) => ({ label: item.name, value: Number.isFinite(item.values[index]) ? withUnit(item.values[index], unit) : '-', accent: seriesAccent(s, item.tone) }))
    }
  })

  return (
    <>
      <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Line chart'}>
        <Axes area={area} size={size} xLabel={text(props.xLabel)} yLabel={text(props.yLabel)} y={{ scale: y, ticks }} categories={labels.map((label, i) => ({ label: labels.length > 14 && i % Math.ceil(labels.length / 14) !== 0 ? '' : label, at: xAt(i) }))} origin />
        {lines.map(({ item, s, base, tops }) => {
          const accent = seriesAccent(s, item.tone)
          const upper = tops.map((v, i) => (Number.isFinite(v) ? `${xAt(i).toFixed(1)} ${y(v).toFixed(1)}` : null))
          const path = upper.filter(Boolean).map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
          const lower = [...tops.keys()].reverse().filter((i) => Number.isFinite(tops[i])).map((i) => `L${xAt(i).toFixed(1)} ${y(base[i]).toFixed(1)}`).join(' ')
          return (
            <g key={s} className={accent}>
              {filled && path && <path d={`${path} ${lower} Z`} fill="currentColor" opacity="0.16" />}
              {path && <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {every && tops.map((v, i) => Number.isFinite(v) && <circle key={i} cx={xAt(i)} cy={y(v)} r="2.8" fill="currentColor" />)}
            </g>
          )
        })}
        <CrosshairOverlay area={area} {...crosshair} />
      </svg>
      <CrosshairTip hover={crosshair.hover} width={size.width} top={area.top} />
    </>
  )
}

const LineChart = ({ props }: ComponentProps) => lineLike(props, false)
const AreaChart = ({ props }: ComponentProps) => lineLike(props, true)

function PieChart({ props }: ComponentProps) {
  const labels = strings(props.labels)
  const values = (Array.isArray(props.values) ? props.values : []).map((v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0))
  const total = values.reduce((sum, v) => sum + v, 0)
  if (labels.length === 0 || total <= 0) return <Empty what="A pie chart needs labels and positive values." />
  const donut = props.donut === true
  const legend: LegendItem[] = labels.map((label, i) => ({ label: `${label} (${((values[i] / total) * 100).toFixed(values[i] / total < 0.1 ? 1 : 0)}%)`, accent: seriesAccent(i), swatch: 'box' }))

  return (
    <ChartShell title={text(props.title)} legend={legend} ratio={0.42} minHeight={190} maxHeight={280}>
      {(size) => {
        const radius = Math.min(size.width, size.height) / 2 - 6
        const cx = size.width / 2
        const cy = size.height / 2
        let angle = -Math.PI / 2
        return (
          <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Pie chart'}>
            {values.map((v, i) => {
              if (v <= 0) return null
              const sweep = (v / total) * Math.PI * 2
              const from = angle
              angle += sweep
              const to = angle
              const point = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
              const large = sweep > Math.PI ? 1 : 0
              const inner = donut ? radius * 0.58 : 0
              const d = sweep >= Math.PI * 2 - 1e-6
                ? `M${point(radius, from)} A${radius} ${radius} 0 1 1 ${point(radius, from + Math.PI)} A${radius} ${radius} 0 1 1 ${point(radius, from)} Z`
                : `M${point(radius, from)} A${radius} ${radius} 0 ${large} 1 ${point(radius, to)} ${donut ? `L${point(inner, to)} A${inner} ${inner} 0 ${large} 0 ${point(inner, from)}` : `L${cx} ${cy}`} Z`
              return (
                <path key={i} d={d} fill="currentColor" className={`${seriesAccent(i)} stroke-app-surface`} strokeWidth="1.5" opacity="0.92">
                  <title>{`${labels[i]}: ${formatTick(v)} (${((v / total) * 100).toFixed(1)}%)`}</title>
                </path>
              )
            })}
          </svg>
        )
      }}
    </ChartShell>
  )
}

function ScatterChart({ props }: ComponentProps) {
  const series = readPoints(props.series)
  const all = series.flatMap((item) => item.points)
  if (all.length === 0) return <Empty what="A scatter chart needs at least one point." />
  const [xLow, xHigh] = niceDomain(Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0])))
  const [yLow, yHigh] = niceDomain(Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1])))
  const legend: LegendItem[] = series.length > 1 ? series.map((item, i) => ({ label: item.name, accent: seriesAccent(i, item.tone), swatch: 'dot' })) : []

  return (
    <ChartShell title={text(props.title)} legend={legend} ratio={0.62} maxHeight={440}>
      {(size) => {
        const area = plotArea(size, { xLabel: text(props.xLabel), yLabel: text(props.yLabel) })
        const x = linear([xLow, xHigh], [area.left, area.left + area.width])
        const y = linear([yLow, yHigh], [area.top + area.height, area.top])
        return (
          <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Scatter chart'}>
            <Axes area={area} size={size} xLabel={text(props.xLabel)} yLabel={text(props.yLabel)} x={{ scale: x, ticks: niceTicks(xLow, xHigh, 7) }} y={{ scale: y, ticks: niceTicks(yLow, yHigh, 6) }} origin />
            {series.map((item, s) => (
              <g key={s} className={seriesAccent(s, item.tone)}>
                {item.line && <path d={item.points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${x(px).toFixed(1)} ${y(py).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />}
                {item.points.map(([px, py], i) => (
                  <circle key={i} cx={x(px)} cy={y(py)} r="3.6" fill="currentColor" opacity="0.75">
                    <title>{`${item.name}: (${formatTick(px)}, ${formatTick(py)})`}</title>
                  </circle>
                ))}
              </g>
            ))}
          </svg>
        )
      }}
    </ChartShell>
  )
}

export const chartComponents: Record<string, ComponentType<ComponentProps>> = { BarChart, LineChart, AreaChart, PieChart, ScatterChart }
