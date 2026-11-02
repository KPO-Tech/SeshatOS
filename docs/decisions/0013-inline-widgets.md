# 0013 - Interactive widgets inside an answer

Status: proposed, 2026-11-02. Settles the first point that [0010](0010-interactive-widgets-and-artifacts.md) left open ("whether a small
artifact can also run inline in the answer"). Builds on the artifact work shipped in 0.3.4 (SeshatOS #417, #418, #419).

## Context

0.3.4 built level 2 of 0010: a web page the agent writes as a file and presents opens in the Artifact panel. The panel loads the page in a
sandboxed frame, serves the CDN libraries it names from the app (`internal/artifactlibs`, 23 libraries, offline), and reports its errors
with a button that asks the agent to fix them.

What is still missing is the ChatGPT case: an answer that *contains* something alive. Examples are a unit circle with a slider, a small
three.js scene, a simulation with Play and Step buttons, or an animated explanation. The reader sees it in the conversation, where it was
answered, without opening a panel or a file. ChatGPT calls this an AppBlock. Our `seshat-ui` blocks (0005 to 0009) draw tables, charts and
drawings, but nothing in them runs code or holds state.

## Decision

### 1. A fenced block, like `seshat-ui`

The agent writes the widget in its answer as a fenced block in the language `seshat-widget`, holding one self-contained HTML document or
fragment. It does not write a file and does not call a tool. A widget is part of the answer: it is stored with the message, shown again
when the conversation is reopened, and copied with it. The title is the document's `<title>`, when it has one.

```seshat-widget
<title>Unit circle</title>
<input type="range" id="t" min="0" max="6.283" step="0.01">
<canvas id="c" width="360" height="360"></canvas>
<script>/* ... */</script>
```

A page that is meant to be kept, reworked or opened elsewhere stays a file presented with `present_artifact` (the panel of 0.3.4). The
prompt tells the two apart: a widget illustrates an answer; an artifact is a deliverable.

### 2. The same frame, the same pipeline as the Artifact panel

A finished block goes through the existing preview pipeline:

1. `POST /artifacts/preview` (authenticated) stores it and allows its exact-version libraries to be downloaded once.
2. The backend serves it with its CDN addresses rewritten to the library route, the problem reporter first in the page, and the preview
   CSP: no network, no `allow-same-origin`, eval allowed for Vue, Alpine and Babel.
3. The renderer shows it in a `sandbox="allow-scripts"` frame.

Nothing about isolation is new. The preview store keeps an entry for 30 minutes, but the block's text is in the message, so a widget
scrolled back into view later is simply posted again (a renderer cache keyed by the text's hash avoids doing it twice in a session).

### 3. In the answer: streamed as text, run when complete

- While the block streams, a card stands in for it ("Building a widget…", with its title once the `<title>` has arrived and a line count),
  as a `seshat-ui` block fills in. It never runs half a program.
- When the fence closes, the frame appears in place of the card.
- **Height**: the reporter also posts the document's height (a `ResizeObserver` on the root). The frame takes that height, between 120
  and 720 px; past that it scrolls inside. The height is remembered per widget, so the virtualized list keeps the row's size when the
  row is mounted again (the lesson of #423).
- **Theme**: the renderer prepends a small stylesheet with the colours of the theme on screen (`--seshat-bg`, `--seshat-panel`,
  `--seshat-text`, `--seshat-muted`, `--seshat-accent`, `--seshat-border`, `--seshat-font`) and `color-scheme`. The prompt asks the widget
  to use them, so it follows Seshat Dark, Shine or any theme. A theme change reloads the widgets on screen.
- **Under the frame**: the problem bar of the Artifact panel (problems listed, and "Ask the agent to fix", sent only on a click), a button
  that opens the widget large (the existing Expandable large view), and a download of the HTML.

### 4. Cost and safety of many widgets

- **Only what is on screen runs.** A widget whose row leaves the screen is unmounted by the virtualized list anyway; an
  `IntersectionObserver` also replaces a frame that is mounted but scrolled out of view by a still card of the same height.
- **At most two live frames** in a conversation. Others show their card with a Run button. The newest widget starts by itself; older ones
  start on a click.
- **Size budget**: a block over 80 KB is shown as code with a note, not run.
- **No bridge to the agent in this step.** The frame can post problems and its height, nothing else. A button inside a widget cannot send
  a message: a page the agent wrote after reading the web must not be able to talk to the agent by itself. A narrow allow-listed action
  (like `@Ask` of 0008, with the person's click) can come later, in its own decision.

### 5. Teaching it to the agent

- A new prompt family, **widget**, joins architecture and charts (`richui_families.go`). It is loaded only when the request asks for
  something to play with: interactive, simulation, animation, 3D, game, slider, "let me try", and the French words for them.
- The family says, briefly:
  - **When.** A widget when the reader should act on something the catalog cannot draw. A `seshat-ui` block for tables, charts and
    drawings. A file with `present_artifact` for a deliverable.
  - **Rules.** One self-contained block. No network, so no `fetch` and no images from the web. Libraries only from jsDelivr, unpkg or
    cdnjs, with an exact version, preferring the shipped ones (listed with their versions from `artifact-libs.json`). The `--seshat-*`
    variables. No `localStorage`, since the frame has an opaque origin. Under about 300 lines.
- About 350 words, so the cost of a turn without the family is unchanged.
- The preference "Rich answers" (Config > Agents > Answers) also turns widgets off. With it off, the agent is not taught them, and a
  `seshat-widget` block that arrives anyway is shown as code.

## Consequences

- An answer can hold a live, themed, offline widget that survives reloads, built on code that already runs in 0.3.4.
- Widgets cost tokens (a page is 5 to 10 times a `seshat-ui` block). The family is loaded only when asked for, and the prompt keeps
  `seshat-ui` as the default for what it can say.
- Two kinds of HTML now exist (inline widget, presented file). The prompt's rule of thumb decides; the person can turn a widget into a file
  by asking.
- A widget does not remember a slider's position across reloads (opaque origin, no bridge). Accepted for this step.

## Not decided here

- The declarative level 1 of 0010 (state in the `seshat-ui` language itself). Widgets cover the need first; level 1 stays worth doing for
  light explorations if widgets prove too heavy.
- An action bridge from a widget to the conversation.
- A check of the widget before it is shown (a hidden frame whose errors return to the model before the answer ends). Here the person sees
  the problems and asks for the fix.

## Order of work

1. Renderer: `seshat-widget` fence, card while streaming, frame with height, theme stylesheet, problem bar, live-frame limit, size budget,
   remembered height. Tests on the parsing and the limits.
2. Reporter: the height message (backend, `artifact_reporter.go`).
3. Prompt family **widget** and its words, gated by the Rich answers preference. Measure the added words.
4. Try it on the models the user runs (glm-4.5 and glm-5.1): a unit circle, a three.js scene, an ACO step simulation. Adjust the prompt.
