# 0015 - Quizzes, flashcards, switches and choices in answers

Status: accepted, 2026-11-05. Follows ADR 0013 (forms) and ADR 0014 (sliders).

## Context

With forms and sliders, an answer can already hold an exercise or an explorable graph. Two things were missing: the reader could not
choose between things to draw (a switch, a list), and a study session (questions with feedback, cards to flip) had to be built from a
Form, which sends a message for every answer.

## Decision

- **`Toggle(name, label?, value?)` and `Select(name, options, value?, label?)`** are variables like a Slider (ADR 0014): a switch is 1
  or 0, a list is the number of the choice, from 0. They share the limits and the names rules of sliders (12 variables in a block, 12
  options, names not taken by formulas). A `Curve` has a new last argument `show`: a variable or a formula, drawn while it is not 0.
  `eq(a, b)` is a new function of the formula reader, 1 when equal and 0 otherwise, so that `show: "eq(fn, 2)"` follows a list.
- **`Quiz(questions, title?, report?)` with `Question(text, options, answer, explanation?)`** asks multiple-choice questions inside the
  answer. A choice is judged at once, in the block, with the explanation, and the score is shown at the end. **`Flashcards(cards, title?,
  report?)` with `Flash(front, back)`** shows one card at a time: flip, then "to review" or "I knew it".
- **Nothing leaves the block, except one thing the reader chooses.** `report` is an optional template for a message sent at the end,
  through the same `ask` bridge as forms: `{{score}}`, `{{total}}`, `{{missed}}` for a quiz, `{{known}}`, `{{total}}`, `{{again}}` for
  flashcards, one pass of replacement, no evaluation, 4000 characters at most, visible in the chat and never sent without a click; the
  button shows what it will send.
- **It is a study tool, not an exam.** The right answers are in the text of the block, so the reader (or anyone with the page) can see
  them. The prompt says so, and the model does not use a Quiz for anything that must be secret.
- **Limits, checked at parse time:** 20 questions, 40 cards, 2 to 6 choices, `answer` an integer that is a choice, 600 characters per
  text, 1000 characters of report, a report that uses only its own names, a Question only inside a Quiz and a Flash only inside
  Flashcards. Progress is kept in the component, not saved.

## Consequences

- A revision session costs one message at most, instead of one per answer, and the agent can adapt the next round to the report.
- The `Forms` prompt family grows (Quiz, Flashcards) and the charts family a line for switches; the full block ceiling is 3650 words.
- Not done here: several right answers, free-text answers judged by the agent (a Form already does it), saved progress, spaced
  repetition, Checkbox and Radio inside a Form, `mailto:` for a Draft.
