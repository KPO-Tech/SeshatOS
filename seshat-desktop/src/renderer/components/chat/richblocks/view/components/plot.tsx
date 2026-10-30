import { useId, type ComponentType } from 'react'
import { isNode } from '../../lang/parseUi'
import type { UiNode } from '../../lang/types'
import type { ComponentProps } from '../NodeView'
import { Axes, plotArea } from '../charts/Axes'
import { ChartShell, type LegendItem } from '../charts/ChartShell'
import { CrosshairOverlay, CrosshairTip, useCrosshair, type Hover } from '../charts/Crosshair'
import { autoRange, derivativeOf, drawableRuns, integralSamples, sampleFormula, simpson, type Sample } from '../charts/curve'
import { tryParseExpression, type Formula } from '../charts/expression'
import { finite, readPoints, text } from '../charts/readers'
import { formatTick, linear, niceTicks } from '../charts/scale'
import { seriesAccent } from '../charts/seriesTone'
import { TONES, toneOrNull } from '../tones'

const NEUTRAL = TONES.neutral.accent
const kind = (node: UiNode) => node.name

type CurveLayer = { label: string; accent: string; dashed: boolean; at: (x: number) => number; samples: Sample[] }

const round = (value: number) => formatTick(Number(value.toPrecision(4)))

function describeCurve(node: UiNode): string {
  const expr = String(node.props.expr)
  if (node.props.op === 'derivative') return `d/dx ${expr}`
  if (node.props.op === 'integral') return `integral of ${expr}`
  return expr
}

