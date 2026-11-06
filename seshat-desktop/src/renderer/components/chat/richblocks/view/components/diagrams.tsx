import type { ComponentType, CSSProperties } from 'react'
import { DIAGRAM_COLOURS, DIAGRAM_LIMITS, columnsOf, partsOf } from '../../lang/diagrams'
import { fillCss, readableOn, safeFill, type Fill } from '../../lang/design'
import { isNode } from '../../lang/parseUi'
import type { UiNode } from '../../lang/types'
import { text } from '../charts/readers'
import type { ComponentProps } from '../NodeView'

// The diagrams of an answer (ADR 0018): a honeycomb, a process of chevrons, a cycle, a pyramid or a funnel, a matrix, a stack of layers. The
// model gives the words and the colours; the shape, the spacing and the colour of the text are the app's. A colour is read by safeFill, so only
// a #rrggbb ever reaches a style.

const SQRT3 = Math.sqrt(3)
const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

/** The fill of a part: the colour it names, or the one of its place in the series. */
function fillOf(node: UiNode, index: number): Fill {
  return safeFill(node.props.color) ?? { base: DIAGRAM_COLOURS[index % DIAGRAM_COLOURS.length], stops: [DIAGRAM_COLOURS[index % DIAGRAM_COLOURS.length]] }
}

function Title({ value }: { value?: string }) {
  return value ? <div className="mb-2.5 text-[14px] font-semibold text-app-text">{value}</div> : null
}

// ── Hive: a honeycomb ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

