# 0023 - Every family taught by default, and the Hub

Status: accepted, 2026-11-06. Follows ADR 0017 (families) and ADR 0022 (choosing the medium).

## Context

Tests of the app with GLM-4.5 showed that a family chosen by the words of the request fails when the words are not the expected ones: "an
decision tree" loaded no diagrams family, so the agent, not knowing the Tree, wrote an HTML page. The five forces of Porter went to an
Architecture because no component says "a centre pressed on by forces". The whole catalogue costs about 8,000 tokens, small next to
the rest of the prompt.

## Decision

- Every family is taught on every request, unless the person set it to "never" in the Generative UI window. "Automatic" and "Always" now
  mean the same; the words of a request (`richUIFamiliesFor`) stay in the code for a lighter mode.
- New `Hub(core, spokes, title?, arrows?)` with `Spoke(label, text?, color?)`: a centre and two to eight satellites joined by arrows (`in`
  towards the centre, the default, `out` or `none`). Four satellites make a cross, as in the five forces of Porter; more are spread on an
  ellipse. The prompt names it for Porter, stakeholders and mind maps, and says an Architecture is wrong for them.
- The arrows of an Architecture with `style block` are thinner (a line of 3, a head of 13): the big arrows were heavy next to the boxes.
- Descriptions say what the model got wrong: a Quad colour is a hex code or a name, not a tone; a formula gives a number, not text.

## Consequences

- The Knowledge agent now also gets the architecture and chart families on every request (about 6,000 tokens more).
- The diagrams family budget goes from 600 to 700 words.

## Update, 2026-11-07: the words of a request were removed

The code that chose the families from the words of the request (`richUIFamiliesFor`, its word lists, the reading of the latest answers) was kept "for a lighter
mode" and never called in production, only by its own tests. It was removed (about 280 lines with its tests). A lighter mode, if it comes back, will start from
what the model sees (the size of the prompt, the model) and not from words of the request, which missed the requests that named nothing; the old code is in the
history of the repository (ADR 0009 describes it).
