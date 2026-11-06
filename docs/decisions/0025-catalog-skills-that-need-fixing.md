# 0025 - Catalog skills that need a copy, a correction and a Python

Status: accepted, 2026-11-06. Follows ADR 0024 (the html-page skill is the first skill of the seshat-skills collection).

## Context

The catalog installs a public skill repository from its source and keeps it updated. Three things stopped a good public skill, ui-ux-pro-max,
from working in Seshat:

- Its only `SKILL.md` lives in `.claude/skills/`. The installer and the loader skip hidden folders on purpose (they hold copies for other tools),
  so an entry would have installed no skill.
- Its text names a Claude plugin folder (`${CLAUDE_PLUGIN_ROOT}/.claude/skills/...`) for its scripts, and tells the agent to try `python`,
  `python3`, `py -3`. In Seshat the skill folder is `${SESHAT_SKILL_DIR}` and the agent is given the Python of the skill.
- Its scripts need Python but no package, so no environment was made, and a machine without Python got no warning and a skill that failed.

## Decision

- A catalog entry may carry `Expose` (copy a skill from a hidden folder to a visible one at the top of the repository) and `Fixes`
  (replace a text in the copy). Both are applied by `skillinstall.Prepare` after the download and again after every update from the source
  at start-up. The repository itself is never changed, so a `git pull` never meets a local change.
- Fixes replace text, not a diff: they still apply after the skill changes elsewhere, and when the text they look for is gone the person is told
  in the log that a correction did not apply, with its reason; the skill stays installed as written. A copy is only redone when the skill or the
  corrections changed. A folder that belongs to the repository is never replaced (a marker file says which folders are copies).
- `PythonRequired` gives a skill a Python environment even with no package. The environment records the interpreter, and the runtime already
  tells the agent to run the scripts of the skill with it.
- When the machine has no Python that is new enough, uv downloads one (3.12, or the minimum when higher) into Seshat's own folder
  (`tools/python`), and the plan says so before the person agrees. Without uv and without Python the plan warns, as before.
- An opt-in test (`SESHAT_TEST_SKILL_CHECKOUTS`) runs the corrections on real checkouts, to learn that a skill changed upstream.

## Consequences

- ui-ux-pro-max can be offered (entry `ui-ux-pro-max-skill`, category Design) and works from the folder Seshat controls, with its own Python.
- Other public skills with the same problems (a hidden folder, a plugin path) need an entry, not a change of the installer.
- The runtime is unchanged: it already reads the visible copy, filters by the chosen skills and gives the agent the Python of the repository.
- The first install on a machine with no Python downloads about 30 MB through uv, with the person's agreement.
