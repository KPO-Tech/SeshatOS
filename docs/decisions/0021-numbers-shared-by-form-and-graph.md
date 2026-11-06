# 0021 - Numbers shared by a Form and a graph

Status: accepted, 2026-11-06. Follows ADR 0013 (forms) and ADR 0014 (sliders and live formulas).

## Context

A Form held text, and the variables of a block (Slider, Toggle, Select) held numbers: the two did not meet. A reader could not type a
slope in a field and see the line move, and the message of a Submit could not carry the value of a slider.

## Decision

- `Field(name, label?, placeholder?, value?, kind?)`: with `kind "number"` the field is also a variable of the block, under
  its name. What the reader types (a comma may be the decimal mark) is read as a number, kept within a million either way, and moves every formula and `Live` that names it. Text that is not a number leaves the graph where it was.
- The template of a Submit may name a Slider, a Toggle or a Select as well as a field: it gets the number shown.
- A number Field follows the rules of the other variables: a valid name, not a word of the formulas (x, pi, sin...), not used twice, at
  most twelve variables in a block.
- Nothing else changes: the same reader of formulas, no code from the answer, nothing sent without the click on Submit.

## Consequences

- An exercise can ask for numbers and show their effect, and the agent receives them in one message.
- Not done: a variable set by a Form field in another block, a text variable in a formula.
