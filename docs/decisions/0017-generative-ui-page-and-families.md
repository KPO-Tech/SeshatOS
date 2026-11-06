# 0017 - The Generative UI page and the choice of families

Status: accepted, 2026-11-06. Follows ADR 0013 to 0016.

## Context

The Generative UI was one switch in the menu at the foot of the side bar. It had grown into four families of components (graphs and
maths, forms and quizzes, design, architecture), a gallery of examples and a prompt that weighs more with each family. A person had no way
to see what the agent can draw, to try it, or to decide which families it may use.

## Decision

- **A page, opened from the menu** (`/generative-ui`, in place of the switch), with two tabs.
  - **Overview:** the general switch (the same preference as Settings > Answers, `rich_answers_enabled`), the choice of families, and eight
    requests to try, each of which opens a new chat with its text in the input, not sent.
  - **Gallery:** every example of the catalogue (the ones the agent is taught from) drawn as in the chat, with filters by family, the source
    and a line that shows what a click on a form, a quiz or a button would send. Nothing leaves the page. `npm run gallery` shows the same
    component for the people who write components, with the parser errors.
- **Each family has three modes**, stored per person in `user_preferences.rich_families` (a JSON text, empty when all are automatic):
  - **automatic** (the default): taught when the request calls for it, or when the conversation already drew it;
  - **always** (`on`): taught to every request, whatever it says, at the cost of its words in every prompt;
  - **never** (`off`): never taught, whatever the request or the history.
  What the person forced wins over the request and the history. The Knowledge agent still teaches no forms and no design.
- **The cost is shown.** The API gives, with the preferences, what each family adds to the prompt in words (`rich_family_words`, computed from
  the same blocks the prompt is made of), and the page writes it next to the choice, so that "always" is a choice made knowing its price.
- **The API:** `rich_families` in the preferences, family -> `on` or `off` (an absent family is automatic). A client that does not send the
  field leaves the stored choice alone; an empty object makes every family automatic. An unknown family or mode is a 400.
- **Not done here:** the choice of families per conversation or per project, a family for the Knowledge agent, a way to add a family from
  a plugin, a preview of the prompt a choice would give.

## Consequences

- "Always" for a family weighs its words in every prompt; the page says so. "Never" is the way to cut the prompt of a person who only wants
  tables and text.
- A new family needs its entry in `RichFamilyNames`, in the page and in the translations, and its words come with it.
