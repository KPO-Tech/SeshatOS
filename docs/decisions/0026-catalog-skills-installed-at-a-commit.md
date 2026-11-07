# 0026 - Catalog skills are installed at a commit

Status: accepted, 2026-11-07. Follows ADR 0025 (catalog skills that need fixing) and the audit of the same day.

## Context

A skill repository is not only text for a person: its instructions are followed by the agent, and its scripts are run with the person's
permissions. The catalog installed each repository from its default branch and the app updated it in the background about once an hour. So
whoever controls a repository of the catalog, or takes it over, changes what the agent does on every installed machine within the hour,
without a release of SeshatOS and without anyone reading the change. Each entry was read before it was listed; nothing kept the installed
copy at the state that was read.

## Decision

- Every entry of the catalog has a `Ref`: a whole commit (40 hexadecimal digits). A tag would not do: its owner can move it. A test fails
  for an entry without one.
- The install downloads that commit and nothing else (`git init`, `fetch --depth=1 <commit>`, `checkout`); without git on the computer, the
  zip of that commit. A ref is checked before git is run: it never starts with a dash, which git would read as an option.
- The app no longer updates the repositories of the catalog from their source. At start-up it puts an installed one on the commit the
  running version names (`skillinstall.Pin`), only when it is not there already. Moving a `Ref` is a change of the catalog, made with the
  difference in front of you, and it reaches people with a release of the app.
- A repository added by its address (not from the catalog) still follows its default branch: the person chose it.

## Consequences

- A change in a catalog repository reaches the people only when SeshatOS says so. A fix of a skill is slower to arrive: a release of the app.
- The commits written in the catalog on 2026-11-07 are those of that day, taken as they were. The entries had been read at the dates in
  `skills_catalog.go` (late October to early November), and some repositories moved since; they were not read again line by line. Reading
  them again at these commits is the next step to make the pin mean "reviewed".
- A repository downloaded as an archive (no git) cannot be moved to another commit afterwards: it stays as it is until it is installed again.
- What a person changed by hand in the files of a catalog repository is not kept when the repository moves to another commit.
