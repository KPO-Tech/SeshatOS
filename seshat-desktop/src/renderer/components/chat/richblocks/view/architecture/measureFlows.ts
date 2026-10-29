import type { UiNode } from '../../lang/types'
import { chooseRoute, labelSize, lineBoxes, placeLabel, type ScoredRoute } from './avoidRoute'
import type { Point, Rect } from './routeFlow'

export type DrawnFlow = { key: string; d: string; label?: string; at: Point; both: boolean; dashed: boolean }

/** A box crossed costs more than any detour, an arrow drawn over another nearly as much, and going up to the panel more than a longer path. */
const HIT_COST = 1000
const OVERLAP_COST = 600
const LIFT_COST = 150
/** How many panels an arrow may climb from the item it was given. */
const MAX_OPTIONS = 4

type Box = { el: Element; rect: Rect }

function rectOf(el: Element, origin: DOMRect): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
}

/**
 * The boxes an arrow may start from or end on: the one it was given, then the panels around it, up to the last one that does
 * not hold the other end. Starting from a panel keeps an arrow from crossing the title of the panel its item sits in.
 */
function endpointOptions(el: Element, other: Element, root: Element): Element[] {
  const options: Element[] = [el]
  let panel = el.parentElement?.closest('[data-ui-panel]') ?? null
  while (panel && panel !== root && root.contains(panel) && !panel.contains(other) && options.length < MAX_OPTIONS) {
    options.push(panel)
    panel = panel.parentElement?.closest('[data-ui-panel]') ?? null
  }
  return options
}

/** The arrows of a drawing, routed from where its boxes are drawn: around titles and items, and with labels that cover neither. */
export function measureFlows(root: HTMLElement, flows: UiNode[]): DrawnFlow[] {
  const origin = root.getBoundingClientRect()
  const boxes: Box[] = Array.from(root.querySelectorAll('[data-ui-item], [data-ui-header]')).map((el) => ({ el, rect: rectOf(el, origin) }))
  const find = (id: string) => root.querySelector(`[data-ui-id="${CSS.escape(id)}"]`)

  const placed: Array<{ flow: UiNode; index: number; route: ScoredRoute }> = []
  const used: Array<ScoredRoute['points']> = []
  flows.forEach((flow, index) => {
    const fromEl = find(String(flow.props.from))
    const toEl = find(String(flow.props.to))
    if (!fromEl || !toEl || fromEl === toEl) return

    let best: { route: ScoredRoute; score: number } | null = null
    for (const a of endpointOptions(fromEl, toEl, root)) {
      for (const b of endpointOptions(toEl, fromEl, root)) {
        const blockers = boxes.filter((box) => !a.contains(box.el) && !b.contains(box.el)).map((box) => box.rect)
        const route = chooseRoute(rectOf(a, origin), rectOf(b, origin), blockers, used)
        if (!route) continue
        const lifts = (a === fromEl ? 0 : 1) + (b === toEl ? 0 : 1)
        const score = route.hits * HIT_COST + route.overlaps * OVERLAP_COST + route.cost + lifts * LIFT_COST
        if (!best || score < best.score) best = { route, score }
      }
    }
    if (best) {
      placed.push({ flow, index, route: best.route })
      used.push(best.route.points)
    }
  })

  const everyBox = boxes.map((box) => box.rect)
  const taken: Rect[] = []
  return placed.map(({ flow, index, route }, position) => {
    const text = typeof flow.props.label === 'string' ? flow.props.label : undefined
    let at = route.label
    if (text) {
      const size = labelSize(text)
      const otherArrows = placed.filter((_, other) => other !== position).flatMap((other) => lineBoxes(other.route.points))
      at = placeLabel(route.points, size, [...everyBox, ...otherArrows], taken)
      taken.push({ x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h })
    }
    return {
      key: `${index}-${flow.props.from}-${flow.props.to}`,
      d: route.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
      label: text,
      at,
      both: flow.props.both === true,
      dashed: flow.props.style === 'dashed'
    }
  })
}
