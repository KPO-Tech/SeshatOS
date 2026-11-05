import type { ReactNode } from 'react'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { formatBytes } from '@renderer/lib/projectFiles'
import type { ProjectSummary } from '@renderer/lib/projects'
import { relativeTime } from '@renderer/lib/projectsView'
import type { ChatSession } from '@renderer/stores/session'
import { Copy, FolderOpen, Time } from '../icons'
import type { Scan } from './useProjectScan'
import { VsCodeIcon } from '../VsCodeIcon'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('shell')
  return (
    <button type="button" onClick={onClick} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--accent-primary)] hover:underline">
      {t('pages.projects.detail.infoColumn.viewAll')}
    </button>
  )
}

function dateOf(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
}

/** The column beside a project's page: what its folder holds, the files and conversations changed last, and the tools to go further. */
export function InfoColumn({ project, scan, sessions, now, onOpenFile, onOpenSession, onViewAllSessions, onOpenInEditor, onOpenFolder, onCopyPath }: Props) {
  const { t } = useTranslation('shell')
  const root = project.rootPath
  const recentSessions = sessions.slice(0, 4)
  return (
    <div className="flex flex-col gap-3">
      <Card title={t('pages.projects.detail.infoColumn.projectInfo')}>
        <Row label={t('pages.projects.detail.infoColumn.path')}>
          <span className="flex items-center justify-end gap-1.5">
            <span className="truncate font-mono text-[11px]" title={root}>
              {root}
            </span>
            <button type="button" onClick={onCopyPath} aria-label={t('pages.projects.detail.infoColumn.copyThePath')} title={t('pages.projects.detail.infoColumn.copyThePath')} className="flex shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Copy size={12} />
            </button>
          </span>
        </Row>
        <Row label={t('pages.projects.detail.infoColumn.files')}>{scan ? `${scan.count}${scan.capped ? '+' : ''}` : '-'}</Row>
        <Row label={t('pages.projects.detail.infoColumn.lastActive')}>{relativeTime(project.lastActiveAt, now) || t('pages.projects.detail.infoColumn.noActivityYet')}</Row>
        <Row label={t('pages.projects.detail.infoColumn.created')}>{scan ? dateOf(scan.createdMs) : '-'}</Row>
        <Row label={t('pages.projects.detail.infoColumn.size')}>{scan ? `${scan.capped ? '> ' : ''}${formatBytes(scan.bytes)}` : '-'}</Row>
      </Card>

      <Card title={t('pages.projects.detail.infoColumn.recentFiles')}>
        {!scan ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">{t('pages.projects.detail.infoColumn.readingTheFolder')}</p>
        ) : scan.recent.length === 0 ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">{t('pages.projects.detail.infoColumn.noFilesYet')}</p>
        ) : (
          scan.recent.map((file) => (
            <button key={file.path} type="button" onClick={() => onOpenFile(file.path)} title={file.path} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-[var(--surface-hover)]">
              <span className="truncate text-[12.5px] text-[var(--text-primary)]">{file.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{relativeTime(new Date(file.modifiedMs).toISOString(), now)}</span>
            </button>
          ))
        )}
      </Card>

      <Card title={t('pages.projects.detail.infoColumn.recentSessions')} action={sessions.length > recentSessions.length ? <ViewAll onClick={onViewAllSessions} /> : undefined}>
        {recentSessions.length === 0 ? (
          <p className="m-0 text-[12px] text-[var(--text-muted)]">{t('pages.projects.detail.infoColumn.noConversationsYet')}</p>
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

      <Card title={t('pages.projects.detail.infoColumn.projectTools')}>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenInEditor} className="flex min-w-0 flex-[1.6] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]">
            <VsCodeIcon size={14} />
            <span className="truncate">{t('pages.projects.detail.infoColumn.openInVsCode')}</span>
          </button>
          <button type="button" onClick={onOpenFolder} className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            <FolderOpen size={13} />
            <span className="truncate">{t('pages.projects.detail.infoColumn.openFolder')}</span>
          </button>
        </div>
      </Card>
    </div>
  )
}
