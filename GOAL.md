# SeshatOS — Vision & Goals

This document describes what SeshatOS is building, where the project is going, and how contributions fit into that direction. It is the reference for anyone who wants to understand why this exists, what it will and won't become, and where to get involved.

---

## What We Are Building

**SeshatOS is a self-hosted agentic workspace** — the local desktop app and backend you run on your own machine to get a real AI agent that reads files, writes code, searches the web, and works with your documents, with no account and no cloud dependency required.

It is built on top of **[seshat](https://github.com/KPO-Tech/seshat)** (Apache-2.0) — the open-source Go agent runtime: multi-turn execution, tools, providers, permissions, sandboxing, MCP, RAG, sub-agents, streaming. `seshat` ships a CLI developers can use directly; SeshatOS is the desktop product built as one of its consumers.

The dependency is strictly one-way: SeshatOS builds on `seshat`. `seshat` has no knowledge of SeshatOS, and never will — see [docs/architecture.md](docs/architecture.md).

### Where SeshatOS stops

Seshat also offers a commercial, multi-tenant cloud platform — organizations, team workspaces, admin controls, org-wide scheduled automation — built as a separate product on the same `seshat` engine. That product's source is not part of this repository and is not required to run SeshatOS. `seshat-backend` can optionally run in a "connected mode" against it, purely over HTTP, for identity/settings delegation and shared catalogs — but a standalone SeshatOS install never needs it, and never gains multi-tenant organization/admin/scheduling surfaces on its own. If you need a team of people administered centrally, with scheduled automation running independently of anyone's laptop, that's the cloud product's job, not this one's. See the [README](README.md#relationship-to-the-seshat-engine-and-the-commercial-offering) for the exact boundary.

---

## Development Levels

The project is organized into levels of ambition. Each level builds on the one before it. We do not start a level before the one below it is stable.

### 🟢 Level 2 — Robust Solo-Agent Desktop (NOW)

A capable, safe, self-hosted agent platform that one person or a small team can run today, on their own machine, with zero required infrastructure.

**What exists:**
- Multi-turn agent loop with tool use, recovery, context compaction, and permission modes, via the `seshat` runtime
- Multiple AI providers switchable per session
- Sandboxed bash, filesystem, web, browser, RAG, MCP, sub-agents, skills
- Local backend: auth, sessions, memories, preferences, plans, skills, knowledge/RAG, usage quotas, audit — scoped to the person(s) running this install, not a multi-tenant organization
- Desktop app (`seshat-desktop`): chat, tool views, attachments, provider/model selection, settings — being rebuilt chat-first on React/Tailwind, replacing the previous UI

**What we are finishing:**
- The chat-first desktop rebuild, stabilized end to end before any other surface gets feature work (see [CONTRIBUTING.md](CONTRIBUTING.md) for the current activation order)
- An **embedded execution profile**: no PostgreSQL, no OpenSearch, no external vector database required to run SeshatOS. SQLite + a local vector index + the filesystem are the default; Docling runs as an on-demand local subprocess, not a permanent service. Heavier backends (Postgres, OpenSearch, S3, a distributed scheduler) stay available for anyone who wants to graduate past a single machine — through the commercial cloud product — but they are never a prerequisite for running SeshatOS itself.
- Knowledge retrieval quality (hybrid search, reranking, source provenance, citation fidelity) rather than more vector-store integrations — we think the current breadth of the runtime is already wide enough that the priority now is making the paths people actually use every day reliable, not adding more surface area.

**Gate to Level 3:** Level 2 is stable with real users. No open critical issues.

---

### 🔵 Level 3 — Agent Team Runtime (NEXT)

Multiple SeshatOS agents collaborating on a shared mission, on your own machine — not a fixed pipeline, a real team where each agent has a role, a private memory, and shared tools to coordinate.

```
Mission: "Build and ship the authentication feature"

Alex (CEO)    → reads mission → posts tasks on the board
Jordan (CTO)  → claims architecture → mails design to Sam
Sam (Dev)     → claims implementation → codes → spawns test workers
Taylor (QA)   → reviews → sends bugs back to Sam
Robin (DevOps)→ claims deploy → ships → marks mission complete
```

Each agent is a complete Level 2 agent. Coordination happens through shared tools — `send_mail`, `read_mail`, `post_task`, `claim_task`, `complete_task` — not a central orchestrator; each agent decides its own actions from its inbox, the task board, and its role's skills.

**What this unlocks:**
- Entire projects executed by agent teams with human supervision
- Roles defined by skills — each agent works in its own domain
- Shared memory (team decisions) plus private memory per agent
- Mandatory budget enforcement: token limits per agent, global timeout per mission

Early experimentation and RFCs on Level 3 are welcome from the community. No Level 3 code merges into the main platform before Level 2 is stable.

---

### 🟣 Level 4 — Multimodal & Extended Workspaces (FUTURE)

SeshatOS expands beyond text and code into other modalities and domains of work.

- **Image generation** — agents that generate, edit, and compose images inline, with pluggable backends (Stable Diffusion, FLUX, cloud APIs).
- **Audio** — text-to-speech, speech-to-text, transcription, voice narration.
- **3D generation** — asset generation from text or image prompts for design and prototyping.
- **Brainstorming & prototyping** — a workspace mode for structuring ideas and iterating on designs before committing to implementation.
- **The multi-workspace desktop** — at full maturity, the SeshatOS desktop is not a single application but an environment containing multiple specialized workspaces (code, research, creation, team missions), each powered by agents, sharing the same local runtime and data.

---

## How We Think About the Pieces

As the runtime and the product around it have grown, we've found it worth being precise about naming, so the project doesn't accumulate five different things all loosely called "agent":

- **Runtime** — the execution infrastructure (`seshat`): sessions, the agent loop, providers, tool execution, permissions, sandboxing. It doesn't decide anything on its own; it provides the primitives.
- **Agent** — an entity with a goal and the ability to choose its own next action among several real options: a decision loop, not a fixed script.
- **Tool** — a single callable capability (`read_file`, `web_search`, `knowledge_search`). Input in, action, result out — no strategic choice involved.
- **Skill** — a reusable, composed capability made of instructions plus optionally several tools, without needing its own persistent identity (a Markdown file an agent "learns" for a task).
- **Workflow** — an explicit, predetermined sequence of steps, even if one step calls an LLM. If the path is known in advance, it's a workflow, not an agent.
- **Service** — a standing infrastructural capability used by agents (Knowledge, Memory, Document intelligence) that is not itself an agent.

A new component only earns the name "agent" if it has a goal, a decision loop, tool/action selection, its own execution context, and a termination condition. Otherwise it's one of the others. This keeps both the runtime and this repository's architecture legible as they grow.

---

## Community & Extensibility

SeshatOS cannot build everything. The project is designed so the community can extend it without forking it:

- **Skills** are the primary extension mechanism — a Markdown file that teaches the agent how to work in a specific context. Anyone can write and publish skills; community skill repositories are installable from any URL.
- **MCP servers** extend what agents can do. The MCP ecosystem already has thousands of servers (GitHub, Postgres, Slack, Docker, Notion, and more); SeshatOS is a first-class MCP client, so any compliant MCP server works without special integration work.
- **Custom agents** — define specialized agents with their own instructions, tools, permission modes, and models.
- **The SDK** — [seshat](https://github.com/KPO-Tech/seshat) ships a Go SDK and a stable HTTP + SSE API. SeshatOS's own backend is itself a consumer of that SDK, nothing more privileged. Anyone can build their own product on the same foundation.

We actively want the community to push SeshatOS in directions we haven't anticipated. Skills, MCP, pluggable providers, and the SDK all exist to make that possible without needing our permission.

---

## What SeshatOS Is Not

Deliberate scope boundaries, not limitations:

- **Not a multi-tenant organization platform.** Organizations, centrally administered teams, and automation that runs independently of any one person's machine are the commercial cloud product's job — see "Where SeshatOS stops" above.
- **Not a no-code workflow builder.** SeshatOS agents reason; they don't just follow fixed rules (though workflows exist as a building block — see "How We Think About the Pieces").
- **Not a single-provider tool.** Multi-provider support with no lock-in is a core architectural commitment of the underlying runtime.
- **Not a Python/TypeScript backend framework.** The backend is a Go program consuming `seshat` via its SDK; the desktop is its UI client.
- **Not a fully-managed SaaS.** SeshatOS is self-hosted first — you run it, you hold the data and the provider keys.
- **Not a chatbot.** The agent executes things: reads files, writes code, runs commands, searches the web and your own documents.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) (the latter is also what AI coding agents working in this repo should read first).

The most valuable contributions right now:
- Bug reports and fixes on the Level 2 desktop/backend
- Skills — for any domain, any framework, any workflow
- MCP server integrations and documentation
- Docs and onboarding clarity
- RFCs and early experiments on Level 3 (team runtime) — discussion first, no Level 3 code merges yet

PRs target `dev`, never directly `main`.
