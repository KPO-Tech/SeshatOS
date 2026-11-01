# TODO

Things we decided to do later, so that nobody has to remember them. Each item says why it is not done yet and what it needs.
When one is done, move it to "Done" at the bottom with the PR number.

## Chat

### Follow the GitHub pull requests of a session in the right sidebar

Noted 2026-10-29. A "Changes" card in the right panel, next to Environment, Context and Activity: one row per PR of the session
with the state (open, draft, merged, closed), the title, the repository and number, the lines added and removed, a dot for the CI
result, and a menu (open on GitHub, copy the link, refresh, unbind). The Claude desktop app has the same card.

Why later: not part of the chat MVP; Chat and Knowledge come first.

It belongs in SeshatOS, not in SeshatCloud: it needs the user's machine (the git folder, `gh`, a local token).

What it needs:
- **Link a PR to a session.** The git branch of the session's folder (`git rev-parse`, the `origin` remote gives the owner and
  the repository), and any `github.com/.../pull/N` address that a tool result of the session printed.
- **A data source.** The `gh` command when it is installed and signed in; otherwise the GitHub API with a token kept in the OS
  keychain (Electron `safeStorage`). The calls go through the Go backend, never the renderer. Read-only scopes (pull requests,
  checks).
- **Backend.** A small domain (`internal/<domain>/`) with a route such as `GET /sessions/:id/pulls`. It polls every 30 to 60
  seconds, only while the panel is visible, with conditional requests (ETag) for the rate limit, and caches.
- **Desktop.** A section in the right panel host (the floating column already exists), the rows and the menu, an empty state.
- **Edge cases.** No git repository, GitLab or Bitbucket, GitHub Enterprise, forks, several PRs per session, offline, rate limit,
  expired token.

Size: the read-only version with `gh` (list, state, CI dot, open link) is about 2 to 4 days with tests; the token and keychain flow
adds more. The bigger second step is acting: merging from the app, or waking the agent when a check fails (auto-fix). That needs
write scopes and the permission model.

Start with: the read-only version with `gh`.

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
and [0009](decisions/0009-lighter-rich-answers-prompt.md).

- **Open a file at a line or a page.** `FileRef` opens a text file in the Files panel; the line and the page it can carry are not
  used yet, and the panel has no way to scroll to a line.
- **Interactive widgets, artifacts and projects.** Sliders with live formulas, 3D scenes, HTML prototypes and real sites run and tested by the agent in the browser: three levels (declarative with state, an Artifacts panel, projects), how to make them reliable, the order to do them in, and the sources are in [0010](decisions/0010-interactive-widgets-and-artifacts.md). To discuss, not scheduled.
- **Patch a drawing in place.** Change one box of an architecture drawing without drawing it again (it comes with the Artifacts panel of 0010).
- **More kinds of curves.** Parametric and polar curves, implicit curves (a circle), inequalities, 3D surfaces, a neural network
  drawn as layers.
- **Forms and inputs in an answer**, and an answer that updates in place.
- **A tool for the families of the prompt.** Today the architecture and chart parts of the prompt are loaded from the words of the
  request and from what the last answers drew. A tool the model calls to read a family when it decides to draw would not depend on
  words.
- **Fonts in the downloaded SVG.** The SVG is faithful on screen but the fonts are not embedded.

## Done

- 2026-10-31: follow-up cards (a `Choice` with a description and an icon) and `SourcePills` in rich answers (PR 335).
- 2026-10-29: the prompt reads the last answers of the session to keep a family a follow-up needs; `FileRef` opens a text file in the
  Files panel.
