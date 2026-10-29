# 0008 - Interactions in chat answers

Status: proposed, 2026-10-29. Builds on [0005](0005-chat-ui-catalog.md).

## Context

The catalog named Button, Choices, FileRef, Citation, SourceList and Link, and parsed the actions `@Ask`, `@OpenFile` and
`@OpenUrl`, but the app drew none of them. An answer could show but not lead anywhere.

## Decision (proposed)

1. **An action bridge.** `view/actions/richActions.tsx` holds a context with what an answer may do: `ask(text)`, which the
   conversation page backs with `sendMessage`, and `busy`, true while an answer is being written. Opening a file
   (`window.seshat.openPath`) and an address (`openExternal`) need no conversation and work anywhere an answer is drawn.
2. **`@Ask` sends a real user message.** The text is what the reader would have typed, so the follow-up is an ordinary turn:
   visible, editable in history, and answered like any other. It is disabled while an answer is being written and where no
   conversation is under the answer (it says why in its tooltip).
3. **Components.** `Button` (primary or secondary), `Choices` with `Choice` (follow-up chips; the one clicked stays marked),
   `FileRef` (a chip with the file name and a line or page, usable in a table cell), `Link` (also usable in a cell),
   `Citation` (a quoted passage with its source and page), `SourceList` with `Source` (numbered, opens the address or file).
4. **The prompt** teaches them with rules of use: Choices only at a real fork, never as a habit, at most once per answer, two to
   four short phrases in the reader's language; a path only for a file that was really read; a real address.

## Not decided here

- Opening a file inside the app's own files panel, at a line or a page: `FileRef` opens it with the system for now, because the
  panel keeps its tabs in its own state and has no entry point from outside.
- An action that runs a tool or changes a file (a button that applies a patch): it needs the permission model, not only a bridge.
- Forms and inputs inside an answer, and an answer that updates in place.
- Cost of the prompt, which grows again (about 190 words); loading the detail of a family only when needed is still open.
