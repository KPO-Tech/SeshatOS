# 0014 - Sliders and live formulas in answers

Status: accepted, 2026-11-05. First slice built on `feat/chat-interactive-graphs`. Level 1 of ADR 0010 (declarative components with state), in its smallest form.

## Context

ChatGPT lets a reader explore a function: a graph with its equation, and a slider for each parameter (a, b, c, d) that redraws the curve at
once. We want it too, without letting the model write code. The Plot of the catalogue already draws formulas in x with a safe reader of
formulas (no `eval`); what was missing is a number the reader can change.

## Decision

- **`Slider(name, min, max, value?, step?, label?)`** sets a variable. **`Live(text)`** is Markdown where `{{formula}}` shows its value
  with the current variables (the equation, a vertex, a period). Both belong to the `Charts` group, so they are taught with the charts
  family and not otherwise.
- **A variable is a number kept in the block** (state of a provider around the block, `VarsContext`), saved in `localStorage` under
  `seshat.vars.<hash of the block>` like the forms (ADR 0013). Nothing is sent: moving a slider has no effect other than redrawing.
- **Formulas read variables by name** through the same reader as before (`view/charts/expression.ts`): the names of the sliders become
  numbers before the formula is evaluated. It still builds a tree of known operations; there is no `eval`, no `Function`, no access to
  anything but numbers and a fixed list of functions.
- **Limits, checked at parse time:** 8 sliders, names `[A-Za-z][A-Za-z0-9_]*` of 16 characters at most, unique, not `x`, a constant or a
  function (a slider named `sin` or `e` is refused, so a formula never changes meaning), `max` above `min`, at most 2000 steps from end
  to end, a Live of 1200 characters, and every `{{formula}}` of a Live readable with the sliders given. A Plot draws at most 900 points.
- A formula written with a bad name shows its message under the graph, as before.

## Consequences

- One Plot with several Curves and a few Sliders gives the exploration of the screenshots, composed from existing parts.
- The prompt for the charts family gains a short paragraph; the ceiling of the full block moves to 3350 words (`richui_test.go`).
- The position of a Dot, VLine or HLine and the bounds of a Shade may be a formula in the variables ("-b/(2*a)"): they follow the sliders.
  The formula is checked at parse time with the starting values.
- Not done here: Select and Toggle, a reset button, zoom and pan of the Plot, a variable shared between a Form and a graph.
