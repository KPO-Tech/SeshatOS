# seshat-desktop

Clean SeshatOS desktop frontend workspace.

This is a fresh Electron + React + TypeScript + Tailwind CSS client. It intentionally starts small instead of copying the whole old `seshat-ui` surface.

What we reuse progressively:

- backend contracts and HTTP/SSE API behavior from `seshat-backend` and, in connected mode, `seshat-server` ([SeshatCloud](https://github.com/KPO-Tech/SeshatCloud));
- Electron main/preload ideas that are still valid;
- renderer API clients and types when a screen actually needs them;
- proven Chat behavior, rebuilt around the new desktop UX.

What we avoid:

- duplicating Go backend logic in the frontend;
- importing the entire old UI before the new structure exists;
- carrying old CSS surfaces unless they are being actively migrated to Tailwind.

The MVP order lives in `D:\Documents\PROJECTS\ai\Discussions\mvp`.

Visual identity decisions live in [`docs/visual-identity.md`](docs/visual-identity.md).

Frontend strategy lives in [`../docs/frontend-strategy.md`](../docs/frontend-strategy.md): keep this desktop on Electron + React for now, and consider Svelte first for new standalone product surfaces such as Knowledge or Inbox.
