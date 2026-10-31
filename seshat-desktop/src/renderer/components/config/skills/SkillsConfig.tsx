import { useCallback, useEffect, useState } from 'react'
import { fetchSkillRepos, installSkillRepo, prepareSkillEnvironment, uninstallSkillRepo } from '@renderer/components/skills/skillsApi'
import type { CatalogEntry, InstallPlan, RepoInfo } from '@renderer/components/skills/skillsTypes'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { SkillInstallDialog } from '@renderer/components/skills/SkillInstallDialog'
import { SkillRow as Row } from './SkillRow'

export function SkillsConfig() {
  const [installed, setInstalled] = useState<RepoInfo[]>([])
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<{ name: string; plan: InstallPlan } | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const repos = await fetchSkillRepos()
      // Dot-prefixed entries are the backend's own bookkeeping, not repos.
      setInstalled(repos.installed.filter((repo) => !repo.name.startsWith('.')))
      setCatalog(repos.catalog)
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
      const result = await installSkillRepo(repoUrl)
      setUrl('')
      if (result.needs_environment) {
        // The skills wait for the person to agree to what they need: the window shows it before anything is installed.
        setReviewing({ name: result.name, plan: result.plan })
        return
      }
      setMessage({ tone: 'ok', text: 'Repository installed.' })
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not install this repository.' })
    } finally {
      setBusy(null)
    }
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

  async function finishInstall(name: string) {
    await prepareSkillEnvironment(name)
    setReviewing(null)
    setMessage({ tone: 'ok', text: 'Repository installed.' })
    await load()
  }

  async function cancelInstall(name: string) {
    setReviewing(null)
    try {
      await uninstallSkillRepo(name)
    } catch {
      // The repository stays marked as unfinished, and is replaced the next time it is installed.
    }
    await load()
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
      {reviewing && <SkillInstallDialog name={reviewing.name} plan={reviewing.plan} onConfirm={() => finishInstall(reviewing.name)} onCancel={() => void cancelInstall(reviewing.name)} />}
    </div>
  )
}
