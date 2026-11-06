# 0018 - Diagrams: shapes that say an idea

Status: accepted, 2026-11-06. Follows ADR 0016 (design pieces) and 0017 (the Generative UI window).

## Context

The agent could draw systems (Architecture, Flow), charts and sketches of a page, but not the shapes of a strategy or a method that slides
and reports are full of: a honeycomb of parts that touch, a process in arrow-shaped steps, a cycle, a pyramid, a funnel, a matrix of two by
two, a stack of layers. A model asked for "my strategy as a honeycomb" could only describe it.

## Decision

- **A `Diagrams` group of six shapes**, each a list of small parts:
  `Hive` of `Hex` (a honeycomb in columns, with a heading for each of two groups), `Chevrons` of `Chev` (a process, each step with a text),
  `Cycle` of `Loop` (three to eight steps in a loop, with the arrows between them and a word in the middle), `Pyramid` of `Level` (a
  hierarchy, or a funnel with `funnel` true), `Quadrant` of four `Quad` (axes named, cells in order), `Layers` of `Layer` (a stack).
- **The model gives words and colours; the app draws.** There is no free drawing, no path, no style: a shape is laid out from its data (the
  honeycomb from the number of hexagons of each column, the cycle from the number of steps, the arrows between the boxes from where the boxes
  are). Colours go through the same reader as the sketches of a page (`safeFill`): a hex code, a name, `rgb()`, `hsl()`, a gradient;
  anything else is refused at parse time. The text on a colour is chosen by contrast.
- **Limits, checked at parse time:** 7 columns and 21 hexagons in a Hive, 8 steps in Chevrons, Cycle and Layers (a Cycle needs 3), 7 levels
  in a Pyramid, exactly 4 cells in a Quadrant, 160 characters per text.
- **A `diagrams` family of the prompt**, chosen from the words of the request (a honeycomb, a pyramid, a funnel, a 2x2, SWOT, Maslow, a
  Venn, an org chart, "diagram"...), or forced on or off from the Generative UI window like the others (ADR 0017). Not taught to the
  Knowledge agent. Words as generic as "process" or "strategy" are not triggers: they would bring the family into too many requests.
- **A gallery**, "Schemas and strategy", with the reproduction of a honeycomb of a well-known analyst, a product strategy, a process, a
  cycle, a pyramid, a funnel, a matrix and a stack.

## Consequences

- A request for a visual of a strategy or a method gets a real shape, in colours of the model's choosing, in a few lines.
- Added afterwards: `Venn` of two or three `VSet` (circles that overlap, one word for what they share) and `Tree` of `Branch` (an org chart or
  a decision tree, up to 25 nodes, 4 levels and 6 children a node, the connecting lines drawn from the structure). The poster look of an
  architecture is ADR 0019.
- Not done here: a swim lane, a mind map.
