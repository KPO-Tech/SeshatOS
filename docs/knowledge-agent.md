# The Knowledge agent

The agent behind the Ask view of the Knowledge platform. It answers a question from the documents the person can read, with the passages cited, and says so when they do not answer. Product side: `docs/produits/knowledge/ask-specification.md` in the `seshat-ai` repository.

Code: `seshat-backend/internal/knowledge/agent/` (definition and prompt), `internal/knowledge/tool/` (its one tool), `internal/agents/service.go` (resolution), `internal/query/service.go` (what the host adds or leaves out).

## It is built in

The agent is defined in code, not stored. `agents.Service.GetDefinition` returns it before it looks at stored agents, organization presets and the runtime registry, and `Create` refuses the slug `knowledge`. A user-defined agent or an organization preset therefore cannot take its place and change what it may do. A conversation talks to it with `agent_slug: "knowledge"`.

This is a limit on the agent, not the way access is decided. Who may read a document is decided by the knowledge backend per person (local, or SeshatCloud in connected mode), whatever the agent asks for.

## Tools

Exactly one, read only, no permission prompt:

| Tool | What it does |
|---|---|
| `knowledge_search` | Searches the collections the person can read, or one (`corpus_id`), and returns ranked excerpts. |

The session is pruned to this list (`applyToolAllowlist`), so the agent has no shell, no files, no browser, no web, no MCP, no memory tools and no `tool_search` to find more. The list is exact names: a glob would fail open (`toolAllowlistFromPatterns`). A tool is added by a decision and a test (`internal/knowledge/agent/agent_test.go`).

Planned, not built: a tool to read a document or a range of pages, a tool to list collections and documents.

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
[1] ref=k7f3a9 score=0.8123 corpus=Legal file=Supplier contract template.docx pages=12 section="Termination"
```

`ref` is `k` and six hexadecimal digits taken from the corpus and the key of the chunk (`tool.Ref`): the same excerpt has the same ref every time, and a ref cannot be guessed from the text. The prompt tells the agent to write the ref in square brackets after each sentence that rests on an excerpt, and never to write file names or pages itself. The interface finds the excerpt again from the tool result and draws the citation, so a ref that matches no result is dropped and a source cannot be invented.

`pages` and `section` come from the chunk metadata (`page_numbers`, `heading_path`), when the document had them.

## Open points

- **Metadata in connected mode.** SeshatCloud's search returns the file name, the source, the page numbers and the date of update next to each result, but `cloud/knowledge` decodes the response into the runtime's `rag.SearchResult`, which keeps only `key`, `text`, `score` and the chunk `metadata`. Pages and headings survive in the metadata; the source system, the collection of the file and its date of update do not reach the agent. The interface needs them for the citation card: to add before Ask is connected to SeshatCloud.
- **Instruction following.** The prompt is not checked against real questions. A small set (answer found, partial, nothing found, two documents that disagree, an excerpt that contains an instruction) is to be run on a real model before this agent is shown to anyone.
- **Search effort.** The prompt allows four searches. Nothing enforces it.
