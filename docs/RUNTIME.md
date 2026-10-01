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
├── sessions/                      ← per-session filesystem data
│   └── {session-id}/
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
│       ├── permissions.json       ← per-session tool permission overrides
│       └── session.log            ← per-session diagnostic log
│
├── data/
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
│   ├── app.log                    ← main backend / CLI log
│   └── docling.log                ← docling-serve output (when auto-started)
│
├── storage/                       ← S3-compatible object storage (optional)
│
├── .venv/                         ← SeshatOS-managed Python venv (docling-serve)
│   └── bin/docling-serve          ← document conversion server binary
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
| `SessionsDir(root)` | `{root}/sessions/` |
| `SessionDir(root, id)` | `{root}/sessions/{id}/` |
| `SessionArtifactsDir(root, id)` | `{root}/sessions/{id}/artifacts/` |
| `SessionArtifactsImagesDir(root, id)` | `{root}/sessions/{id}/artifacts/images/` |
| `SessionArtifactsAudioDir(root, id)` | `{root}/sessions/{id}/artifacts/audio/` |
| `SessionArtifactsWebDir(root, id)` | `{root}/sessions/{id}/artifacts/web/` |
| `SessionScreenshotsDir(root, id)` | `{root}/sessions/{id}/artifacts/screenshots/` |
| `SessionPastesDir(root, id)` | `{root}/sessions/{id}/pastes/` |
| `SessionPastesTextDir(root, id)` | `{root}/sessions/{id}/pastes/text/` |
| `SessionPastesImagesDir(root, id)` | `{root}/sessions/{id}/pastes/images/` |
| `SessionPastesOtherDir(root, id)` | `{root}/sessions/{id}/pastes/other/` |
| `SessionPlansDir(root, id)` | `{root}/sessions/{id}/plans/` |
| `SessionToolsDir(root, id)` | `{root}/sessions/{id}/tools/` |
| `SessionLogPath(root, id)` | `{root}/sessions/{id}/session.log` |
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

A session has two representations that must be removed together:

| Layer | Location | How to delete |
|---|---|---|
| **Database** | `seshat.db` — `sessions` table + related rows (messages, files, …) | `store.DeleteSession(ctx, id)` |
| **Filesystem** | `sessions/{id}/` and all subdirectories | `os.RemoveAll(SessionDir(root, id))` |
| **Object storage** | S3 prefix `sessions/{id}/` (when configured) | Provider-specific delete |

The application is responsible for performing all three steps atomically. Leaving
filesystem data after a DB delete causes orphaned artifacts; leaving a DB row after
filesystem delete causes broken session references.

Recommended pattern:
1. Begin a DB transaction.
2. Delete related rows (messages, files, plans, …) then the session row.
3. Commit the transaction.
4. Call `os.RemoveAll(SessionDir(root, id))`.
5. If S3 is configured, delete the object prefix.

---

## Docling (document conversion)

SeshatOS integrates [docling-serve](https://github.com/DS4SD/docling-serve) for
converting DOCX, PPTX, XLSX, PDF, and audio files to text/markdown. It runs as an
optional sidecar HTTP process on `127.0.0.1:5001`.

### Install

```bash
# From the repository root
make install-python

# Or directly:
./scripts/install-python-env.sh
```

This creates `~/.config/seshat/.venv/` and installs `docling-serve` into it using
`uv` (no system Python required).

GPU acceleration:

```bash
DOCLING_EXTRAS=gpu ./scripts/install-python-env.sh
```

### Auto-start

**Backend (HTTP API server / desktop app):** The local backend binary (`seshat-backend/cmd/api`) checks at
startup whether `~/.config/seshat/.venv/bin/docling-serve` exists. If it does and
`SESHAT_DOCLING_URL` / `docling_url` config is not set, it starts docling-serve
automatically in the background and routes document-conversion requests to it.

Startup is non-blocking — the server becomes ready while docling warms up (~5 s on a
cold start). Tools that need docling (`read`, `read_document_url`) fall back to
plain-text extraction until it responds.

Logs go to `~/.config/seshat/logs/docling.log`. Set `SESHAT_DOCLING_VERBOSE=1` to
print them to stderr instead.

**Manual start:**

```bash
./scripts/start-docling.sh
# or
DOCLING_PORT=5002 ./scripts/start-docling.sh
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SESHAT_RUNTIME_ROOT` | `~/.config/seshat` | Runtime root (shared by all components) |
| `SESHAT_DOCLING_URL` | *(auto)* | Override docling-serve URL; set to skip auto-start |
| `SESHAT_DOCLING_VERBOSE` | — | If set, print docling logs to stderr |
| `DOCLING_PORT` | `5001` | Port for manual `start-docling.sh` invocation |
| `DOCLING_HOST` | `127.0.0.1` | Bind address for manual invocation |
| `DOCLING_WORKERS` | `1` | Parallel conversion workers |
| `DOCLING_EXTRAS` | — | pip extras for install (e.g. `gpu`) |
| `PYTHON_VERSION` | `3.11` | Python version for venv creation |

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
