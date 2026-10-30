# The Knowledge agent

The agent behind the Ask view of the Knowledge platform. It answers a question from the documents the person can read, with the passages cited, and says so when they do not answer. Product side: `docs/produits/knowledge/ask-specification.md` in the `seshat-ai` repository.

![The Knowledge agent workflow: composer, chat session, built-in agent with its prompt and two tools, one turn of searches against the knowledge backend, citations drawn in the Ask view](img/knowledge-agent-workflow.svg)

Code: `seshat-backend/internal/knowledge/agent/` (definition and prompt), `internal/knowledge/tool/` (its one tool), `internal/agents/service.go` (resolution), `internal/query/service.go` (what the host adds or leaves out).

## It is built in

The agent is defined in code, not stored. `agents.Service.GetDefinition` returns it before it looks at stored agents, organization presets and the runtime registry, and `Create` refuses the slug `knowledge`. A user-defined agent or an organization preset therefore cannot take its place and change what it may do. A conversation talks to it with `agent_slug: "knowledge"`.

This is a limit on the agent, not the way access is decided. Who may read a document is decided by the knowledge backend per person (local, or SeshatCloud in connected mode), whatever the agent asks for.

## Tools

Exactly two, both read only, no permission prompt:

| Tool | What it does |
|---|---|
| `knowledge_search` | Searches the collections the person can read, or one (`corpus_id`), and returns ranked excerpts, each with a `ref`. |
| `knowledge_read` | Reads one document by the file name a search shows (`file=...`): whole in windows of 12000 characters (`offset` reads on), or by `pages` for a PDF. |

The session is pruned to this list (`applyToolAllowlist`), so the agent has no shell, no files, no browser, no web, no MCP, no memory tools and no `tool_search` to find more. The list is exact names: a glob would fail open (`toolAllowlistFromPatterns`). A tool is added by a decision and a test (`internal/knowledge/agent/agent_test.go`).

**Why `knowledge_read` and not the runtime's `Read`.** `Read` takes any absolute path of the machine. An agent with it could read what the person never put in a collection (an SSH key, another project), and an excerpt that carries an instruction could send it there. `knowledge_read` takes the name of a document, looks for it among the collections the person can read (the one chosen for the conversation wins over what the model asks for), and fetches the bytes through the knowledge backend (`DownloadFile`), which decides per person what may be read, locally and in connected mode. A path, `../` or a file of no collection is answered "no document named". Text formats are read as they are; PDF, Office and HTML go through the runtime's `documentreading` (native extraction, no external converter).

Planned, not built: a tool to list collections and documents.

## What the host does not add

For other agents the host appends blocks to the system prompt. For this one it leaves out:

- the rendering block (it teaches `write_file`, which the agent does not have) and the narration block ("say what you are about to do before a tool call": the interface already shows the search);
- the block on where the agent runs (the prompt says it) and the generic internal knowledge block (it asks not to number sources, the opposite of what this agent does);
- the person's memories and long-term memory (an answer must come from documents, not from what the person once said);
- the pre-searched corpus (`corpus_id` on the request): the agent searches by itself and the interface gets its sources from the tool result.

The person's preferences block is kept (language, tone).

## Scope

The Ask composer lets the person limit a question to one collection. It is sent as the `corpus_id` of the request, together with `agent_slug: "knowledge"` (`withKnowledgeScope` in `internal/api/query.go`). The limit is **applied by the tool, not asked of the model**: `knowledge.WithScope` puts the collection in the context of the turn, and `knowledge_search` uses it instead of whatever `corpus_id` the model passes, or none. Whether the person may read that collection is still decided by the backend on every search.

The agent is told what the limit means (`knowledgeagent.ScopeBlock`): an empty result is "nothing in this collection", not "nothing in the organization", and the person can widen the question. The tool says the same in its own "nothing found" answer. For any other agent `corpus_id` keeps its existing meaning (a corpus pre-searched into the prompt).

## Citations

`knowledge_search` introduces each excerpt like this:

```text
[1] ref=k7f3a91 score=0.8123 corpus=Legal file=Supplier contract template.docx pages=12 section="Termination"
```

`ref` is `k` and six hexadecimal digits (seven characters) taken from the corpus and the key of the chunk (`tool.Ref`): the same excerpt has the same ref every time, and a ref cannot be guessed from the text. The prompt tells the agent to write the ref in square brackets after each sentence that rests on an excerpt, and never to write file names or pages itself. The interface finds the excerpt again from the tool result and draws the citation, so a ref that matches no result is dropped and a source cannot be invented.

`pages` and `section` come from the chunk metadata (`page_numbers`, `heading_path`), when the document had them.

## In the desktop

The Ask view of the Knowledge page (`seshat-desktop/src/renderer/pages/knowledge/`) is a conversation of the chat with this agent, not a separate engine. `useKnowledgeConversation` creates a session with the default model, sends each question through the chat hook (`useChat`) with `agentSlug: "knowledge"` and the chosen collection as `corpusId`, and the chat engine streams, stops and keeps the history.

