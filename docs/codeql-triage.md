# CodeQL: how its alerts were read

CodeQL (default setup, Go, TypeScript and the workflows) was switched on on 2026-11-07 and opened 48 alerts. They were read one by one the
same day. This page says what was found, so that nobody has to read them again, and how to tell a new alert from one that is already known.

## Fixed

- **`go/command-injection`, `gitstate.go`.** The folder was never an option (it is the value of `git -C`), but `git status` is run for a folder as
  soon as it is chosen, and git runs the program a repository names in `core.fsmonitor`. It is switched off, and the test proves a plain
  `git status` does run it on this machine while `Inspect` does not. The clean and smudge filters a repository names are still run by git for
  files it compares: closing that takes a trust prompt for a folder, like the workspace trust of a code editor (not done).
- **`js/incomplete-sanitization`, `sheet.ts`.** A cell that held `a\|b` became `a\|b`, which ends the cell at the bar. Backslashes are escaped first.
- **`js/incomplete-multi-character-sanitization`, `readmeDescription.ts`.** Removing a comment once could leave `<!--` behind. The removal now
  repeats until nothing is left. Nothing changed for the reader (a later step already dropped the tag): this is hardening.
- **`go/reflected-xss`, `routes.go`.** The line is a pass-through writer. The page it can carry is the preview of a page the agent wrote, which is
  meant to be HTML. It has a content security policy with no network (`connect-src 'none'`), and now also `sandbox allow-scripts`, so that the page
  opened outside the frame of the app has no origin either.

## Not defects, kept as they are

- **`go/path-injection` (37 alerts).** CodeQL does not know the cleaning that comes first: `filepath.Base` on the name in the skill and repository
  dispatchers, a repository name that must be a folder of its own, an identifier taken from a fixed list (the native document packs), identifiers
  made by the app (the task files), and `EvalSymlinks` followed by a check that the path stays in the folder (the artifacts of a session).
  `skills_traversal_test.go` keeps the first two true: without `filepath.Base`, `DELETE /api/v1/skills/..%5Coutside` answers 204 and removes a
  folder outside the skills on Windows, and the test fails.
- **`go/request-forgery` (3 alerts: Ollama and TEI detection, the check of a provider key).** The address is the one the signed-in person typed for
  their own local model or provider. A local app that runs a model on the same computer cannot refuse the loopback address.
- **`go/weak-sensitive-data-hashing`, `api_keys.go`.** SHA-256 of an API key made of 32 random bytes. A slow hash protects a password a person
  chose, which can be guessed; it adds nothing to 256 bits that cannot.
- **`js/incorrect-suffix-check` (2 alerts, `splitModelChoiceId`).** `separator <= 0` returns first, so a missing `::` (index -1) never reaches the
  comparison with `id.length - 2`.

## A new alert

A new alert of `go/path-injection` on a name or a path that comes from a request deserves the same reading: where is the name cleaned, and is there a
test that a name that climbs out of the folder changes nothing? If not, add the cleaning and the test, then close the alert.
