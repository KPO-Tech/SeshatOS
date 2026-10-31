import type { ReactNode } from 'react'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { formatBytes } from '@renderer/lib/projectFiles'
import type { ProjectSummary } from '@renderer/lib/projects'
import { relativeTime } from '@renderer/lib/projectsView'
import type { ChatSession } from '@renderer/stores/session'
import { Copy, Folder, FolderOpen, Time } from '../icons'
import type { Scan } from './useProjectScan'

type Props = {
  project: ProjectSummary
  scan: Scan | null
  sessions: ChatSession[]
  now: number
  onOpenFile: (path: string) => void
  onOpenSession: (id: string) => void
  onViewAllSessions: () => void
  onOpenInEditor: () => void
  onOpenFolder: () => void
  onCopyPath: () => void
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-[12px]">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

function ViewAll({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--accent-primary)] hover:underline">
      View all
    </button>
  )
}

function dateOf(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
}

/** The column beside a project's page: what its folder holds, the files and conversations changed last, and the tools to go further. */
export function InfoColumn({ project, scan, sessions, now, onOpenFile, onOpenSession, onViewAllSessions, onOpenInEditor, onOpenFolder, onCopyPath }: Props) {
  const root = project.rootPath
  const recentSessions = sessions.slice(0, 4)
  return (
    <div className="flex flex-col gap-3">
      <Card title="Project info">
        <Row label="Path">
          <span className="flex items-center justify-end gap-1.5">
            <span className="truncate font-mono text-[11px]" title={root}>
              {root}
            </span>
            <button type="button" onClick={onCopyPath} aria-label="Copy the path" title="Copy the path" className="flex shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Copy size={12} />
            </button>
          </span>
        </Row>
        <Row label="Files">{scan ? `${scan.count}${scan.capped ? '+' : ''}` : '-'}</Row>
        <Row label="Last active">{relativeTime(project.lastActiveAt, now) || 'No activity yet'}</Row>
        <Row label="Created">{scan ? dateOf(scan.createdMs) : '-'}</Row>
        <Row label="Size">{scan ? `${scan.capped ? '> ' : ''}${formatBytes(scan.bytes)}` : '-'}</Row>
      </Card>

      <Card title="Recent files">
        {!scan ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">Reading the folder...</p>
        ) : scan.recent.length === 0 ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">No files yet.</p>
        ) : (
          scan.recent.map((file) => (
            <button key={file.path} type="button" onClick={() => onOpenFile(file.path)} title={file.path} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-[var(--surface-hover)]">
              <span className="truncate text-[12.5px] text-[var(--text-primary)]">{file.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{relativeTime(new Date(file.modifiedMs).toISOString(), now)}</span>
            </button>
          ))
        )}
      </Card>

      <Card title="Recent sessions" action={sessions.length > recentSessions.length ? <ViewAll onClick={onViewAllSessions} /> : undefined}>
        {recentSessions.length === 0 ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">No conversations yet.</p>
        ) : (
          recentSessions.map((session) => (
            <button key={session.id} type="button" onClick={() => onOpenSession(session.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-[var(--surface-hover)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[var(--text-muted)]">
                  <Time size={12} />
                </span>
                <span className="truncate text-[12.5px] text-[var(--text-primary)]">{session.title || UNTITLED_SESSION_TITLE}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{relativeTime(session.updatedAt || session.createdAt, now)}</span>
            </button>
          ))
        )}
      </Card>

      <Card title="Project tools">
        <div className="flex gap-2">
          <button type="button" onClick={onOpenInEditor} className="flex min-w-0 flex-[1.6] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]">
            <Folder size={13} />
            <span className="truncate">Open in VS Code</span>
          </button>
          <button type="button" onClick={onOpenFolder} className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            <FolderOpen size={13} />
            <span className="truncate">Open folder</span>
          </button>
        </div>
      </Card>
    </div>
  )
}
