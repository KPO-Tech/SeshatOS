# 0020 - Open a draft in the mail app, and the table to fill in

Status: accepted, 2026-11-06. Follows ADR 0013 (forms); keeps its rule that nothing leaves the block without a click.

## Context

A Draft could only be copied. The reader then had to open their mail app and paste. And an exercise or a budget often asks for rows
of cells, which a text box does badly.

## Decision

- `Draft(text, subject?, to?, title?)` gains a button "Open in mail" in the desktop app. The renderer never builds a link: it sends the
  parts (to, subject, body) through a dedicated IPC, `system:open-mail`. The main process checks the sender, validates every address,
  builds the `mailto:` link itself (everything encoded, line breaks removed from the subject, the body cut so the link stays under 2000
  characters) and refuses the draft if an address is not one. `system:open-external` stays limited to http and https.
- The button first shows the address and the subject and asks for a second click. Outside the desktop app (no bridge) the button is not drawn.
- `Sheet(columns, rows?, title?, report?)`: a table the reader fills in. Limits on columns, rows and cell length; a row cannot be wider than
  the columns; the report may use only `{{table}}` and `{{rows}}`. The reader edits cells, adds and removes rows. The cells are kept in the
  computer's storage like a form. Only the report, a Markdown table of the non-blank rows, can be sent, with one click.

## Consequences

- A letter goes from the answer to the mail app in two clicks, with no way for the model to craft a link of its own.
- Not done: attachments, cc/bcc, formulas in the cells.
