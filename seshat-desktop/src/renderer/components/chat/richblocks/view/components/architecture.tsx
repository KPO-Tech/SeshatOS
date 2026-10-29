import type { ComponentType } from 'react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isNode } from '../../lang/parseUi'
import { routeFlow, type Point } from '../architecture/routeFlow'
import { RichIcon } from '../icons/RichIcon'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'

const HUES = {
  neutral: { box: 'border-app-border-subtle bg-app-surface', icon: 'text-app-text-secondary' },
  blue: { box: 'border-blue-500/35 bg-blue-500/10', icon: 'text-blue-500' },
  violet: { box: 'border-violet-500/35 bg-violet-500/10', icon: 'text-violet-500' },
  green: { box: 'border-emerald-500/35 bg-emerald-500/10', icon: 'text-emerald-500' },
  orange: { box: 'border-orange-500/35 bg-orange-500/10', icon: 'text-orange-500' },
  red: { box: 'border-rose-500/35 bg-rose-500/10', icon: 'text-rose-500' },
  teal: { box: 'border-teal-500/35 bg-teal-500/10', icon: 'text-teal-500' },
  yellow: { box: 'border-amber-500/35 bg-amber-500/10', icon: 'text-amber-500' }
} as const

type Hue = keyof typeof HUES

function Panel({ props, id }: ComponentProps) {
  const hue = HUES[(props.tone as Hue) in HUES ? (props.tone as Hue) : 'neutral']
  const title = typeof props.title === 'string' ? props.title : undefined
  const icon = typeof props.icon === 'string' ? props.icon : undefined
  const row = props.direction === 'row'
  const holdsPanels = Array.isArray(props.children) && props.children.some((child) => isNode(child) && child.name === 'Panel')
  return (
    <div data-ui-id={id} className={`flex min-w-0 flex-col gap-2.5 rounded-xl border p-3 ${hue.box} ${props.dashed === true ? 'border-dashed' : ''}`}>
      {(title || icon) && (
        <div className="flex items-center gap-2 text-[14px] font-semibold text-app-text">
          <RichIcon name={icon} size={20} className={hue.icon} />
          {title}
        </div>
      )}
      <div className={row ? `flex flex-row flex-wrap ${holdsPanels ? 'gap-6' : 'gap-2.5'} [&>*]:min-w-[9rem] [&>*]:flex-1` : 'flex flex-col gap-2'}>
        <NodeList nodes={props.children} />
      </div>
    </div>
  )
}

function Item({ props, id }: ComponentProps) {
  const boxed = props.boxed === true
  const icon = typeof props.icon === 'string' ? props.icon : undefined
  return (
    <div
      data-ui-id={id}
      className={boxed ? 'flex items-start gap-2.5 rounded-lg border border-app-border-subtle bg-app-surface px-3 py-2.5' : 'flex items-start gap-2'}
    >
      <RichIcon name={icon} size={boxed ? 22 : 16} className="mt-px text-app-text-secondary" />
      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-snug text-app-text">{String(props.label)}</div>
        {typeof props.caption === 'string' && <div className="mt-0.5 text-[11.5px] leading-snug text-app-text-muted">{props.caption}</div>}
      </div>
    </div>
  )
}

type DrawnFlow = { key: string; d: string; label?: string; at: Point; both: boolean; dashed: boolean }

function Architecture({ props }: ComponentProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState<DrawnFlow[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const flows = useMemo(() => (Array.isArray(props.flows) ? props.flows.filter(isNode) : []), [props.flows])

  const measure = useCallback(() => {
    const root = frame.current
    if (!root) return
    const origin = root.getBoundingClientRect()
    const rectOf = (id: string) => {
      const el = root.querySelector(`[data-ui-id="${CSS.escape(id)}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }
    }
    const next: DrawnFlow[] = []
    flows.forEach((flow, index) => {
      const from = rectOf(String(flow.props.from))
      const to = rectOf(String(flow.props.to))
      const route = from && to ? routeFlow(from, to) : null
      if (!route) return
      next.push({
        key: `${index}-${flow.props.from}-${flow.props.to}`,
        d: route.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
        label: typeof flow.props.label === 'string' ? flow.props.label : undefined,
        at: route.label,
        both: flow.props.both === true,
        dashed: flow.props.style === 'dashed'
      })
    })
    setDrawn((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    setSize((current) => (current.w === origin.width && current.h === origin.height ? current : { w: origin.width, h: origin.height }))
  }, [flows])

  useLayoutEffect(measure)

  useEffect(() => {
    const root = frame.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [measure])

  return (
    <div ref={frame} className="relative my-3 flex flex-col gap-9">
      {typeof props.title === 'string' && <div className="text-[16px] font-semibold text-app-text">{props.title}</div>}
      <NodeList nodes={props.children} />
      {drawn.length > 0 && (
        <>
          <svg width={size.w} height={size.h} className="pointer-events-none absolute left-0 top-0 overflow-visible text-app-text-muted" aria-hidden="true">
            <defs>
              <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0.5 L9.5 5 L0 9.5 z" fill="currentColor" />
              </marker>
            </defs>
            {drawn.map((flow) => (
              <path
                key={flow.key}
                d={flow.d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeDasharray={flow.dashed ? '5 4' : undefined}
                markerEnd={`url(#${markerId})`}
                markerStart={flow.both ? `url(#${markerId})` : undefined}
              />
            ))}
          </svg>
          {drawn.map(
            (flow) =>
              flow.label && (
                <span
                  key={`${flow.key}-label`}
                  style={{ left: flow.at.x, top: flow.at.y }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--surface-root)] px-1.5 py-px text-[11px] text-app-text-secondary"
                >
                  {flow.label}
                </span>
              )
          )}
        </>
      )}
    </div>
  )
}

// A Flow is read by its Architecture, which draws it: on its own it draws nothing.
function Flow() {
  return null
}

export const architectureComponents: Record<string, ComponentType<ComponentProps>> = { Architecture, Panel, Item, Flow }
