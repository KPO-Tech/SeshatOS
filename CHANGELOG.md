# Changelog

All notable changes to SeshatOS are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The runtime that powers the agents has its own changelog in [seshat-runtime](https://github.com/KPO-Tech/seshat-runtime/blob/main/CHANGELOG.md); the version this app uses is named here when it changes something you can see.

---

## [Unreleased]

### Added

#### Knowledge

- **A Knowledge platform inside the app, reached from the Store.** It has its own sidebar with Ask, Search, Collections, Sources and Settings.
- **Sources and collections.** Collections live inside the source they come from. A source can be given an icon and renamed. A folder of this computer is analysed into proposed collections that you can rename, merge or remove before creating them, and the documents of a folder source are indexed. The documents of a collection can be read in place, with an Index button that shows the passages a document was cut into, as Markdown.
- **Reading scanned documents without a server.** The OCR models download from the app, the language pack is chosen in a Documents section of Config (and offered in the first-run wizard), and a document that could not be read says why.
- **Search.** A page with filters by collection and kind. Before any search it lists the documents a page at a time. A search by words works without any model, and a query that holds a code or an identifier is searched by its words alone.
- **A result opens its document where the passage is.** Clicking a result opens the document in the right panel on the page of the best passage, with that passage marked in the PDF. The other passages that matched are buttons under the result. The results are laid out by the width they have (list or grid), the sort control is the app's own menu, and clearing the search closes the document.
- **Ask.** A conversation with a built-in Knowledge agent that answers from the documents you can read, with two read-only tools (search and read a document). Its messages, thinking and tool calls are drawn by the chat's own components. The header shrinks once a conversation starts, the chat icon opens the history of your questions (continue or delete), and the column on the right shows the context with its automatic compaction, the environment and the activity.
- **Citations that open the document.** A citation in an answer is a chip; clicking it opens the document on the cited page with the passage marked, and a document of the list under the answer opens on its page. Conversations from before this also work. Hovering a chip shows the passage, and the card fits the room there is.
- **Config > Search.** The embedding model and the rerank model can be set up (OpenRouter included, and the key of a provider you already set up is used as it is). Several rerank models can be kept and the one in use chosen. The embedding model changes without restarting the app, and **Re-embed** makes the vectors again from the stored text when the model changed.

#### Chat

- **Sources under a chat answer.** The pages the agent consulted are listed once each, folded, and the links to them in the text become citations.
- **The agent's thinking stays folded while it is written, and shows how long it took.** The time is counted in seconds at the right of the row while the thought is being written, and kept when it ends.
- **Rich answers.** The agent can answer with drawn components (tables, figures, steps, notes) that fill in while the answer streams. It is on by default and can be turned off in Config > Agents > Answers.
- **Architecture drawings in an answer.** The agent can draw a system as coloured panels holding items with icons (generic icons and technology logos), with arrows between them.
- **The model menu folds the models under their provider**, all folded when it opens and one open at a time, so a provider with hundreds of models no longer fills the menu.
- **A top bar for Config and Settings**, and Sources laid out like Plugins.

#### Setup and development

- **The first-run wizard finds the models already on the computer**, downloads everything at once and shows how far all of it is.
- **One version of the app with everything on**; a release picks what it shows.
- **`make dev` keeps your data between starts** and builds the backend with the native OCR when there is a C compiler; `make dev-reset` forgets the dev install completely.

### Changed

- **Knowledge is reached from the Store only.**
- **Models and sources of Knowledge are in its own pages**, and the agents are managed next to the skills.
- **Providers are foldable and searchable in Config > Models, and the default model applies.** A new conversation takes the default model once every provider that could give it has answered.
- **Tool rows stay closed while their tool runs** (chat and Ask). A row opens when its tool failed, when it is a question waiting for your answer, or on a click.
- **seshat-runtime v1.12.4.** It fixes GO-2026-6866 and GO-2026-6860 in `golang.org/x/net`, which are reached when web pages or HTML documents are read, and moves `x/crypto`, `x/sys`, `x/sync` and `x/text` with it.

### Fixed

- **Ask answered "No passage found" with every model.** The Knowledge agent was never given its two tools (the client built for a turn started from the engine's own tools), so the request carried none and GLM models wrote their call as text. The agent now has them.
- **Ask conversations are kept apart from the chat's** after a restart; they used to be created without telling the server which view they came from.
- **A store fault is no longer reported as "file not found"**, and a file that is retried is shown as indexing.
- **A file that crashes the app is not started again for ever.**
- **A document opened from Knowledge closes when the page changes**, and the presentation viewer fills the right panel.
- **The model field of Config > Search shows every model of the provider**, not one.
- **Individual SeshatCloud accounts and the person of a local device manage their own Knowledge**; sign out is disabled on the local workspace.
- **A web search provider is tested with what is typed**, before saving.
- **`source_path` is added to the documents of existing databases.**

## [0.1.2] - 2026-10-23

First public release: the assisted Windows installer (and AppImage and deb for Linux, experimental macOS images), a first-run wizard that offers the title model and voice dictation, Images and Audio pages in Config, local Whisper, the `present_artifact` tool, and inline media in the chat.
