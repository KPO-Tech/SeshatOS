# SeshatOS Runtime Directory Layout

**Default root:** `~/.config/seshat` (override via `SESHAT_RUNTIME_ROOT` env var)

All persistent state — database, sessions, artifacts, skills, plans, logs — lives
under a single directory called the *runtime root*. Deleting or relocating the root
moves everything at once.

---

## Top-level structure

```
~/.config/seshat/                   ← runtime root (SESHAT_RUNTIME_ROOT)
│
├── seshat.db                       ← main SQLite database (users, providers,
│                                    sessions metadata, knowledge, plans, …)
│
├── secret.key                     ← server encryption key (auto-generated, keep private)
├── auth.json                      ← persisted auth/provider credentials (CLI mode)
│
├── workspaces/                    ← one directory per session (files attached, files written, plans, …)
│   └── {session-id}/
│       ├── uploads/               ← files the user attached (seshat-backend)
│       ├── artifacts/
│       │   ├── images/            ← AI-generated images (DALL-E, SD, …)
│       │   ├── audio/             ← TTS output / STT input files
│       │   ├── screenshots/       ← browser screenshots
│       │   └── web/               ← web-fetched/scraped content
│       ├── pastes/
│       │   ├── text/              ← pasted text attachments
│       │   ├── images/            ← pasted image attachments
│       │   └── other/             ← pasted binary attachments
│       ├── plans/                 ← plan-mode markdown files
│       ├── tools/                 ← browser downloads, tool-produced outputs
│       └── session.log            ← per-session diagnostic log
│
├── data/
│   ├── permissions/{session-id}.json ← tool permissions granted to a session (outside its directory on purpose)
│   ├── hnsw/                      ← HNSW vector index files (local embedding store)
│   ├── sessions/                  ← SDK filesystem session store (embedded mode only)
│   └── desktop-bridge-secret      ← HMAC key for Electron ↔ backend handshake
│
├── plans/                         ← global plan files (cross-session)
├── skills/                        ← user-installed skills (downloaded / custom)
│
├── cache/                         ← ephemeral cache (safe to delete)
├── tmp/
│   ├── tasks/                     ← background task state files
│   ├── bash-tasks/                ← bash tool async task state
│   └── electron/                  ← Electron temp files
│
├── logs/
│   └── app.log                    ← main backend / CLI log
│
├── storage/                       ← S3-compatible object storage (optional)
│
└── electron/                      ← Electron app OS paths (desktop only)
    ├── user-data/                 ← Chromium profile, localStorage, IndexedDB
    ├── session-data/              ← Chromium session partition data
    ├── logs/                      ← Electron main-process logs
    └── crash-dumps/               ← crash report files
```

---

## Path resolution (Go)

All canonical paths are resolved through `pkg/runtimepath`:

| Function | Path |
|---|---|
| `ResolveRoot(explicit)` | explicit → `SESHAT_RUNTIME_ROOT` → `~/.config/seshat` |
| `BackendDBPath(root)` | `{root}/seshat.db` |
| `SessionsDir(root)` | `{root}/workspaces/` |
| `SessionDir(root, id)` | `{root}/workspaces/{id}/` |
| `SessionArtifactsDir(root, id)` | `{root}/workspaces/{id}/artifacts/` |
| `SessionArtifactsImagesDir(root, id)` | `{root}/workspaces/{id}/artifacts/images/` |
| `SessionArtifactsAudioDir(root, id)` | `{root}/workspaces/{id}/artifacts/audio/` |
| `SessionArtifactsWebDir(root, id)` | `{root}/workspaces/{id}/artifacts/web/` |
| `SessionScreenshotsDir(root, id)` | `{root}/workspaces/{id}/artifacts/screenshots/` |
| `SessionPastesDir(root, id)` | `{root}/workspaces/{id}/pastes/` |
| `SessionPastesTextDir(root, id)` | `{root}/workspaces/{id}/pastes/text/` |
| `SessionPastesImagesDir(root, id)` | `{root}/workspaces/{id}/pastes/images/` |
| `SessionPastesOtherDir(root, id)` | `{root}/workspaces/{id}/pastes/other/` |
| `SessionPlansDir(root, id)` | `{root}/workspaces/{id}/plans/` |
| `SessionToolsDir(root, id)` | `{root}/workspaces/{id}/tools/` |
| `SessionLogPath(root, id)` | `{root}/workspaces/{id}/session.log` |
| `PlansDir(root)` | `{root}/plans/` |
| `SkillsDir(root)` | `{root}/skills/` |
| `LogsDir(root)` | `{root}/logs/` |
| `HNSWDataDir(root)` | `{root}/data/hnsw/` |
| `SessionStoreDir(root)` | `{root}/data/sessions/` *(SDK embedded mode)* |
| `TmpDir(root)` | `{root}/tmp/` |
| `TasksDir(root)` | `{root}/tmp/tasks/` |
| `BashTasksDir(root)` | `{root}/tmp/bash-tasks/` |
| `ElectronUserDataDir(root)` | `{root}/electron/user-data/` |
| `ElectronSessionDataDir(root)` | `{root}/electron/session-data/` |
| `ElectronLogsDir(root)` | `{root}/electron/logs/` |
| `ElectronCrashDumpsDir(root)` | `{root}/electron/crash-dumps/` |

---

## Session lifecycle and cascade delete

A session has three representations that must be removed together (seshat v1.2.59 moved everything of a session into `workspaces/{id}/`; at start the backend moves what older versions left in `sessions/{id}/` and removes `workspaces/*` directories no session points at):

| Layer | Location | How to delete |
|---|---|---|
| **Database** | `seshat.db` — `sessions` table + related rows (messages, files, …) | `store.DeleteSession(ctx, id)` |
| **Filesystem** | `workspaces/{id}/` and its permissions file `data/permissions/{id}.json` | `runtimepath.RemoveSessionData(root, id)` |
| **Object storage** | S3 prefix `workspaces/{id}/` (when configured) | Provider-specific delete |

The application is responsible for performing all three steps atomically. Leaving
filesystem data after a DB delete causes orphaned artifacts; leaving a DB row after
filesystem delete causes broken session references.

Recommended pattern:
1. Begin a DB transaction.
2. Delete related rows (messages, files, plans, …) then the session row.
3. Commit the transaction.
4. Call `runtimepath.RemoveSessionData(root, id)`.
5. If S3 is configured, delete the object prefix.

---

## Document reading

The Go reader built into the backend reads DOCX, PPTX, XLSX and PDFs with a text layer, and nothing has
to be installed for it. For scans and complex layouts, run a document reading service yourself (Docling, or
`seshat-intelligence` from SeshatCloud) and point the backend at it with `DOCUMENT_READER_URL`.

SeshatOS does not install or start a Python environment: there is no `.venv` in the runtime root, and no
step of `make setup` creates one. Setting up the Python service is something you do on purpose; a proper
configuration for it (check, install, GPU) is planned.

---

## Electron path mapping (desktop app)

The Electron main process calls `app.setPath(…)` at startup to redirect all
Chromium/OS paths into the runtime root, keeping all data co-located:

| Electron path | Maps to |
|---|---|
| `userData` | `{root}/electron/user-data/` |
| `sessionData` | `{root}/electron/session-data/` |
| `crashDumps` | `{root}/electron/crash-dumps/` |
| `temp` | `{root}/tmp/electron/` |
| app logs | `{root}/electron/logs/` |

This means clearing the runtime root also clears the Electron profile, which is
intentional — a full reset should leave no trace.
