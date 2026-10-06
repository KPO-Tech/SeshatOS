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
  <a href="https://github.com/KPO-Tech/SeshatCloud"><b>☁️ SeshatCloud (organizations)</b></a> ·
  <a href="https://github.com/KPO-Tech/seshat/discussions"><b>💬 Discussions</b></a>
</p>

---

## What SeshatOS Is

SeshatOS is the self-hosted desktop product built on top of [seshat](https://github.com/KPO-Tech/seshat), the open-source Go agent runtime. It's what you run locally to get a real chat/agent desktop app with no cloud dependency required:

- an Electron desktop app (`seshat-desktop`) — chat, tool execution, file attachments, provider/model selection
- a local Go backend (`seshat-backend`) — the HTTP API the desktop talks to, session/memory persistence, knowledge/RAG

Everything here runs on your own machine, with your own provider API keys. No account, no org, no cloud required.

## Status

SeshatOS is under active construction. The desktop is being rebuilt chat-first; the other surfaces follow in order.

| Capability | Status |
|---|---|
| Chat with tools, files, providers, MCP and skills | Active, being stabilized |
| Local backend: sessions, memory, plans, knowledge/RAG, audit, quotas | Available |
| Knowledge search from the chat | Available |
| Dedicated Knowledge, Scheduling, Skills and Admin screens | Planned, in order after Chat |
| Automation, Inbox, Companion, Team | Roadmap (after the MVP) |

## SeshatOS and SeshatCloud: two halves of one offer

| | SeshatOS (this repository) | [SeshatCloud](https://github.com/KPO-Tech/SeshatCloud) |
|---|---|---|
| Scope | One person or a small team, on their own machine | An organization, administered centrally |
| Runs | Locally, no account, no cloud required | Server + admin console, self-hosted via Docker Compose |
| Identity | Local | Organizations, roles, SCIM, audit |
| Automation | Scheduled tasks on your machine | Jobs that run independently of anyone's laptop |
| Knowledge | Local knowledge/RAG | Org-scoped knowledge at scale, document-intelligence service |

SeshatOS works on its own. SeshatCloud completes it when an organization needs shared administration and centrally governed automation. The connection is optional and one-directional (see below).

## Relationship to the Seshat engine and the commercial offering

- **[seshat](https://github.com/KPO-Tech/seshat)** is the underlying agent runtime (tools, providers, permissions, multi-agent) — a separate repository, plain Apache-2.0, that SeshatOS consumes as a Go module.
- **SeshatOS** (this repository) is the local, single-user/small-team product built on that runtime.
- **[SeshatCloud](https://github.com/KPO-Tech/SeshatCloud)** is the multi-tenant layer (organizations, team workspaces, admin controls, scheduled automation), a separate source-available codebase. `seshat-backend` can optionally connect to it ("connected mode") for identity/settings delegation, entirely over HTTP — none of its source is part of, or required by, this repository.
- The commercial activity around Seshat (AI consulting and integration) is presented at [seshat-ai.com](https://seshat-ai.com).

## License

Apache License 2.0, with the [Commons Clause](https://commonsclause.com/) condition: free to use, self-host, modify, and redistribute for any purpose — including internal use by organizations of any size — except selling it (offering it as a paid product or service to third parties). See [LICENSE](./LICENSE).

This makes SeshatOS **source-available**, not open source in the OSI sense. The underlying [seshat](https://github.com/KPO-Tech/seshat) runtime is plain Apache-2.0. The license text is still a draft pending legal review.

## Getting started

```bash
git clone <this-repo>
cd seshatos
cp .env.example .env   # fill in at least one provider API key
make setup              # first-time setup: Node deps + build
make dev                 # start the local backend + desktop app
```

See [`docs/development.md`](./docs/development.md) for the full setup reference, and [`docs/architecture.md`](./docs/architecture.md) for how the pieces fit together.

## Vision

See [GOAL.md](./GOAL.md) for where the project is going, what's in scope, and what deliberately isn't.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) (the latter is also what AI coding agents working in this repo should read first).

## Contact

For licensing questions (reselling or offering SeshatOS as a hosted service - see the Commons Clause condition in [LICENSE](./LICENSE)), reach out at seshatsupport@seshat-ai.com.
