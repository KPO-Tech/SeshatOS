import { useCallback, useEffect, useState } from 'react'
import { fetchSkillRepos, fetchSkillSources, installSkillRepo, saveSkillSources, uninstallSkillRepo } from '@renderer/components/skills/skillsApi'
import type { CatalogEntry, RepoInfo, SkillSources } from '@renderer/components/skills/skillsTypes'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'

export function SkillsConfig() {
  const [installed, setInstalled] = useState<RepoInfo[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [sources, setSources] = useState<SkillSources | null>(null)
  const [folderPath, setFolderPath] = useState('')

  const load = useCallback(async () => {
    try {
      const repos = await fetchSkillRepos()
      // Dot-prefixed entries are the backend's own bookkeeping, not repos.
      setInstalled(repos.installed.filter((repo) => !repo.name.startsWith('.')))
      setCatalog(repos.catalog)
      setSources(await fetchSkillSources().catch(() => null))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load skills.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const featured = catalog.filter((entry) => !entry.installed)

  async function install(repoUrl: string, key: string) {
    setBusy(key)
    setMessage(null)
    try {
      await installSkillRepo(repoUrl)
      setUrl('')
      setMessage({ tone: 'ok', text: 'Repository installed.' })
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not install this repository.' })
    } finally {
      setBusy(null)
    }
  }

  // The skills of another tool are read where they lie: turning one on copies nothing, and an edit there is what the agent uses at its
  // next turn. Nothing is on until the person turns it on.
  async function changeSources(next: { claude_code?: boolean; codex?: boolean; folders?: string[] }) {
    if (!sources) return
    setBusy('sources')
    setMessage(null)
    try {
      const tool = (id: string) => sources.tools.find((item) => item.id === id)?.enabled ?? false
      setSources(await saveSkillSources({
        claude_code: next.claude_code ?? tool('claude_code'),
        codex: next.codex ?? tool('codex'),
        folders: next.folders ?? sources.folders.map((folder) => folder.path),
      }))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change the skill sources.' })
    } finally {
      setBusy(null)
    }
  }

  async function browseFolder() {
    const result = await window.seshat?.dialog?.openDirectory?.()
    if (result && !result.canceled && result.filePaths[0]) setFolderPath(result.filePaths[0])
  }

  async function addFolder() {
    if (!sources || !folderPath.trim()) return
    await changeSources({ folders: [...sources.folders.map((folder) => folder.path), folderPath.trim()] })
    setFolderPath('')
  }

  async function remove(repo: RepoInfo) {
    if (!window.confirm(`Remove the "${repo.name}" repository and its ${repo.skill_count} skill(s)?`)) return
    setBusy(repo.name)
    setMessage(null)
    try {
      await uninstallSkillRepo(repo.name)
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not remove this repository.' })
    } finally {
      setBusy(null)
    }
  }

  async function removeAll() {
    if (!window.confirm(`Remove all ${installed.length} installed repositories and their skills? This cannot be undone.`)) return
    setBusy('all')
    setMessage(null)
    let failed = 0
    for (const repo of installed) {
      try {
        await uninstallSkillRepo(repo.name)
      } catch {
        failed += 1
      }
    }
    await load()
    setMessage(failed > 0 ? { tone: 'error', text: `${failed} repositories could not be removed.` } : { tone: 'ok', text: 'All repositories removed.' })
    setBusy(null)
  }

  if (loading) return <ProviderEmptyState label="Loading skills..." />

  return (
    <div className="space-y-5">
      {message && (
        <div className={[
          'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      {sources && (
        <ConfigCard
          title="Skills from other tools"
          description="Let your agent use the skills you already have in Claude Code or Codex, or in a folder of your own. They are read where they are: nothing is copied, and a change you make there applies at the next message."
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {sources.tools.map((tool) => (
              <Row
                key={tool.id}
                title={tool.label}
                subtitle={tool.detected ? `${tool.skill_count} skill${tool.skill_count === 1 ? '' : 's'} in ${tool.path}` : `Not found (${tool.path})`}
              >
                <ToggleSwitch enabled={tool.enabled} onChange={(enabled) => { if (busy !== 'sources') void changeSources({ [tool.id]: enabled }) }} />
              </Row>
            ))}
            {sources.folders.map((folder) => (
              <Row
                key={folder.path}
                title={folder.path}
                subtitle={folder.exists ? `${folder.skill_count} skill${folder.skill_count === 1 ? '' : 's'}` : 'This folder no longer exists'}
              >
                <SoftButton tone="danger" disabled={busy === 'sources'} onClick={() => void changeSources({ folders: sources.folders.filter((item) => item.path !== folder.path).map((item) => item.path) })}>
                  Remove
                </SoftButton>
              </Row>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-3">
            <Field label="Add a folder of skills">
              <TextInput value={folderPath} onChange={(event) => setFolderPath(event.target.value)} placeholder="Full path to a folder of skills" />
            </Field>
            <SoftButton onClick={() => void browseFolder()}>Browse</SoftButton>
            <SoftButton tone="primary" disabled={!folderPath.trim() || busy === 'sources'} onClick={() => void addFolder()}>Add</SoftButton>
          </div>
        </ConfigCard>
      )}

      <ConfigCard title="Add skills" description="Download a Git repository of skills to use with your agents. Skills are stored locally on this machine.">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Field label="Repository URL">
            <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/skills" />
          </Field>
          <SoftButton tone="primary" disabled={!url.trim() || busy === 'url'} onClick={() => void install(url.trim(), 'url')}>
            {busy === 'url' ? 'Installing...' : 'Install'}
          </SoftButton>
        </div>
      </ConfigCard>

      {featured.length > 0 && (
        <ConfigCard title="Featured repositories" description="Curated collections you can install in one click.">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {featured.map((entry) => (
              <Row key={entry.name} title={entry.name} subtitle={entry.description}>
                <SoftButton disabled={busy === entry.name} onClick={() => void install(entry.url, entry.name)}>
                  {busy === entry.name ? 'Installing...' : 'Install'}
                </SoftButton>
              </Row>
            ))}
          </div>
        </ConfigCard>
      )}

      <ConfigCard
        title="Installed repositories"
        description="Repositories cloned to this machine. Removing one removes all of its skills."
        status={<StatusPill tone="muted">{installed.length}</StatusPill>}
        action={installed.length > 0 ? <SoftButton tone="danger" disabled={busy === 'all'} onClick={() => void removeAll()}>{busy === 'all' ? 'Removing...' : 'Remove all'}</SoftButton> : undefined}
      >
        {installed.length === 0 ? (
          <ProviderEmptyState label="No repositories installed." />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {installed.map((repo) => (
              <Row key={repo.name} title={repo.name} subtitle={`${repo.skill_count} skill${repo.skill_count === 1 ? '' : 's'}${repo.url ? ` · ${repo.url}` : ''}`}>
                <SoftButton tone="danger" disabled={busy === repo.name || busy === 'all'} onClick={() => void remove(repo)}>
                  {busy === repo.name ? 'Removing...' : 'Remove'}
                </SoftButton>
              </Row>
            ))}
          </div>
        )}
      </ConfigCard>
    </div>
  )
}

function Row({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        {subtitle && <div className="line-clamp-2 break-words text-[11.5px] leading-4 text-[var(--text-muted)]">{subtitle}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
