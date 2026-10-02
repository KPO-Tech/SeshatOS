import type { ComponentType, ReactNode } from 'react'
import { FileTextOne, Write, Edit as EditIcon, Search, Terminal, Tool } from '@icon-park/react'
import type { ToolUseBlock } from '@renderer/api/types'
import type { ToolViewProps, ToolBlockProps } from './types'
import { basename } from './helpers'
import { AskUserToolView } from './renderers/AskUserToolView'
import { BashToolView } from './renderers/BashToolView'
import { BrowserToolView } from './renderers/BrowserToolView'
import { EditToolView } from './renderers/EditToolView'
import { GenericToolView } from './renderers/GenericToolView'
import { GlobToolView } from './renderers/GlobToolView'
import { GrepToolView } from './renderers/GrepToolView'
import { ImageGenToolView } from './renderers/ImageGenToolView'
import { JsonToolView } from './renderers/JsonToolView'
import { ListDirectoryToolView } from './renderers/ListDirectoryToolView'
import { MathToolView } from './renderers/MathToolView'
import { McpToolView } from './renderers/McpToolView'
import { NotebookToolView } from './renderers/NotebookToolView'
import { PatchToolView } from './renderers/PatchToolView'
import { ProseToolView } from './renderers/ProseToolView'
import { RagSearchToolView } from './renderers/RagSearchToolView'
import { ReadToolView } from './renderers/ReadToolView'
import { SttToolView } from './renderers/SttToolView'
import { TtsToolView } from './renderers/TtsToolView'
import { WebFetchToolView } from './renderers/WebFetchToolView'
import { WebSearchToolView } from './renderers/WebSearchToolView'
import { WriteToolView } from './renderers/WriteToolView'

// The single place that answers "what does tool X look like in the chat" -
// label, category, whether it gets a terse status line instead of a full
// card, whether it can fold into a collapsed multi-tool run, what its full
// card body renders as, and (for the terse line) what one-line snippet to
// show next to it. All of this used to live in four separately-maintained
// places (renderBody.tsx's switch, helpers.tsx's toolLabel/toolIcon/
// inputSnippetForSilent, SilentToolView's own LABELS dict duplicating
// toolLabel, quietGroupPhrase.ts's SILENT_TOOLS/NOT_GROUPABLE/categoryFor/
// specificSingleLabel) - fixing or adding a tool meant remembering to touch
// up to 5 files, and nothing enforced they agreed with each other (they'd
// already drifted - e.g. enter_worktree/exit_worktree only existed in
// SilentToolView's LABELS, and list_directory had no entry there at all and
// silently fell back to showing its raw snake_case name). One entry per
// tool name here, everything about its display co-located, is the fix.
//
// Tools with no entry get sensible defaults (see DEFAULTS below) - most of
// the ~110 tools the engine registers need no customization at all and are
// intentionally not listed here.

export type ToolCategory = 'read' | 'search' | 'edit' | 'write' | 'bash' | 'other'

export type ToolViewComponent = ComponentType<ToolViewProps & { onSubmitPrompt?: ToolBlockProps['onSubmitPrompt'] }>

export type ToolDisplayEntry = {
  /** Static label - PermissionCard, the collapsed-group "other" bucket, and SilentToolView's status line all read this. */
  label: string
  category?: ToolCategory
  /** Terse status line (SilentToolView) instead of a full card - no user-visible input/output worth showing. */
  silent?: boolean
  /** Can fold into a collapsed multi-tool run (QuietToolGroup). Defaults true. */
  groupable?: boolean
  /** Full-card body when expanded. Omitted -> GenericToolView (raw input/output JSON). */
  render?: ToolViewComponent
  /** One-line value shown next to the label in the silent/terse view. */
  snippet?: (tool: ToolUseBlock) => string
  /** Custom summary for the solo/quiet-group line (e.g. "Read foo.py"). Falls back to label when null/omitted. */
  soloLabel?: (tool: ToolUseBlock) => string | null
}

