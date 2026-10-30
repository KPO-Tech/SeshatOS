import type { ReactNode } from 'react'

// One source under an answer, whatever it comes from: a web page, a document of the organization. The list and its row know nothing
// else, so the same component serves the chat and Knowledge.
export type SourceItem = {
  key: string
  title: string
  // The line under the title: the site, or the collection and the source of a document.
  meta: string
  // What sits at the right: the pages used, for a document.
  trailing?: string
  // The small mark of the source (logo of the site, kind of file), drawn at the size the place needs.
  mark: (size: number) => ReactNode
  // A web address opens in the app's own browser; a source without one calls onOpen.
  href?: string
  onOpen?: () => void
  active?: boolean
}