function Hive({ props }: ComponentProps) {
  const columns = columnsOf({ props })
  const n = columns.length
  const rows = Math.max(1, ...columns.map((column) => column.length))
  if (n === 0) return null
  // Flat-topped hexagons of radius 1: a column is 1.5 further than the one before, a hexagon is the square root of three high, and the columns
  // are centred on each other, so that columns of one and two make a honeycomb by themselves.
  const width = 1.5 * n + 0.5
  const height = rows * SQRT3
  const gap = 0.92
  const fontSize = `${((200 / width) * 0.075).toFixed(2)}cqw`
  const left = text(props.left)
  const right = text(props.right)
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      {(left || right) && (
        <div className="mb-1.5 flex justify-between gap-4 text-[11.5px] font-semibold uppercase tracking-wide text-app-text-muted">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
      <div className="relative mx-auto w-full" style={{ aspectRatio: String(width / height), containerType: 'inline-size', maxWidth: `${Math.round(width * 112)}px` }}>
        {columns.map((column, i) =>
          column.map((hex, j) => {
            const fill = fillOf(hex, 0)
            const x = i * 1.5
            const y = (height - column.length * SQRT3) / 2 + j * SQRT3
            const style: CSSProperties = {
              left: `${((x + (1 - gap)) / width) * 100}%`,
              top: `${((y + ((1 - gap) * SQRT3) / 2) / height) * 100}%`,
              width: `${((2 * gap) / width) * 100}%`,
              height: `${((SQRT3 * gap) / height) * 100}%`,
              clipPath: HEX_CLIP,
              background: fillCss(fill),
              color: readableOn(fill.base),
              fontSize,
              // A percentage of padding is one of the width of the whole honeycomb, not of the hexagon: it is worked out from the hexagon.
              paddingInline: `${(((200 * gap) / width) * 0.14).toFixed(2)}%`
            }
            return (
              <div key={`${i}-${j}`} className="absolute flex items-center justify-center text-center font-semibold leading-tight" style={style}>
                {String(hex.props.label ?? '')}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Chevrons: a process ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Chevrons({ props }: ComponentProps) {
  const items = partsOf({ props }, 'items').slice(0, DIAGRAM_LIMITS.chevrons)
  if (items.length === 0) return null
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <div className="flex">
        {items.map((item, index) => {
          const fill = fillOf(item, index)
          const first = index === 0
          const point = 'min(22px, 18%)'
          const clip = first ? `polygon(0 0, calc(100% - ${point}) 0, 100% 50%, calc(100% - ${point}) 100%, 0 100%)` : `polygon(0 0, calc(100% - ${point}) 0, 100% 50%, calc(100% - ${point}) 100%, 0 100%, ${point} 50%)`
          return (
            <div key={index} className="min-w-0 flex-1" style={{ marginLeft: first ? 0 : -6 }}>
              <div className="flex h-16 items-center justify-center px-[18%] text-center text-[13px] font-semibold leading-tight" style={{ clipPath: clip, background: fillCss(fill), color: readableOn(fill.base) }}>
                {String(item.props.label ?? '')}
              </div>
              {text(item.props.text) && <div className="mt-2 px-2 text-center text-[12px] leading-snug text-app-text-secondary">{text(item.props.text)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cycle: steps in a loop ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A label cut into at most two lines, at the space nearest its middle. */
function twoLines(label: string): string[] {
  if (label.length <= 14 || !label.includes(' ')) return [label]
  const middle = label.length / 2
  let best = -1
  label.split('').forEach((char, at) => {
    if (char === ' ' && (best === -1 || Math.abs(at - middle) < Math.abs(best - middle))) best = at
  })
  return [label.slice(0, best), label.slice(best + 1)]
}

function Cycle({ props }: ComponentProps) {
  const loops = partsOf({ props }, 'loops').slice(0, DIAGRAM_LIMITS.loops)
  const n = loops.length
  if (n < 3) return null
  const size = 460
  const c = size / 2
  const radius = 150
  const boxWidth = Math.min(130, 600 / n)
  const boxHeight = 48
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const at = (theta: number) => ({ x: c + radius * Math.cos(theta), y: c + radius * Math.sin(theta) })
  // An arrow leaves a box and reaches the next one just outside them, whatever their size and place: the angle is searched until the point of
  // the circle is clear of the box.
  const clear = (point: { x: number; y: number }, box: { x: number; y: number }) => Math.abs(point.x - box.x) > boxWidth / 2 + 9 || Math.abs(point.y - box.y) > boxHeight / 2 + 9
  const leave = (i: number) => {
    for (let d = 0.03; d < Math.PI; d += 0.02) if (clear(at(angle(i) + d), at(angle(i)))) return angle(i) + d
    return angle(i) + 0.5
  }
  const reach = (i: number) => {
    for (let d = 0.03; d < Math.PI; d += 0.02) if (clear(at(angle(i) - d), at(angle(i)))) return angle(i) - d
    return angle(i) - 0.5
  }
  const center = text(props.center)
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[460px]" role="img" aria-label={text(props.title) ?? 'cycle'}>
        <defs>
          <marker id="cycle-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" className="text-app-text-muted" />
          </marker>
        </defs>
        {loops.map((_, i) => {
          const start = leave(i)
          const end = reach(i + 1)
          if (end <= start) return null
          const from = at(start)
          const to = at(end)
          return <path key={`arc-${i}`} d={`M${from.x.toFixed(1)} ${from.y.toFixed(1)} A${radius} ${radius} 0 0 1 ${to.x.toFixed(1)} ${to.y.toFixed(1)}`} fill="none" stroke="currentColor" strokeWidth="2.2" className="text-app-text-muted" markerEnd="url(#cycle-head)" opacity="0.7" />
        })}
        {center && (
          <text x={c} y={c} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-app-text" style={{ fontSize: 15, fontWeight: 700 }}>
            {twoLines(center).map((line, k, all) => (
              <tspan key={k} x={c} dy={k === 0 ? (all.length === 1 ? 0 : -9) : 18}>
                {line}
              </tspan>
            ))}
          </text>
        )}
        {loops.map((loop, i) => {
          const fill = fillOf(loop, i)
          const { x, y } = at(angle(i))
          const lines = twoLines(String(loop.props.label ?? ''))
          return (
            <g key={`node-${i}`}>
              <rect x={x - boxWidth / 2} y={y - boxHeight / 2} width={boxWidth} height={boxHeight} rx="14" fill={fill.base} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={readableOn(fill.base)} style={{ fontSize: n > 6 ? 11 : 12.5, fontWeight: 600 }}>
                {lines.map((line, k) => (
                  <tspan key={k} x={x} dy={k === 0 ? (lines.length === 1 ? 0 : -7) : 14}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Hub: a centre and what surrounds it ─────────────────────────────────────────────────────────────────────────────────────────────

/** The angles, from the top and clockwise, of the satellites of a Hub: four make a cross (the five forces), any other number is spread evenly. */
export function hubAngles(n: number): number[] {
  if (n === 4) return [-90, 0, 90, 180]
  return Array.from({ length: n }, (_, i) => -90 + (360 * i) / n)
}

function Hub({ props }: ComponentProps) {
  const spokes = partsOf({ props }, 'spokes').slice(0, DIAGRAM_LIMITS.spokes)
  const core = isNode(props.core) ? props.core : null
  const n = spokes.length
  if (!core || n < 2) return null
  const W = 760
  const H = n <= 4 ? 420 : 460
  const cx = W / 2
  const cy = H / 2
  const rx = 268
  const ry = n <= 4 ? 160 : 185
  const spokeW = 200
  const spokeH = 72
  const coreW = 230
  const coreH = 86
  const direction = props.arrows === 'out' || props.arrows === 'none' ? props.arrows : 'in'
  const angles = hubAngles(n)
  // A line from the centre to a satellite, cut where it leaves one box and enters the other.
  const edge = (dx: number, dy: number, w: number, h: number, gap: number) => {
    const s = Math.min(dx === 0 ? Infinity : w / 2 / Math.abs(dx), dy === 0 ? Infinity : h / 2 / Math.abs(dy))
    const length = Math.hypot(dx, dy)
    return s + gap / length
  }
  const label = (node: UiNode, x: number, y: number, size: number, ink: string, large: boolean) => {
    const heading = twoLines(String(node.props.label ?? ''))
    const sub = text(node.props.text) ? twoLines(text(node.props.text) as string) : []
    const total = heading.length + sub.length
    const rowHeight = large ? 17 : 15
    const top = y - ((total - 1) * rowHeight) / 2
    return (
      <text x={x} y={top} textAnchor="middle" dominantBaseline="middle" fill={ink}>
        {heading.map((line, k) => (
          <tspan key={`h${k}`} x={x} dy={k === 0 ? 0 : rowHeight} style={{ fontSize: size, fontWeight: 700 }}>
            {line}
          </tspan>
        ))}
        {sub.map((line, k) => (
          <tspan key={`s${k}`} x={x} dy={rowHeight - 1} style={{ fontSize: size - 1.5, fontWeight: 400, opacity: 0.85 }}>
            {line}
          </tspan>
        ))}
      </text>
    )
  }
  const coreFill = fillOf(core, 1)
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[760px]" role="img" aria-label={text(props.title) ?? 'hub'}>
        <defs>
          <marker id="hub-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" className="text-app-text-muted" />
          </marker>
        </defs>
        {spokes.map((spoke, i) => {
          const theta = (angles[i] * Math.PI) / 180
          const x = cx + rx * Math.cos(theta)
          const y = cy + ry * Math.sin(theta)
          const dx = x - cx
          const dy = y - cy
          const a = edge(dx, dy, coreW, coreH, 6)
          const b = 1 - edge(dx, dy, spokeW, spokeH, 6)
          const from = direction === 'in' ? { x: cx + dx * b, y: cy + dy * b } : { x: cx + dx * a, y: cy + dy * a }
          const to = direction === 'in' ? { x: cx + dx * a, y: cy + dy * a } : { x: cx + dx * b, y: cy + dy * b }
          return (
            <line key={`line-${i}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth="1.8" className="text-app-text-muted" opacity="0.75" markerEnd={direction === 'none' ? undefined : 'url(#hub-head)'} />
          )
        })}
        <rect x={cx - coreW / 2} y={cy - coreH / 2} width={coreW} height={coreH} rx="18" fill={coreFill.base} />
        {label(core, cx, cy, 14.5, readableOn(coreFill.base), true)}
        {spokes.map((spoke, i) => {
          const theta = (angles[i] * Math.PI) / 180
          const x = cx + rx * Math.cos(theta)
          const y = cy + ry * Math.sin(theta)
          const fill = fillOf(spoke, i + 2)
          return (
            <g key={`spoke-${i}`}>
              <rect x={x - spokeW / 2} y={y - spokeH / 2} width={spokeW} height={spokeH} rx="14" fill={fill.base} />
              {label(spoke, x, y, 13, readableOn(fill.base), false)}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Pyramid and funnel ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Pyramid({ props }: ComponentProps) {
  const levels = partsOf({ props }, 'levels').slice(0, DIAGRAM_LIMITS.levels)
  const n = levels.length
  if (n === 0) return null
  const funnel = props.funnel === true
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-1">
        {levels.map((level, index) => {
          const fill = fillOf(level, index)
          // A pyramid grows from its top, a funnel narrows towards its foot; the narrowest level keeps a third of the width, so that its words fit.
          const share = (step: number) => 0.3 + (0.7 * step) / n
          const top = funnel ? share(n - index) : share(index)
          const bottom = funnel ? share(n - index - 1) : share(index + 1)
          const clip = `polygon(${50 - (top * 100) / 2}% 0, ${50 + (top * 100) / 2}% 0, ${50 + (bottom * 100) / 2}% 100%, ${50 - (bottom * 100) / 2}% 100%)`
          return (
            <div key={index} className="relative flex h-14 items-center justify-center text-center" style={{ clipPath: clip, background: fillCss(fill), color: readableOn(fill.base) }}>
              <div className="flex flex-col px-[12%] leading-tight">
                <span className="text-[13px] font-semibold">{String(level.props.label ?? '')}</span>
                {text(level.props.text) && <span className="text-[11px] opacity-85">{text(level.props.text)}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Quadrant: a matrix of two by two ────────────────────────────────────────────────────────────────────────────────────────────────

function Quadrant({ props }: ComponentProps) {
  const cells = partsOf({ props }, 'cells').slice(0, DIAGRAM_LIMITS.quads)
  if (cells.length === 0) return null
  const xLabel = text(props.xLabel)
  const yLabel = text(props.yLabel)
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <div className="flex gap-2">
        {yLabel && <div className="flex w-5 shrink-0 items-center justify-center text-[11.5px] font-semibold uppercase tracking-wide text-app-text-muted [writing-mode:vertical-rl] rotate-180">{yLabel}</div>}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {cells.map((cell, index) => {
              const fill = fillOf(cell, [2, 0, 4, 6][index] ?? index)
              return (
                <div key={index} className="flex min-h-[110px] flex-col gap-1 rounded-xl p-3.5" style={{ background: mix(fill.base, 12), border: `1px solid ${mix(fill.base, 42)}` }}>
                  <div className="text-[13.5px] font-semibold" style={{ color: fill.base }}>
                    {String(cell.props.title ?? '')}
                  </div>
                  {text(cell.props.text) && <div className="text-[12.5px] leading-snug text-app-text-secondary">{text(cell.props.text)}</div>}
                </div>
              )
            })}
          </div>
          {xLabel && <div className="text-center text-[11.5px] font-semibold uppercase tracking-wide text-app-text-muted">{xLabel}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Layers: a stack ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Layers({ props }: ComponentProps) {
  const layers = partsOf({ props }, 'layers').slice(0, DIAGRAM_LIMITS.layers)
  if (layers.length === 0) return null
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <div className="flex flex-col gap-1.5">
        {layers.map((layer, index) => {
          const fill = fillOf(layer, index)
          return (
            <div key={index} className="grid items-stretch overflow-hidden rounded-xl border border-app-border-subtle bg-app-surface" style={{ gridTemplateColumns: 'minmax(7rem, 30%) minmax(0, 1fr)' }}>
              <div className="flex items-center px-3.5 py-3 text-[13px] font-semibold leading-tight" style={{ background: fillCss(fill), color: readableOn(fill.base) }}>
                {String(layer.props.label ?? '')}
              </div>
              <div className="flex items-center px-3.5 py-3 text-[12.5px] leading-snug text-app-text-secondary">{text(layer.props.text) ?? ' '}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Venn: sets that overlap ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function Venn({ props }: ComponentProps) {
  const sets = partsOf({ props }, 'sets').slice(0, 3)
  const n = sets.length
  if (n < 2) return null
  const three = n === 3
  const width = 480
  const height = three ? 430 : 300
  const radius = three ? 108 : 112
  // The centres of the circles, and where the words of each set sit: away from the others, in the part of the circle that is its own.
  const centres = three ? [{ x: 240, y: 135 }, { x: 170, y: 255 }, { x: 310, y: 255 }] : [{ x: 172, y: 150 }, { x: 308, y: 150 }]
  const words = three ? [{ x: 240, y: 78 }, { x: 128, y: 298 }, { x: 352, y: 298 }] : [{ x: 108, y: 150 }, { x: 372, y: 150 }]
  const middle = three ? { x: 240, y: 218 } : { x: 240, y: 150 }
  const center = text(props.center)
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block w-full max-w-[480px]" role="img" aria-label={text(props.title) ?? 'venn'}>
        {sets.map((set, i) => {
          const fill = fillOf(set, [2, 5, 6][i] ?? i)
          return <circle key={`c-${i}`} cx={centres[i].x} cy={centres[i].y} r={radius} fill={fill.base} fillOpacity="0.5" stroke={fill.base} strokeWidth="2" />
        })}
        {sets.map((set, i) => {
          const lines = twoLines(String(set.props.label ?? ''))
          const note = text(set.props.text)
          return (
            <text key={`t-${i}`} x={words[i].x} y={words[i].y} textAnchor="middle" fill="currentColor" className="text-app-text" style={{ fontSize: 14, fontWeight: 700 }}>
              {lines.map((line, k) => (
                <tspan key={k} x={words[i].x} dy={k === 0 ? 0 : 17}>
                  {line}
                </tspan>
              ))}
              {note && (
                <tspan x={words[i].x} dy={17} style={{ fontSize: 11.5, fontWeight: 400 }} fill="currentColor" className="text-app-text-secondary">
                  {note}
                </tspan>
              )}
            </text>
          )
        })}
        {center && (
          <text x={middle.x} y={middle.y} textAnchor="middle" dominantBaseline="middle" fill="currentColor" className="text-app-text" style={{ fontSize: 13, fontWeight: 700 }}>
            {twoLines(center).map((line, k, all) => (
              <tspan key={k} x={middle.x} dy={k === 0 ? (all.length === 1 ? 0 : -8) : 16}>
                {line}
              </tspan>
            ))}
          </text>
        )}
      </svg>
    </div>
  )
}

// ── Tree: an org chart ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

function Branches({ node, level, index }: { node: UiNode; level: number; index: number }) {
  const kids = level < DIAGRAM_LIMITS.depth ? partsOf(node, 'children').slice(0, DIAGRAM_LIMITS.children) : []
  const fill = fillOf(node, level - 1 + index)
  const note = text(node.props.text)
  return (
    <div className="flex flex-col items-center">
      <div className="max-w-[11rem] rounded-xl px-3.5 py-2 text-center shadow-sm" style={{ background: fillCss(fill), color: readableOn(fill.base) }}>
        <div className="text-[13px] font-semibold leading-tight">{String(node.props.label ?? '')}</div>
        {note && <div className="mt-0.5 text-[11px] leading-snug opacity-85">{note}</div>}
      </div>
      {kids.length > 0 && (
        <>
          <div className="h-4 w-px bg-app-border" />
          <div className="flex items-start">
            {kids.map((kid, i) => (
              <div key={i} className="relative flex flex-col items-center px-2 pt-4">
                {/* The line over the children: it starts at the middle of the first and stops at the middle of the last. */}
                <span className="absolute top-0 h-px bg-app-border" style={{ left: i === 0 ? '50%' : 0, right: i === kids.length - 1 ? '50%' : 0 }} />
                <span className="absolute left-1/2 top-0 h-4 w-px bg-app-border" />
                <Branches node={kid} level={level + 1} index={i + index} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Tree({ props }: ComponentProps) {
  const root = isNode(props.root) ? props.root : null
  if (!root) return null
  return (
    <div className="my-3">
      <Title value={text(props.title)} />
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto flex w-max min-w-full justify-center">
          <Branches node={root} level={1} index={0} />
        </div>
      </div>
    </div>
  )
}

/** A Hex, a Chev, a Loop, a Level, a Quad or a Layer is read by the shape that holds it. */
function ReadByParent() {
  return null
}

export const diagramComponents: Record<string, ComponentType<ComponentProps>> = {
  Hub,
  Hive, Hex: ReadByParent, Chevrons, Chev: ReadByParent, Cycle, Loop: ReadByParent, Pyramid, Level: ReadByParent, Quadrant, Quad: ReadByParent, Layers, Layer: ReadByParent, Venn, VSet: ReadByParent, Tree, Branch: ReadByParent
}
