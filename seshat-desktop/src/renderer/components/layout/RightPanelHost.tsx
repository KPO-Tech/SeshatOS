import { useRef } from 'react'
import { Book, Code, Computer, DocDetail, FilePdf, FileTextOne, Globe, Robot, FileWord, FileExcel, Terminal } from '@icon-park/react'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { useUIStore } from '@renderer/stores/ui'
import { useSessionStore } from '@renderer/stores/session'
import { ComputerPanel } from '@renderer/components/chat/panels/ComputerPanel'
import { FilesPanel } from '@renderer/components/chat/panels/FilesPanel'
import { SubagentPanel } from '@renderer/components/chat/panels/SubagentPanel'
import { PlanEditorPanel } from '@renderer/components/chat/panels/PlanEditorPanel'
import { PDFViewerPanel } from '@renderer/components/chat/panels/PDFViewerPanel'
import { ArtifactPreviewPanel } from '@renderer/components/chat/panels/ArtifactPreviewPanel'
import { DocxPreviewPanel } from '@renderer/components/chat/panels/DocxPreviewPanel'
import { XlsxPreviewPanel } from '@renderer/components/chat/panels/XlsxPreviewPanel'
import { PptxPreviewPanel } from '@renderer/components/chat/panels/PptxPreviewPanel'
import { BrowserPanel } from '@renderer/components/chat/panels/BrowserPanel'
import { TerminalPanel } from '@renderer/components/chat/panels/TerminalPanel'
import { EmptyState } from '@renderer/components/chat/panels/EmptyState'
import { KnowledgePanel } from '@renderer/components/chat/panels/KnowledgePanel'
import { flattenRightPanels } from '@renderer/stores/ui'
import { WindowCloseIcon, WindowMaximizeIcon } from '@renderer/components/ui/WindowControlIcon'
import type { RightPanelInstance, RightPanelKind, RightPanelColumn } from '@renderer/stores/ui'

