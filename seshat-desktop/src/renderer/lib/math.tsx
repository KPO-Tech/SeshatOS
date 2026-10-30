import { memo } from 'react'
import katex from 'katex'

type HastNode = {
  tagName?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

const CACHE_LIMIT = 500
const rendered = new Map<string, string | null>()

/** Whether a markdown code element (as remark-math writes it) holds a formula, and of which kind. */
export function mathKind(className: unknown): 'inline' | 'display' | null {
  const classes = Array.isArray(className) ? className.map(String) : String(className ?? '').split(/\s+/)
  if (classes.includes('math-display')) return 'display'
  if (classes.includes('math-inline')) return 'inline'
  return null
}

/** True when a markdown `pre` holds a displayed formula, which is drawn as a block and not as code. */
export function isMathBlockNode(node: unknown): boolean {
  const code = (node as HastNode | undefined)?.children?.find((child) => child.tagName === 'code')
  return mathKind(code?.properties?.className) === 'display'
}

/**
 * The HTML KaTeX draws for a formula, or null when it cannot read it. The result is kept by formula: a streaming answer is drawn again on
 * every token, and the formulas already written must not be typeset again each time.
 */
export function renderMath(tex: string, display: boolean): string | null {
  const key = `${display ? 'd' : 'i'}:${tex}`
  const kept = rendered.get(key)
  if (kept !== undefined) return kept
  let html: string | null
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' })
  } catch {
    html = null
  }
  if (rendered.size >= CACHE_LIMIT) rendered.delete(rendered.keys().next().value as string)
  rendered.set(key, html)
  return html
}

/** A formula of an answer. One KaTeX cannot read stays as the text the model wrote, in the muted colour, and does not colour the page. */
export const KatexMath = memo(function KatexMath({ tex, display }: { tex: string; display: boolean }) {
  const html = renderMath(tex, display)
  if (html === null) {
    return <code className="rounded-[3px] bg-[var(--surface-muted)] px-1 py-px font-mono text-[0.9em] text-[var(--text-muted)]">{tex}</code>
  }
  if (display) return <div className="my-3 overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
  return <span dangerouslySetInnerHTML={{ __html: html }} />
})
