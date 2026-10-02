<p align="center">
  <img src="docs/images/seshat.png" alt="SeshatOS" width="120">
</p>

<h1 align="center">SeshatOS</h1>

<p align="center">
  <b>SeshatOS is a self-hosted AI desktop app and local backend, built on the Seshat agent runtime.</b><br>
  <i>Local-first &nbsp;·&nbsp; Electron desktop + Go backend &nbsp;·&nbsp; document intelligence &nbsp;·&nbsp; Apache-2.0 + Commons Clause</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-orange?style=for-the-badge">
  <img src="https://img.shields.io/badge/Go-1.26%2B-00ADD8?style=for-the-badge&logo=go">
  <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black">
  <img src="https://img.shields.io/badge/Electron-37-47848F?style=for-the-badge&logo=electron">
  <img src="https://img.shields.io/badge/License-Apache--2.0%20%2B%20Commons%20Clause-blue?style=for-the-badge">
</p>

<p align="center">
  <a href="https://github.com/KPO-Tech/seshat"><b>⚙️ seshat (engine)</b></a> ·
  <a href="https://github.com/KPO-Tech/seshat/discussions"><b>💬 Discussions</b></a>
</p>

---

## What SeshatOS Is

SeshatOS is the self-hosted desktop product built on top of [seshat](https://github.com/KPO-Tech/seshat), the open-source Go agent runtime. It's what you run locally to get a real chat/agent desktop app with no cloud dependency required:

- an Electron desktop app (`seshat-desktop`) — chat, tool execution, file attachments, provider/model selection
- a local Go backend (`seshat-backend`) — the HTTP API the desktop talks to, session/memory persistence, knowledge/RAG
- a local document-intelligence service (`seshat-intelligence`) — OCR, layout analysis, document conversion

Everything here runs on your own machine, with your own provider API keys. No account, no org, no cloud required.

## Relationship to the Seshat engine and the commercial offering

- **[seshat](https://github.com/KPO-Tech/seshat)** is the underlying agent runtime (tools, providers, permissions, multi-agent) — a separate repository, plain Apache-2.0, that SeshatOS consumes as a Go module.
- **SeshatOS** (this repository) is the local, single-user/small-team product built on that runtime.
- Seshat also offers a commercial cloud/multi-tenant product (organizations, team workspaces, admin controls, scheduled automation) that is a separate, not-yet-public codebase. `seshat-backend` can optionally connect to it ("connected mode") for identity/settings delegation, entirely over HTTP — none of that product's source is part of, or required by, this repository.

## License

Apache License 2.0, with the [Commons Clause](https://commonsclause.com/) condition: free to use, self-host, modify, and redistribute for any purpose — including internal use by organizations of any size — except selling it (offering it as a paid product or service to third parties). See [LICENSE](./LICENSE).

## Getting started

```bash
git clone <this-repo>
cd seshatos
cp .env.example .env   # fill in at least one provider API key
make setup              # first-time setup: Node deps + docling + build
make dev                 # start the local backend + desktop app
```

See [`docs/development.md`](./docs/development.md) for the full setup reference, and [`docs/architecture.md`](./docs/architecture.md) for how the pieces fit together.

## Vision

See [GOAL.md](./GOAL.md) for where the project is going, what's in scope, and what deliberately isn't.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) (the latter is also what AI coding agents working in this repo should read first).

## Contact

For licensing questions (reselling or offering SeshatOS as a hosted service - see the Commons Clause condition in [LICENSE](./LICENSE)), reach out at seshatsupport@seshat-ai.com.
