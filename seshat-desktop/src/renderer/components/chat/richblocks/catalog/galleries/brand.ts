import type { Gallery } from './types'

export const BRAND: Gallery = {
  id: 'brand',
  title: 'Brand boards',
  description: 'Palettes, buttons, pictures and moods: the same page in other colours, fonts and corners.',
  tone: 'rose',
  icon: 'pic',
  examples: [
    {
      title: 'Terra: warm earth',
      about: 'Clay, sun and moss, with its buttons and pictures.',
      code: `root = Stack([title, palette, buttons, pictures])
title = Heading("Terra, brand board", 2)
palette = Palette([Swatch("#b45309", "Clay"), Swatch("#f59e0b", "Sun"), Swatch("#fef3c7", "Sand"), Swatch("#14532d", "Moss"), Swatch("#b45309 > #f59e0b", "Glow")], "Colours")
buttons = Browser([Grid([Cta("Primary", "#b45309"), Cta("Secondary", "#b45309", "outline"), Cta("Accent", "#14532d")], 3)], null, "#fffaf3", "serif", "lg")
pictures = Browser([Grid([Picture("Clay", "#b45309 > #f59e0b", 1.4), Picture("Moss", "#14532d > #65a30d", 1.4), Picture("Sand", "#fef3c7 > #fcd34d", 1.4)], 3)], null, "#fffaf3", "serif", "lg")`
    },
    {
      title: 'Marea: the sea',
      about: 'Blues and teal, a clean sans.',
      code: `root = Stack([title, palette, hero])
title = Heading("Marea, brand board", 2)
palette = Palette([Swatch("#0c4a6e", "Deep"), Swatch("#0ea5e9", "Wave"), Swatch("#99f6e4", "Foam"), Swatch("#f0f9ff", "Mist"), Swatch("#0c4a6e > #0ea5e9 > #99f6e4", "Tide")], "Colours")
hero = Browser([Hero("Sail further", "Charter, courses and a harbour that knows your name.", "Book a trip", "See the fleet", "#0c4a6e > #0ea5e9 > #14b8a6")], null, "#f0f9ff", "sans", "md")`
    },
    {
      title: 'Three moods, one page',
      about: 'The same hero in serif, mono and display, with other corners.',
      code: `root = Grid([calm, tech, bold], 3)
calm = Browser([Hero("Hello", "A quiet look.", "Start", null, "#92400e > #f59e0b")], null, "#fffaf3", "serif", "lg")
tech = Browser([Hero("Hello", "A technical look.", "Start", null, "#0f172a > #334155")], null, "#0b1120", "mono", "none")
bold = Browser([Hero("Hello", "A bold look.", "Start", null, "#db2777 > #7c3aed")], null, "#ffffff", "display", "full")`
    },
    {
      title: 'Light and dark twins',
      about: 'One site, drawn for two themes.',
      code: `root = Grid([light, dark], 2)
light = Browser([Nav("Atlas", ["Docs", "Pricing"], "Sign up", "#2563eb"), Hero("Maps for teams", "Plan routes together.", "Try it", null, "#2563eb > #38bdf8")], "https://atlas.app", "#ffffff", "sans", "md")
dark = Browser([Nav("Atlas", ["Docs", "Pricing"], "Sign up", "#38bdf8"), Hero("Maps for teams", "Plan routes together.", "Try it", null, "#1e3a8a > #0ea5e9")], "https://atlas.app", "#0b1220", "sans", "md")`
    },
    {
      title: 'Buttons in every colour',
      about: 'Solid and outline, from one palette.',
      code: `root = Stack([title, solid, outline])
title = Heading("Buttons", 3)
solid = Browser([Grid([Cta("Orange", "orange"), Cta("Pink", "pink"), Cta("Violet", "violet"), Cta("Blue", "blue"), Cta("Teal", "teal"), Cta("Green", "green")], 6)], null, "#ffffff", "sans", "full")
outline = Browser([Grid([Cta("Orange", "orange", "outline"), Cta("Pink", "pink", "outline"), Cta("Violet", "violet", "outline"), Cta("Blue", "blue", "outline"), Cta("Teal", "teal", "outline"), Cta("Green", "green", "outline")], 6)], null, "#ffffff", "sans", "full")`
    }
  ]
}
