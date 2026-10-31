# Changelog

All notable changes to SeshatOS are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The runtime that powers the agents has its own changelog in [seshat-runtime](https://github.com/KPO-Tech/seshat-runtime/blob/main/CHANGELOG.md); the version this app uses is named here when it changes something you can see.

---

## [Unreleased]

### Added

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
