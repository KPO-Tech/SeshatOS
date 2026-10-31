import { Archive, Check, Edit, Delete, Folder, FolderOpen, MoreOne, Pin, Play, Time } from './icons'
import type { ProjectSummary } from '@renderer/lib/projects'
import { fileCountLabel, relativeTime } from '@renderer/lib/projectsView'
import { Dropdown, type DropdownItem } from './Dropdown'
import { PROJECT_COLOR_VALUE, tileBackground } from './projectColors'
import type { FileCount } from './useFileCounts'

export type ProjectActions = {
  open: (project: ProjectSummary) => void
  startSession: (project: ProjectSummary) => void
  continueSession: (project: ProjectSummary) => void
  openFolder: (project: ProjectSummary) => void
  edit: (project: ProjectSummary) => void
  togglePinned: (project: ProjectSummary) => void
  toggleArchived: (project: ProjectSummary) => void
  remove: (project: ProjectSummary) => void
}

type Props = {
  project: ProjectSummary
  files: FileCount | undefined
  now: number
  actions: ProjectActions
}

const MAX_TAGS = 3

export function menuItems(project: ProjectSummary, actions: ProjectActions): DropdownItem[] {
  return [
    { id: 'edit', label: 'Edit details', icon: <Edit size={14} />, onSelect: () => actions.edit(project) },
    { id: 'pin', label: project.pinned ? 'Unpin' : 'Pin to the top', icon: <Pin size={14} />, onSelect: () => actions.togglePinned(project) },
    { id: 'folder', label: 'Open folder', icon: <FolderOpen size={14} />, onSelect: () => actions.openFolder(project) },
    { id: 'archive', label: project.archived ? 'Restore from the archive' : 'Archive', icon: <Archive size={14} />, onSelect: () => actions.toggleArchived(project) },
    // A project with conversations would come back at once, since its conversations name the folder: archiving is what removes it from view.
    ...(project.sessionCount === 0 ? [{ id: 'remove', label: 'Remove from the list', icon: <Delete size={14} />, danger: true, onSelect: () => actions.remove(project) }] : [])
  ]
}

/** The tags of a card: the first few, then how many more there are. */
export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, MAX_TAGS).map((tag) => (
        <span key={tag} className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-[12px] leading-none text-[var(--text-secondary)]">
          {tag}
        </span>
      ))}
      {tags.length > MAX_TAGS && (
        <span title={tags.slice(MAX_TAGS).join(', ')} className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-[12px] leading-none text-[var(--text-muted)]">
          +{tags.length - MAX_TAGS}
        </span>
      )}
    </div>
  )
}

/** The coloured folder of a project. */
export function ProjectTile({ project, size = 44 }: { project: ProjectSummary; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: tileBackground(project.color), color: PROJECT_COLOR_VALUE[project.color] }}
    >
      <Folder theme="filled" size={Math.round(size * 0.5)} />
    </span>
  )
}

/** What a project is doing: nothing to say for most, a quiet mark for one that is writing an answer now. */
export function ActivityMark({ project }: { project: ProjectSummary }) {
  if (project.activeSessionCount === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent-success)]" title="A conversation of this project is writing an answer">
      <span className="size-1.5 rounded-full bg-current" style={{ animation: 'pulse-opacity 1.1s ease-in-out infinite' }} />
      Working
    </span>
  )
}

export function ProjectCard({ project, files, now, actions }: Props) {
  const last = relativeTime(project.lastActiveAt, now)
  return (
    <article
      className={`group relative flex flex-col gap-3 rounded-2xl border bg-[var(--surface-panel)] p-4 transition-colors focus-within:border-[var(--accent-primary)] hover:border-[var(--accent-primary)] ${project.archived ? 'border-[var(--border-soft)] opacity-75' : 'border-[var(--border-soft)]'}`}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => actions.open(project)} aria-label={`Open ${project.name}`} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent p-0 text-left">
          <ProjectTile project={project} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-[var(--text-primary)]" title={project.name}>
                {project.name}
              </span>
              {project.pinned && <Pin size={12} className="shrink-0 text-[var(--accent-primary)]" />}
              <ActivityMark project={project} />
            </span>
            <span className="mt-0.5 block truncate font-mono text-[11.5px] text-[var(--text-muted)]" title={project.rootPath}>
              {project.rootPath}
            </span>
          </span>
        </button>
        <Dropdown
          label={`Actions of ${project.name}`}
          items={menuItems(project, actions)}
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} aria-label={`Actions of ${project.name}`} aria-haspopup="menu" className="flex size-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
              <MoreOne size={16} />
            </button>
          )}
        />
      </div>

      <p className="m-0 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[var(--text-secondary)]">{project.description || <span className="text-[var(--text-muted)]">No description yet.</span>}</p>

      <div className="min-h-[26px]">
        <TagList tags={project.tags} />
      </div>

      <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Folder size={13} />
          {fileCountLabel(files?.count, files?.capped ?? false)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Time size={13} />
          {last ? `Last active ${last}` : 'No activity yet'}
        </span>
      </div>

      <div className="mt-auto flex items-stretch gap-2.5">
        <div className="flex min-w-0 flex-1">
          <button
            type="button"
            onClick={() => actions.startSession(project)}
            className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-l-[10px] border border-r-0 border-[var(--border-soft)] bg-transparent px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors group-hover:border-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)] group-hover:text-white group-focus-within:border-[var(--accent-primary)] group-focus-within:bg-[var(--accent-primary)] group-focus-within:text-white"
          >
            <Play size={13} />
            <span className="truncate">Start session</span>
          </button>
          <Dropdown
            label="More ways to start"
            align="left"
            items={[
              { id: 'new', label: 'New chat in this project', icon: <Play size={14} />, onSelect: () => actions.startSession(project) },
              ...(project.lastSessionId ? [{ id: 'continue', label: 'Continue the last conversation', icon: <Check size={14} />, onSelect: () => actions.continueSession(project) }] : [])
            ]}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} aria-label="More ways to start a session" aria-haspopup="menu" className="flex h-full w-9 cursor-pointer items-center justify-center rounded-r-[10px] border border-l border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] transition-colors group-hover:border-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)] group-hover:text-white group-focus-within:border-[var(--accent-primary)] group-focus-within:bg-[var(--accent-primary)] group-focus-within:text-white">
                &#9662;
              </button>
            )}
          />
        </div>
        <button
          type="button"
          onClick={() => actions.openFolder(project)}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[var(--border-soft)] bg-transparent px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          <FolderOpen size={14} />
          <span className="truncate">Open folder</span>
        </button>
      </div>
    </article>
  )
}
