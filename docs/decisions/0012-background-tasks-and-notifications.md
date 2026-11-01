# 0012 - Background tasks, faster skill environments and notifications

Status: proposed, 2026-11-01. Follows the first lot of this work, which made the environments of skills faster (PR 384).

## Context

Installing a skill repository can take from seconds to several minutes, and for that time the person is stuck. What the code does today:

- **One request does everything.** `POST /skills/repos/{name}/environment` makes the Python environment and the Node packages in the
  request itself, with the context of the request (`skillinstall.Environment`). If the connection drops, the context is cancelled and
  pip is killed. The client is the main process of Electron, whose `fetch` gives up on its own after a default of 5 minutes without
  an answer (nothing in `main/ipc/backend.ts` changes it), while the backend allows 25.
- **The state lives in a React component.** `installing` and `reviewing` are `useState` of `SkillsPage`: leave the page and the dialog,
  the result and the "installed" message are gone. The dialog is modal and says only "This can take a few minutes...".
- **Nothing says how far it is.** The output of pip and npm is kept in memory and shown only when a step fails.
- **Closing the window quits the app** (`window-all-closed` calls `app.quit()`), and the backend is its child: an installation cannot
  survive it, and it leaves a repository marked `Pending`.
- **Indra already does it right, in its own way.** Its install runs in a goroutine and is read through a status route
  (`document_reader_indra.go`), but the state is only in memory and the code repeats the search for Python and the use of venv and pip.
  The models of native OCR, the local title model and Whisper have three more ways of reporting a long job.
- **There are no notifications.** The three switches of Settings > General (desktop notifications, sound, product updates) are
  `useState` that nothing reads, and no code shows a system notification. The only feedback is a toast that goes with the page.

## Decisions

### One environment per repository, built from a shared cache (not one environment for all)

A single environment for every repository looks lighter, and it is not once uv is used. uv links the packages from one cache instead of
copying them (an environment of numpy, pandas, scipy, matplotlib and scikit-learn took 3.3 s with a warm cache against 47 s with pip), so
the second environment that needs numpy costs a link, not a copy. What a shared environment would bring is only the loss of what
separates repositories:

- two repositories pin different versions (one needs `pandas<2`, another `pandas>=2`), and a Python minimum of their own (3.10 or 3.11);
- uninstalling a repository could not remove its packages without breaking another;
- a failed or hostile requirement would damage every skill instead of one.

So the isolation stays, and the cache is made to do the sharing: `UV_CACHE_DIR` is set inside the data folder, on the same volume as the
environments, so that links are hard links. Unused packages are freed with `uv cache prune`.

### uv is downloaded on first use

When uv is not on the machine, it is downloaded from its official releases (`github.com/astral-sh/uv`), at a version pinned in the code,
and its SHA-256 is checked against the one pinned for the platform before anything is run. It is kept in the data folder
(`tools/uv-<version>/`). The plan shown before an installation says it will be fetched. If the download or the check fails, pip does the
work, as before. `SESHAT_SKILL_UV=off` keeps pip.

### Long jobs are tasks of the backend

A new package, `internal/tasks`, runs a job with a context of its own (not that of a request):

- a task has an id, a kind (`skill.install`), a subject (the repository), a title, a status (`queued`, `running`, `succeeded`, `failed`,
  `cancelled`, `interrupted`), a step ("2 of 4: creating the environment"), the last thing said (`detail`), the end of its log and an
  error;
- starting a task for a kind and subject that is already active returns the active one; a small number of tasks run at once, the others
  wait in the queue;
- a task can be cancelled, which cancels its context and so kills the programs it started;
- the state of each task is written to the data folder when its status or its step changes, so that a task still running when the app
  stopped comes back as `interrupted`, with the error saying so, and can be started again; the environment it had made is kept, and
  the install runs again over it;
- routes: `GET /tasks`, `GET /tasks/{id}`, `POST /tasks/{id}/cancel`, `DELETE /tasks/{id}` (a finished task).

This is not a scheduler: nothing starts by itself. A task exists because the person asked for something, which keeps it inside the rule
that automation belongs to SeshatCloud.

The install of an environment becomes the first task: the route starts it and answers `202` with the task. Its steps are getting the tools
(finding Python, downloading uv when needed), creating the environment, installing the packages (Python and Node at the same time) and
recording the result. The lines that pip, uv and npm print are read as they come and shown as the detail of the task.

### The interface follows the task, not the page

- The state of tasks is a store of the desktop, fed by the routes above (polled every 1.5 s while a task is active, rarely otherwise), so
  leaving a page loses nothing.
- The dialog of an installation gets "Install in the background": it closes, and the card of the skill shows the step and a bar.
- A bar of progress sits at the bottom of the sidebar while a task runs; a click opens the list of tasks, with cancel.
- Closing the window while a task runs hides it instead of quitting: an icon stays in the system tray (menu: open, quit), and a
  notification says the app goes on. With no task running, closing quits as before. Once the tasks are done the app stays in the tray
  until the person opens it or quits from the menu.

### One service of notifications

A notification is `{ kind, title, body?, route? }`, with a kind among `task`, `error`, `info` (later `reply` for an agent that finished).
`notify()` does four things: it keeps the notification in a history (a bell in the title bar, with the unread ones counted), it shows a
toast when the window has the focus, it asks the main process for a system notification when it does not (a click brings the window back
and opens `route`), and it plays the sound if asked. Settings > General becomes real: a master switch, the sound, and one switch per
kind (tasks and errors on, replies off). The settings are kept on the machine, as a desktop notification is a matter of the machine.
The "Product updates" switch notifies when an update of the app has been downloaded. On Windows the app sets an application user model
id so that the system notifications carry its name.

## Order of the work

1. This document, `internal/tasks`, the install as a task with its progress, uv downloaded on first use, the shared cache.
2. The interface: store of tasks, background install, bar in the sidebar, tray on close.
3. The notification service, the settings, the history, the updates.
4. Later: the other long jobs (Indra, models of OCR, title model, Whisper, indexing) move to tasks; replies of the agent notify.

## Consequences

- An installation survives leaving the page, a dropped connection and the 5 minutes of the client, and can be cancelled.
- A crash leaves an `interrupted` task instead of a repository stuck on `Pending` with no way to know, and a retry resumes.
- The first installation on a machine without uv downloads about 16 MB more, once, and says so.
- The code that finds Python and builds environments has one place (`skillinstall`); Indra can use it when it moves to tasks.
- Quitting from the tray while a task runs still stops it: the app asks first.

## Addendum: the download is a task too (2026-11-01)

`POST /skills/repos` used to clone inside the request (the module `skillrepos` runs `git clone` with no way to see or stop it), so a large
repository held the page for minutes. It now starts a task of kind `skill.clone` and answers 202: `skillinstall.Clone` runs `git clone
--depth=1 --single-branch --progress`, streams what git prints into the task, never lets git ask for a password (`GIT_TERMINAL_PROMPT=0`)
and removes what it downloaded when it fails or is cancelled. A second step reads what the skills need and records it as pending. When the
task succeeds the desktop asks `GET /skills/repos/{name}/plan` and opens the window of the plan wherever the person is
(`SkillReviewHost`, mounted in the shell), so the answer no longer depends on a page staying open.

Cancelling now ends the whole process tree (`taskkill /T` on Windows, a process group elsewhere): killing only `git` left
`git-remote-https` writing into the folder that was being removed, and the same was true of pip and npm.
