# 0013 - Forms and inputs in answers

Status: accepted, 2026-11-05. First slice built on `feat/chat-forms`. Completes ADR 0008 (interactions), which left forms undecided, and is level 1 of ADR 0010 in its simplest form.

## Context

ChatGPT shows exercises inside an answer: a plan with a segmented bar, a text area with a word counter and a button that sends what was
typed, a score card, an email draft to edit and copy. We want the same in the chat, but the agent must never write HTML or JavaScript:
the answer of a model is untrusted input, and a page that runs it would be a way in for whatever the model was told by a document or
a web page.

## Decision

The agent keeps writing `seshat-ui` blocks. Forms are new components of the catalogue, checked by the same parser; there is no
other way to draw an input.

### Components

`Form(children, submit, title?)`, `TextArea(name, placeholder?, rows?, value?)`, `Field(name, label?, placeholder?, value?)`,
`Counter(of, unit?, min?, max?)`, `Submit(label, template, requires?)`, `Draft(body, subject?, to?, title?)`,
`ProgressBar(value, max?, label?, tone?)`, `SegmentBar(segments, unit?, title?)`, `Segment(label, value, tone?)`.
Group `Forms` of the catalogue, taught to the model only when the request is an exercise, a quiz, a text to correct or a draft
(family `forms` in `richui_families.go`), never to the Knowledge agent.

### Security rules

1. **Nothing but catalogue components.** No HTML, no script, no style, no URL fetched by a block.
2. **What is typed stays in the block** until the person clicks. It lives in React state and, for convenience, in `localStorage`
   (key `seshat.form.<hash of the block>`, values cut at 8000 characters); it is never sent anywhere else.
3. **One real effect: the Submit click.** It builds a message by replacing `{{name}}` in the template, once, with the text of the
   field (no evaluation, no nesting: a value holding `{{x}}` stays as text) and sends it through the existing `ask` bridge as an
   ordinary user message. The person sees it in the conversation and the button's tooltip shows what will be sent.
4. **Never sent on its own.** No timer, no event of the model, no auto-submit. After sending, the form is locked.
5. **No hidden action.** A form cannot run a tool, write a file or call a connector; the next turn goes through the normal
   permissions like any message typed by hand.
6. **Limits, checked at parse time and again in the view:** 12 fields, names `[A-Za-z][A-Za-z0-9_]*` and unique, template 4000
   characters, initial value 4000, typed text 8000, final message 12000 (`FORM_LIMITS` in `lang/forms.ts`). A template naming a missing
   field, a Counter counting one, a `requires` naming one, a nested Form, or a field outside a Form is an error and the block falls
   back to its text.
7. **No secrets.** The prompt tells the model never to ask for a password or a key in a form.
8. **Draft is local.** To, subject and body are editable and copied with a button; nothing is sent. Opening a mail application
   (`mailto:`, only after a click and a confirmation showing the address) or a connector send are later and need their own decision.

### Streaming

The checks run once the block is complete. While it streams, the form is drawn from what is there and its Submit stays disabled.

## Consequences

- The agent can run exercises, quizzes and corrections as a loop of block, message, block, with no new channel.
- The prompt grows by about 650 words, only for requests that ask for it; the ceiling of the full block moved from 2400 to 3100
  words (`richui_test.go`), the core stays under 1200.
- Not done here: Select, Checkbox, Slider; variables and state shared between components (ADR 0010 level 1); patching a block in
  place instead of writing a new one; `mailto:` for Draft.