const DEFAULTS = {
  category: 'other' as ToolCategory,
  silent: false,
  groupable: true,
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function str(tool: ToolUseBlock, key: string): string {
  return typeof tool.input[key] === 'string' ? (tool.input[key] as string) : ''
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\n/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

function editStats(tool: ToolUseBlock): { added: number; removed: number } | null {
  const meta = tool._result?.metadata
  if (meta && typeof meta.lines_added === 'number' && typeof meta.lines_removed === 'number') {
    return { added: meta.lines_added as number, removed: meta.lines_removed as number }
  }
  return null
}

function fileEditSoloLabel(verb: 'Edited' | 'Wrote') {
  return (tool: ToolUseBlock): string | null => {
    const filePath = str(tool, 'file_path')
    const stats = editStats(tool)
    if (filePath && stats) return `${verb} ${basename(filePath)} +${stats.added} -${stats.removed}`
    if (filePath) return `${verb} ${basename(filePath)}`
    return null
  }
}

const TOOL_REGISTRY: Record<string, ToolDisplayEntry> = {
  // Sober row (a plain "Bash" label + a command/description detail, no
  // "N lines" subtitle) but still inline-foldable on running/error, unlike
  // the fully silent read/write/list_directory - see ToolLineItem.tsx's
  // isPreviewTool/isBigRow split for how "Bash" + detail is drawn without
  // the bigger card ask_user_question/mcp still get.
  bash: {
    label: 'Bash',
    category: 'bash',
    render: BashToolView,
  },

  ask_user_question: { label: 'Ask User', groupable: false, render: AskUserToolView },

  // File tools with no user-visible output worth showing inline.
  read: { label: 'Read', category: 'read', render: ReadToolView, silent: true, snippet: (t) => str(t, 'file_path') ? basename(str(t, 'file_path')) : '', soloLabel: (t) => str(t, 'file_path') ? `Read ${basename(str(t, 'file_path'))}` : null },
  file_read: { label: 'Read', category: 'read', render: ReadToolView, silent: true, snippet: (t) => str(t, 'file_path') ? basename(str(t, 'file_path')) : '', soloLabel: (t) => str(t, 'file_path') ? `Read ${basename(str(t, 'file_path'))}` : null },
  read_file: { label: 'Read', category: 'read', render: ReadToolView, silent: true, snippet: (t) => str(t, 'file_path') ? basename(str(t, 'file_path')) : '', soloLabel: (t) => str(t, 'file_path') ? `Read ${basename(str(t, 'file_path'))}` : null },
  list_directory: { label: 'List Directory', silent: true, render: ListDirectoryToolView, snippet: (t) => str(t, 'path') },

  edit: { label: 'Edit', category: 'edit', render: EditToolView, soloLabel: fileEditSoloLabel('Edited') },
  file_edit: { label: 'Edit File', category: 'edit', render: EditToolView, soloLabel: fileEditSoloLabel('Edited') },
  edit_file: { label: 'Edit File', category: 'edit', render: EditToolView, soloLabel: fileEditSoloLabel('Edited') },

  write: { label: 'Write', category: 'write', render: WriteToolView, soloLabel: fileEditSoloLabel('Wrote') },
  file_write: { label: 'Write File', category: 'write', render: WriteToolView, soloLabel: fileEditSoloLabel('Wrote') },
  write_file: { label: 'Write File', category: 'write', render: WriteToolView, soloLabel: fileEditSoloLabel('Wrote') },

  glob: { label: 'Glob', category: 'search', render: GlobToolView, soloLabel: (t) => { const p = str(t, 'pattern'); return p ? `Glob: ${p}` : null } },
  grep: { label: 'Grep', category: 'search', render: GrepToolView, soloLabel: (t) => { const p = str(t, 'pattern'); return p ? `Grep: ${p}` : null } },

  // Task plumbing - the live task list/status lives in the Computer
  // panel (auto-opened on task_create), not inline in the chat. These three
  // are filtered out before they ever reach this registry (see HIDDEN_TOOLS
  // in MessageItem.tsx) - no `render` here, there'd be nothing left to
  // invoke it (TaskToolView, which used to sit here, was dead code for the
  // same reason and was removed).
  task_create: { label: 'Create Task', silent: true },
  task_update: { label: 'Update Task', silent: true },
  task_list: { label: 'List Tasks', silent: true },
  task_get: { label: 'Get Task', silent: true, snippet: (t) => str(t, 'taskId') || str(t, 'task_id') || str(t, 'id') },
  task_stop: { label: 'Stop Task', silent: true, snippet: (t) => str(t, 'taskId') || str(t, 'task_id') || str(t, 'id') },
  task_output: { label: 'Task Output', silent: true, snippet: (t) => str(t, 'taskId') || str(t, 'task_id') || str(t, 'id') },

  web_search: { label: 'Web Search', groupable: false, silent: true, render: WebSearchToolView, snippet: (t) => str(t, 'query'), soloLabel: (t) => { const q = str(t, 'query'); return q ? `Web Search: ${q}` : null } },
  web_fetch: { label: 'Web Fetch', groupable: false, silent: true, render: WebFetchToolView, snippet: (t) => str(t, 'url'), soloLabel: webFetchSoloLabel },
  read_document_url: { label: 'Web Fetch', groupable: false, silent: true, render: WebFetchToolView, snippet: (t) => str(t, 'url'), soloLabel: webFetchSoloLabel },
  read_url: { label: 'Web Fetch', groupable: false, silent: true, render: WebFetchToolView, snippet: (t) => str(t, 'url'), soloLabel: webFetchSoloLabel },

  generate_image: { label: 'Generate Image', groupable: false, render: ImageGenToolView },
  text_to_speech: { label: 'Text To Speech', groupable: false, render: TtsToolView },
  speech_to_text: { label: 'Speech To Text', groupable: false, render: SttToolView },

  rag_search: { label: 'RAG Search', render: RagSearchToolView },
  // The tool Chat's agent actually uses to search every accessible corpus
  // (see seshat-backend internal/knowledge/tool) - same result shape, so it
  // shares RagSearchToolView's source cards.
  knowledge_search: { label: 'Knowledge Search', groupable: false, render: RagSearchToolView, snippet: (t) => compact(str(t, 'query'), 40) },
  rag_ingest: { label: 'Ingest', silent: true, snippet: (t) => str(t, 'corpus_id') },

  // Internal discovery & control.
  tool_search: { label: 'Tool Search', silent: true, snippet: (t) => compact(str(t, 'query'), 40) },
  // The engine's skill tool takes a `skill` field (see skillTool.go's
  // SkillInput), not `name`/`skill_name` - those never matched, which is why
  // this used to render as a bare "Skill" with no indication of which one.
  skill: {
    label: 'Skill',
    silent: true,
    snippet: (t) => {
      const name = str(t, 'skill')
      const args = str(t, 'args')
      return name ? (args ? `${name} ${args}` : name) : ''
    },
  },
  config: { label: 'Config', silent: true, snippet: (t) => str(t, 'key') },
  brief: { label: 'Brief', silent: true },

  // LSP / code assist.
  lsp: { label: 'LSP', silent: true, snippet: (t) => str(t, 'method') },
  code_complete: { label: 'Complete', silent: true, snippet: (t) => basename(str(t, 'file_path')) },

  // MCP.
  mcp: { label: 'MCP' },
  mcp_list_resources: { label: 'MCP Resources', silent: true },
  mcp_read_resource: { label: 'MCP Read', silent: true, snippet: (t) => compact(str(t, 'uri') || str(t, 'resource'), 40) },

  // Background task / agent management.
  monitor: { label: 'Monitor', silent: true, snippet: (t) => compact(str(t, 'command') || str(t, 'pid'), 40) },
  agent: { label: 'Agent' },
  wait_agent: { label: 'Wait', silent: true, snippet: agentIdSnippet },
  list_agents: { label: 'List Agents', silent: true },
  close_agent: { label: 'Close Agent', silent: true, snippet: agentIdSnippet },
  // Unlike its wait/list/close/message siblings, resume_agent's result is
  // real content worth reading (the resumed run's output + sources), not a
  // plumbing confirmation - same shape as web_fetch/web_search, a
  // groupable:false full card instead of a silent line.
  resume_agent: { label: 'Resume Agent', groupable: false, render: ProseToolView, snippet: agentIdSnippet },
  send_agent_message: { label: 'Message', silent: true, snippet: agentIdSnippet },

  // Worktree lifecycle.
  enter_worktree: { label: 'Worktree', silent: true, snippet: (t) => str(t, 'directory') || str(t, 'branch') },
  exit_worktree: { label: 'Exit Worktree', silent: true },

  // Goal tracking.
  create_goal: { label: 'Goal', silent: true, snippet: (t) => compact(str(t, 'title'), 40) },
  update_goal: { label: 'Update Goal', silent: true, snippet: (t) => compact(str(t, 'title'), 40) },
  get_goal: { label: 'Get Goal', silent: true, snippet: (t) => str(t, 'goal_id') },

  // Doc generation - no preview needed.
  docx: { label: 'Docx', silent: true, snippet: (t) => basename(str(t, 'filename') || str(t, 'path')) },

  // Messaging.
  mailbox_send: { label: 'Send', silent: true, snippet: (t) => str(t, 'recipient') || str(t, 'to') },
  mailbox_broadcast: { label: 'Broadcast', silent: true, snippet: (t) => str(t, 'topic') },

  // Plan mode - the resulting document has its own dedicated review UI
  // (PlanArtifactCard/PlanEditorPanel); SilentToolView special-cases this
  // tool further (live plan name/status) beyond this static label fallback.
  // `render` only matters for the paths that fall/never made a live plan
  // available (still running, or errored) - ProseToolView gives those a
  // clean prose Error section instead of a raw text dump.
  submit_plan: { label: 'Submit Plan', silent: true, render: ProseToolView },

  // Browser (18 tools, one shared body renderer).
  ...Object.fromEntries(
    [
      'browser_open', 'browser_navigate', 'browser_snapshot', 'browser_extract',
      'browser_list_pages', 'browser_network_list', 'browser_list_downloads',
      'browser_search_content', 'browser_get_network_policy', 'browser_set_network_policy',
      'browser_select_page', 'browser_close_page', 'browser_click', 'browser_type',
      'browser_press', 'browser_scroll', 'browser_wait', 'browser_screenshot',
    ].map((name): [string, ToolDisplayEntry] => [name, { label: humanize(name), render: BrowserToolView }]),
  ),

  // --- Below: the ~50 tools that used to have no entry at all and fell
  // through to GenericToolView (raw `tool.input` JSON + raw `result.content`
  // dump, always shown, on every successful call - the "texte brut" this
  // pass fixes). Two treatments only, per the rule this codebase now
  // follows: either the result is pure plumbing/confirmation and gets
  // `silent: true` (nothing worth reading unless it failed), or it's real
  // content and gets one of the shared renderers below (ProseToolView for
  // readable text, JsonToolView for structured JSON, MathToolView/
  // PatchToolView for their one specific shape) instead of a bespoke
  // one-off component per tool.

  // Bash job-control siblings of bash/monitor - background job lifecycle,
  // not itself worth a card unless it failed.
  write_stdin: { label: 'Write Stdin', category: 'bash', silent: true, snippet: (t) => str(t, 'job_id') },
  job_output: { label: 'Job Output', category: 'bash', silent: true, snippet: (t) => str(t, 'job_id') },
  job_kill: { label: 'Kill Job', category: 'bash', silent: true, snippet: (t) => str(t, 'job_id') },

  // File plumbing - a confirmation line, same bucket as list_directory/read.
  create_directory: { label: 'Create Directory', silent: true, snippet: (t) => str(t, 'path') },
  remove_file: { label: 'Remove File', silent: true, snippet: (t) => str(t, 'path') },
  get_file_metadata: { label: 'File Metadata', silent: true, snippet: (t) => str(t, 'path') },
  apply_patch: { label: 'Apply Patch', category: 'edit', render: PatchToolView },

  // Notebook (7 tools) - each already returns a human-formatted summary in
  // .content (a cell dump, a per-op result list, kernel status) rather than
  // structured fields worth a bespoke layout; the fix is dropping the raw
  // input-JSON dump and showing that text as prose.
  notebook_create: { label: 'Create Notebook', render: NotebookToolView, snippet: (t) => basename(str(t, 'notebook_path') || str(t, 'path')) },
  notebook_read: { label: 'Read Notebook', category: 'read', render: NotebookToolView, snippet: (t) => basename(str(t, 'notebook_path') || str(t, 'path')) },
  notebook_write: { label: 'Write Notebook', category: 'write', render: NotebookToolView, snippet: (t) => basename(str(t, 'notebook_path') || str(t, 'path')) },
  notebook_edit: { label: 'Edit Notebook', category: 'edit', render: NotebookToolView, snippet: (t) => basename(str(t, 'notebook_path') || str(t, 'path')) },
  notebook_execute: { label: 'Execute Notebook', render: NotebookToolView, snippet: (t) => basename(str(t, 'notebook_path') || str(t, 'path')) },
  notebook_run: { label: 'Run Notebook Cell', render: NotebookToolView },
  notebook_kernel: { label: 'Notebook Kernel', render: NotebookToolView },

  // Plan mode support tools - no user-facing input/output of their own
  // (enter_plan_mode/exit_plan_mode never even reach this registry, see
  // HIDDEN_TOOLS in MessageItem.tsx).
  request_permissions: { label: 'Request Permissions', silent: true, snippet: (t) => str(t, 'scope') },

  // Skills introspection - real markdown content worth reading, not data.
  seshat_list_skills: { label: 'List Skills', render: ProseToolView },
  seshat_read_skill: { label: 'Read Skill', render: ProseToolView, snippet: (t) => str(t, 'name') || str(t, 'slug') },
  seshat_validate_skill: { label: 'Validate Skill', render: ProseToolView, snippet: (t) => str(t, 'name') || str(t, 'slug') },

  // Long-term memory - create/add are confirmation-shaped plumbing; the two
  // lookups return an actual entity/relation graph worth reading.
  memory_create_entities: { label: 'Create Entities', silent: true },
  memory_add_observations: { label: 'Add Observations', silent: true },
  memory_search_nodes: { label: 'Search Memory', category: 'search', render: JsonToolView, soloLabel: (t) => { const q = str(t, 'query'); return q ? `Search Memory: ${q}` : null } },
  memory_open_nodes: { label: 'Open Memory Nodes', category: 'search', render: JsonToolView },

  // Goal tracking - see create_goal/update_goal/get_goal above (already
  // silent). Agent control (wait_agent/list_agents/close_agent/
  // send_agent_message/resume_agent) is likewise already covered above.

  // Automation daemon (schedule/list/update/run return raw job JSON;
  // delete/pause/resume are one-line confirmations).
  schedule_job: { label: 'Schedule Job', render: JsonToolView, soloLabel: (t) => { const n = str(t, 'name'); return n ? `Schedule Job: ${n}` : null } },
  list_jobs: { label: 'List Jobs', render: JsonToolView },
  update_job: { label: 'Update Job', render: JsonToolView },
  run_job_now: { label: 'Run Job', render: JsonToolView },
  delete_job: { label: 'Delete Job', silent: true, snippet: (t) => str(t, 'job_id') || str(t, 'id') },
  pause_job: { label: 'Pause Job', silent: true, snippet: (t) => str(t, 'job_id') || str(t, 'id') },
  resume_job: { label: 'Resume Job', silent: true, snippet: (t) => str(t, 'job_id') || str(t, 'id') },

  // Math (4 tools) - a short expression/operation in, a result out.
  calculator: { label: 'Calculator', render: MathToolView, soloLabel: (t) => { const e = str(t, 'expression'); return e ? `Calculator: ${e}` : null } },
  unit_convert: { label: 'Unit Convert', render: MathToolView },
  statistics: { label: 'Statistics', render: MathToolView },
  financial_calc: { label: 'Financial Calc', render: MathToolView },

  // Social feeds - genuinely readable text, same treatment as skills docs.
  hn_stories: { label: 'HN Stories', category: 'search', render: ProseToolView },
  hn_item: { label: 'HN Item', category: 'search', render: ProseToolView },
  hn_search: { label: 'HN Search', category: 'search', render: ProseToolView, soloLabel: (t) => { const q = str(t, 'query'); return q ? `HN Search: ${q}` : null } },
  devto_feed: { label: 'Dev.to Feed', category: 'search', render: ProseToolView },
  devto_article: { label: 'Dev.to Article', category: 'search', render: ProseToolView },
  devto_publish: { label: 'Publish to Dev.to', silent: true, snippet: (t) => str(t, 'title') },

  // VCS/notifications - stubs (IsEnabled=false, Call() always errors) until
  // implemented; silent keeps them as a plain line that only opens on the
  // stub's own error text, same as any other failed silent tool.
  git_status: { label: 'Git Status', category: 'other', silent: true },
  git_log: { label: 'Git Log', category: 'other', silent: true },
  git_diff: { label: 'Git Diff', category: 'other', silent: true },
  git_commit: { label: 'Git Commit', category: 'other', silent: true },
  git_branch: { label: 'Git Branch', category: 'other', silent: true },
  slack_send: { label: 'Slack Send', silent: true },
  discord_send: { label: 'Discord Send', silent: true },
  telegram_send: { label: 'Telegram Send', silent: true },
  email_send: { label: 'Email Send', silent: true },
  whatsapp_send: { label: 'WhatsApp Send', silent: true },
}

function webFetchSoloLabel(tool: ToolUseBlock): string | null {
  const url = str(tool, 'url')
  if (!url) return null
  try {
    return `Web Fetch: ${new URL(url).hostname}`
  } catch {
    return `Web Fetch: ${url}`
  }
}

function agentIdSnippet(tool: ToolUseBlock): string {
  return str(tool, 'agent_id') || str(tool, 'agentId')
}

// mcp__<server>__<tool> tool names are dynamic (one per server/tool pair the
// user has connected) - can't be static registry keys, so they're resolved
// here instead of via TOOL_REGISTRY lookup.
function mcpDynamicLabel(name: string): string {
  const rest = name.slice('mcp__'.length)
  const sepIndex = rest.indexOf('__')
  const server = sepIndex >= 0 ? rest.slice(0, sepIndex) : ''
  const toolPart = sepIndex >= 0 ? rest.slice(sepIndex + 2) : rest
  const readableTool = toolPart.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  return server ? `${server}: ${readableTool}` : readableTool
}

function getEntry(name: string): ToolDisplayEntry | undefined {
  return TOOL_REGISTRY[name]
}

// Tools that never surface as their own chat row (mode-switches folded into
// the Computer panel, or task_create/update/list superseded by its live
// task list there — see HIDDEN_TOOLS in MessageItem.tsx) are left out of the
// catalog too: they aren't something a user would ever allow/disallow.
const CATALOG_EXCLUDED = new Set([
  'enter_plan_mode', 'exit_plan_mode',
  'enter_pair_programming_mode', 'exit_pair_programming_mode',
  'task_create', 'task_update', 'task_list',
])

export type ToolCatalogEntry = { name: string; label: string; category: ToolCategory }

// Read-only listing of every named entry in the registry, for surfaces that
// want to show "what tools exist" (Workspace's Tools tab) rather than
// display one already-invoked tool_use. mcp__server__tool names are dynamic
// (one per connected server) and never appear here — only the static
// built-in catalog does.
export function listToolCatalog(): ToolCatalogEntry[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([name]) => !CATALOG_EXCLUDED.has(name))
    .map(([name, entry]) => ({ name, label: entry.label, category: entry.category ?? DEFAULTS.category }))
}

export function toolLabel(name: string): string {
  if (name.startsWith('mcp__')) return mcpDynamicLabel(name)
  return getEntry(name)?.label ?? humanize(name)
}

export function toolCategory(name: string): ToolCategory {
  return getEntry(name)?.category ?? DEFAULTS.category
}

// The timeline row icon for a tool_use, by category - not by exact tool
// name (that's toolIcon in helpers.tsx, used for PermissionCard's more
// specific per-tool icon). One glance at the icon now says *what kind* of
// step this was (read/write/edit/search/bash/other) instead of every row
// looking the same status dot regardless of what it actually did.
const CATEGORY_ICON: Record<ToolCategory, ReactNode> = {
  read: <FileTextOne size={12} />,
  write: <Write size={12} />,
  edit: <EditIcon size={12} />,
  search: <Search size={12} />,
  bash: <Terminal size={12} />,
  other: <Tool size={12} />,
}

export function categoryIcon(name: string): ReactNode {
  return CATEGORY_ICON[toolCategory(name)]
}

export function isSilentTool(name: string): boolean {
  return getEntry(name)?.silent ?? DEFAULTS.silent
}

// Whether this tool has a dedicated full-card renderer worth opening even
// when it succeeded (used by SilentToolView to decide whether a silent
// line's status click should do anything beyond the error case every silent
// tool already gets - see its own comment for why that split exists).
export function hasCustomRender(name: string): boolean {
  return getEntry(name)?.render != null
}

export function isGroupable(name: string): boolean {
  return getEntry(name)?.groupable ?? DEFAULTS.groupable
}

export function isEditTool(name: string): boolean {
  return toolCategory(name) === 'edit'
}

export function isWriteTool(name: string): boolean {
  return toolCategory(name) === 'write'
}

// read/write/edit are the only categories whose content is "a file" - see
// FilesPanel.tsx, which is where a click on one of these opens instead of
// Computer (everything else keeps opening there).
export function isFileTool(name: string): boolean {
  const category = toolCategory(name)
  return category === 'read' || category === 'write' || category === 'edit'
}

// agent/spawn_agent dispatch a sub-agent - their own progress belongs to the
// SubagentPanel (opened by clicking the agent card), not Computer.
const AGENT_TOOLS = new Set(['agent', 'spawn_agent'])

export function isAgentTool(name: string): boolean {
  return AGENT_TOOLS.has(name)
}

export function toolSnippet(tool: ToolUseBlock): string {
  return getEntry(tool.name)?.snippet?.(tool) ?? ''
}

export function toolSoloLabel(tool: ToolUseBlock): string | null {
  return getEntry(tool.name)?.soloLabel?.(tool) ?? null
}

// Full-card body dispatch, used by both ToolBlock (full card) and
// QuietGroupItem (grouped, per-item expansion) so the two rendering
// surfaces never fall out of sync with each other. mcp__* tool names are
// dynamic and can't be registry keys, so they're checked ahead of the
// registry lookup, same as toolLabel above.
export function renderToolBody(props: ToolViewProps, onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']) {
  const { tool } = props
  if (tool.name.startsWith('mcp__') || tool.name === 'mcp') {
    return <McpToolView {...props} />
  }
  const Render = getEntry(tool.name)?.render ?? GenericToolView
  return <Render {...props} onSubmitPrompt={onSubmitPrompt} />
}
