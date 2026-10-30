import type { ReactNode } from 'react'
import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { KatexMath, isMathBlockNode, mathKind } from '@renderer/lib/math'
import { useRichLink } from '../links/richLinks'

/** True when a text uses Markdown that a plain paragraph would show as stray symbols. */
export function hasMarkdown(text: string): boolean {
  return /\*\*|__|`|\$[^$\n]+\$|\[[^\]]+\]\([^)]+\)|^\s*(?:[-*+]|\d+\.)\s|^#{1,6}\s|\n/m.test(text)
}

function openLink(event: { preventDefault: () => void }, href: string | undefined) {
  if (!href || !/^https?:\/\//i.test(href)) return
  event.preventDefault()
  void window.seshat?.openExternal?.(href)
}

function Anchor({ href, children }: { href?: string; children?: ReactNode }) {
  const custom = useRichLink()?.(href)
  if (custom) return <>{custom}</>
  return (
    <a href={href} onClick={(event) => openLink(event, href)} className="cursor-pointer text-[var(--accent-primary)] underline-offset-2 hover:underline">
      {children}
    </a>
  )
}

// The text inside a component is small and sits in a box, so the spacing is tight and the first and last blocks touch the edges.
const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-app-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-1.5 list-disc pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="my-0.5 pl-0.5">{children}</li>,
  h1: ({ children }) => <div className="mb-1 mt-2 text-[1.15em] font-semibold text-app-text first:mt-0">{children}</div>,
  h2: ({ children }) => <div className="mb-1 mt-2 text-[1.1em] font-semibold text-app-text first:mt-0">{children}</div>,
  h3: ({ children }) => <div className="mb-1 mt-2 font-semibold text-app-text first:mt-0">{children}</div>,
  h4: ({ children }) => <div className="mb-1 mt-2 font-semibold text-app-text first:mt-0">{children}</div>,
  blockquote: ({ children }) => <blockquote className="my-1.5 border-0 border-l-2 border-solid border-app-border pl-2.5 text-app-text-secondary">{children}</blockquote>,
  a: Anchor,
  pre: ({ node, children }) =>
    isMathBlockNode(node) ? <>{children}</> : <pre className="my-2 overflow-x-auto rounded-md border border-solid border-app-border-subtle bg-[var(--surface-muted)] px-3 py-2 font-mono text-[12px] leading-relaxed first:mt-0 last:mb-0">{children}</pre>,
  code: ({ className, children }) => {
    const kind = mathKind(className)
    if (kind) return <KatexMath tex={String(children).replace(/\n$/, '')} display={kind === 'display'} />
    return className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-[3px] bg-[var(--surface-muted)] px-1 py-px font-mono text-[0.9em]">{children}</code>
    )
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[0.95em]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-0 border-b border-solid border-app-border px-2.5 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-0 border-b border-solid border-app-border-subtle px-2.5 py-1.5 text-left align-top">{children}</td>
}

/**
 * The Markdown of a component's text. The model writes a bold word or a code fence in a Card or a Callout as it would anywhere
 * else, so it is drawn, not shown as symbols. A seshat-ui fence inside it stays code: a component does not nest answers.
 */
export function MarkdownText({ text, className = '' }: { text: string; className?: string }) {
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], [])
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
