import type { ReactNode } from 'react'

// What a surface that reuses the chat's messages (the Ask view of Knowledge) adds to an answer. The chat itself adds nothing.
export type AnswerExtras = {
  // The text of the answer as Markdown for the view, for instance with its citations turned into links.
  prepare?: (text: string) => string
  // Draws a link of the answer; returns null to leave it as a normal link.
  renderLink?: (href: string | undefined) => ReactNode
  // Shown under the message that ends the turn.
  footer?: ReactNode
}
