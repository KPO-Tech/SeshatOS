import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchSkillSources, saveSkillSources, scanSkillSource } from '@renderer/components/skills/skillsApi'
import type { ScanSkill, SkillSources } from '@renderer/components/skills/skillsTypes'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import { SkillRow } from './SkillRow'

type Review = { source: string; label: string; skills: ScanSkill[]; checked: Set<string> }

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// Nothing is imported until the person asks. They scan a source, see everything it holds with the skills checked, uncheck what they do
// not want and validate. Only the validated skills reach the agent, read where they are and never copied.
export function ExternalSkillSources() {
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

  const visible = useMemo(() => review?.skills ?? [], [review])

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
    if (done) setReview(null)
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
  }

  if (!sources) return null

  return (
    <ConfigCard
      title="Skills from other tools"
      description="Use the skills you already have in Claude Code or Codex, or in a folder of your own. Nothing is imported until you review and validate. The skills stay where they are: nothing is copied, and a change you make there applies at the next message."
    >
      {error && <div className="mb-3 rounded-md border border-[var(--accent-danger)]/40 px-3 py-2 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</div>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {sources.tools.map((tool) => (
          <SkillRow
            key={tool.id}
            title={tool.label}
            subtitle={tool.detected ? `${plural(tool.skill_count, 'skill')} found in ${tool.path}` : `Not found (${tool.path})`}
          >
            <div className="flex items-center gap-2">
              {tool.selected > 0 && <StatusPill tone="ok">{tool.selected} used</StatusPill>}
              <SoftButton disabled={!tool.detected || busy !== null} onClick={() => void scan(tool.id, tool.label)}>
                {busy === `scan:${tool.id}` ? 'Scanning...' : tool.selected > 0 ? 'Review' : 'Scan'}
              </SoftButton>
            </div>
          </SkillRow>
        ))}
        {sources.folders.map((folder) => (
          <SkillRow
            key={folder.path}
            title={folder.path}
            subtitle={folder.exists ? `${plural(folder.skill_count, 'skill')} found` : 'This folder no longer exists'}
          >
            <div className="flex items-center gap-2">
              {folder.selected > 0 && <StatusPill tone="ok">{folder.selected} used</StatusPill>}
              <SoftButton disabled={!folder.exists || busy !== null} onClick={() => void scan(folder.path, folder.path)}>
                {busy === `scan:${folder.path}` ? 'Scanning...' : folder.selected > 0 ? 'Review' : 'Scan'}
              </SoftButton>
              <SoftButton tone="danger" disabled={busy !== null} onClick={() => void removeFolder(folder.path)}>Remove</SoftButton>
            </div>
          </SkillRow>
        ))}
      </div>

      {review && (
        <div className="mt-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">Skills found in {review.label}</div>
              <div className="text-[11.5px] text-[var(--text-muted)]">{review.checked.size} of {visible.length} checked. The agent will use the checked ones.</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SoftButton onClick={() => setReview({ ...review, checked: new Set(visible.map((skill) => skill.name)) })}>Check all</SoftButton>
              <SoftButton onClick={() => setReview({ ...review, checked: new Set() })}>Uncheck all</SoftButton>
            </div>
          </div>
          <div className="mt-3 grid max-h-80 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto pr-1">
            {visible.map((skill) => (
              <label
                key={skill.name}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2"
              >
                <input type="checkbox" className="mt-0.5 shrink-0" checked={review.checked.has(skill.name)} onChange={() => toggle(skill.name)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{skill.title}</span>
                  <span className="line-clamp-2 break-words text-[11.5px] leading-4 text-[var(--text-muted)]">{skill.description}</span>
                  {skill.flag && <span className="mt-0.5 block text-[11.5px] leading-4 text-[var(--accent-warning)]">Unchecked by default: {skill.flag}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <SoftButton disabled={busy === 'validate'} onClick={() => setReview(null)}>Cancel</SoftButton>
            <SoftButton tone="primary" disabled={busy === 'validate'} onClick={() => void validate()}>
              {busy === 'validate' ? 'Validating...' : review.checked.size === 0 ? 'Stop using this source' : `Validate ${review.checked.size}`}
            </SoftButton>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-3">
        <Field label="Add a folder of skills">
          <TextInput value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="Full path to a folder of skills" />
        </Field>
        <SoftButton onClick={() => void browseFolder()}>Browse</SoftButton>
        <SoftButton tone="primary" disabled={!folderPath.trim() || busy !== null} onClick={() => void addFolder()}>Add</SoftButton>
      </div>
    </ConfigCard>
  )
}
