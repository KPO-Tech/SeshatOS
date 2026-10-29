# 0009 - A lighter prompt for rich answers

Status: proposed, 2026-10-29. Builds on [0005](0005-chat-ui-catalog.md), [0007](0007-chat-charts-and-plots.md) and
[0008](0008-chat-interactions.md).

## Context

Every turn pays for the block that teaches the model the seshat-ui components, and each new family of components made it longer:
about 2 290 words with the charts, the plots and the interactions. Most turns need none of the drawings.

## Decision (proposed)

1. **A core and two families.** The core (tables, steps, metrics, callouts, sources, interactions, the line language, tones, four
   examples) is taught on every turn: about 1 100 words. The architecture family (drawings, the icon and logo lists, their rules
   and example) adds about 530 words; the charts family (charts, plots, formulas, histograms, heatmaps, their rules and examples)
   adds about 710.
2. **The request decides.** `richUIFamiliesFor` reads the user's message for words that ask for a diagram or a chart: stems and
   whole words in French and English, and the shape of a formula (`f(x)`, `x^3`, `y = 2x + 1`). A stem must start a word and a short
   word must be whole, so `process` does not bring the charts in. The four combinations are built once and cached.
3. **An example leaves with the components it draws.** The generated catalog is the single source: the groups Architecture and
   Charts are the families, and an example that uses a component of a left-out group is left out.
4. **The model can still offer what it was not taught.** The core ends with one sentence: more components exist for diagrams and
   charts; when one would clearly help, offer it as a Choice whose `@Ask` text names it (Show it as a chart). The reader's click is a
   message that carries the word, so the next turn brings the family in.

## Consequences

- Since 2026-10-29 the session is read too: the families that the last 12 messages' answers drew (a call of a component of the
  family inside a seshat-ui block) are kept, so a follow-up that names nothing ("and the next one?") continues with what it needs.
  A turn that names nothing, after answers that drew nothing of the families, still gets the core.
- A word list is a heuristic and will miss some requests. It errs towards loading (the cost of a false hit is some tokens, that of a
  miss is a Markdown table where a chart was wanted).

## Not decided here

- A tool the model calls to read a family's details when it decides to draw, which would not depend on words.
