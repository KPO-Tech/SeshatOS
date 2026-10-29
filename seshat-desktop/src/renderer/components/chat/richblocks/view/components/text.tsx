import type { ComponentType } from 'react'
import type { ComponentProps } from '../NodeView'
import { TONE_BOX, TONE_TEXT, toneOf, toneOrNull } from '../tones'

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[20px] font-semibold',
  2: 'text-[16px] font-semibold',
  3: 'text-[14px] font-semibold',
  4: 'text-[13px] font-medium text-app-text-secondary'
}

function Heading({ props }: ComponentProps) {
  const level = typeof props.level === 'number' ? Math.min(4, Math.max(1, Math.round(props.level))) : 2
  const tone = toneOrNull(props.tone)
  return <div role="heading" aria-level={level} className={`mt-1 ${tone && tone !== 'neutral' ? TONE_TEXT[tone] : 'text-app-text'} ${HEADING_CLASS[level]}`}>{String(props.text)}</div>
}

function Markdown({ props }: ComponentProps) {
  return <p className="my-1 whitespace-pre-wrap text-app-text">{String(props.text)}</p>
}

function Callout({ props }: ComponentProps) {
  const tone = toneOf(props.tone)
  return (
    <div role="note" className={`my-3 rounded-lg border px-3.5 py-2.5 ${TONE_BOX[tone]}`}>
      <div className={`text-[13px] font-semibold ${tone === 'neutral' ? 'text-app-text' : TONE_TEXT[tone]}`}>{String(props.title)}</div>
      {typeof props.body === 'string' && <div className="mt-0.5 text-[13px] text-app-text-secondary">{props.body}</div>}
    </div>
  )
}

function Badge({ props }: ComponentProps) {
  const tone = toneOf(props.tone)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-medium ${TONE_BOX[tone]} ${TONE_TEXT[tone]}`}>
      {String(props.text)}
    </span>
  )
}

function Quote({ props }: ComponentProps) {
  return (
    <blockquote className="my-3 border-0 border-l-2 border-app-border pl-3 text-app-text-secondary">
      <div>{String(props.text)}</div>
      {typeof props.source === 'string' && <div className="mt-1 text-xs text-app-text-muted">{props.source}</div>}
    </blockquote>
  )
}

export const textComponents: Record<string, ComponentType<ComponentProps>> = { Heading, Markdown, Callout, Badge, Quote }
