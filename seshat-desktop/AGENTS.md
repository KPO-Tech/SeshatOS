# Agent Instructions - seshat-desktop

`seshat-desktop` is the clean SeshatOS desktop client. Treat it as the place where we rebuild the product carefully, without carrying over the structural debt from `seshat-ui`.

## Product Boundary

- Frontend: Electron, React, TypeScript, Tailwind CSS.
- Backend/runtime: Go services called through REST, SSE, and IPC-safe bridges.
- Renderer code must not access the database directly.
- Renderer code must not duplicate backend policy or security rules.
- Do not copy broad chunks from `seshat-ui`. Reuse ideas, then rewrite the touched surface in the desktop architecture.

## Current Priority

1. Finish Chat first.
2. Reintroduce API clients and types only when needed by Chat.
3. Keep other surfaces scoped unless they directly support Chat.
4. Keep post-MVP features out of the main path unless the user explicitly asks for them.

Before editing, check the MVP strategy (`docs/mvp/` in the `seshat-ai` repository) when the task touches product scope.

## Code Style

- Prefer small, focused files with professional names.
- Do not pack unrelated components, hooks, constants, and helpers into one large file when a clear split would improve readability.
- Avoid abstractions that only make the code look clever. Add an abstraction only when it removes real complexity or matches an existing local pattern.
- Keep comments rare and useful. Do not add comments that restate the code.
- If a comment is needed, make it short, precise, and tied to a non-obvious design decision or edge case.
- Avoid decorative punctuation in code, UI strings, docs, and commit messages. In particular, remove unnecessary em dashes.
- Prefer plain ASCII unless the file already requires another character set or the product text explicitly needs it.
- Avoid noisy symbols, ornamental separators, and punctuation that does not improve clarity.

## Frontend And Design

- Follow the existing SeshatOS visual system before inventing new styling.
- Use the existing CSS tokens for color, spacing, typography, surfaces, borders, and status states.
- Match the quiet desktop workspace direction: dense, calm, readable, and precise.
- Do not introduce isolated visual styles that do not belong to the current app.
- Keep cards, panels, modals, buttons, inputs, and lists consistent with nearby components.
- Avoid oversized UI elements unless the screen is intentionally a hero or primary focus surface.
- Make responsive behavior explicit for fixed-format UI such as chat input, title bars, sidebars, tool cards, and panels.
- Do not create visible scrollbars unless the interaction needs them.

## Chat And Tools

- Keep Chat modular. The current shape is:
  - `components/chat/lib` for API, stream, model, and presentation logic.
  - `components/chat/messages` for message rendering.
  - focused components for input, model selection, and workspace layout.
- Tools are rendered by intent:
  - observable tools use live workspaces;
  - informational tools use compact cards;
  - delegated tools use agent activity cards.

## Commits

- Never add `Co-authored-by` lines.
- Keep commit messages short, direct, and scoped to the change.
- Commit only the files related to the task unless the user explicitly asks otherwise.
- Do not mix unrelated dirty files into a commit.

## Things To Avoid

- Do not make one-file catch-all implementations.
- Do not add unused placeholder UI just to fill space.
- Do not leave TODO comments unless the user explicitly asks for a tracked TODO.
- Do not introduce helper files with vague names like `utils.ts` if a more specific name is obvious.
- Do not silently change product concepts that were already agreed on.
- Do not use `seshat-ui` as a dumping ground for patterns. Treat it as reference material only.
