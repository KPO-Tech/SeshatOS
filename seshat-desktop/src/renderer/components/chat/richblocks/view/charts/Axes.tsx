import { formatTick, type Scale } from './scale'

export type PlotArea = { left: number; top: number; width: number; height: number }

const TICK_TEXT = 'fill-app-text-muted text-[10.5px]'
const AXIS_LABEL = 'fill-app-text-secondary text-[11px]'

/** Where the data is drawn inside an SVG of this size: room left for the value labels, below for the labels of the axes. */
export function plotArea(size: { width: number; height: number }, options: { xLabel?: string; yLabel?: string; left?: number; right?: number; top?: number } = {}): PlotArea {
  const left = (options.left ?? 44) + (options.yLabel ? 16 : 0)
  const right = options.right ?? 12
  const top = options.top ?? 8
  const bottom = 26 + (options.xLabel ? 16 : 0)
  return { left, top, width: Math.max(10, size.width - left - right), height: Math.max(10, size.height - top - bottom) }
}

type AxesProps = {
  area: PlotArea
  size: { width: number; height: number }
  xLabel?: string
  yLabel?: string
  /** Horizontal rules and value labels. */
  y: { scale: Scale; ticks: number[]; format?: (value: number) => string }
  /** Vertical rules and labels when the x axis is numeric. */
  x?: { scale: Scale; ticks: number[]; format?: (value: number) => string }
  /** Labels at given places when the x axis is made of categories. */
  categories?: Array<{ at: number; label: string }>
  /** Draw the lines x = 0 and y = 0 when they are inside the area. */
  origin?: boolean
  /** Swap the roles: categories on the left, values below. */
  horizontal?: boolean
}

/** The axes of a chart: rules, tick labels, axis labels. It draws no data. */
export function Axes({ area, size, xLabel, yLabel, y, x, categories, origin, horizontal }: AxesProps) {
  const right = area.left + area.width
  const bottom = area.top + area.height
  const yFormat = y.format ?? formatTick
  const xFormat = x?.format ?? formatTick
  return (
    <g>
      {y.ticks.map((tick) => {
        const at = y.scale(tick)
        return (
          <g key={`y${tick}`}>
            <line x1={area.left} x2={right} y1={at} y2={at} className="stroke-app-border-subtle" strokeWidth="1" />
            {!horizontal && (
              <text x={area.left - 6} y={at} textAnchor="end" dominantBaseline="middle" className={TICK_TEXT}>
                {yFormat(tick)}
              </text>
            )}
          </g>
        )
      })}
      {x?.ticks.map((tick) => {
        const at = x.scale(tick)
        return (
          <g key={`x${tick}`}>
            <line x1={at} x2={at} y1={area.top} y2={bottom} className="stroke-app-border-subtle" strokeWidth="1" opacity="0.6" />
            <text x={at} y={bottom + 14} textAnchor="middle" className={TICK_TEXT}>
              {xFormat(tick)}
            </text>
          </g>
        )
      })}
      {categories?.map((category, index) => (
        <text
          key={index}
          x={horizontal ? area.left - 6 : category.at}
          y={horizontal ? category.at : bottom + 14}
          textAnchor={horizontal ? 'end' : 'middle'}
          dominantBaseline={horizontal ? 'middle' : undefined}
          className={TICK_TEXT}
        >
          {category.label}
        </text>
      ))}
      {origin && x && x.scale.domain[0] < 0 && x.scale.domain[1] > 0 && (
        <line x1={x.scale(0)} x2={x.scale(0)} y1={area.top} y2={bottom} className="stroke-app-text-muted" strokeWidth="1.2" />
      )}
      {origin && y.scale.domain[0] < 0 && y.scale.domain[1] > 0 && (
        <line x1={area.left} x2={right} y1={y.scale(0)} y2={y.scale(0)} className="stroke-app-text-muted" strokeWidth="1.2" />
      )}
      <rect x={area.left} y={area.top} width={area.width} height={area.height} fill="none" className="stroke-app-border-subtle" strokeWidth="1" />
      {xLabel && (
        <text x={area.left + area.width / 2} y={size.height - 4} textAnchor="middle" className={AXIS_LABEL}>
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text transform={`translate(11 ${area.top + area.height / 2}) rotate(-90)`} textAnchor="middle" className={AXIS_LABEL}>
          {yLabel}
        </text>
      )}
    </g>
  )
}
