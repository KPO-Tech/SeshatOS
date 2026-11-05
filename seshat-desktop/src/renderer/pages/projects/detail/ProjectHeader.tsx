import { Dropdown } from '@renderer/components/ui/Dropdown'
import type { ProjectSummary } from '@renderer/lib/projects'
import { Archive, Copy, Edit, FolderOpen, Left, MoreOne, Plus, Star } from '../icons'
import { ActivityMark, ProjectTile } from '../ProjectCard'
import { VsCodeIcon } from '../VsCodeIcon'
import { useTranslation } from 'react-i18next'

type Props = {
  project: ProjectSummary
  onBack: () => void
  onTogglePinned: () => void
  onOpenInEditor: () => void
  onOpenFolder: () => void
  onCopyPath: () => void
  onSettings: () => void
  onNewChat: () => void
  onToggleArchived: () => void
}

const SECONDARY =
  'flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'

/** The top of a project's page: its name and folder, a star to pin it, and the ways to open it elsewhere. */
export function ProjectHeader({ project, onBack, onTogglePinned, onOpenInEditor, onOpenFolder, onCopyPath, onSettings, onNewChat, onToggleArchived }: Props) {
  const { t } = useTranslation('shell')
  return (
    <header className="shrink-0 px-6 pt-4">
      <button type="button" onClick={onBack} className="mb-2 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <Left size={12} />
        {t('pages.projects.detail.projectHeader.projects')}
      </button>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectTile project={project} size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 truncate text-[20px] font-semibold leading-tight text-[var(--text-primary)]" title={project.name}>
                {project.name}
              </h1>
              <button
                type="button"
                onClick={onTogglePinned}
                aria-pressed={project.pinned}
                aria-label={project.pinned ? t('pages.projects.detail.projectHeader.unpinTheProject') : t('pages.projects.detail.projectHeader.pinTheProject')}
                title={project.pinned ? t('pages.projects.detail.projectHeader.unpin') : t('pages.projects.detail.projectHeader.pinToTheTopOf')}
                className={`flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent hover:bg-[var(--surface-hover)] ${project.pinned ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}
              >
                <Star theme={project.pinned ? 'filled' : 'outline'} size={15} />
              </button>
              <ActivityMark project={project} />
            </div>
            <div className="truncate font-mono text-[11.5px] text-[var(--text-muted)]" title={project.rootPath}>
              {project.rootPath}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex">
            <button type="button" onClick={onOpenInEditor} className="flex h-9 cursor-pointer items-center gap-2 rounded-l-lg border border-r-0 border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]">
              <VsCodeIcon size={15} />
              {t('pages.projects.detail.projectHeader.openInVsCode')}
            </button>
            <Dropdown
              label={t('pages.projects.detail.projectHeader.moreWaysToOpenThe')}
              items={[
                { id: 'folder', label: t('pages.projects.detail.projectHeader.openFolder'), icon: <FolderOpen size={14} />, onSelect: onOpenFolder },
                { id: 'copy', label: t('pages.projects.detail.projectHeader.copyThePath'), icon: <Copy size={14} />, onSelect: onCopyPath }
              ]}
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} aria-haspopup="menu" aria-label={t('pages.projects.detail.projectHeader.moreWaysToOpenThe')} className="flex h-9 w-8 cursor-pointer items-center justify-center rounded-r-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                  &#9662;
                </button>
              )}
            />
          </div>
          <button type="button" onClick={onSettings} className={SECONDARY}>
            <Edit size={14} />
            {t('pages.projects.detail.projectHeader.projectSettings')}
          </button>
          <Dropdown
            label={t('pages.projects.detail.projectHeader.actionsOfTheProject')}
            items={[
              { id: 'chat', label: t('pages.projects.detail.projectHeader.newChatInThisProject'), icon: <Plus size={14} />, onSelect: onNewChat },
              { id: 'archive', label: project.archived ? 'Restore from the archive' : 'Archive', icon: <Archive size={14} />, onSelect: onToggleArchived }
            ]}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} aria-haspopup="menu" aria-label={t('pages.projects.detail.projectHeader.actionsOfTheProject')} className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                <MoreOne size={16} />
              </button>
            )}
          />
        </div>
      </div>
    </header>
  )
}
