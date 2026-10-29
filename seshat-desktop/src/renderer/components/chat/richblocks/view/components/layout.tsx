import type { ComponentType } from 'react'
import { useState } from 'react'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'
import { TONE_BOX, toneOf } from '../tones'

const GAP = { sm: 'gap-2', md: 'gap-3', lg: 'gap-5' } as const

function Stack({ props }: ComponentProps) {
  const row = props.direction === 'row'
  const gap = GAP[props.gap as keyof typeof GAP] ?? GAP.md
  return (
    <div className={`my-3 flex ${row ? 'flex-row flex-wrap items-start' : 'flex-col'} ${gap}`}>
      <NodeList nodes={props.children} />
    </div>
  )
}

function Card({ props }: ComponentProps) {
  return (
    <div className={`my-3 flex flex-col gap-2.5 rounded-lg border p-3.5 ${TONE_BOX[toneOf(props.tone)]}`}>
      {typeof props.title === 'string' && <div className="text-[13px] font-semibold text-app-text">{props.title}</div>}
      <NodeList nodes={props.children} />
    </div>
  )
}

function Section({ props }: ComponentProps) {
  const collapsible = props.collapsible === true
  const [open, setOpen] = useState(props.open !== false)
  const shown = !collapsible || open
  return (
    <section className="my-3 flex flex-col gap-2">
      <button
        type="button"
        disabled={!collapsible}
        aria-expanded={shown}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[14px] font-semibold text-app-text enabled:cursor-pointer"
      >
        {collapsible && <span className={`text-[10px] text-app-text-muted transition-transform ${shown ? 'rotate-90' : ''}`}>{'>'}</span>}
        {String(props.title)}
      </button>
      {shown && <NodeList nodes={props.children} />}
    </section>
  )
}

function Separator() {
  return <hr className="my-3 border-0 border-t border-app-border-subtle" />
}

export const layoutComponents: Record<string, ComponentType<ComponentProps>> = { Stack, Card, Section, Separator }
