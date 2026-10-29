# 0005 - Rich answers in chat: a component catalog and a streaming line language

Status: proposed, 2026-10-29. Nothing is built yet. Replaces [0003](0003-chat-generative-ui.md), which fixed the idea
(the agent describes, the client renders) but not the format, the streaming behaviour or the catalog.

## Context

Chat answers are Markdown. The desktop renders three special fences: `mermaid` (diagram), `chart` (a raw Chart.js config)
and code. `renderingCapabilitiesBlock` in `seshat-backend/internal/query/context.go` teaches the model about `chart` by hand.

Generative UI has moved a long way since 0003. The reference we studied is OpenUI (thesysdev/openui, MIT, read locally in
`helps/openui`). What we keep from it:

- the model writes a short program, one statement per line, `name = Component(args)`, with positional arguments;
- a name may be used before it is defined, so the layout arrives first and the data after;
- the parser closes open brackets and strings, so every partial text is a valid page and the UI fills in while streaming;
- a mistake removes the smallest broken piece, and the error is structured so it can be sent back to the model;
- the system prompt is generated from the component library, never written by hand;
- arguments are append-only, so stored answers keep rendering when a component evolves.

What we do not take: its 82 components, its visual style, its state, query and mutation language, its Next.js server. We
write our own parser and catalog in the desktop, themed with the app tokens.

### What real answers look like

A scan of 210 assistant text blocks in 15 sessions of the local database (research and coding work, so a small and biased
sample) shows which shapes recur: comparison and status tables (7 percent of blocks, and the longest answers), long
structured reports with headings (9 percent, 3000 to 27000 characters), lists of bold labels followed by an explanation
(7 percent), source and reference lists, a few ASCII diagrams. Almost no charts. So the first catalog serves reports,
comparisons, status and sources, and the chart is one component among others, not the centre.

## Decision (proposed)

1. **The model describes, the client renders.** No HTML, SVG or script from the agent in this layer. The schema is the
   safety boundary.
2. **A line language, not JSON.** Fewer tokens, and forward references give real progressive rendering. Called
   `seshat-ui`.
3. **Carrier: a fenced block** with language `seshat-ui`, inside normal Markdown, so prose and components mix freely. It
   degrades to a readable code block anywhere else. A `render_ui` tool is a later, cleaner carrier (other hosts, text
   fallback), and does not change the language.
4. **One catalog, defined once.** The components are defined in the desktop as plain TypeScript data (name, positional
   arguments with their types, description), which the parser also validates against. `npm run ui-catalog` writes
   `seshat-backend/internal/query/richui_catalog.spec.json` (signatures, descriptions, worked examples). The backend embeds that
   file to build the prompt block; a desktop test fails when the file is out of date. The prompt is never edited by hand, and
   it teaches only the components the app can draw today, so the catalog can be larger than what the model is told.
5. **Progressive rendering.** The block renders while it streams. Raw code is shown only if nothing could be parsed when the
   block closes.
6. **Mermaid stays**, for quick diagrams. The old `chart` fence stays readable for stored messages, but is no longer taught
   to the model once `BarChart` and `LineChart` exist.
7. **Free HTML, SVG animation and 3D are a second layer** (a `Widget` component backed by a sandboxed iframe), decided in a
   separate record. The name `Widget` is reserved here.
8. **It is a preference, on by default.** The user preference `rich_answers_enabled` (Config, Agents, Answers) decides
   whether the model is taught the components. It is stored as an opt-out (`rich_answers_disabled`) so that a user who never
   chose, and a row written before the column existed, get the default. A save that omits the field keeps the stored choice.
   Turning it off removes only this block from the prompt; a `seshat-ui` block already in a conversation still draws.

## The language

```text
root = Stack([title, kpis, table, note])
title = Heading("Terminal agents compared", 2)
kpis = MetricRow([m1, m2])
m1 = Metric("Tools compared", 5)
m2 = Metric("With a native sandbox", 3, "+1", "up")
table = Table([Col("Tool"), Col("Sandbox"), Col("Memory")], rows)
rows = [["Claude Code", Badge("yes", "success"), "CLAUDE.md"], ["Aider", Badge("no", "danger"), "chat history"]]
note = Callout("warning", "Not documented", "OpenCode does not document its internal database schema.")
```

Rules:

- One statement per line: `name = value`. A value is a string, a number, `true`, `false`, `null`, an array, an object
  `{ key: value }` or a component call.
- Rendering starts at `root`. A statement nothing reaches is not rendered.
- A name can be used before it is defined. An unresolved name means "not yet", not an error, until the block closes.
- Arguments are positional, in the order the catalog lists them. Optional arguments come last; `null` skips one in the
  middle.
- Strings accept inline Markdown (bold, code, links) where a component says so.
- Actions are values: `@Ask("text")` sends a message as the user, `@OpenFile(path, page?, line?)` opens a document in the
  app, `@OpenUrl(url)` opens a link. A button or a choice takes one.
- No variables, expressions, queries or mutations in v1. Interactivity that the model does not need to see (tabs,
  accordions, sorting a table, hover) lives inside the components.
- Parser: tolerant. It closes open strings, brackets and calls at the end of the text. An unknown component, a wrong
  argument type or a missing required argument removes that statement and reports
  `{ code, statement, message, hint }`. The hint lists the valid names, so the error can be sent back to the model.
- Evolution: add arguments only at the end, never reorder or remove one, give every new required argument a default.

## Catalog v1

Argument lists are the contract. `?` marks an optional argument. Every component has a plain-text fallback, used by the
terminal and by exports.

### Layout

