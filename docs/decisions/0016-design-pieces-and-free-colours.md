# 0016 - Design pieces and free colours in answers

Status: accepted, 2026-11-06. Follows ADR 0013 to 0015.

## Context

The pieces of the catalogue were made for facts: tables, charts, steps. A model asked "what could my site look like?" could only describe
it, and an interactive explorer (a list, a switch, a graph) showed as loose parts instead of one object. We want a model to sketch a page
quickly in the chat, with colours of its own, without writing HTML or CSS.

## Decision

- **A `Design` group of pieces:** `Browser` (a window with an address bar that holds a page), `Nav`, `Hero`, `Features` with `Feature`,
  `Grid` (1 to 4 columns), `Picture` (a gradient placeholder), `Palette` with `Swatch`, `Footer`. The pieces draw themselves; the model
  chooses what goes in them and which colours.
- **A colour is a hex code and nothing else** (`#f97316`, `#fff`; `safeColor` in `lang/design.ts`). The view writes it in a style only
  after it passed that test and was rewritten as `#rrggbb`; shades come from `color-mix` of that code. A name, a function, a URL or a
  declaration (`red`, `url(x)`, `#fff; x`) is refused at parse time and never reaches a style.
- **The text reads by itself.** A piece puts dark or white text on its colour by contrast (`readableOn`), so a model cannot make text
  invisible; a `Browser` gives its page colours to what it holds.
- **Limits, checked at parse time:** 8 features, 12 swatches, 8 links, 4 columns, 400 characters per text, no window inside a window.
- **It is a sketch to talk over.** The prompt says so, and sends whoever wants the real page to write the files. A complex page remains
  an HTML file in the preview panel (ADR 0010, level 2).
- **One object, not parts.** The prompt asks for the controls and the graph of an explorer to be put in one `Card`, and the catalogue
  example does so.
- **A `design` family of the prompt**, given when the request is about a site, a mockup, a landing page, a palette or the look of
  something; not to the Knowledge agent. The prompt budget is now per family (what each adds to the core), since the full block, the sum
  of them, only matters for a request that asks for all.

## Consequences

- A model can show three or four variants of a page, or a palette, in a few seconds of writing, and the reader answers with a click.
- Not done here: fonts, shadows and radii as choices, a mobile frame, images other than gradients, a Pricing or a Form piece for sites,
  a dark mode switch of the sketch, an export of the sketch to files.
