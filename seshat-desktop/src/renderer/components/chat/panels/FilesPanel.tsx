import { useEffect, useMemo, useState } from 'react'
import { Close, FileTextOne, Folder, FolderOpen, HamburgerButton, Right } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { isFileTool, toolCategory, toolLabel } from '@renderer/components/chat/tools/toolDisplay'
import { basename, languageForPath, parseReadToolContent } from '@renderer/components/chat/tools/helpers'
import { CodeBox, ErrorPre, Section } from '@renderer/components/chat/tools/common'
import { DiffView, resolveDiffRows } from '@renderer/components/chat/tools/DiffView'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { EmptyState } from './EmptyState'
import { WindowCloseIcon, WindowMaximizeIcon } from '@renderer/components/ui/WindowControlIcon'
import type { StreamingBlock } from '@renderer/stores/session'
import type { Message, ToolUseBlock } from '@renderer/api/types'

const EMPTY_MESSAGES: Message[] = []

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type FilesTab =
  | { id: string; kind: 'tool'; tool: ToolUseBlock }
  | { id: string; kind: 'path'; path: string }

type DirEntry = { name: string; isDirectory: boolean }
type DirState = DirEntry[] | 'loading' | 'error'
type FileContentState = string | 'loading' | 'error'

function collectFileTools(messages: Message[], streaming: StreamingBlock[]): ToolUseBlock[] {
  const byId = new Map<string, { block: ToolUseBlock; order: number }>()
  let order = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool_use' || !isFileTool(block.name)) continue
      byId.set(block.id, { block, order: order++ })
    }
  }
  for (const block of streaming ?? []) {
    if (block.type !== 'tool_use' || !isFileTool(block.name)) continue
    byId.set(block.id, { block, order: order++ })
  }
  return [...byId.values()].sort((a, b) => a.order - b.order).map((entry) => entry.block)
}

