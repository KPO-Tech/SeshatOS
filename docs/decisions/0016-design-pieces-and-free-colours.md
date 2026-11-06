# 0016 - Design pieces and free colours in answers

Status: accepted, 2026-11-06. Follows ADR 0013 to 0015.

## Context

The pieces of the catalogue were made for facts: tables, charts, steps. A model asked "what could my site look like?" could only describe
it, and an interactive explorer (a list, a switch, a graph) showed as loose parts instead of one object. We want a model to sketch a page
quickly in the chat, with colours of its own, without writing HTML or CSS.

## Decision

- **A `Design` group of pieces.** Frames: `Browser` (a window with an address bar), `Phone` (a phone screen). Sections: `Nav`, `Hero`,
  `Logos`, `Features` with `Feature`, `Stats` with `Stat`, `Plans` with `Plan` (prices), `Testimonial`, `Footer`; and a dashboard: `Shell` with
  `SideItem` (a side bar and a main area), `Tile`, `Kpi`, `Spark` (a curve or bars), `DataRows`. Parts: `Grid` (1 to 4
  columns), `Picture` (a gradient placeholder), `Cta` (a button), `Avatar` (initials in a circle), `Palette` with `Swatch`. The pieces draw
  themselves; the model chooses what goes in them, the colours, a font and a radius.
- **A colour is read, then rewritten as `#rrggbb`** (`safeColor` in `lang/design.ts`). It may be written as a hex code, as a name of a fixed
  list of about forty (`orange`, `navy`, `slate`...), as `rgb(r, g, b)` with whole numbers up to 255, or as `hsl(h, s%, l%)`. Anything else
  (`url(x)`, `var(--x)`, `#fff; x`, a name that is not on the list, a number out of range) is no colour: it is refused at parse time with
  a hint, and it never reaches a style. What reaches a style is the `#rrggbb` code, and shades are `color-mix` of it.
- **A gradient is up to three colours joined by `>`** (`"#f97316 > #ec4899"`), each read as above; it is written into a style as a
  `linear-gradient` of the codes.
- **A font is one of four families** (`sans`, `serif`, `mono`, `display`), each a stack of fonts the computer already has: nothing is
  downloaded. **A radius is one of five steps** (`none` to `full`). `Browser` and `Phone` carry both and hand them to what they hold.
- **No image from the web, no `url()`.** An image loaded from an address makes a request as soon as the answer is shown: it tells that
  address who reads, and a page the model was misled by could send data in the address. So a picture is a gradient with a label, and
  logos come from the icon catalogue, which now holds the logos of about a hundred common technologies and services, found by their plain name
  (`react`, `stripe`, `figma`). A real image will be a file of the project, shown by the app, or a web image after a click; that is
  for a later lot.
- **The text reads by itself.** A piece puts dark or white text on its colour by contrast (`readableOn`), so a model cannot make text
  invisible; a `Browser` or a `Phone` gives its page colours to what it holds.
- **Limits, checked at parse time:** 8 features, 12 swatches, 8 links, 8 logos, 6 stats, 4 plans of 8 features each, 4 columns, 3
  gradient stops, 400 characters per text, no window inside a window.
- **It is a sketch to talk over.** The prompt says so, and sends whoever wants the real page to write the files. A complex page remains
  an HTML file in the preview panel (ADR 0010, level 2).
- **One object, not parts.** The prompt asks for the controls and the graph of an explorer to be put in one `Card`, and the catalogue
  example does so.
- **A `design` family of the prompt**, given when the request is about a site, a mockup, a landing page, a palette or the look of
  something; not to the Knowledge agent. The prompt budget is per family (what each adds to the core): design is the heaviest of the
  small ones at about 825 words (budget 850), which the planned work on the size of the prompt will have to look at (loading a family when it is
  needed, or describing the pieces once in a tool).

## Consequences

- A model can show three or four variants of a page, or a palette, in a few seconds of writing, and the reader answers with a click.
- Not done here: shadows as a choice, real images, a form piece or a dashboard layout for sketches, a dark mode switch of the sketch,
  an export of the sketch to files.
