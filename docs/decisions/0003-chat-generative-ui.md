# 0003 - Rich answers in chat: the agent describes, the client renders

Status: proposed, 2026-10-09. Nothing is built yet. Written down so the idea is not lost.

## Context

Chat answers are markdown. seshat-desktop already renders fenced `mermaid` blocks as diagrams
(`src/renderer/components/ui/MarkdownView.tsx`), but that is the only visual form. We want an agent that
can answer with a styled diagram, a table, a card list, a step list or a chart, rendered cleanly in the
chat, the way ChatGPT and similar products do today.

The seshat-ai website now has a hand-built SVG diagram component (nodes, edges, groups, icons, light and
dark themes) that gives a much better result than mermaid. It is a good starting point for the diagram
part, but it needs positions that a model cannot give reliably.

## Decision (proposed)

The agent does not draw. It describes, and the client renders.

1. **A small component catalog**, each component with a strict schema: diagram, table, card grid, steps,
   callout, chart. The catalog lives in the desktop client, themed with the app tokens.
2. **Diagrams: nodes and edges only.** The agent sends nodes (id, title, optional subtitle, icon, kind)
   and edges (from, to, label, style). Layout is computed by a layout library (dagre or ELK) before
   drawing. The renderer is the website's `Diagram` component adapted to React.
3. **A typed carrier.** Either a fenced block (language `seshat-ui`, JSON content) parsed by
   `MarkdownView`, or a dedicated content block type sent by the backend. The fenced block is the cheaper
   first step and degrades to a readable code block anywhere else. A dedicated tool (`render_ui`) that
   returns the description is the cleaner second step, and lets other hosts (the terminal) show a text
   fallback.
4. **Validate, then render.** The client validates against the schema. If the description is invalid or
   still streaming, it shows the raw block as code, never a broken layout.
5. **No raw HTML or SVG from the agent.** The schema is the safety boundary: no scripts, no external
   resources, no inline styles.

## Why not raw HTML in an iframe

More freedom, but a larger attack surface (the agent reads untrusted files and web pages), inconsistent
styling, and harder streaming. The schema approach keeps the look consistent and the risk low.

## Open points

- Keep `mermaid` as is for quick diagrams, or retire it once the catalog diagram exists.
- Streaming: render nothing until the block closes, or render progressively.
- How the agent learns the catalog: a skill, the system prompt, or the tool schema.
- The terminal interface fallback: a plain-text or ASCII rendering of the same description.
- Where the shared schema lives, so the backend, the desktop client and the website agree.

## First increment

One component, the diagram, end to end: schema, fenced block parsing in `MarkdownView`, auto layout,
dark and light rendering, fallback to code. Then the table, then the rest of the catalog.
