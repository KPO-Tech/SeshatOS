# 0010 - Interactive widgets, artifacts and projects (to discuss)

Status: to discuss, 2026-10-30. Nothing is decided or scheduled. Builds on [0005](0005-chat-ui-catalog.md), [0007](0007-chat-charts-and-plots.md)
and [0008](0008-chat-interactions.md).

## Context

The wish: answers that are really interactive, as in ChatGPT (a unit circle with a slider and a draggable point whose formulas follow, a
bike configurator with clickable parts and an SVG export), and beyond them 3D scenes (three.js), small sites and prototypes written in HTML,
CSS and JavaScript, shown in the app, changed on request, and for real projects, run locally and looked at by the agent in the browser.

Today the catalog draws what it knows (tables, charts, plots of formulas, drawings) and nothing in an answer holds a state or runs code.

## What others do (read in October 2026)

- **ChatGPT is not one iframe per answer.** Its "Intelligent UI" is mostly declarative: the model writes Markdown with component tags
  (`<slider>`, `<box>`...) and JavaScript for state (`seats`, `price = seats*29`). The server compiles it, and a locked-down runtime runs it
  (a hidden iframe with `allow-scripts` and `default-src 'none'`, a Web Worker whose globals are stripped, a watchdog). A slider moves a
  value without any model call. About 70 generic components, no component for trigonometry: the unit circle is built from generic parts.
  For what the catalog cannot draw (a drum machine with Web Audio) the model writes an **AppBlock**: a self-contained HTML app in an iframe on
  a separate origin, with theme variables injected so that it follows light and dark. The bike is that second kind.
  Their weak points, as measured by Thesys: logic errors are silent, the compiler's diagnostics seem not to reach the model, the state is
  lost on reload, and a follow-up regenerates the interface instead of changing it.
- **Claude artifacts**: an iframe sandbox with a strict Content Security Policy and process isolation.
- **OpenUI** (the repository in `helps/openui`): a declarative language with reactive state (`$variables`, `@Set`, `@Each`, derived values), so
  the slider case is declarative there too, and the same combination: an `HtmlArtifact` component in the catalog, `sandbox="allow-scripts"`
  with `srcDoc`, a compact card inline and the document in a side panel (raw while it arrives, rendered once complete). Its example is
  minimal: it warns to add a CSP, validation and a narrow bridge "before production".
- **Safe pattern for model-written HTML** (agentpatterns.ai, Simon Willison's tests): `sandbox="allow-scripts"` and never
  `allow-same-origin` with it; a `<meta>` CSP with `default-src 'none'` in the `srcdoc`; a `MessageChannel` with an allow-list of operations
  instead of a general `postMessage`; a separate origin when the host holds private data.

## The three levels

1. **Declarative with state** (inline in the answer). Generic parts, not a component per subject: variables, reactive expressions,
   inputs (slider, switch, select), text that follows the variables (LaTeX included), plots whose formulas use the variables, parametric
   curves, segments, arcs, a point that can be dragged and bound to a variable, a reset button. Safe and valid by construction (no code
   runs; the parser validates), streams while it is written, follows the theme, exports. Covers explorations: the unit circle, a function with
   `a`, `b`, `c` sliders, the effect of a learning rate. About a week.
2. **Artifact** (a file the agent presents, in a panel). A single-file HTML (CSS, JS, SVG, WebGL) kept as a workspace file, shown in an
   Artifacts panel in a sandboxed frame, with a card in the chat. The agent changes it with its edit tool and the panel reloads, so a
   change request is a patch, not a new generation; versions and undo; download. Covers the bike, a three.js scene, a game, a prototype.
   The names are already frozen (`present_artifact(path, title, kind)`, see the artifacts plan in the project notes). One to two weeks.
3. **Project** (a real site run on the machine). The agent writes files in the workspace, starts a dev server with its shell tool, and
   opens it in the Browser panel, where it can take screenshots, click, read the console, fix and test again. Most pieces exist
   (browser tools, shell, write and edit tools); what is missing is detecting the port and opening the preview, managing the processes,
   and the trust rules (localhost only, a sandbox for the shell: see the sandbox decision). About a week of integration.

## "Will it always work?"

It cannot be promised for arbitrary code, and ChatGPT does not promise it either. It can be made much more reliable, and SeshatOS has
what ChatGPT's interface lacks, an agent loop:

- **A check before showing.** Load the artifact in a hidden frame, collect the errors (`onerror`, `console.error`, unhandled rejections), detect a
  blank page, take a screenshot, and give all of it back to the model as the result of the tool, so it fixes its own file (a few tries).
- **A fixed ground**: libraries bundled offline and pinned (three, d3, a chart library), a starter skeleton with the theme variables
  (`--viz-*` as ChatGPT does), single file, a size budget.
- **When it still fails**: an error overlay with a "Fix it" button that sends the error to the agent, and the previous version one click away.
- **A watchdog** for loops that never end: a heavy artifact must not freeze the app; a separate process (`webview` or a view of its own) or a
  timeout that removes the frame.
- Level 1 is reliable by construction; level 2 by the loop above; level 3 by the agent's own tests in the browser.

## Constraints specific to SeshatOS

- Local first and private: no network from an artifact by default (`default-src 'none'`), libraries served from the app, and an explicit,
  per-artifact permission if one needs the network.
- No `allow-same-origin`: the frame has an opaque origin, so no `localStorage`; saving goes through the bridge, which offers a small
  allow-listed set of operations (save, export, copy, ask a question to the agent).
- Theme and look: variables injected into the frame, a starter CSS, so the artifact does not look like a foreign page.
- Cost: a full HTML page is 5 to 10 times the tokens of a declarative spec, so level 1 stays the default for what it can say, and the prompt
  for level 2 is loaded only when the request asks for it (as the architecture and chart families are).

## Suggested order (to confirm)

Level 2 first, since it covers the widest part of the wish (3D, the bike, prototypes) and gives an escape hatch for everything else, then level 3
(which mostly reuses what exists), then level 1 for the light explorations that do not deserve a page.

## Not decided here

- Whether a small artifact can also run inline in the answer (ChatGPT's AppBlock has an inline variant) or only in the panel, with a card inline
  (OpenUI's choice).
- Level 1 language: our line language extended with state, or a second language for it.
- Multi-file artifacts and how a folder is served to the frame (a custom protocol of the app).
- How the user's edits in the artifact (a changed slider, a chosen colour) are told to the agent: ChatGPT's model does not see them.

## Sources

- [How ChatGPT's Intelligent UI works (Thesys, 2026-10-08)](https://www.openui.com/blog/how-chatgpt-intelligent-ui-works), also in `helps/openui/docs/content/blog`.
- OpenUI: `docs/content/docs/agent/guides/open-ended-html.mdx`, `examples/miscellaneous/html-artifact`, `spec/language.md` section 5.
- [Browser sandbox for agent-generated HTML](https://www.agentpatterns.ai/security/browser-sandbox-agent-generated-html/) and
  [Simon Willison on CSP in sandboxed iframes](https://simonwillison.net/2026/Apr/3/test-csp-iframe-escape/).
- [How Anthropic built artifacts](https://simonwillison.net/2024/Aug/28/how-anthropic-built-artifacts).
- [I reverse engineered ChatGPT apps' iframe sandbox](https://dev.to/infoxicator/i-reverse-engineered-chatgpt-apps-iframe-sandbox-2ok3) (the two-layer proxy; secondhand).