export function RightPanelHost() {
  const rightColumns = useUIStore((s) => s.rightColumns)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const maximizedPanelId = useUIStore((s) => s.maximizedPanelId)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const toggleMaximizePanel = useUIStore((s) => s.toggleMaximizePanel)

  if (rightColumns.length === 0) return null

  const maximized = maximizedPanelId ? flattenRightPanels(rightColumns).find((p) => p.id === maximizedPanelId) : undefined

  if (maximized) {
    return (
      <div
        className="fixed bottom-0 right-0 top-[34px] z-[200] flex min-w-0 flex-col border-l border-app-border-subtle bg-app-bg shadow-[var(--shadow-large)]"
        style={{ left: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      >
        <PanelFrame
          panel={maximized}
          isMaximized
          onClose={() => closeRightPanel(maximized.id)}
          onToggleMaximize={() => toggleMaximizePanel(maximized.id)}
        />
      </div>
    )
  }

  return (
    <div className="relative z-40 flex h-full shrink-0 items-stretch">
      {rightColumns.map((column) => (
        <RightPanelColumnView key={column.id} column={column} />
      ))}
    </div>
  )
}

function RightPanelColumnView({ column }: { column: RightPanelColumn }) {
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const setRightPanelSplit = useUIStore((s) => s.setRightPanelSplit)
  const toggleMaximizePanel = useUIStore((s) => s.toggleMaximizePanel)
  const widthDrag = useRef<{ startX: number; startWidth: number } | null>(null)
  const splitDrag = useRef<{ startY: number; startSplit: number; containerHeight: number } | null>(null)

  function onWidthDragStart(e: React.MouseEvent) {
    e.preventDefault()
    widthDrag.current = { startX: e.clientX, startWidth: column.width }
    const onMove = (ev: MouseEvent) => {
      if (!widthDrag.current) return
      const delta = widthDrag.current.startX - ev.clientX
      setRightPanelWidth(column.id, widthDrag.current.startWidth + delta)
    }
    const onUp = () => {
      widthDrag.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function onSplitDragStart(e: React.MouseEvent, containerHeight: number) {
    e.preventDefault()
    splitDrag.current = { startY: e.clientY, startSplit: column.split, containerHeight }
    const onMove = (ev: MouseEvent) => {
      if (!splitDrag.current) return
      const delta = ev.clientY - splitDrag.current.startY
      setRightPanelSplit(column.id, splitDrag.current.startSplit + delta / splitDrag.current.containerHeight)
    }
    const onUp = () => {
      splitDrag.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="relative flex h-full min-w-0 flex-col border-l border-app-border-subtle bg-app-bg shadow-[var(--shadow-medium)]" style={{ width: `${column.width}px` }}>
      <div className="absolute bottom-0 left-[-4px] top-0 z-10 w-2 cursor-col-resize transition-colors duration-150 hover:bg-app-primary-subtle active:bg-app-primary-subtle" onMouseDown={onWidthDragStart} aria-label="Drag to resize" />
      {column.panels.map((panel, index) => (
        <div
          key={panel.id}
          className="relative flex min-h-0 flex-col"
          style={column.panels.length === 2 ? { flex: index === 0 ? column.split : 1 - column.split } : { flex: 1 }}
        >
          <PanelFrame
            panel={panel}
            isMaximized={false}
            onClose={() => closeRightPanel(panel.id)}
            onToggleMaximize={() => toggleMaximizePanel(panel.id)}
          />
          {column.panels.length === 2 && index === 0 && (
            <div
              className="absolute bottom-[-4px] left-0 right-0 z-20 h-2 cursor-row-resize transition-colors duration-150 hover:bg-app-primary-subtle active:bg-app-primary-subtle"
              onMouseDown={(e) => onSplitDragStart(e, e.currentTarget.parentElement?.parentElement?.clientHeight ?? 600)}
              aria-label="Drag to resize"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function PanelFrame({
  panel,
  isMaximized,
  onClose,
  onToggleMaximize,
}: {
  panel: RightPanelInstance
  isMaximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
}) {
  // The plan panel renders its own full header (title, Edit toggle, status
  // badge, maximize, close) in one row - it owns state (edit mode, plan
  // status) that this generic frame has no access to, and a second
  // independent header here would just repeat the title underneath it.
  if (panel.kind === 'plan') {
    return (
      <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
        <PlanEditorPanelHost panel={panel} isMaximized={isMaximized} onClose={onClose} onToggleMaximize={onToggleMaximize} />
      </aside>
    )
  }

  // Files owns its whole header (burger to toggle the tree, the open file's
  // name/badge, maximize/close all on one row) instead of the generic frame
  // below plus a second inner header - see FilesPanel.tsx.
  if (panel.kind === 'files') {
    return (
      <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
        <FilesPanel
          sessionId={panel.sessionId ?? ''}
          focusToolId={panel.focusToolId}
          isMaximized={isMaximized}
          onClose={onClose}
          onToggleMaximize={onToggleMaximize}
        />
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app-surface">
      <div className="flex min-h-[46px] shrink-0 items-center justify-between gap-2 border-b border-app-border-subtle px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border border-app-border-subtle bg-app-primary-subtle text-app-primary">{renderPanelIcon(panel.kind)}</span>
          <div className="min-w-0">
            <h2 className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-base)] font-bold text-app-text">{panel.title}</h2>
            {panel.sourceLabel && <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-2xs)] font-semibold uppercase tracking-[0.06em] text-app-text-muted">{panel.sourceLabel}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text" type="button" onClick={onToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
            <WindowMaximizeIcon />
          </button>
          <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text" type="button" onClick={onClose}>
            <WindowCloseIcon />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-app-surface p-3">{renderPanelBody(panel)}</div>
    </aside>
  )
}

function renderPanelIcon(kind: RightPanelKind) {
  switch (kind) {
    case 'browser':
      return <Globe size={11} />
    case 'terminal':
      return <Terminal size={11} />
    case 'subagent':
      return <Robot size={11} />
    case 'computer':
      return <Computer size={11} />
    case 'files':
      return <FileTextOne size={11} />
    case 'knowledge':
      return <Book size={11} />
    case 'plan':
      return <DocDetail size={11} />
    case 'pdf':
      return <FilePdf size={11} />
    case 'docx':
      return <FileWord size={11} />
    case 'xlsx':
      return <FileExcel size={11} />
    case 'pptx':
      return <DocDetail size={11} />
    case 'artifact':
      return <Code size={11} />
    default:
      return <FileTextOne size={11} />
  }
}

function renderPanelBody(panel: RightPanelInstance) {
  switch (panel.kind) {
    case 'computer':
      return <ComputerPanel sessionId={panel.sessionId ?? ''} focusToolId={panel.focusToolId} />
    case 'markdown':
      if (!panel.markdown) {
        return (
          <EmptyState
            title="Markdown preview"
            description="Generated markdown content will render here when a note or document is opened."
          />
        )
      }
      return panel.plainText ? (
        <pre className="m-0 whitespace-pre-wrap rounded-app-md border border-app-border-subtle bg-[var(--color-code-bg)] p-3 font-mono text-[var(--font-size-sm)] leading-relaxed text-[var(--color-code-fg)]">{panel.markdown}</pre>
      ) : (
        <MarkdownView sessionId={panel.sessionId}>{panel.markdown}</MarkdownView>
      )
    case 'browser':
      return <BrowserPanel url={panel.browserUrl} contextId={panel.sessionId ? `session:${panel.sessionId}` : 'chat'} />
    case 'terminal':
      return <TerminalPanel sessionId={panel.sessionId} focusToolId={panel.focusToolId} />
    case 'knowledge':
      return <KnowledgePanel results={panel.knowledgeResults ?? []} />
    case 'subagent':
      return <SubagentPanel sessionId={panel.sessionId ?? ''} toolUseId={panel.subagentToolUseId ?? ''} />
    case 'pdf':
      return panel.documentFileId ? (
        <PDFViewerPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="PDF preview" description="This PDF couldn't be opened." />
      )
    case 'docx':
      return panel.documentFileId ? (
        <DocxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Document preview" description="This document couldn't be opened." />
      )
    case 'xlsx':
      return panel.documentFileId ? (
        <XlsxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Spreadsheet preview" description="This spreadsheet couldn't be opened." />
      )
    case 'pptx':
      return panel.documentFileId ? (
        <PptxPreviewPanel fileId={panel.documentFileId} filename={panel.title} />
      ) : (
        <EmptyState title="Presentation preview" description="This presentation couldn't be opened." />
      )
    case 'artifact':
      return panel.artifactPreviewId ? (
        <ArtifactPreviewPanel artifactId={panel.artifactPreviewId} filename={panel.title} />
      ) : (
        <EmptyState title="Artifact preview" description="This artifact couldn't be opened." />
      )
    default:
      return (
        <EmptyState
          title={panel.title || 'Right panel'}
          description={panel.note || 'Supplementary content will appear here.'}
        />
      )
  }
}

// Subscribes reactively to the plan session's pendingPermission, unlike a
// plain getState() snapshot (the previous implementation) which reads the
// store once and never updates again - since renderPanelBody is an ordinary
// function, not a component, that snapshot would only ever refresh if some
// unrelated state change happened to re-render RightPanelHost. A permission
// resolved elsewhere (e.g. via handlePermissionDecision in Conversation.tsx)
// could then leave this panel showing a stale "Proceed" button after the
// user had already approved or denied it.
function PlanEditorPanelHost({
  panel,
  isMaximized,
  onClose,
  onToggleMaximize,
}: {
  panel: RightPanelInstance
  isMaximized: boolean
  onClose: () => void
  onToggleMaximize: () => void
}) {
  const planSessionId = panel.sessionId ?? ''
  const pendingPermission = useSessionStore((s) =>
    planSessionId ? s.getAgentState(planSessionId).pendingPermission : null
  )
  const isExitPlanMode = pendingPermission?.toolName === 'exit_plan_mode'
  const pendingPerm = isExitPlanMode
    ? { toolUseId: pendingPermission.toolUseId }
    : null
  // No structured PlanDocument (agent called exit_plan_mode without
  // submit_plan): fall back to the raw plan text so PlanEditorPanel can
  // still render the same annotate/comment review experience.
  const rawContent = !panel.planId && isExitPlanMode
    ? (pendingPermission.toolInput.plan as string | undefined) ?? ''
    : undefined

  return (
    <PlanEditorPanel
      planId={panel.planId}
      sessionId={planSessionId}
      pendingPermission={pendingPerm}
      rawContent={rawContent}
      isMaximized={isMaximized}
      onClose={onClose}
      onToggleMaximize={onToggleMaximize}
    />
  )
}