The view reads the messages of the chat: `knowledgeSearchResults.ts` parses the text `knowledge_search` returns (the format above), `askTurns.ts` turns the messages into questions, excerpts and answers, and `answerText.ts` turns each `[ref]` the agent wrote into a citation chip, dropping a ref that matches no excerpt. Because the parser reads the text the tool writes, a change to that text (`formatResults` in `internal/knowledge/tool`) must change `knowledgeSearchResults.test.ts` with it.

What the view cannot show yet: the document itself (a click on a citation opens the passage the agent read, with its file, pages and section), the source system and the date of the file, and a history of past conversations.

## Current limits

What the system cannot do or cannot guarantee today, by where it shows. The fix is named when it lives in the runtime or in SeshatCloud.

### The agent and its prompt

1. **The prompt is not checked on a real model.** The cases to run: answer found, partial, nothing found, two documents that disagree, an excerpt that contains an instruction, a question that needs `knowledge_read`. Until then the citation format and the "four searches" rule are intentions, not measured behaviour.
2. **The search effort is not enforced.** The prompt allows four searches; nothing counts them. *Runtime:* a per-agent budget of tool calls (an agent definition has `MaxTurns`, not a limit per tool).
3. **A citation proves that a ref exists, not that it supports the sentence.** The interface drops a ref that matches no result; it cannot tell that a real ref was put after a sentence it does not support, nor that a sentence has no citation at all.
4. **Text read with `knowledge_read` has no ref.** The agent is told to cite the search excerpt that points to the same place, or to say it without a citation. A claim that rests only on a read window therefore has no chip. *Fix:* give each read window a ref, and let the interface map it.
5. **Prompt injection is defended by instruction only.** Excerpts and read text are framed as reference material, but nothing filters them. The impact is bounded (two read-only tools, scoped, per-person access), not removed: an injected text can still change what the agent says.
6. **Models.** The agent uses the person's default model. A small model may ignore the `[ref]` format or search too little; there is no model chosen for this agent and no decision model yet.

### The tools

7. **`knowledge_read` finds a document by file name.** A search does not return the file id. Two files with the same name in one collection cannot be told apart (the first is read); in two collections the agent is asked to pass `corpus_id`. *Fix:* add the file id to the chunk metadata at ingestion and to the search result (a re-index for the documents already in).
8. **Every read downloads and converts the document again.** No cache; a large PDF is slow, and in connected mode the file crosses the network each time.
9. **Formats.** No external converter is wired into the tool: legacy formats (`.doc`, `.ppt`, `.xls`) and scanned PDFs without a text layer answer "could not be read". PPTX and XLSX cannot be asked by slide or sheet; only PDFs have pages. `knowledge_read` itself has no test on a real PDF or Office file yet (its tests use text files).
10. **Search is one semantic search.** No keyword or hybrid mode, no filters (document, source, date), no pagination, no document-level results, no facets; `top_k` is capped (`MaxSearchTopK`). This is the need of the Search page (SeshatCloud ADR 0007).
11. **No tool to list collections or documents.** The agent cannot browse; it can only search, then read a file it has seen.
12. **Metadata in connected mode.** SeshatCloud returns the file name, the source, the page numbers and the date of update with each result, but `internal/cloud/knowledge` decodes it into the runtime's `rag.SearchResult`, which keeps only `key`, `text`, `score` and the chunk `metadata`. Pages and headings survive; the source system, the collection of the file and its date do not. *Fix:* the decoding in this repository, and `rag.SearchResult` in the runtime if the type must grow.
13. **The result text is the contract with the interface.** The desktop parses what `formatResults` writes (`knowledgeSearchResults.ts`). A structured result next to the text would remove that coupling. *Runtime:* tool results reach the client as `Content` plus loose metadata.

### The host

14. **The scope is one collection or all.** No several collections, no single document.
15. **The two tools are registered for every session**, not only this agent's (`config/bootstrap.go`); other agents may be given them. Access is still decided by the backend.
16. **A narrowed session stays narrowed.** `applyToolAllowlist` can only unregister; the session cannot switch to another agent. A Knowledge conversation is its own session by design.
17. **The built-in slug is reserved by this repository only.** The runtime does not know it; another consumer of the runtime could define its own `knowledge`.
18. **Memory is off for this agent on purpose**: an answer must come from documents, not from what the person once said. It also means no personalisation across conversations.

### The interface

19. **A citation opens the passage, not the document.** No viewer, no page jump, no highlight (the chat's PDF, DOCX, PPTX and XLSX panels are to be reused).
20. **The view ignores `knowledge_read`.** While the agent reads, it shows "Searching"; read text appears in no card.
21. **No history of Knowledge conversations**, and its sessions also appear in the main chat sidebar.
22. **Empty state without suggestions**; no Search, Collections, Sources or Settings pages; no generative UI or charts in Ask yet.
23. **Checked on mocks only.** The Ask view has been run against mocked responses, never against a real backend and model, and not in the light theme.

### Delivery

24. **The security gate is weakened.** CI runs gosec with `-no-fail` after a pin to v2.29.0; 44 findings are not triaged. Triage them, then drop `-no-fail` and raise the pin.
