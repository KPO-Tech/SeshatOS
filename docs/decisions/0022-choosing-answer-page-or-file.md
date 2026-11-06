# 0022 - Choosing between the answer, a page and a file

Status: accepted, 2026-11-06. Follows ADR 0005 (rich answers).

## Context

First tests with GLM-4.5 showed the agent writing an HTML page for what the chat components draw well (a parabola with sliders, an
architecture of a few boxes), because the always-present rendering note offered the HTML preview "for demos and visualizations". Its pages
also asked for web fonts, which the preview blocks, and used a dark blue background and emoji instead of the app icons.

## Decision

- The general agent is told, in the core of the rich answers block, to choose in this order: in the answer with the components; an HTML
  preview only when the reader asks for a page, an app, a game or a site, or the components cannot draw it (3D, animation over time, a
  simulation, a map, a free drawing, an architecture of more than about fifteen boxes or with crossing flows); a real file when the
  reader wants something to open elsewhere. A function to explore is a Plot with Sliders, never a page.
- A page has no external resource (system fonts), a light background unless the reader asks for dark, a careful design, and icons
  drawn as inline SVG, not emoji. The always-present note says nothing loads from outside the file.
- The Knowledge agent is not told: it writes no page and no file. The core ceiling goes from 1200 to 1500 words.

## Consequences

- Not done: giving a page the app's own icons (the agent has only their names); a component for hub shapes (five forces, a mind map).
- To check with real models: the rule is only a prompt, so its effect is measured by the list of test requests, not by a unit test.
