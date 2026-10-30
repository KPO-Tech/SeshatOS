import { createContext, useContext, type ReactNode } from 'react'

/** Draws a link of the answer in its own way (a citation chip): returns null to leave it as a normal link. */
export type LinkRenderer = (href: string | undefined) => ReactNode

const RichLinkContext = createContext<LinkRenderer | undefined>(undefined)

export function RichLinkProvider({ render, children }: { render: LinkRenderer | undefined; children: ReactNode }) {
  return <RichLinkContext.Provider value={render}>{children}</RichLinkContext.Provider>
}

/** The way the view that holds a component draws its links, so that a citation inside a card or a table cell is a chip as in a paragraph. */
export const useRichLink = () => useContext(RichLinkContext)