| Component | Arguments | Fallback |
|---|---|---|
| `Stack` | children, direction? ("column" or "row"), gap? ("sm", "md", "lg") | children in order |
| `Card` | children, title?, tone? ("neutral", "info", "success", "warning", "danger") | title, then children |
| `Section` | title, children, open? (default true), collapsible? | heading, then children |
| `Tabs` | tabs | each tab as a section |
| `Tab` | label, children | heading, children |
| `Accordion` | items | each item as a section |
| `Separator` | | a rule |

### Text

| Component | Arguments | Fallback |
|---|---|---|
| `Heading` | text, level? (1 to 4) | `#` heading |
| `Markdown` | text | the text |
| `Callout` | tone, title, body? | `> **title** body` |
| `Badge` | text, tone? | `[text]` |
| `Quote` | text, source? | blockquote |

### Data

| Component | Arguments | Fallback |
|---|---|---|
| `Table` | columns, rows, caption?, sortable? | Markdown table |
| `Col` | label, kind? ("text", "number", "percent", "money", "date"), align? | header cell |
| `Metric` | label, value, delta?, trend? ("up", "down", "flat"), note? | `label: value (delta)` |
| `MetricRow` | metrics | one line per metric |
| `Timeline` | items | dated list |
| `TimelineItem` | title, when?, body?, tone? | list item |
| `KeyValues` | pairs | `key: value` lines |
| `Pair` | key, value | line |

A table cell is a string, a number, a `Badge`, a `FileRef` or a `Link`. Numbers are formatted by the column kind and the
app language.

### Charts

| Component | Arguments | Fallback |
|---|---|---|
| `BarChart` | labels, series, mode? ("grouped", "stacked"), unit?, horizontal? | table of the values |
| `LineChart` | labels, series, unit? | table |
| `AreaChart` | labels, series, unit?, stacked? | table |
| `PieChart` | labels, values, donut? | table |
| `ScatterChart` | series, xLabel?, yLabel? | table of points |
| `Series` | name, values | column |

Charts use the app palette in light and dark, show a legend only with more than one series, and are keyboard and screen
reader accessible through a table view.

### Relations

| Component | Arguments | Fallback |
|---|---|---|
| `Diagram` | nodes, edges, direction? ("right", "down"), groups? | indented outline of nodes and links |
| `Node` | id, title, subtitle?, icon?, kind? | line |
| `Edge` | from, to, label?, style? ("solid", "dashed") | `from -> to` |
| `Group` | id, title, nodeIds | heading |

The model gives no coordinates. A layout library (dagre or ELK) places nodes and groups. `icon` is a name from a small
fixed set, `kind` is one of "service", "store", "user", "external", "process", "decision".

### Guidance

| Component | Arguments | Fallback |
|---|---|---|
| `Steps` | items | numbered list |
| `Step` | title, body?, status? ("todo", "doing", "done", "blocked") | list item |
| `Checklist` | items | task list |
| `CheckItem` | text, done? | `- [x]` |
| `ProsCons` | pros, cons, title? | two lists |

### Sources and files

| Component | Arguments | Fallback |
|---|---|---|
| `FileRef` | path, label?, page?, line? | `path:line` |
| `Citation` | label, source, quote?, page? | footnote |
| `SourceList` | sources | list |
| `Source` | title, url?, path?, note? | list item |
| `Link` | label, url | Markdown link |

`FileRef` and `Citation` open the document in the app at the cited place with the passage marked, as the Knowledge search
already does.

### Interaction

| Component | Arguments | Fallback |
|---|---|---|
| `Button` | label, action, variant? ("primary", "secondary") | label |
| `Choices` | options, title? | list of options |
| `Choice` | label, action | list item |

`Choices` renders as follow-up suggestions under the answer. At most one `Choices` per answer.

### Reserved

`Widget` (sandboxed HTML, SVG, animation, 3D). Not in v1.

## Guidance for the model

The generated prompt block stays short. It states, once: use a `seshat-ui` block only when it beats plain Markdown (a
comparison, a set of figures, a process, a structure, a list of sources); keep prose outside the block; write `root`
first; put data last; never invent a component; one block per idea, at most three per answer. Each component adds one line
(its signature) and the catalog adds three worked examples. The block replaces the manual `chart` paragraph in
`renderingCapabilitiesBlock`.

## Open points

- Mermaid and `Diagram` overlap. Decide after a month of use whether `Diagram` makes mermaid redundant.
- Row-oriented `Table` (chosen here, models write it naturally) against OpenUI's column-oriented one. Measure on the test
  set.
- Whether `Choices` should be limited to the last message only.
- Persistence: a stored message keeps its raw text, so a catalog change must stay backward compatible (append-only rule).
- The terminal interface uses the fallbacks. Who writes them: the same definitions, as a `toText` per component.

## How it is validated

Before wide use, a fixed set of about 30 questions (comparison, status report, figures, process, architecture, sources,
decision) is answered by several models with the generated prompt. Measured: share of blocks that parse without error,
share where the component fits the question, time to first visible content while streaming, and tokens against the same
answer in Markdown. A component that fails on this set is changed or removed, not kept.

## Build order

1. Parser and renderer shell: tolerant parse, forward references, errors, registry, fallback to code.
2. `Stack`, `Card`, `Heading`, `Callout`, `Badge`, `Table`, `Metric`, `MetricRow`, `Steps`.
3. Prompt generation from the catalog and the test set.
4. `FileRef`, `Citation`, `SourceList`, `Choices`, `Button` (needs the chat action bridge).
5. Charts.
6. `Diagram` with auto layout.
7. The rest of the catalog, then the `Widget` record.
