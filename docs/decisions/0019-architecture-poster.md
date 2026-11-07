# 0019 - The poster look of an architecture

Status: accepted, 2026-11-06. Follows ADR 0018 (diagrams); extends the Architecture of ADR 0005.

## Context

An Architecture stacked its blocks in a column and drew thin arrows: good for a system seen as layers, not for the posters that platforms
and pipelines are shown on: stages side by side with big arrows between them, databases as cylinders, a frame around all with a large
title. The model could describe such a drawing and not make it.

## Decision

Four options, all appended to the arguments of the existing components, so that nothing already written changes:

- `Architecture(children, flows?, title?, direction?, framed?)`: `direction row` lays the blocks side by side (wrapping when the width
  is short) with room between them for the arrows; `framed true` draws a frame around everything, with the title large and in capitals.
- `Item(..., shape?)`: `cylinder` draws a database, `hexagon` and `pill` a step, in the colour of the tone of the item, with the icon (if any) above its label and its caption.
- `Flow(..., style?)`: `style block` draws the big arrow of a stage to the next, a thick line with a head of its own size, in the accent
  colour. The route is the same as for the thin arrows (around boxes, titles and other arrows).
- Panels that hold panels in a row are a little further apart, so that an arrow between them has room.

The prompt gains one sentence for the architecture family, which says when to use them. The gallery of cloud architectures gains two
examples made with them: a data fabric as a poster and a pipeline in a row.

## Consequences

- A platform drawn as in an analyst's poster is a few dozen lines, and stays in the same family and the same budget.
- Not done: a legend, a numbering of the arrows.