function tabLabel(tab: FilesTab): string {
  if (tab.kind === 'tool') {
    const filePath = typeof tab.tool.input.file_path === 'string' ? tab.tool.input.file_path : ''
    return filePath ? basename(filePath) : toolLabel(tab.tool.name)
  }
  return basename(tab.path)
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${sep}${name}`
}

export function FilesPanel({
  sessionId,
  focusToolId,
  isMaximized,
  onClose,
  onToggleMaximize,
}: {
  sessionId: string
  focusToolId?: string
  isMaximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
}) {
  const session = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId))
  const messages = session?.messages ?? EMPTY_MESSAGES
  const streaming = useSessionStore((s) => s.getStreaming(sessionId))
  const projectPath = session?.projectPath

  // Closed by default - the root directory still loads in the background
  // below (that effect isn't gated on treeOpen), so the tree is ready the
  // instant the user clicks the burger instead of popping in empty.
  const [treeOpen, setTreeOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dirCache, setDirCache] = useState<Record<string, DirState>>({})
  const [fileContent, setFileContent] = useState<Record<string, FileContentState>>({})
  const [tabs, setTabs] = useState<FilesTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const fileTools = useMemo(() => collectFileTools(messages, streaming), [messages, streaming])

  function loadDirectory(path: string) {
    if (dirCache[path]) return
    setDirCache((prev) => ({ ...prev, [path]: 'loading' }))
    window.nexus?.fs?.listDirectory(path)
      .then((entries) => setDirCache((prev) => ({ ...prev, [path]: entries })))
      .catch(() => setDirCache((prev) => ({ ...prev, [path]: 'error' })))
  }

  useEffect(() => {
    if (projectPath) loadDirectory(projectPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  function toggleFolder(path: string) {
    const willOpen = !expanded[path]
    setExpanded((prev) => ({ ...prev, [path]: willOpen }))
    if (willOpen) loadDirectory(path)
  }

  function openToolTab(tool: ToolUseBlock) {
    // Keyed by file path (falling back to the tool id when there isn't one)
    // rather than by the tool call itself - a chunked read of a big file
    // dispatches several Read calls for the same path, and each one should
    // refresh the same tab instead of stacking a new one next to it.
    const filePath = typeof tool.input.file_path === 'string' ? tool.input.file_path : ''
    const id = filePath ? `file:${filePath}` : `tool:${tool.id}`
    setTabs((prev) => {
      if (prev.some((t) => t.id === id)) {
        return prev.map((t) => (t.id === id ? { id, kind: 'tool', tool } : t))
      }
      return [...prev, { id, kind: 'tool', tool }]
    })
    setActiveTabId(id)
  }

  function openPathTab(path: string) {
    const id = `path:${path}`
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, kind: 'path', path }]))
    setActiveTabId(id)
    if (!fileContent[path]) {
      setFileContent((prev) => ({ ...prev, [path]: 'loading' }))
      window.nexus?.fs?.readTextFile(path)
        .then((text) => setFileContent((prev) => ({ ...prev, [path]: text })))
        .catch(() => setFileContent((prev) => ({ ...prev, [path]: 'error' })))
    }
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTabId === id) setActiveTabId(next.length ? next[next.length - 1].id : null)
      return next
    })
  }

  // A tool row clicked in the chat transcript (ToolLineItem/SilentToolView)
  // opens/updates this panel with a new focusToolId instead of expanding
  // inline - pick that up even when Files was already open on something else.
  useEffect(() => {
    if (!focusToolId) return
    const tool = fileTools.find((t) => t.id === focusToolId)
    if (tool) openToolTab(tool)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToolId, fileTools])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeLabel = activeTab ? tabLabel(activeTab) : 'Files'
  const activeKindBadge = activeTab?.kind === 'tool'
    ? (toolCategory(activeTab.tool.name) === 'write' ? 'Written' : toolCategory(activeTab.tool.name) === 'edit' ? 'Edited' : 'Read')
    : activeTab?.kind === 'path' ? 'Read' : ''
  const activeKindColor = activeKindBadge === 'Written' ? 'text-app-success' : activeKindBadge === 'Edited' ? 'text-app-primary' : 'text-app-text-muted'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
      {/* Single header row: burger + file info + panel chrome, all together.
          No separate path/breadcrumb line - the tree and the tab already
          say where the file lives, repeating it a third time just for the
          folder prefix wasn't worth the extra row. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-app-border-subtle px-2.5 py-1.5">
        <button
          type="button"
          aria-label="Toggle file tree"
          onClick={() => setTreeOpen((v) => !v)}
          className={cx(
            'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border text-app-text-secondary',
            treeOpen ? 'border-app-border-subtle bg-app-surface-elevated' : 'border-transparent bg-transparent',
          )}
        >
          <HamburgerButton size={13} />
        </button>
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-app-text-muted">
          <FileTextOne size={13} />
        </span>
        <h2 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-app-text">{activeLabel}</h2>
        {activeKindBadge && (
          <span className={cx('shrink-0 text-[9px] font-bold uppercase tracking-[0.04em]', activeKindColor)}>{activeKindBadge}</span>
        )}
        <button type="button" className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-app-text-secondary hover:bg-[var(--color-hover)] hover:text-app-text" onClick={onToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
          <WindowMaximizeIcon />
        </button>
        <button type="button" className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-app-text-secondary hover:bg-[var(--color-hover)] hover:text-app-text" onClick={onClose} aria-label="Close">
          <WindowCloseIcon />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {treeOpen && (
          <div className="w-[170px] shrink-0 overflow-y-auto border-r border-app-border-subtle bg-app-bg py-1.5">
            {!projectPath ? (
              <p className="px-2.5 py-2 text-[11px] leading-normal text-app-text-muted">No project folder set for this conversation.</p>
            ) : (
              <TreeChildren
                path={projectPath}
                depth={0}
                dirCache={dirCache}
                expanded={expanded}
                activePath={activeTab?.kind === 'path' ? activeTab.path : ''}
                onToggleFolder={toggleFolder}
                onOpenFile={openPathTab}
              />
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length > 0 && (
            <div className="flex shrink-0 overflow-x-auto border-b border-app-border-subtle">
              {tabs.map((tab) => {
                const active = tab.id === activeTabId
                return (
                  <div
                    key={tab.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveTabId(tab.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTabId(tab.id) } }}
                    className={cx(
                      'flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-app-border-subtle py-1.5 pl-3 pr-1.5 text-[11.5px]',
                      active ? 'border-b-2 border-b-[var(--color-accent)] bg-app-bg text-app-text' : 'border-b-2 border-b-transparent bg-app-surface text-app-text-muted',
                    )}
                    style={{ maxWidth: 150 }}
                  >
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tabLabel(tab)}</span>
                    <button
                      type="button"
                      aria-label="Close tab"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                      className="flex size-[15px] shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text"
                    >
                      <Close size={9} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto p-2.5 [&>*]:max-w-full">
            {!activeTab ? (
              <EmptyState
                title="No file open"
                description="Click a Read, Write, or Edit call in the chat, or browse the tree on the left."
              />
            ) : (
              <FileTabContent tab={activeTab} fileContent={fileContent} sessionId={sessionId} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TreeChildren({
  path,
  depth,
  dirCache,
  expanded,
  activePath,
  onToggleFolder,
  onOpenFile,
}: {
  path: string
  depth: number
  dirCache: Record<string, DirState>
  expanded: Record<string, boolean>
  activePath: string
  onToggleFolder: (path: string) => void
  onOpenFile: (path: string) => void
}) {
  const state = dirCache[path]
  if (state === 'loading') {
    return <p className="px-2.5 py-1 text-[11px] text-app-text-muted" style={{ paddingLeft: 10 + depth * 14 }}>Loading…</p>
  }
  if (state === 'error' || !state) {
    return depth === 0 ? <p className="px-2.5 py-1 text-[11px] text-app-text-muted" style={{ paddingLeft: 10 + depth * 14 }}>Can't read this folder.</p> : null
  }
  return (
    <>
      {state.map((entry) => {
        const entryPath = joinPath(path, entry.name)
        if (entry.isDirectory) {
          const isOpen = !!expanded[entryPath]
          return (
            <div key={entryPath}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onToggleFolder(entryPath)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleFolder(entryPath) } }}
                className="flex cursor-pointer items-center gap-1.5 py-[3px] pr-2.5 text-[12px] text-app-text-secondary hover:bg-[var(--color-hover)]"
                style={{ paddingLeft: 10 + depth * 14 }}
              >
                <Right size={9} className={cx('shrink-0 transition-transform duration-100', isOpen && 'rotate-90')} />
                {isOpen ? <FolderOpen size={13} className="shrink-0 text-[#d6a15f]" /> : <Folder size={13} className="shrink-0 text-[#d6a15f]" />}
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
              </div>
              {isOpen && (
                <TreeChildren
                  path={entryPath}
                  depth={depth + 1}
                  dirCache={dirCache}
                  expanded={expanded}
                  activePath={activePath}
                  onToggleFolder={onToggleFolder}
                  onOpenFile={onOpenFile}
                />
              )}
            </div>
          )
        }
        const isActive = entryPath === activePath
        return (
          <div
            key={entryPath}
            role="button"
            tabIndex={0}
            onClick={() => onOpenFile(entryPath)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenFile(entryPath) } }}
            className={cx(
              'flex cursor-pointer items-center gap-1.5 py-[3px] pr-2.5 text-[12px] hover:bg-[var(--color-hover)]',
              isActive ? 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-app-text' : 'text-app-text-secondary',
            )}
            style={{ paddingLeft: 10 + depth * 14 + 15 }}
          >
            <FileTextOne size={12} className="shrink-0 opacity-75" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
          </div>
        )
      })}
    </>
  )
}

// A file's current content (as opposed to a diff) - one function for every
// source (a Read tool result, a tree-opened file), so "how do we show a
// file" has exactly one answer. Markdown renders as actual prose (real
// tables, headers, bold) via MarkdownView instead of raw ```|``` source -
// no amount of no-wrap/horizontal-scroll tuning on CodeBox makes a
// pipe-delimited table read well as text; a genuine <table> just doesn't
// have that problem. Anything else (code, JSON, plain text) stays CodeBox,
// where seeing the literal source is the point.
function ReadContent({ path, content, startLine = 1, sessionId }: { path: string; content: string; startLine?: number; sessionId?: string }) {
  if (languageForPath(path) === 'markdown') {
    return (
      <div className="px-1">
        <MarkdownView sessionId={sessionId}>{content}</MarkdownView>
      </div>
    )
  }
  return (
    <CodeBox
      content={content}
      copyable
      language={languageForPath(path)}
      lineNumbers
      // Same trick a partial read already gets elsewhere - the gutter shows
      // where in the real file this range sits, not 1-N.
      startingLineNumber={startLine}
      bare
      expanded
    />
  )
}

// The one place that decides what a tab's content looks like, regardless of
// how it was opened - a Read tool call, a Write/Edit tool call, or a click
// straight in the tree. All three used to go through separate rendering
// (renderToolBody's ReadToolView/WriteToolView/EditToolView for a tool tab,
// a bespoke PathFileView for a tree tab), which meant every display fix had
// to be applied twice and inevitably drifted apart.
function FileTabContent({ tab, fileContent, sessionId }: { tab: FilesTab; fileContent: Record<string, FileContentState>; sessionId?: string }) {
  if (tab.kind === 'path') {
    const state = fileContent[tab.path]
    if (state === 'loading' || state === undefined) {
      return <p className="p-2 text-[11px] text-app-text-muted">Loading…</p>
    }
    if (state === 'error') {
      return <ErrorPre content={`Couldn't read ${tab.path} - it may be binary, too large, or no longer exist.`} />
    }
    return <ReadContent path={tab.path} content={state} sessionId={sessionId} />
  }

  const tool = tab.tool
  const result = tool._result
  const filePath = typeof tool.input.file_path === 'string' ? tool.input.file_path : ''
  const category = toolCategory(tool.name)

  if (result?.isError && result.content) {
    return (
      <Section label="Error">
        <ErrorPre content={result.content} />
      </Section>
    )
  }

  if (category === 'read') {
    if (!result?.content) return <p className="p-2 text-[11px] text-app-text-muted">Waiting for the read to finish…</p>
    // result.content is never the file's raw bytes - it's a "File:/Lines:"
    // header plus every line prefixed with its own cat -n number (see
    // parseReadToolContent's own comment). Recover the real text (and the
    // real starting line number) before handing it to ReadContent, which
    // otherwise has no way to tell this apart from genuinely clean text.
    const offset = tool.input.offset as number | undefined
    const parsed = parseReadToolContent(result.content)
    return <ReadContent path={filePath} content={parsed.text} startLine={parsed.startLine ?? (offset != null ? offset + 1 : 1)} sessionId={sessionId} />
  }

  const diff = resolveDiffRows(tool)
  if (!diff || diff.rows.length === 0) {
    return <p className="p-2 text-[11px] text-app-text-muted">No changes to show yet.</p>
  }
  return <DiffView rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} expanded />
}
