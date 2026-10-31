import { FolderOpen, MoreOne, Pin, Play } from './icons'
import type { ProjectSummary } from '@renderer/lib/projects'
import { fileCountLabel, relativeTime } from '@renderer/lib/projectsView'
import { Dropdown } from './Dropdown'
import { ActivityMark, menuItems, ProjectTile, TagList, type ProjectActions } from './ProjectCard'
import type { FileCount } from './useFileCounts'

type Props = {
  project: ProjectSummary
  files: FileCount | undefined
  now: number
  actions: ProjectActions
}

/** A project as one line, for the list view. */
export function ProjectRow({ project, files, now, actions }: Props) {
  const last = relativeTime(project.lastActiveAt, now)
  return (
    <li className={`group flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2 transition-colors focus-within:border-[var(--accent-primary)] hover:border-[var(--accent-primary)] ${project.archived ? 'opacity-75' : ''}`}>
      <button type="button" onClick={() => actions.open(project)} aria-label={`Open ${project.name}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left">
        <ProjectTile project={project} size={30} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]" title={project.name}>
              {project.name}
            </span>
            {project.pinned && <Pin size={12} className="shrink-0 text-[var(--accent-primary)]" />}
            <ActivityMark project={project} />
          </span>
          <span className="block truncate text-[11.5px] text-[var(--text-muted)]" title={project.description || project.rootPath}>
            {project.description || project.rootPath}
          </span>
        </span>
      </button>
      <div className="hidden shrink-0 lg:block">
        <TagList tags={project.tags.slice(0, 2)} />
      </div>
      <span className="hidden w-[84px] shrink-0 text-right text-[11px] text-[var(--text-muted)] md:block">{fileCountLabel(files?.count, files?.capped ?? false)}</span>
      <span className="hidden w-[140px] shrink-0 text-right text-[11px] text-[var(--text-muted)] md:block">{last ? `Active ${last}` : 'No activity yet'}</span>
      <button
        type="button"
        onClick={() => actions.startSession(project)}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-transparent px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] group-hover:border-[var(--accent-primary)]"
      >
        <Play size={12} />
        Start session
      </button>
      <button type="button" onClick={() => actions.openFolder(project)} aria-label={`Open the folder of ${project.name}`} title="Open folder" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
        <FolderOpen size={14} />
      </button>
      <Dropdown
        label={`Actions of ${project.name}`}
        items={menuItems(project, actions)}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} aria-label={`Actions of ${project.name}`} aria-haspopup="menu" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <MoreOne size={15} />
          </button>
        )}
      />
    </li>
  )
}