function Plot({ props }: ComponentProps) {
  const xmin = finite(props.xmin)
  const xmax = finite(props.xmax)
  const layers = (Array.isArray(props.layers) ? props.layers : []).filter(isNode)
  const clipId = `clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  if (xmin === undefined || xmax === undefined || xmax <= xmin) {
    return <div className="my-3 rounded-lg border border-dashed border-app-border-subtle px-3 py-2 text-xs text-app-text-muted">A plot needs xmin below xmax.</div>
  }

  return (
    <ChartShell title={text(props.title)} ratio={0.6} maxHeight={460} legend={undefined}>
      {(size) => {
        const problems: string[] = []
        const formulaOf = (node: UiNode): Formula | null => {
          const parsed = tryParseExpression(String(node.props.expr))
          if (parsed.error) problems.push(`${kind(node)} "${String(node.props.expr)}": ${parsed.error}`)
          return parsed.formula ?? null
        }
        const area = plotArea(size, { xLabel: text(props.xLabel), yLabel: text(props.yLabel) })
        const n = Math.min(900, Math.max(160, Math.round(area.width)))
        let colour = 0
        const curves: CurveLayer[] = []
        const legend: LegendItem[] = []
        const rangeSources: Sample[][] = []

        // First pass: what each layer is, and the values that decide the vertical range.
        const prepared = layers.map((node) => {
          if (kind(node) === 'Curve') {
            const f = formulaOf(node)
            if (!f) return { node, accent: NEUTRAL }
            const accent = seriesAccent(colour++, node.props.tone)
            const op = node.props.op
            const samples = op === 'integral' ? integralSamples(f, xmin, xmax, n) : sampleFormula(op === 'derivative' ? derivativeOf(f) : f, xmin, xmax, n)
            const at = op === 'integral' ? (x: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.round(((x - xmin) / (xmax - xmin)) * (samples.length - 1))))].y : op === 'derivative' ? derivativeOf(f) : f
            const label = text(node.props.label) ?? describeCurve(node)
            curves.push({ label, accent, dashed: node.props.dashed === true, at, samples })
            legend.push({ label, accent, dashed: node.props.dashed === true })
            rangeSources.push(samples)
            return { node, accent, samples }
          }
          if (kind(node) === 'Shade') {
            const f = formulaOf(node)
            const from = finite(node.props.from) ?? xmin
            const to = finite(node.props.to) ?? xmax
            if (!f) return { node, accent: NEUTRAL }
            const accent = seriesAccent(colour++, node.props.tone)
            const samples = sampleFormula(f, Math.min(from, to), Math.max(from, to), n)
            const value = simpson(f, from, to)
            const label = text(node.props.label) ?? `integral from ${round(from)} to ${round(to)}`
            legend.push({ label: `${label} = ${Number.isFinite(value) ? round(value) : 'undefined'}`, accent, swatch: 'box' })
            rangeSources.push(samples, [{ x: from, y: 0 }])
            return { node, accent, samples, f }
          }
          if (kind(node) === 'Points') {
            const points = readPoints([node])[0]
            const accent = seriesAccent(colour++, node.props.tone)
            if (points.name) legend.push({ label: points.name, accent, swatch: 'dot' })
            rangeSources.push(points.points.map(([x, y]) => ({ x, y })))
            return { node, accent, points }
          }
          const tone = toneOrNull(node.props.tone)
          const accent = tone ? TONES[tone].accent : NEUTRAL
          if (kind(node) === 'Dot') rangeSources.push([{ x: finite(node.props.x) ?? 0, y: finite(node.props.y) ?? 0 }])
          if (kind(node) === 'HLine') rangeSources.push([{ x: xmin, y: finite(node.props.y) ?? 0 }])
          return { node, accent }
        })

        const [autoLow, autoHigh] = autoRange(rangeSources)
        const low = finite(props.ymin) ?? autoLow
        const high = Math.max(finite(props.ymax) ?? autoHigh, low + 1e-9)
        const x = linear([xmin, xmax], [area.left, area.left + area.width])
        const y = linear([low, high], [area.top + area.height, area.top])
        const toPath = (run: Sample[]) => run.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.x).toFixed(1)} ${y(Math.max(low - (high - low) * 3, Math.min(high + (high - low) * 3, s.y))).toFixed(1)}`).join(' ')

        const crosshair = useCrosshair((px): Hover | null => {
          if (px < area.left || px > area.left + area.width) return null
          const at = xmin + ((px - area.left) / area.width) * (xmax - xmin)
          return {
            px,
            heading: `x = ${round(at)}`,
            rows: curves.map((curve) => {
              const v = curve.at(at)
              return { label: curve.label, value: Number.isFinite(v) ? round(v) : 'undefined', accent: curve.accent }
            })
          }
        })

        return (
          <>
            {legend.length > 0 && (
              <ul className="m-0 mb-1.5 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[11.5px] text-app-text-secondary">
                {legend.map((item, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {item.swatch === 'box' ? <span className={`inline-block size-2.5 rounded-sm bg-current opacity-40 ${item.accent}`} /> : item.swatch === 'dot' ? <span className={`inline-block size-2 rounded-full bg-current ${item.accent}`} /> : (
                      <svg width="16" height="8" aria-hidden="true" className={item.accent}><line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={item.dashed ? '4 3' : undefined} strokeLinecap="round" /></svg>
                    )}
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            )}
            <svg width={size.width} height={size.height} role="img" aria-label={text(props.title) ?? 'Plot'}>
              <defs>
                <clipPath id={clipId}>
                  <rect x={area.left} y={area.top} width={area.width} height={area.height} />
                </clipPath>
              </defs>
              <Axes area={area} size={size} xLabel={text(props.xLabel)} yLabel={text(props.yLabel)} x={{ scale: x, ticks: niceTicks(xmin, xmax, 9) }} y={{ scale: y, ticks: niceTicks(low, high, 7) }} origin />
              <g clipPath={`url(#${clipId})`}>
                {prepared.map(({ node, accent, ...rest }, i) => {
                  const name = kind(node)
                  if (name === 'Shade' && 'samples' in rest && rest.samples) {
                    const from = Math.min(finite(node.props.from) ?? xmin, finite(node.props.to) ?? xmax)
                    const to = Math.max(finite(node.props.from) ?? xmin, finite(node.props.to) ?? xmax)
                    const runs = drawableRuns(rest.samples, [low, high])
                    return (
                      <g key={i} className={accent}>
                        {runs.map((run, r) => (
                          <path key={r} d={`${toPath(run)} L${x(run[run.length - 1].x).toFixed(1)} ${y(0).toFixed(1)} L${x(run[0].x).toFixed(1)} ${y(0).toFixed(1)} Z`} fill="currentColor" opacity="0.22" />
                        ))}
                        <line x1={x(from)} x2={x(from)} y1={y(0)} y2={area.top} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                        <line x1={x(to)} x2={x(to)} y1={y(0)} y2={area.top} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                      </g>
                    )
                  }
                  return null
                })}
                {prepared.map(({ node, accent, ...rest }, i) => {
                  if (kind(node) === 'Curve' && 'samples' in rest && rest.samples) {
                    return (
                      <g key={i} className={accent}>
                        {drawableRuns(rest.samples, [low, high]).map((run, r) => (
                          <path key={r} d={toPath(run)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={node.props.dashed === true ? '6 4' : undefined} />
                        ))}
                      </g>
                    )
                  }
                  if (kind(node) === 'Points' && 'points' in rest && rest.points) {
                    const { points, line } = rest.points
                    return (
                      <g key={i} className={accent}>
                        {line && <path d={points.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${x(px).toFixed(1)} ${y(py).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />}
                        {points.map(([px, py], k) => <circle key={k} cx={x(px)} cy={y(py)} r="3.4" fill="currentColor" opacity="0.8" />)}
                      </g>
                    )
                  }
                  if (kind(node) === 'HLine' || kind(node) === 'VLine') {
                    const horizontal = kind(node) === 'HLine'
                    const at = finite(node.props[horizontal ? 'y' : 'x'])
                    if (at === undefined) return null
                    const label = text(node.props.label)
                    return (
                      <g key={i} className={accent}>
                        <line x1={horizontal ? area.left : x(at)} x2={horizontal ? area.left + area.width : x(at)} y1={horizontal ? y(at) : area.top} y2={horizontal ? y(at) : area.top + area.height} stroke="currentColor" strokeWidth="1.4" strokeDasharray="6 4" opacity="0.8" />
                        {label && (
                          <text x={horizontal ? area.left + area.width - 4 : x(at) + 4} y={horizontal ? y(at) - 5 : area.top + 12} textAnchor={horizontal ? 'end' : 'start'} fill="currentColor" className="text-[11px] font-medium">{label}</text>
                        )}
                      </g>
                    )
                  }
                  return null
                })}
              </g>
              {prepared.map(({ node, accent }, i) => {
                if (kind(node) !== 'Dot') return null
                const px = finite(node.props.x)
                const py = finite(node.props.y)
                if (px === undefined || py === undefined) return null
                const label = text(node.props.label)
                const flip = x(px) > area.left + area.width * 0.78
                return (
                  <g key={i} className={accent}>
                    <circle cx={x(px)} cy={y(py)} r="4.6" fill="currentColor" className="stroke-app-surface" strokeWidth="1.6" />
                    {label && (
                      <text x={x(px) + (flip ? -8 : 8)} y={y(py) - 8} textAnchor={flip ? 'end' : 'start'} fill="currentColor" className="stroke-app-surface text-[11px] font-semibold" strokeWidth="3" paintOrder="stroke">{label}</text>
                    )}
                  </g>
                )
              })}
              {curves.length > 0 && <CrosshairOverlay area={area} {...crosshair} />}
            </svg>
            <CrosshairTip hover={crosshair.hover} width={size.width} top={area.top} />
            {problems.length > 0 && (
              <ul className="m-0 mt-1.5 list-none p-0 text-[11.5px] text-app-error">
                {problems.map((problem, i) => <li key={i}>{problem}</li>)}
              </ul>
            )}
          </>
        )
      }}
    </ChartShell>
  )
}

// A layer is read by its Plot, which draws it: on its own it draws nothing.
function ReadByPlot() {
  return null
}

export const plotComponents: Record<string, ComponentType<ComponentProps>> = { Plot, Curve: ReadByPlot, Shade: ReadByPlot, Dot: ReadByPlot, VLine: ReadByPlot, HLine: ReadByPlot, Points: ReadByPlot, Series: ReadByPlot }
