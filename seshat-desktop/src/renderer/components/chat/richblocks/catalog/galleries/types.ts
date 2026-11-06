// The galleries: collections of examples made to be looked at, each a set of cards in the Generative UI window. They are not the examples
// the agent is taught from (those are in examples.ts and cost words in its prompt): a gallery is free to be rich, long and beautiful.

export type GalleryExample = {
  /** The name on its card. */
  title: string
  /** One line under the title. */
  about: string
  /** The seshat-ui of the example. */
  code: string
}

/** The hue of the frame of the pictures of a gallery. */
export type GalleryTone = 'blue' | 'green' | 'violet' | 'orange' | 'rose' | 'slate'

export type Gallery = {
  id: string
  title: string
  description: string
  tone: GalleryTone
  /** An icon name of the window (see the icons of the catalogue). */
  icon: string
  examples: GalleryExample[]
}
