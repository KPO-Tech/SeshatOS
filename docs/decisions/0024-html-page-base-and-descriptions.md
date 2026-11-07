# 0024 - A base for HTML pages, and descriptions that say when

Status: accepted, 2026-11-06. Follows ADR 0022 (choosing the medium).

## Context

When the agent does write a page (a complex architecture, a 3D scene), its design depended on the model: dark blue backgrounds, emoji as
icons, web fonts the preview blocks. The app already ships 23 libraries (Chart.js, D3, three.js, ECharts, Mermaid...) that the backend serves, but
nothing told the agent how a page of the app should look. The descriptions of the components said what they are, rarely when to use them.

## Decision

- A block of the prompt, `htmlPageBlock` (context.go), is sent with the rendering note on every turn of the general agent: the base CSS
  (light palette as variables, one accent, spacing, radius, shadow, system fonts), the habits (inline SVG icons, never emoji; arrows in an
  SVG layer over a grid; Chart.js, ECharts, three.js, Leaflet for what they do well; responsive from 360px) and the rule to adapt it.
- A recipe in the prompt, not a file copied into the workspace: a copied file still has to be described to the agent, adds a file to
  every project, and ties the pages to a version of the file. A built-in skill, loaded on demand, would cost nothing until used, but skills
  come from the runtime repository; it stays an option for later.
- The descriptions of the components the agent confuses say what they are and when: a Plot is any function (never a page), an Architecture
  is up to about fifteen boxes, a Tree is a decision tree, a Cycle a loop, a Hub a centre with what surrounds it, a Sheet a table to fill in.
- Ceilings of the prompt tests go up a little (charts 1250, forms 1100, design 950 words; Knowledge core 1300).

## Consequences

- Pages share one look, and the agent knows the libraries exist. The base is about 250 words on every turn.
- Not done: giving a page the app's own icons (an icon tool, with the SVG tool), a library of ready sections.

## Update, 2026-11-06: the skill was tried and dropped

The recipe was moved into a built-in skill (`html-page`, collection seshat-skills) and tried in the real app. With a large reasoning model it read four files
before writing (about 35k tokens), looked for them by a wrong relative path, read the whole icon file when its search failed, and lost most of eight minutes
to something else (the permission classifier blocking every write, see the runtime). A smaller model with the recipe in the prompt wrote a good page in 1 min 32.
A skill pays only for a large content that is rarely needed; this base is short and needed on every page. The recipe stays in the prompt, with the habits of
`design-rules.md` added (what makes a page look made by a model, one write call, say so when a write is refused), and the skill was removed. The icon set, the
three.js and diagram snippets were not kept: a model draws a simple SVG and knows those libraries.
