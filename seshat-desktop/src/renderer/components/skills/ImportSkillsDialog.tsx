import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Code, Folder, Left, Plus, Terminal } from '@icon-park/react'
import { fetchSkillSources, saveSkillSources, scanSkillSource } from './skillsApi'
import type { ScanSkill, SkillSources } from './skillsTypes'

type Review = { source: string; label: string; skills: ScanSkill[]; checked: Set<string> }

type Props = {
  onClose: () => void
  /** Called when the skills the agent uses changed, so that the page lists them again. */
  onChanged: () => void
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function Tile({ children }: { children: ReactNode }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]">{children}</span>
}

const GHOST = 'h-8 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50'
const PRIMARY = 'h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50'

/**
 * Use the skills of other tools (Claude Code, Codex, a folder of the person's own). Nothing is imported until the person has scanned a
 * source, looked at what it holds and validated: only the checked skills reach the agent, read where they are and never copied.
 */
export function ImportSkillsDialog({ onClose, onChanged }: Props) {
  const [sources, setSources] = useState<SkillSources | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setSources(await fetchSkillSources().catch(() => null))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && !busy && (review ? setReview(null) : onClose())
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [busy, review, onClose])

  async function run<T>(key: string, action: () => Promise<T>) {
    setBusy(key)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return undefined
    } finally {
      setBusy(null)
    }
  }

  async function scan(source: string, label: string) {
    const result = await run(`scan:${source}`, () => scanSkillSource(source))
    if (!result) return
    setReview({ source, label, skills: result.skills, checked: new Set(result.skills.filter((skill) => skill.selected).map((skill) => skill.name)) })
  }

  async function validate() {
    if (!review) return
    const done = await run('validate', async () => {
      setSources(await saveSkillSources({ selection: { [review.source]: [...review.checked] } }))
      return true
    })
    if (done) {
      setReview(null)
      onChanged()
    }
  }

  function toggle(name: string) {
    setReview((current) => {
      if (!current) return current
      const checked = new Set(current.checked)
      if (checked.has(name)) checked.delete(name)
      else checked.add(name)
      return { ...current, checked }
    })
  }

  async function browseFolder() {
    const result = await window.seshat?.dialog?.openDirectory?.()
    if (result && !result.canceled && result.filePaths[0]) setFolderPath(result.filePaths[0])
  }

  async function addFolder() {
    if (!sources || !folderPath.trim()) return
    const added = await run('folder', async () => {
      setSources(await saveSkillSources({ folders: [...sources.folders.map((folder) => folder.path), folderPath.trim()] }))
      return true
    })
    if (added) setFolderPath('')
  }

  async function removeFolder(path: string) {
    if (!sources) return
    await run('folder', async () => {
      setSources(await saveSkillSources({ folders: sources.folders.filter((folder) => folder.path !== path).map((folder) => folder.path) }))
    })
    if (review?.source === path) setReview(null)
    onChanged()
  }

  const rows = sources
    ? [
        ...sources.tools.map((tool) => ({
          key: tool.id,
          title: tool.label,
          detail: tool.detected ? `${plural(tool.skill_count, 'skill')} in ${tool.path}` : `Not found (${tool.path})`,
          available: tool.detected,
          used: tool.selected,
          icon: tool.id === 'claude_code' ? <Terminal theme="outline" size={20} /> : <Code theme="outline" size={20} />,
          source: tool.id,
          label: tool.label,
          removable: false
        })),
        ...sources.folders.map((folder) => ({
          key: folder.path,
          title: folder.path.split(/[\\/]/).filter(Boolean).pop() ?? folder.path,
          detail: folder.exists ? `${plural(folder.skill_count, 'skill')} in ${folder.path}` : 'This folder no longer exists',
          available: folder.exists,
          used: folder.selected,
          icon: <Folder theme="outline" size={20} />,
          source: folder.path,
          label: folder.path,
          removable: true
        }))
      ]
    : []

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Import skills" className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
        {review ? (
          <>
            <button type="button" disabled={busy !== null} onClick={() => setReview(null)} className="mb-2 flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Left theme="outline" size={13} />
              Sources
            </button>
            <h2 className="m-0 truncate text-[16px] font-semibold text-[var(--text-primary)]">Skills found in {review.label}</h2>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="m-0 text-[12.5px] text-[var(--text-muted)]">
                {review.checked.size} of {review.skills.length} checked. The agent uses the checked ones.
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={GHOST} onClick={() => setReview({ ...review, checked: new Set(review.skills.map((skill) => skill.name)) })}>
                  Check all
                </button>
                <button type="button" className={GHOST} onClick={() => setReview({ ...review, checked: new Set() })}>
                  Uncheck all
                </button>
              </div>
            </div>
            <div className="no-scrollbar mt-3 grid min-h-0 flex-1 gap-1.5 overflow-y-auto">
              {review.skills.map((skill) => (
                <label key={skill.name} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-soft)] px-3 py-2.5 hover:bg-[var(--surface-hover)]">
                  <input type="checkbox" className="mt-0.5 shrink-0 accent-[var(--accent-primary)]" checked={review.checked.has(skill.name)} onChange={() => toggle(skill.name)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{skill.title}</span>
                    <span className="line-clamp-2 break-words text-[12px] leading-4 text-[var(--text-muted)]">{skill.description}</span>
                    {skill.flag && <span className="mt-0.5 block text-[11.5px] leading-4 text-[var(--accent-warning)]">Unchecked by default: {skill.flag}</span>}
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="m-0 mt-3 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={GHOST.replace('h-8', 'h-9')} disabled={busy === 'validate'} onClick={() => setReview(null)}>
                Cancel
              </button>
              <button type="button" className={PRIMARY} disabled={busy === 'validate'} onClick={() => void validate()}>
                {busy === 'validate' ? 'Validating...' : review.checked.size === 0 ? 'Stop using this source' : `Validate ${review.checked.size}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">Import skills from other tools</h2>
            <p className="m-0 mt-1 text-[12.5px] leading-5 text-[var(--text-muted)]">
              Use the skills you already have in Claude Code or Codex, or in a folder of your own. Nothing is imported until you look and validate. The skills stay where they are: nothing is copied.
            </p>

            <div className="no-scrollbar mt-4 grid min-h-0 flex-1 gap-2 overflow-y-auto">
              {!sources && <p className="m-0 text-[12.5px] text-[var(--text-muted)]">Looking for skills...</p>}
              {rows.map((row) => (
                <div key={row.key} className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] px-3 py-2.5">
                  <Tile>{row.icon}</Tile>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{row.title}</span>
                      {row.used > 0 && <span className="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--accent-success)_16%,transparent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent-success)]">{row.used} used</span>}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]" title={row.detail}>
                      {row.detail}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.removable && (
                      <button type="button" className={GHOST} disabled={busy !== null} onClick={() => void removeFolder(row.source)}>
                        Remove
                      </button>
                    )}
                    <button type="button" className={PRIMARY.replace('h-9', 'h-8')} disabled={!row.available || busy !== null} onClick={() => void scan(row.source, row.label)}>
                      {busy === `scan:${row.source}` ? 'Scanning...' : row.used > 0 ? 'Review' : 'Scan'}
                    </button>
                  </div>
                </div>
              ))}

              <div className="mt-1 rounded-xl border border-dashed border-[var(--border-strong)] p-3">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">Add a folder of skills</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={folderPath}
                    onChange={(event) => setFolderPath(event.target.value)}
                    placeholder="Full path to a folder of skills"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button type="button" className={GHOST.replace('h-8', 'h-9')} onClick={() => void browseFolder()}>
                    Browse
                  </button>
                  <button type="button" className={`${GHOST.replace('h-8', 'h-9')} flex items-center gap-1`} disabled={!folderPath.trim() || busy !== null} onClick={() => void addFolder()}>
                    <Plus theme="outline" size={13} />
                    Add
                  </button>
                </div>
              </div>
            </div>
            {error && <p className="m-0 mt-3 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" className={GHOST.replace('h-8', 'h-9')} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
