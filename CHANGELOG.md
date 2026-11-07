# Changelog

All notable changes to SeshatOS are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The runtime that powers the agents has its own changelog in [seshat-runtime](https://github.com/KPO-Tech/seshat-runtime/blob/main/CHANGELOG.md); the version this app uses is named here when it changes something you can see.

---

## [Unreleased]

### Fixed

- **A repository downloaded as an archive can no longer announce a size that slips past the limit.** When git is missing, a skill repository is downloaded as a zip; the size an entry announced was read as a signed number, so a huge one turned negative and lowered the running total, and the files after it could go beyond the 2 GB limit. Such an entry is now refused. Copying a skill from a hidden folder also checks that the file it opens is the one it listed, so a link swapped in the meantime is not followed.
- **Two dependencies with a known flaw are updated** (the spreadsheet library and the cryptography module). Neither was reachable from the app's code, and the vulnerability check now finds nothing.

### Changed

- **Skills of the catalog are installed at a commit and no longer change by themselves.** Until now each repository of the catalog was installed from its default branch and updated in the background about once an hour, so a change at the source (or a takeover of the repository) reached every machine within the hour, unread. Each entry now names the commit that is installed, and the app no longer updates these repositories from their source: a change reaches you with a release of SeshatOS. A repository you add by its address still follows its branch (ADR 0026).

## [0.3.17] - 2026-11-07

### Highlights

- **A fuller Generative UI.** The agent knows every component by default and reaches for a page of HTML only when it has to; forms and graphs share numbers, tables can be filled in and sent, a hub diagram, diagrams open large and can be saved.
- **Public skills that needed fixing can now be offered.** The catalog copies a skill from a hidden folder, corrects its text after each update, and gives it a Python of its own (downloaded by uv if the machine has none). ui-ux-pro-max is the first.
- **glm-5.3 writes files again** (runtime v1.15.1), and the permission modes say what they do: "No confirmation" is the one that never checks.

### Added

- **"What's new" tells everything since 0.3.0, in your language.** The card that opens after an update now reads "New in 0.3.0 → 0.3.17" and has twelve pictures instead of six: Generative UI, web pages beside the chat, skills from a catalog, the pull requests of the agent, the interface in French, token use and the sandbox, next to the earlier ones. Its texts were in English only; they are now translated, and the start page card no longer shows a Generative UI switch that moved to Settings.
- **A sketch says its texts are examples.** When the agent sketches a page in a Browser or a Phone, the figures, names and quotes in it are made up; it is now told to say so under the sketch instead of presenting them as real.
- **The permission modes say what they do.** The shield menu showed "Smart" and "Auto", and "Auto" was the one that never checks anything. It is now "No confirmation" ("Sans confirmation"), and each mode has a line under its name: Smart checks each action and asks when it is unsure or risky; No confirmation runs everything without asking.
- **Better pages from the agent.** The base the agent starts an HTML page from now also says what to avoid (indigo accent, gradient titles, invented figures, the same skeleton every time), to write the page in one call, and to ask you when a write is refused instead of looking for a way around it.
- **Public skills that need a copy, a correction or a Python.** The catalog can now install a skill that keeps its files in a hidden folder (copied to a visible one), correct the text that does not suit Seshat (re-applied after each update, reported if it no longer fits), and give a skill that only uses Python's own library an environment too. When the machine has no Python, uv downloads one for Seshat after you agree. ui-ux-pro-max (design help for building a real interface) is the first entry (ADR 0025).
- **Seshat's own skills collection is cloned at first start.** `seshat-skills` is downloaded in the background and kept up to date; it holds only skills written for Seshat and is empty for now (an `html-page` skill was tried and dropped for a base in the prompt). Public skills stay in the catalog.
- **Forms in chat answers.** The agent can now put an exercise, a quiz or a text to correct in the answer: a text box with a word counter and a button that sends what you wrote as your next message. It can also give a draft (an email, a letter) to edit and copy, a score bar and a bar cut in parts. Nothing is sent without your click (ADR 0013).
- **Sliders and live formulas.** A graph in an answer can be explored: sliders change the parameters of a curve, and the equation, the marks (a vertex, a root) and the values follow (ADR 0014).
- **Switches, choices, quizzes and flashcards.** A switch or a list can show or hide curves of a graph. A quiz gives the right answer and its explanation at once, with a score; flashcards flip and are marked known or to review. At the end you may send your result to the agent with one click (ADR 0015).
- **Flashcards that turn.** Cards flip with an animation, show progress and a count of known and to review, can be shuffled and used with the keyboard, and may carry a category and a note.
- **Site sketches in the chat.** The agent can draw how a page could look: a browser window with a navigation bar, a hero, feature cards, a grid, pictures, a footer, and a colour palette, with colours of its own choosing (ADR 0016).
- **Logos for architecture drawings.** A technology or a service by its plain name (aws lambda, azure, slack, openai, stripe, react) now shows its logo in colour, from a large set that ships with the app and works offline.
- **A Generative UI page.** The menu entry opens a page with the switch, a gallery of every example the agent is taught from, eight requests to try (each opens a new chat with the text ready), and the choice of families of components: automatic, always or never, with what each adds to the prompt (ADR 0017).
- **Diagrams that say an idea.** The agent can draw a honeycomb of parts, a process in arrow-shaped steps, a cycle, a pyramid or a funnel, a matrix of two by two and a stack of layers, in colours of its choosing (ADR 0018). A new family in the Generative UI window, with a gallery.
- **Architectures as posters.** An architecture can lay its stages in a row, sit in a frame with a large title, draw databases as cylinders and join the stages with big arrows (ADR 0019).
- **Venn diagrams, org charts and decision trees**, hexagon and pill shapes for the steps of an architecture, and a legend that wraps under the bars of a session or a budget, where short parts overlapped their words.
- **Drafts that open in your mail app, and tables to fill in.** A draft can be opened as a new mail after you confirm the address; the agent can also give a table with columns and rows you edit, then send it back as a Markdown table (ADR 0020).
- **Numbers typed in a form move the graph.** A number field in a form works like a slider: the curve and the live formulas follow what you type, and the message you send can carry the sliders' values too (ADR 0021).
- **A hub diagram, and every component known to the agent.** A centre with what surrounds it (the five forces of Porter, stakeholders, a mind map) can be drawn. The agent now knows all the components on every request, so it no longer falls back to an HTML page for a decision tree; the big arrows of an architecture poster are thinner (ADR 0023).
- **Diagrams open large and can be saved.** A tree, a cycle, a hub or any other diagram has the same corner button as an architecture: a large view, and a download as an image. The agent is also told that pages can use the libraries the app ships (Chart.js, D3, three.js, Mermaid...).
- **Better pages, better choices.** The agent writes its HTML pages from a common base (light colours, one accent, inline icons, the shipped libraries), and each component description now says when to use it, so a function, a decision tree or an architecture of a few boxes stays in the answer (ADR 0024).

### Fixed

- **Files can be written with glm-5.3 again.** In the smart permission mode every write was refused without a question: the safety check asked z.ai to switch the model's reasoning off, glm-5.3 always reasons and rejects that, so the check failed. The runtime (v1.15.1) no longer sends it to a model that refuses it, and a check that cannot decide now asks you instead of refusing.

## [0.3.16] - 2026-11-05

### Highlights

- **FreeLLMAPI joins the providers.**

### Added

- **FreeLLMAPI in the list of providers.** [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a router you install and run yourself that puts the free tiers of many providers behind one address. It is offered with its logo in Settings > Providers: give its unified key and its address (the one of its desktop app by default, port 31415), and its models are read from it (only those it can serve, `auto` first). SeshatOS installs and starts nothing of it. For personal use, under the terms of each provider.

## [0.3.15] - 2026-11-05

### Fixed

- **One word for each thing in French.** Settings is always "Réglages" (it was also "Paramètres" in Knowledge) and the Changes tab is always "Modifications".

## [0.3.14] - 2026-11-05

### Highlights

- **The French fits the screens, and the icon near the clock, the dialogs and the Windows installer speak your language.**

### Added

- **The tray menu, the notice of a hidden window and the dialogs of the system follow the language of the app.** Open / Quit, "still working" and the question when you quit during a task are in English or French, and the choice is kept for the next start.
- **The Windows installer speaks French as well as English,** following the language of the system: welcome and finish pages, and the question asked when the app is removed.
- **The notifications list scrolls after five.**
- **The messages of the backend that a person may meet are translated** (session expired, device not connected, request too large, rate limit...), and so are the messages about the downloads and installations in progress.

### Changed

- **Shorter French labels.** About 560 labels were tightened, so that buttons, tabs and titles are not stretched (the French text is 13% longer than the English now, against 24% before).
- **Updated dependencies:** chart.js, simple-icons, electron-updater, electron-builder and oxlint.

## [0.3.13] - 2026-11-05

### Highlights

- **The files of a skill look like the files of a project, and a skill has its own Overview.**

### Added

- **Overview and Files tabs on a skill.** The description moves out of the header into an Overview that reads well: what the skill is about, its tags, its details, and what it asks for (license, compatibility, allowed tools, read from its SKILL.md). Files takes the whole width.
- **Colour icons, search, tables and notebooks in the files of a skill.** They use the same tree and the same viewer as the files of a project.

### Fixed

- **The tabs of a project showed their keys in French.** "shell:pages.projects.detail.tabFiles" appeared instead of Files; the titles are drawn again.
- **The type of a skill (Built-in, Yours...) is translated.**

## [0.3.12] - 2026-11-05

### Highlights

- **SeshatOS speaks French.** The whole interface can be read in English or in French.

### Added

- **A language setting.** In Settings, choose English or French. The choice applies at once and is remembered. By default the app follows the language of your system.
- **The interface in French.** Settings, Chat, the sidebar and Home, the Store, Plugins, Skills, agents and Knowledge (Ask, Search, Collections, Sources) are translated. The words Skills and Plugins stay as they are, and so do the names of tools.
- **Plurals and dates in your language.** "3 documents", "il y a 5 min", file sizes and dates follow the language you chose.

### Not translated yet

- The administration pages, the release notes and the native menus stay in English for now. What an agent is told (prompts, instructions) is never translated.

## [0.3.11] - 2026-11-05

### Highlights

- **A One Dark appearance, file icons like in VS Code, and sign-in by code for organizations.**

### Added

- **A One Dark appearance.** In Settings > Appearance, a dark theme after One Dark Pro for VS Code, with Seshat's orange as its accent and the One Dark colours in code.
- **File and folder icons in the files of a project.** Each file shows the icon of its type and each folder the icon of its name (src, docs, .github...), open or closed, from Material Icon Theme as in VS Code.
- **Sign in to an organization by approving a code in the browser.** When the app is connected to an organization, it shows a short code and opens the organization's console, where you approve it. Standalone mode is unchanged.

### Fixed

- **The logo of a README shows in the files of a project.** A README that names one image for dark pages and another for light ones showed a broken image when the system was dark. The app now picks the one for its own theme.

### Changed

- **Runtime 1.14.2.**

## [0.3.10] - 2026-11-03

### Changed

- **The tools of an MCP server are easy to read.** Each one takes one line with its name and first sentence, its full description opens on a click with examples as code, and a long list can be searched.

## [0.3.9] - 2026-11-03

### Highlights

- **The Hugging Face plugin works, and a LaTeX skill makes your PDF documents.**

### Added

- **A LaTeX skill in the skills on offer.** It makes PDF reports, papers, theses, CVs, letters, exams, posters and slides. Its Python packages are installed with it, and LaTeX is yours to install: the app tells you before you agree if it is missing.

### Fixed

- **MCP servers over HTTP connect.** The Hugging Face plugin stopped on an error and showed no tools, whatever key you gave it. It now connects.

### Changed

- **Runtime 1.14.1.**

## [0.3.8] - 2026-11-03

### Highlights

- **See how many tokens you use, day by day, and let the agent's commands run in a sandbox on Windows.** Account shows your token activity, and Settings > Environment offers a Sandbox mode.

### Added

- **Token activity in Account.** A year of daily use, with weekly and cumulative views, and the tokens of a day when you hover over it. Deleting a chat does not change it: what the chat spent stays counted.
- **A Sandbox mode for the agent's commands on Windows.** In Settings > Environment, commands can write only in the session's folder and cannot read the folders you protect, such as your credentials. They can still read other files and use the network. Direct stays the default.

### Changed

- **Account comes first in Settings**, and the General page is now called Language & notifications. General stays as the name of the section.
- **The Docker mode is gone.** If you had chosen it, commands now run directly on your computer, and Environment tells you so until you choose again.
- **On macOS, commands are no longer confined.** The component that confined them is gone, and Environment says so. Linux keeps Landlock.
- **The installer no longer installs the `srt` component.**
- **Runtime 1.14.0.** Confined commands can no longer read the clipboard, capture the screen, see your windows or write to the sandbox's internal pipes.

## [0.3.7] - 2026-11-03

Not published: the Linux package failed, so this tag has no release. What it held is in 0.3.8.

## [0.3.6] - 2026-11-02

### Highlights

- **The conversation follows the answer again, and the Artifact panel follows the file.** The view keeps up with what the agent writes until you scroll up yourself, and a page the agent edits reloads by itself.

### Changed

- **Electron 45.1.**

### Fixed

- **The conversation follows the answer being written.** It stopped by itself as soon as the text grew faster than it scrolled, with nobody touching anything, and the arrow that goes back down did not start it again. Now only your own move up stops it; coming back to the end, or the arrow, starts it again.
- **The Artifact panel follows the file.** When the agent edits a page, the panel reloads it by itself; it used to keep showing the old version and its old errors until you clicked reload.
- **A long line stays inside your message.** A message with a long path or a wide code block ran off the screen on the left, as the one sent by "Ask the agent to fix" did. It now keeps its width, and the code scrolls inside.
- **Thin scrollbars in previewed pages**, in place of Chromium's wide white ones.
- **"Ask the agent to fix" says it better.** The agent answers in the language of the conversation, and an error names the file and its line instead of an internal address.

## [0.3.5] - 2026-11-02

### Highlights

- **Switch between your dark and light theme in one click**, from a shorter list of fourteen themes, and scroll smoothly through a conversation while the agent writes.

### Changed

- **Two main themes, one click to switch.** The appearance is now a dark theme and a light theme, Seshat Dark and Shine to begin with, and the sun and moon button of the title bar switches between them in one click instead of opening a list. Settings > Appearance chooses what each of them is, and a mode: dark, light, or following the system.
- **Fourteen themes instead of thirty.** Seshat Dark, Seshat Night, Seshat Light and Shine, then Carbon, Graphite, Mirage, Tide, Violet hour and Dusk, then Paper, Alpine, Blossom and Daybreak. A theme taken out of the list moves to the closest one kept. The first screen of a new install offers Seshat Dark, Carbon, Dusk and Shine.

### Fixed

- **Scrolling up through a conversation is smooth, during a turn too.** Each streamed word drew again every message on screen; now only the answer being written is. Scrolling up no longer jumps when earlier messages take their real height, and a picture, GIF or clip the agent showed comes back at once and at its size instead of loading again (an 8.9 MB GIF made the list run away from it).

## [0.3.4] - 2026-11-02

### Highlights

- **The web pages the agent builds open live beside the conversation**, work offline with the common libraries shipped in the app, and report their errors so the agent can fix them.

### Added

- **A web page the agent makes opens live beside the conversation.** When the agent presents a page it built, the Artifact panel opens on it by itself, running in an isolated frame, with a Code tab for its source and a reload button. Clicking the page's card, or an HTML file in the list of changed files, opens it the same way instead of showing the diff. The panel reads the file as it stands on disk, so it stays available after the conversation is reopened.
- **The libraries those pages load work offline.** Chart.js, D3, three.js, React 18 with Babel, Tailwind, Mermaid, KaTeX, Plotly, ECharts, Leaflet, Vue, Alpine, GSAP and a few others ship with the app (about 6 MB in the installer), and a page that loads one from jsDelivr, unpkg, cdnjs, esm.sh or the Tailwind CDN gets the shipped copy. Another exact version is downloaded once, while there is a network, and kept in a cache of at most 100 MB that forgets what no page used for 60 days. The page itself still cannot reach the network.
- **A page that breaks says so, and the agent can fix it.** The Artifact panel lists what goes wrong in the page: script errors, libraries it could not load, what the preview blocked. "Ask the agent to fix" sends that list to the conversation. Nothing is sent unless you click. "Open in the browser" opens the file in your browser, with the network.

## [0.3.3] - 2026-11-02

### Highlights

- **Follow the pull requests the agent opens, then let it merge them.** The Changes card lists only the pull requests the agent itself opened, shows their checks, and offers a Merge button once they are green.
- **A new version is offered while SeshatOS stays open**, instead of only when it starts.

### Added

- **Follow a pull request until it can be merged, then have the agent merge it.** In the Changes card, the icon of a pull request the agent opened blinks while its checks run, turns green once the checks passed and GitHub says it merges cleanly, red on a failed check or a conflict. A green one has a Merge button that asks the agent, in the conversation, to merge it. "Merge when ready" in its menu sends that request by itself as soon as it turns green, while the conversation is open.

### Changed

- **Web searches and fetched pages stay in the conversation.** The session panel no longer opens and follows each search or page while the agent reads the web: the row in the chat already opens on what was found.
- **The Changes card follows the pull requests the agent opened, and only those, however it opened them.** It used to fill up with the latest pull requests you opened anywhere on GitHub, even in a conversation that never touched it. It now lists a pull request when a tool call of the agent printed its address and GitHub says it was created while that call ran: `gh pr create`, `gh api`, `curl`, a script or an MCP tool alike. One the agent only listed or read, and yours, are left out; the card stays hidden when there are none. With a runtime older than 1.12.11, which does not say when its calls ran, only `gh pr create` and tools made to create one count.

### Fixed

- **A long pull request title is cut in the Changes card** instead of running out of it.
- **A failed tool call stays closed like the others.** It used to open by itself and could not be closed again. Its row now shows "failed" in red, and a click opens or closes it.
- **A new version is offered while SeshatOS stays open.** The app looked for updates only when it started, so one that kept running for hours never heard of a release published meanwhile. It now looks again every hour.

## [0.3.2] - 2026-11-02

### Highlights

- **Skills install on every Windows computer.** Installing a skill no longer says that git is missing when SeshatOS is opened from the Start menu, and a computer without git downloads skills from GitHub all the same.
- **The installed app shows its icon in the taskbar** instead of a blank page.

### Added

- **Skills install on a computer without git.** When git is not there, a skill repository on GitHub is downloaded as an archive of its latest version instead of being cloned, and installs the same way. A repository on another host still needs git, and the message says so. Repositories downloaded this way are not updated by themselves.

### Fixed

- **Skills download again on Windows when SeshatOS is opened from the Start menu or the desktop.** The app gave its engine a search path that held only its own folder, so git, Node.js and Python were not found and installing a skill said that git was missing. The engine now keeps the search path of the computer.
- **The installed app shows its icon in the taskbar.** The window now tells Windows which icon goes with its application id, instead of a blank page left by the icon cache.

## [0.3.1] - 2026-11-01

### Highlights

- **A clean uninstall.** Removing SeshatOS on Windows ends with one question: delete your conversations, settings, downloaded models and the update cache too, or keep them for a later install.
- **Fixes after 0.3.0.** The taskbar shows the icon of SeshatOS again when the app runs from the sources, and the three ways to set up the local models take one line each.

### Added

- **The Windows uninstaller asks whether to delete your data.** Removing SeshatOS now ends with one question that lists what is on the computer: your conversations, memories, settings, skills and downloaded models (`.config\seshat`), the cache of the updates (`seshat-desktop-updater`) and the command-line Seshat (`Programs\seshat`), each only if it is there. Yes deletes them so that nothing is left behind; No, the default, keeps them for a later install. Nothing is asked, nor deleted, when the uninstaller runs silently or as the first step of an update.

### Changed

- **The three ways to set up the local models are lighter.** Download recommended, Customize my install and Skip for now are one line each, with the radio on the right, instead of tall cards with a paragraph and a badge: the overview below them has the room.

### Fixed

- **The taskbar shows the icon of SeshatOS again when the app is run from the sources.** Since the notifications, the app gave Windows an application id that only the installer's shortcuts carry, and Windows drew a blank page in place of the icon of the window. The id is now set only for the installed app.

## [0.3.0] - 2026-11-01

### Highlights

- **A new first launch and a fuller start page.** The app opens maximized on a page to pick the look (Dark, Light or Midnight, and an accent colour), then the setup goes straight to the local models, and the start page shows five ways to begin with the input docked at the bottom.
- **Work that goes on in the background.** Skills download and install as tasks you can follow in the sidebar, with the bell of the title bar keeping what finished or failed and a What's new card after each update.
- **One look for Settings, Knowledge and Projects.** Every page of Settings shares the same header and cards, and Collections, Sources and Search of Knowledge look alike.

The full list of changes follows.

### Added

- **A What's new card opens once after each update.** A window a little smaller than Settings walks through the changes of the release one at a time, each with a small drawing of the feature in the colours of your theme and accent (the look chosen at first launch, the background tasks, the bell, the start page, Settings, Projects), with Back, Next and dots, and Escape to leave. It does not open on a first install, nor twice for the same version, and "What's new" in the menu at the bottom of the sidebar opens it again whenever you want.
- **The Sources and Search pages of Knowledge look like Collections.** Both open with the same head (an icon on a tinted tile, the title, one line and the buttons of the page), the same wide search field and pills. Sources has Refresh and Add a folder at the top and pills for All, Knowledge and Actions with their counts; Search lists its collections as pills above the results (several can be picked), moves the document type next to the sort, and gives the results the whole width instead of two filter cards on the left.
- **The app opens maximized.** The window fills the screen on every launch instead of opening at 1280 x 820; restoring it with the title bar button still brings back the smaller size.
- **The start page is laid out like a conversation.** The input of New Chat sits at the bottom, at the same place and width as in an open conversation (so nothing moves when the first message is sent), and the room above it now says what the workspace is for: a badge, the greeting, five ways to begin (Chat, Work with files, Analyze data, Search the web, Write code, each filling the input with the start of a request), and a strip on what sets SeshatOS apart (private and local, modular, open). The model menu opens upwards from there.
- **Generative UI can be turned on and off from the menu at the bottom of the sidebar**, under Settings, without opening Settings: the switch is the same preference as Rich answers in Settings > Answers, and the menu stays open.
- **Notifications have a bell and a history.** A bell in the title bar keeps what the app told you (a download or an installation that ended, something that failed in the background, a new version ready to install), up to 50 entries on this computer: unread ones are counted and in bold, a click opens the page the entry is about, and you can mark all as read, remove one or clear. The switches of Settings > General now do something, where before nothing read them: desktop notifications (shown by the system only when SeshatOS is not the window in front), a short chime, and which kinds to be told about (tasks, agent replies, errors, app updates); a kind that is off is neither in the bell nor shown by the system. The choices are kept per machine. When the agent finishes (or stops with an error) in a conversation you are not looking at, you are told: with the chime and the bell if SeshatOS is in front on another page or conversation, and with the notification of the system (Windows, macOS or Linux) if another application is in front. A download that ends in the window of what the skills need no longer adds a second entry to the bell.
- **Downloading a skill repository goes on in the background too.** Installing a large repository no longer holds the page for minutes with nothing to look at: the request answers at once with a task (`POST /skills/repos`), the card and the sidebar show the step and what git prints, shortened to fit ("RO 45%" for "Receiving objects: 45%"), it can be cancelled, and a download that fails or is cancelled leaves nothing behind. Git never waits for a password. When the download ends, wherever you are in the app, the window of what the skills need opens to agree to (`GET /skills/repos/{name}/plan`). The task card of the sidebar now sits above the Store, no longer overflows, and when several tasks run each has a number to click.
- **The first launch opens on the look of the app.** Before the login page, a new install shows a welcome page with three steps (Appearance, Get started, Models): pick Dark, Light or Midnight and an accent colour (orange, blue, purple, pink, green or teal), and the page itself changes at once. It is shown once, and the same choices, including the accent colour, are in Settings > Appearance. The page after it (continue on this computer, log in or create an account) and the setup that follows share the same look, and the setup no longer opens with a second welcome page: it goes straight to connecting a model, then to a page where you download the recommended set of local models, customize it or skip it, with the total size and the free space in view.
- **A skill installation goes on in the background, and you can follow it.** After you agree to what it needs, the dialog closes: the card of the skill shows the step and a bar with Cancel, and a card at the bottom of the sidebar shows the same wherever you are, with the time spent, the line the installer printed last and how it ended. If you close the window while something is installing, the window is hidden and an icon stays near the clock (Open, Quit) so that the installation can finish; with nothing running, closing quits as before. When it ends while you are in another window, the system says so, and a click opens the page. A clone that stops halfway no longer blocks the next attempt.
- **Installing the environment of a skill repository runs in the background.** The route answers at once with a task, and the installation goes on when you leave the page, cannot be cut by a dropped connection or by the 5 minutes a request could last, says which of its four steps it is on and what the installer prints, and can be cancelled (`GET /tasks`, `POST /tasks/{id}/cancel`). A task still running when the app stopped comes back as interrupted, and the environment it had made is kept. When the machine has no uv, the pinned version is downloaded once from its official releases, checked against its SHA-256 and kept; the plan says so before you agree, and pip does the work if it cannot be fetched. The packages of all repositories are linked from one cache in the data folder. The design is in `docs/decisions/0012`.
- **Skill environments are made faster.** When uv is on the machine (or `SESHAT_SKILL_UV` names it), the Python environment of a skill repository is made with it: its packages come from one shared cache, so a data stack that took about 47 seconds with pip takes about 3 seconds once the cache holds it, and a second repository that needs the same packages costs almost nothing. Without uv, pip does the work as before, now in a single resolution instead of one run per file. The Python and Node parts are installed at the same time, and a second attempt after a failure keeps the environment that was already made. `SESHAT_SKILL_UV=off` keeps pip.
- **Sources and Collections each do one thing.** Sources lists the folders you added (icon, analyse again, remove) above what you can add, and its Collections button opens the list filtered by that source. Collections is one list with the Skills look: search, a pill for each source ("Made in the app" for the ones you made yourself), a sort, and New collection. The Seshat source card is gone.
- **Memories, About, Scanned pages and Titles are tidier.** Memories adds an item on one line, About opens with the logo, the version and the update button, Scanned pages shows one step at a time (languages, models, start) with the models folded away, and Titles lists the models with their size and puts your own model behind an Add button.
- **Every page of Settings has the same look.** Documents, Search, Web search, Images, Providers, Models, Titles, Storage, Environment, MCP servers, Memories, Data controls, Cloud, Answers and About now use the shared header, cards and rows. The explanations that only repeated the labels are gone, and the web search providers are a grid of cards.
- **The Collections page of Knowledge has a search bar and a filter.** The search finds sources and collections, the filter picks a source, and the collections of a search or of a source are listed under the sources. The Seshat source counted no collection, though some were made in the app: it counts them now.
- **Settings has a Skills page.** It replaces Skill repositories: a card to add a repository by its Git URL and a card of what is installed, with the count of skills. The Featured repositories list is gone: the Skills page already offers them.
- **Audio settings are redone.** Three tabs (Dictation, Voice, Provider), cards with the control on the right, one Save button with the unsaved state next to it, and the explanations that only repeated the labels are gone.
- **The input of the start page is wider.** It now spans the row of examples under it.
- **The start page is plain.** A message, the input and five examples under it. The orange glow, the lists of recent chats and projects (already in the sidebar) are gone, and the input is a little smaller.
- **The start page is lighter.** The greeting, the input and your recent chats and projects: the line under the greeting, the five suggestion buttons and the long list of what the input can do are gone. The input is larger and the page is centred on one column. The skills list (/) and the knowledge bases list (@) open on the side that has room, show four rows and scroll after that.
- **Settings drops its side columns.** The help cards next to Documents (How it works, Supported formats) and Providers (About, Recommended setup, Add a provider) are gone, and the cards use the full width.
- **Settings has one look, starting with General.** A shared header (icon, title, one line, a state badge), cards that each answer one question, rows with the control on the right, and tabs where a page has several parts. General, Appearance, Shortcuts and Account use it; the descriptions under the titles are one short line, and the buttons that did nothing (Local data, Change email, sign-in methods, Delete account) are gone.

### Fixed

- **A skill repository is downloaded safely.** The download goes to a staging folder outside the one the skills are read from and is moved into place only when it is whole, so a download cut short (the app closed, the machine asleep) no longer leaves a half repository listed as installed. An address that ends in `..` or in a dot name is refused: it used to name the folder of all the repositories, which a failed download would then have removed. An address starting with a dash is no longer taken by git for an option.
- **Settings has its title bar again.** A bar across the top of the window with its name and the close button, above the list of pages and the page.
- **The provider cards of Settings are lighter.** Two models and a count (the others in a tooltip) on one line instead of rows of chips, a layout that gives the key, the test and the default model their own width, descriptions of the catalog without long dashes, and a side column that stays in view while you scroll.
- **The long dashes are gone from what the app says.** The messages of the plan (the agent still running, nothing sent...) are two plain sentences, the previews after a name and the size of a file are set off by a dot, and an empty value is a hyphen. In Settings, the page is centred in its window and the line under the title stays on one line.
- **The menus of the start page open, and the page starts lower.** The "..." of the recent chats and of the projects were cut off by the frame of their list; they now show their actions. The welcome starts further down on a tall window instead of sticking to the top, and the glow behind it fades at its top edge.
- **The start page has its background.** A warm glow around the mark and slow lines of the accent colour across the page, quieter on a light theme.
- **The Projects page has the proportions of Skills and Plugins.** The same margins, the same title and icon, search, filters and buttons, and project cards with the size and the corners of the other cards. The page now fills the width instead of stopping at a fixed width.
- **The skills we offer show the logo of their project.** Remotion, Superpowers, Strix and the LinkedIn skills use the logo each publishes in its repository, on the card to install and on the cards and the page of their skills. A skill whose repository has no logo (data analysis, ppt-master, paperasse), or whose icon you chose yourself, keeps its icon.
- **The MCP servers of the list show their own logos.** Figma, Chrome, Hugging Face and the MCP mark come from the brand marks; Playwright, Context7, DBHub and Firecrawl use the logo each project publishes in its repository (Firecrawl's cut down from 100 KB to 3 KB). A server installed before keeps its vendor's logo and not the symbol it was saved with.

### Added

- **The Documents page is redone.** Two tabs: Overview (enable documents, the document server with its test, which reader goes first, and the capabilities of each reader detected on this computer) and Scanned pages (the built-in OCR with its languages, models and download, and the optional Indra reader). A side column explains how documents are read and lists the formats. Changes are saved with one Save changes button.
- **The git branch is always in view.** Under the message box, on the left of the context gauge, a small label names the branch of the project folder (or the short commit when the head is detached) with a dot when files are not committed, and the Environment card has a Branch row too. Both follow a branch switched in a terminal within a few seconds, and nothing is shown outside a git repository. The Changes card now looks at the same project folder.
- **The Providers page is redone.** Each provider is a card with its real logo (Anthropic, Google, Mistral, Ollama, DeepSeek, OpenRouter, Hugging Face; OpenAI keeps its mark), its state (Default, Active, Not configured), the models it offers, its key shown masked and changeable, a Test, and a menu to choose the default model, change the key or the address, manage the models, set it as default or remove it. "Add provider" opens its own window, the providers not yet set up have a Set up button, and a side column explains providers and checks the setup (a provider connected, a default, a second one). Test all asks every provider for its models.
- **Settings is one window with every page.** The two pop-up windows, Settings and Config, become one raised window: every page is listed on its left, grouped as General, AI runtime, Capabilities, Workspace, Data & privacy and About, and each page shows its icon, its title and what it is for. The sidebar menu has one entry, Settings; Skills, Plugins and Knowledge open it on the page they need. The pages keep their content for now, except Providers and Documents, which are redone; the rest are redone one by one.
- **A new start page.** The mark and "Welcome to SeshatOS", the input with its buttons (Summarize a file, Analyze data, Search the web, Brainstorm ideas, Write code), then your three last conversations and the three projects to go back to, each with a menu and a View all link.
- **Real menus on the "..." of plugins, MCP servers and skills, and a link to the source.** An MCP server to install offers Install, Open the source, the documentation and Copy the command; one that is installed offers Configure, Turn off, Open the source, Copy the command and Remove. A connector offers Get a key, the documentation and Disconnect; a skill offers Open the source, Copy the name and Delete for your own, and a skill to install offers Install, Open the source and Copy the repository address. The cards, the skill page and the Plugins page also show where each one comes from (owner/repository) as a link that opens it.
- **A short list of MCP servers to install from the Plugins page.** Context7 (library documentation), Playwright and Chrome DevTools (browser), Sequential Thinking, DBHub (databases), Figma, Firecrawl (web scraping) and Hugging Face are offered as cards in the MCP servers section. A window shows what will run and where, what the server needs on the machine and what it asks for (a token or a connection string, kept as the server's own settings), then installs it and says at once whether it started.
- **The Plugins page follows the look of Skills.** A title with its icon, a search, filters with their counts, a sort and a grid or list switch; each category is a section with a line about it and a View all link, and each plugin a card with its Installed, Not installed or Needs attention badge, its words, a filled Install or a Configure button and a menu (documentation, disconnect). MCP servers have their own section, with a button to create one when there is none.
- **Skills of other tools are imported from a Scan button on the Skills page.** It opens a window that lists Claude Code, Codex and the folders you added, with what each holds; you scan one, check the skills you want and validate. The skills stay where they are and nothing is copied. This replaces the block that was in Settings.
- **The Agents page separates your agents from the platform ones.** "Your agents" comes first with the New agent button and a short note while there is none; "Platform agents" lists the built-in and organization ones. The line of explanation under the title is gone, and the New agent form is laid out like the rest of the page, with its cards, pills and orange Create button.
- **Skills that need packages are installed with them.** The catalog now offers Remotion (video), data analysis with Python (exploratory analysis, statistics, polars, scikit-learn, charts), the superpowers method skills, ppt-master, Strix, paperasse and the LinkedIn skills, each with the skills chosen from its repository (gstack was removed: it is written for Claude Code). Before anything is installed, a window lists the Python and Node packages the skills will use, the licences to know about and whether Python or Node was found; when you agree, a private environment is made for that repository only (a Python virtual environment, Node packages without their install scripts), and the agent is told to use it when it runs the skill. Uninstalling a repository removes its environment. An installation left unfinished is offered again.
- **The Agents tab keeps the page of the Skills.** The same title, search, sort and buttons stay in place; the agents come as cards under "Agent profiles" with their Enabled and source badges, model, tools and turns, and a category filter next to the sort. It replaces the separate agents layout.
- **A Changes card follows your GitHub pull requests.** In the session panel, the five most recently updated pull requests are listed: the ones the session worked on first, then your own. Each row shows its state (open, draft, merged, closed), title, repository and number, lines added and removed, a dot for the checks (passed, failing, running), and a menu to open it on GitHub, copy the link or refresh. It uses the GitHub connector's token, or the GitHub CLI's when it is signed in, reads only, and keeps nothing on disk: a closed or merged pull request leaves the list a week after its last update.
- **Skills that can be installed look different from the ones you have.** A card now says who publishes the skills, how many the repository holds, its category and what it needs on the machine (Python, Docker, Bun...), with a filled Install button and a link to the source.
- **A skill opens on a page of its own, like the files of a project.** The files of the skill are a tree on the left, the file is read in the middle (Markdown drawn or as source, code coloured, the front matter shown above), and a column gives its type, version, status, number of files, tags and the quick actions (turn on or off, change the icon, delete). It replaces the pop-up.
- **A new Skills page.** Skills are shown as cards under All skills, Built-in, Installed and Available, with a search, a sort and a category filter; a skill that is not installed has an Install button. Each skill gets an icon of its own colour, chosen from what its name and description say (a few general icons, always the same for a given name, when nothing fits), and the words it is about are shown as tags. The icon can be changed from the menu of a card, and set back to automatic. Agents are one click away in the same row.
- **Markdown pages with HTML are drawn as on GitHub.** In the project reader, a README can centre its logo and title, use `<details>`, tables and the usual layout tags; scripts, frames and event handlers are removed, and the pictures it names by a relative path are read from its folder. Makefiles, PowerShell, batch, shell, C, C++, Go and more are now coloured, and the Notes tab is greyed until it is thought over again.
- **A project now opens on an Overview.** It holds an input to ask about the project (the conversation is begun in its folder, which cannot be changed from there), suggestions, the description and tags, and the list of what was asked before, with the ones still working marked. "Start session" lands there instead of the start page, and the open project appears under Projects in the sidebar.
- **A new page for a project: read its files, its conversations and its notes.** The page shows the tree of the folder with a search over the names, and a reader for what is selected: Markdown (drawn, or as source), code with its colours, Jupyter notebooks (text, code, results, pictures and errors; nothing is run), CSV and TSV tables and pictures. Nothing in this view changes a file. Tabs for Sessions (open, rename, delete, start a chat) and Notes (Markdown notes per project, kept as they are typed); a column with the information of the folder (files, size, creation, last activity), the files changed last and the last conversations; "Open in VS Code" and "Open folder". PDF and Office files are not drawn here yet: the button opens them with the program of the system.
- **Open in VS Code** for a project, which falls back to opening the folder when Visual Studio Code is not found.
- **Follow-up cards and source pills in rich answers.** A Choice with a description is drawn as a card (an optional icon, title, one line, an arrow) for a topic worth digging into; without one it stays a pill. A new SourcePills block shows the sites a web search drew from, each opening its page. The prompt asks for real addresses only and was tightened to stay inside its word budget.
- **The button of the title bar offers Light, Night, Dark and System.** Clicking the moon (or the sun) opens a small menu with a sample of each appearance and a tick on the one in use, instead of switching between dark and light.
- **A new project starts from the first sentence of its README.** When a project is added, the description in the "Edit the project" dialog is the first sentence of the README of the folder (titles, badges, pictures and tables are passed over), and can be changed before saving.
- **Adding a project asks for its details at once.** After choosing the folder, the "Edit the project" dialog opens over the list, with the name of the folder, so that the project can be given a name, a description, tags and a colour from the start. Closing it keeps the project as it was added.
- **A redesigned Projects page.** Each project is a card with a coloured folder, its name and folder, a description, tags, the number of files and when it was last active, with "Start session" (and "Continue the last conversation") and "Open folder". A project can be pinned, archived and edited (name, description, tags, colour); tabs show All projects, Recent, Pinned, Active (a conversation is writing an answer) and Archived with their counts; the search looks in the name, folder, description and tags; the projects can be sorted and shown as a grid or a list. The number of files is counted in the background, stops at 5000+ for a very big folder, and leaves out `node_modules`, `.git` and the like.
- **Seshat Night, a third Seshat appearance.** A blue-black dark theme with the orange of Seshat, in Settings > Appearance next to Seshat Dark and Seshat Light. Its colours were measured on the Projects design; the orange is a little darker than on the picture so that white text stays readable on buttons.

### Changed

- **Seshat Light has a new palette:** a cool white, a pale blue-grey sidebar, deep navy text and very light borders, with peach tints for the accent, measured on the design the user shared.
- **The sidebar is the same in a project as on the start page.** Skills, Plugins and Projects were hidden inside a project; they are shown everywhere, and only the list of tasks changes: a project shows its own conversations, and the start page shows none that belong to a project.

### Fixed

- **The sort and filter menus of a collection are readable in a dark appearance.** They were the system's own lists, which drew pale text on white; they are now menus in the colours of the app, and the other system lists of the app take the colours of the appearance too.

## [0.2.2] - 2026-10-31

### Highlights

- **Indexing a folder no longer ends in a wall of "Failed".** A provider that refuses for quota pauses the queue instead of failing every document, and a document whose embedding fails is kept and found by its words, with a notice that says so.
- **Indexing is faster:** several documents are read at once, and a collection can be sorted, filtered and its failed documents retried together.
- **A new chat names its default model at once.**

### Added

- **A document whose embedding fails is kept and found by its words.** The reading of a document and its embedding are different steps: when the embedding fails in a way that waiting does not mend (a wrong key, a model that is gone, a daily quota, a provider that is down), the document is no longer marked as failed. It is indexed for keywords only, shown as "Indexed" with a "keywords only" note, and a notice pinned at the top of the collection says that the embedding failed and offers "Index again" once a model with more quota is chosen, which makes the vectors and clears the mark. A refusal for quota that a wait mends is still a pause of the queue, and a document that cannot be read (a scan with no text) is still Failed. Needs seshat-runtime v1.12.8.
- **Several documents are read at once while indexing.** Half of the cores read (one to four, `SESHAT_INGEST_WORKERS` sets it), while the step that chunks and embeds stays one document at a time, so the embedding provider still sees one request at a time. On the 60 test documents the whole run took 76.4 s with one reader and 33.7 s with four, with the same documents indexed. Readings through an external reader (Docling) stay one at a time, and the files being read at once are held to 256 MB.
- **Sort, filter and retry-all in a collection.** The documents of a collection can be sorted by format (the order they are indexed in, the default), by name or by state with the failures first, and filtered by format and by state. A "Retry failed documents" button starts every failed document again at once.

### Changed

- **Documents added by hand are indexed in the same order as those of a folder:** text first, then Word, then PDF, then the rest, small files before big ones.

### Fixed

- **A new chat names its default model at once.** The start page waited until every provider had given its list of models before choosing the default, so one slow or unreachable provider (a local server that is off) left the button on "Model", with nothing chosen. It now chooses as soon as the providers that could give the default have answered, as a conversation does, and names the model chosen for the default provider in the meantime.
- **A provider that refuses for quota no longer fails every document.** The embedder waits out the refusal (seshat-runtime v1.12.7), and a document it refused goes back to waiting without using an attempt. The whole queue pauses instead of starting the next document only to see it refused too, and goes on by itself; the collection page says "Indexing is paused" with the time left, and no document is marked as failed for a quota. A daily quota pauses for an hour and says so. Documents that wait show in a quiet grey, only the one being indexed stands out.

## [0.2.1] - 2026-10-31

### Highlights

- **Updates install with one click**, and a downloaded update is no longer missed.
- **Formulas are drawn everywhere in an answer**, while it is written, and a request for illustrations draws them in the chat.
- **Voyage, Jina and more models for the embeddings and the rerank of Knowledge.**

### Added

- **Jina AI and the newer Cohere and Voyage models for the rerank of Knowledge.** Config > Search offers Jina (`jina-reranker-v3.5` and three more), Cohere adds `rerank-v5.0-pro`, `rerank-v5.0-fast` and `rerank-v4.0-fast`, and Voyage adds `rerank-3` and `rerank-3-lite` (seshat-runtime v1.12.5). The default of Cohere and Voyage stays the model that was measured.
- **Voyage AI and Jina AI for the embeddings of Knowledge, and each provider offers its own models.** Config > Search can now use Voyage (`voyage-4` and its variants) or Jina (`jina-embeddings-v5` and `v4`) with a key from them, and Gemini offers `gemini-embedding-2` next to `gemini-embedding-001`. The list of models of a provider comes from the app, not from a copy in the screen; Gemini and Mistral used to be offered OpenAI's models when asked for their list.

### Fixed

- **A long answer from a z.ai model (GLM) no longer ends in "The provider took too long".** z.ai sent the arguments of a tool call only when it had finished writing them, so a long file or illustration left the connection silent until the app gave up. The runtime (v1.12.6) now asks z.ai to stream them.
- **A request body that is not valid JSON is refused, and a skill file cannot be read through a link that leaves its folder.** The test and model-listing calls of the embedder, reranker, document reader and web search read a broken body as an empty request; they now answer 400. A failed save of the sync state of a connector is written to the log instead of being dropped. The skill file endpoint follows links before checking that the file is inside the skill folder.
- **Asking for illustrations or figures now draws them in the chat.** A request such as "explain gradient descent with visual illustrations" did not bring the chart components to the model, which then wrote a file or an HTML page instead of answering. The words illustration, visual, figure, gradient and optimisation now bring them, and the prompt tells the model to draw in the answer and write no file unless asked.
- **A formula that ends at the end of a line no longer swallows the rest of the answer.** A model writes a displayed formula as `$$` ... `\end{array}$$`, with the closing `$$` after the last line of content, and the Markdown reader only closes a formula on a line of its own: everything after it, up to the end of the message, was drawn as one failed formula, in red or as grey code. Such formulas are now closed where the model meant them to end, and a `$$` that has no partner is shown as text.
- **Formulas are drawn in cards and tables, and while the answer is written.** A formula in a card, a callout, a step or a table cell showed its `$…$` source, and in a message the formulas appeared only once it was finished. They are now typeset as they close, and one that cannot be read stays as muted text instead of turning the paragraph red.
- **You can scroll up while the agent writes.** The conversation followed the end of the answer so eagerly that a scroll up was taken back down before it started. Scrolling up (wheel, touch, keys or the scrollbar) now stops the follow at once, and it starts again when you come back to the end or use the arrow.
- **An update installs with one click and no wizard.** Restarting into a downloaded update runs the installer silently and opens the app again by itself, instead of showing the installer's pages.
- **A downloaded update is no longer missed.** The app remembers that an update is ready and shows it when a window opens, and Settings > About has a Check for updates button and a Restart and install button.

## [0.2.0] - 2026-10-30

### Highlights

- **Knowledge is in this release**, with Ask, Search, Collections and Sources. SeshatCloud accounts and the cloud stay off in the public build; the Store and sources are on.
- **Rich answers**: tables, drawings, charts, buttons and follow-up choices, drawn while the answer streams.
- **Indra OCR**, an optional reader for scanned pages, and a first-run setup that connects a model.

### Added

#### Knowledge

- **A Knowledge platform inside the app, reached from the Store.** It has its own sidebar with Ask, Search, Collections, Sources and Settings.
- **Sources and collections.** Collections live inside the source they come from. A source can be given an icon and renamed. A folder of this computer is analysed into proposed collections that you can rename, merge or remove before creating them, and the documents of a folder source are indexed. The documents of a collection can be read in place, with an Index button that shows the passages a document was cut into, as Markdown.
- **Reading scanned documents without a server.** The OCR models download from the app, the language pack is chosen in a Documents section of Config (and offered in the first-run wizard), and a document that could not be read says why.
- **Indra OCR, an optional reader for scanned pages.** In Config > Documents, a card offers Datalab's Indra OCR: a small, fast reader of scans in many alphabets that runs on this computer only. It is not installed until you ask: the card shows the licence of its weights (free for personal use, research and organizations under $20 million in revenue and funding, not for competitors of Datalab), and installing needs the box ticked. It then creates a Python environment of its own (Python 3.10 or newer is needed, about 350 MB in all), and can be switched off or removed with its model. When it is on, a scanned page is read by Indra first and the built-in OCR reads what it leaves empty.
- **Search.** A page with filters by collection and kind. Before any search it lists the documents a page at a time. A search by words works without any model, and a query that holds a code or an identifier is searched by its words alone.
- **A result opens its document where the passage is.** Clicking a result opens the document in the right panel at the best passage, with that passage marked: on its page in a PDF, on its slide in a PowerPoint file, and in the text of a Word, Excel, Markdown or text file (see the citations below). The other passages that matched are buttons under the result. The results are laid out by the width they have (list or grid), the sort control is the app's own menu, and clearing the search closes the document.
- **Ask.** A conversation with a built-in Knowledge agent that answers from the documents you can read, with two read-only tools (search and read a document). Its messages, thinking and tool calls are drawn by the chat's own components. The header shrinks once a conversation starts, the chat icon opens the history of your questions (continue or delete), and the column on the right shows the context with its automatic compaction, the environment and the activity.
- **Ask says why it cannot answer, or why it may answer badly.** When the collections cannot be read, Ask says so (naming SeshatCloud when the device is paired with it), shuts the input and offers to try again; with no collection at all, it offers to add a source (a member of an organization is sent to an administrator instead). When no embedding model is in use, or the documents were indexed with another one, a line above the input says that the search is by words only or may be wrong, and opens Config > Search. A failed answer (credit, rate limit, network) is shown by the chat with its reason and a retry.
- **Citations that open the document.** A citation in an answer is a chip; clicking it opens the document at the cited place with the passage marked, and a document of the list under the answer opens on its page. The place is a page in a PDF and a slide in a PowerPoint file; a Word file has no fixed page, so its passage is found by its words and brought into view; in an Excel file the sheet of the passage is shown and its cells are marked; a Markdown or text file is marked the same way as Word. A scanned page has no text to mark, so it opens on its page. Conversations from before this also work. Hovering a chip shows the passage, and the card fits the room there is.
- **Config > Search.** The embedding model and the rerank model can be set up (OpenRouter included, and the key of a provider you already set up is used as it is). Several rerank models can be kept and the one in use chosen. The embedding model changes without restarting the app, and **Re-embed** makes the vectors again from the stored text when the model changed.

#### Chat

- **Sources under a chat answer.** The pages the agent consulted are listed once each, folded, and the links to them in the text become citations.
- **The agent's thinking stays folded while it is written, and shows how long it took.** The time is counted in seconds at the right of the row while the thought is being written, and kept when it ends.
- **Rich answers.** The agent can answer with drawn components (tables, figures, steps, notes) that fill in while the answer streams. It is on by default and can be turned off in Config > Agents > Answers.
- **Architecture drawings in an answer.** The agent can draw a system as coloured panels holding items with icons (generic icons and technology logos), with arrows between them.
- **Colours and complex tables in rich answers.** Tables, figures, headings, items and panels can take a colour to mark a concept, and a table can group its columns under a heading, have section and total rows, and merge cells.
- **Narrower conversation and a large view for wide content.** Messages and the composer now default to 900 px (Narrow 780, Wide 1100) so the text has margins and lines stay readable. A table with many columns or rows, or a tall drawing, gets a button that opens it in a large view with room to scroll and a header that stays in place.
- **Buttons, follow-up choices and file references in rich answers.** An answer can end with Choices that send a follow-up as your next message, carry a Button, point to a file with FileRef, quote a passage with Citation and list its sources. They are disabled while an answer is being written.
- **A lighter prompt for rich answers.** The instructions for architecture drawings and for charts and plots of formulas are sent only when the request is about a diagram, a chart or a formula, which halves the size of the block on every other turn (about 1 100 words instead of 2 290).
- **Markdown inside components.** The text of a card, callout, step, quote, item caption or table cell is drawn as Markdown (bold, lists, links, code blocks) instead of showing the symbols, and the instructions ask the model to keep code and ordinary paragraphs as normal Markdown outside a card.
- **A way back to the latest message.** When you scroll up in a long conversation, a small arrow appears at the bottom centre, above the composer; one click returns to the last line.
- **File references open in the app, and follow-ups keep their charts.** A file named in an answer opens as a tab in the Files panel (a PDF, an image or an Office file still opens with the system), and a follow-up question keeps the drawing or chart instructions when the latest answers used them.
- **Ask looks like the chat.** The Ask view no longer sits in a tinted panel with a border: its messages and its start screen rest on the page background like the chat's, and it has the arrow that returns to the latest message.
- **Rich answers in Ask.** The Knowledge agent can now write tables, steps, key figures, charts and follow-up choices. Its citations stay chips inside a table cell or a card, a follow-up choice sends the question with the collection you chose, and the rules ask that every figure comes from the excerpts.
- **A readable view of a knowledge search.** The search of the Knowledge agent, opened in the side panel or in the chat, now shows the query, the number of passages and documents, then each document with its passages: the reference the answer cites, the page, the section, how well it matches, the excerpt (cut, with Show more) and a button that opens the document at that page. It showed the raw text before, because the older reader did not know the reference of an excerpt.
- **Panels of the Ask conversation.** Once a question is asked, the title bar offers the Browser button like the chat, and the column of cards in Ask is no longer drawn next to a panel that shows the same cards.
- **A window for the panel of a tool.** The session panel was always drawn as the narrow, fixed-width cards. While it shows a tool it now has its frame and the width it was opened at (about half the room for a knowledge search or a document read, with larger excerpts), and the home button brings the cards back.
- **A cleaner Search page.** Results show the page and the section apart from the excerpt, without the running headers and page numbers of the PDF, with each word of the query marked at most twice; the other matching pages are small chips ("+N" for the rest); a Best match tag and a bar compare the documents; the kinds on the left follow the search like the collections; a search that reads as a question offers Ask Seshat beside the bar; the collection on the left is the only scope control; the title and the nested panels are gone; the list of documents is more compact.
- **The Search results no longer scroll sideways.** A passage chip named by a long section heading was as wide as the heading and pushed the list sideways; the chip is now cut, shows the deepest heading, and the list cannot scroll sideways.
- **A preview of each document in Search, and a readable view of a document read by the agent.** The list of documents shows the beginning of each one's text under its name, which tells apart files named `Compliance_03bd81f7f4.docx` (the listing route takes `preview=1`; it reads the first two passages, one read per collection). A document read by the Knowledge agent is shown as a document in the side panel: its name and collection, the pages read, how far into the text it went, then the text page by page as Markdown.
- **Download figures as SVG or PNG.** A chart, plot, histogram or heatmap has a download arrow in its corner, and the large view of a table or a drawing has one next to the close button. A menu saves it as PNG (twice the size) or SVG.
- **Charts in an answer: data charts, plots of formulas, and charts for machine learning.** Bars, lines, areas, pies and scatter plots; a plot of formulas with the derivative and the integral computed for you, the area under a curve with its value, and marked roots and extrema (a mathematics exercise can be answered with all its graphs); histograms, confusion and correlation matrices, learning curves. They are drawn in the colours of the app and show the values under the pointer.
- **The model menu folds the models under their provider**, all folded when it opens and one open at a time, so a provider with hundreds of models no longer fills the menu.
- **A top bar for Config and Settings**, and Sources laid out like Plugins.

#### Setup and development

- **The first-run wizard finds the models already on the computer**, downloads everything at once and shows how far all of it is.
- **One version of the app with everything on**; a release picks what it shows.
- **`make dev` keeps your data between starts** and builds the backend with the native OCR when there is a C compiler; `make dev-reset` forgets the dev install completely.
- **The first-run setup connects a model.** A new step after the welcome lists the providers built into the runtime, takes the API key (or the address of a local Ollama), saves it, makes it the default and loads its models. It can be skipped, and a computer that already has a provider shows it as connected. Before, the setup ended on an app that could not answer until a provider was added in Config.
- **The key is checked before it is saved.** A new `POST /settings/providers/check-key` asks the provider for its model list with the key and says `ok`, `rejected`, `unreachable` or `unchecked`; nothing is stored and the key is in no message. The setup step refuses a rejected key with the provider's verdict and offers "Save anyway" when the provider could not be asked.
- **A clearer first-run setup.** A labeled step bar replaces the dots, the download shows its speed and the time left, a component left unticked says it can be added later in Config, and the last screen lists what is still to do when no model was connected.

### Changed

- **Knowledge is reached from the Store only.**
- **Models and sources of Knowledge are in its own pages**, and the agents are managed next to the skills.
- **Providers are foldable and searchable in Config > Models, and the default model applies.** A new conversation takes the default model once every provider that could give it has answered.
- **Tool rows stay closed while their tool runs** (chat and Ask). A row opens when its tool failed, when it is a question waiting for your answer, or on a click.
- **Web search and web fetch open inline in the chat**, under their row, instead of in the session panel. The card is the same (the selected results, the fetched page) and the row opens and closes with a click; it stays closed while the tool runs and opens when the tool failed.
- **The session cards (Environment, Context, Activity) sit beside the chat** instead of in a framed panel: no border, no shadow, no handle to resize them, the background of the chat, and a fixed narrow width. A panel with a document, a file or a terminal keeps its frame.
- **seshat-runtime v1.12.4.** It fixes GO-2026-6866 and GO-2026-6860 in `golang.org/x/net`, which are reached when web pages or HTML documents are read, and moves `x/crypto`, `x/sys`, `x/sync` and `x/text` with it.
- **The conversation is wider, and the messages and the composer have exactly the same width.** The default width goes from 768 to 1100 px (Narrow 820, Wide 1280), so tables and drawings have room, and the composer lines up with the answers. It is still capped, so a large window is not filled.

### Fixed

- **The first-run setup tells the truth about what it downloads.** The total now counts the engines that run the models (llama.cpp, whisper.cpp) when they are not on the computer yet, the welcome no longer promises two choices when there are three, macOS says why local dictation is missing, and a failed download can be tried again from the last screen without redoing the others. The Windows installer text names the three features and says it downloads nothing itself.
- **The arrows of an architecture drawing keep clear of the boxes.** They go around the titles and items in their way, climb to the panel when an item is boxed in, no longer run over each other, and their labels (now at most two lines) stay off the text of the boxes and of the other arrows.
- **Ask answered "No passage found" with every model.** The Knowledge agent was never given its two tools (the client built for a turn started from the engine's own tools), so the request carried none and GLM models wrote their call as text. The agent now has them.
- **Ask conversations are kept apart from the chat's** after a restart; they used to be created without telling the server which view they came from.
- **A store fault is no longer reported as "file not found"**, and a file that is retried is shown as indexing.
- **A file that crashes the app is not started again for ever.**
- **A document opened from Knowledge closes when the page changes**, and the presentation viewer fills the right panel.
- **The model field of Config > Search shows every model of the provider**, not one.
- **Individual SeshatCloud accounts and the person of a local device manage their own Knowledge**; sign out is disabled on the local workspace.
- **A web search provider is tested with what is typed**, before saving.
- **`source_path` is added to the documents of existing databases.**
- **A citation names its document by its file name**, not only its collection; the search now names the file even when the index kept no name with the passage.
- **A citation to a document that was removed still shows the passage**, with a note saying the document is no longer in the collection, instead of failing to open.
- **The OCR models are checked after download.** Each model file is pinned to a revision and a SHA-256; a file that is not the expected one is refused and not kept.
- **A file named in a rich answer opens, and never starts a program.** A file reference of a project opens in the Files panel when the system cannot open it; a program or script (`.exe`, `.bat`, `.sh`, `.msi`, `.lnk` and the like) is never opened from an answer, and only web links (`http`, `https`) are followed. A button or a choice shows what it will send or open when hovered.
- **The public build shows Knowledge, the Store and sources**; accounts and the cloud are hidden.
- **macOS and unsigned installers are said plainly.** The macOS image is marked experimental and has no built-in OCR for scans yet (Indra can read them); the installers are not signed, and the README explains the first launch.
- **Dependencies:** `npm audit fix` applied to the desktop lockfile.

## [0.1.2] - 2026-10-23

First public release: the assisted Windows installer (and AppImage and deb for Linux, experimental macOS images), a first-run wizard that offers the title model and voice dictation, Images and Audio pages in Config, local Whisper, the `present_artifact` tool, and inline media in the chat.
