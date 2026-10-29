import type { ComponentType } from 'react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isNode } from '../../lang/parseUi'
import { measureFlows, type DrawnFlow } from '../architecture/measureFlows'
import { RichIcon } from '../icons/RichIcon'
import { TONES, toneOf, toneOrNull } from '../tones'
import { MarkdownText } from '../text/MarkdownText'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'
import { Expandable } from '../expand/Expandable'

function Panel({ props, id }: ComponentProps) {
  const hue = TONES[toneOf(props.tone)]
  const title = typeof props.title === 'string' ? props.title : undefined
  const icon = typeof props.icon === 'string' ? props.icon : undefined
  const row = props.direction === 'row'
  const holdsPanels = Array.isArray(props.children) && props.children.some((child) => isNode(child) && child.name === 'Panel')
  return (
    <div data-ui-id={id} data-ui-panel className={`flex min-w-0 flex-col gap-2.5 rounded-xl border p-3 ${hue.box} ${props.dashed === true ? 'border-dashed' : ''}`}>
      {(title || icon) && (
        <div data-ui-header className="flex w-fit max-w-full items-center gap-2 text-[14px] font-semibold text-app-text">
          <RichIcon name={icon} size={20} className={hue.accent} />
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
  const tone = toneOrNull(props.tone)
  const style = tone ? TONES[tone] : null
  return (
    <div
      data-ui-id={id}
      data-ui-item
      className={boxed ? `flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${style ? style.box : 'border-app-border-subtle bg-app-surface'}` : 'flex items-start gap-2'}
    >
      <RichIcon name={icon} size={boxed ? 22 : 16} className={`mt-px ${style && tone !== 'neutral' ? style.accent : 'text-app-text-secondary'}`} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-snug text-app-text">{String(props.label)}</div>
        {typeof props.caption === 'string' && <MarkdownText text={props.caption} className="mt-0.5 text-[11.5px] leading-snug text-app-text-muted" />}
      </div>
    </div>
  )
}

function ArchitectureFrame({ props }: ComponentProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState<DrawnFlow[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const flows = useMemo(() => (Array.isArray(props.flows) ? props.flows.filter(isNode) : []), [props.flows])

  const measure = useCallback(() => {
    const root = frame.current
    if (!root) return
    const origin = root.getBoundingClientRect()
    const next = measureFlows(root, flows)
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
    <div ref={frame} className="relative flex flex-col gap-9">
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
                  className="pointer-events-none absolute max-w-[150px] -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--surface-root)] px-1.5 py-px text-center text-[11px] leading-[14px] text-app-text-secondary"
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

const TALL_DRAWING = 560

function Architecture({ props, id }: ComponentProps) {
  return (
    <Expandable label={typeof props.title === 'string' ? props.title : 'Architecture'} maxHeight={TALL_DRAWING} className="my-3">
      <ArchitectureFrame props={props} id={id} />
    </Expandable>
  )
}

// A Flow is read by its Architecture, which draws it: on its own it draws nothing.
function Flow() {
  return null
}

export const architectureComponents: Record<string, ComponentType<ComponentProps>> = { Architecture, Panel, Item, Flow }
