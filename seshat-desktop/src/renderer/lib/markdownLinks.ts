import { findWebSource, type WebSource } from './webSources'

// The part of a markdown (hast) tree this needs: elements with a tag, properties and children.
export type MarkdownNode = {
  tagName?: string
  properties?: Record<string, unknown>
  children?: MarkdownNode[]
}

// A list inside a list item holds its own items: their links belong to them.
const OWN_LIST = new Set(['ul', 'ol'])

/** The addresses linked in a paragraph or list item, in order, without those of the lists nested inside it. */
export function linkedHrefs(node: MarkdownNode | undefined): string[] {
  const hrefs: string[] = []
  const walk = (current: MarkdownNode) => {
    for (const child of current.children ?? []) {
      if (child.tagName && OWN_LIST.has(child.tagName)) continue
      if (child.tagName === 'a' && typeof child.properties?.href === 'string') hrefs.push(child.properties.href)
      walk(child)
    }
  }
  if (node) walk(node)
  return hrefs
}

/** The pages a paragraph cites by its links, once each and in the order they come: only links to pages the agent consulted count. */
export function citedPages(node: MarkdownNode | undefined, consulted: readonly WebSource[]): WebSource[] {
  const pages = new Map<string, WebSource>()
  for (const href of linkedHrefs(node)) {
    const source = findWebSource(href, consulted)
    if (source && !pages.has(source.url)) pages.set(source.url, source)
  }
  return [...pages.values()]
}
