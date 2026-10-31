import { useEffect, useState } from 'react'
import { PROJECT_COLORS, type ProjectColor, type ProjectSummary } from '@renderer/lib/projects'
import { parseTags } from '@renderer/lib/projectsView'
import { PROJECT_COLOR_LABEL, PROJECT_COLOR_VALUE } from './projectColors'

type Props = {
  project: ProjectSummary
  onSave: (details: { name: string; description: string; tags: string[]; color: ProjectColor }) => void
  onClose: () => void
}

const FIELD = 'w-full rounded-lg border border-app-border-subtle font-normal bg-[var(--surface-root)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]'

/** What a person says about a project: its name, a line about it, tags to find it by, and its colour. */
export function EditProjectDialog({ project, onSave, onClose }: Props) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [tags, setTags] = useState(project.tags.join(', '))
  const [color, setColor] = useState<ProjectColor>(project.color)

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  function submit() {
    onSave({ name: name.trim() || project.name, description: description.trim(), tags: parseTags(tags), color })
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Edit the project"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="w-full max-w-[460px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]"
        style={{ animation: 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <h2 className="m-0 text-[17px] font-medium text-[var(--text-primary)]">Edit the project</h2>
        <p className="mb-0 mt-1 truncate font-mono text-[11.5px] text-[var(--text-muted)]" title={project.rootPath}>
          {project.rootPath}
        </p>

        <label className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus className={`${FIELD} mt-1`} />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-[var(--text-secondary)]">
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What this project is for" className={`${FIELD} mt-1 resize-none`} />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-[var(--text-secondary)]">
          Tags
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="data, analysis, market" className={`${FIELD} mt-1`} />
        </label>

        <div className="mt-3">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Colour</span>
          <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="Colour of the project">
            {PROJECT_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={PROJECT_COLOR_LABEL[option]}
                title={PROJECT_COLOR_LABEL[option]}
                onClick={() => setColor(option)}
                className="size-7 cursor-pointer rounded-full border-2 p-0"
                style={{ background: PROJECT_COLOR_VALUE[option], borderColor: color === option ? 'var(--text-primary)' : 'transparent' }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-[9px] border border-app-border-subtle bg-transparent px-3.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            Cancel
          </button>
          <button type="submit" className="cursor-pointer rounded-[9px] border-0 bg-[var(--accent-primary)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
