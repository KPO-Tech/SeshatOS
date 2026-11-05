import { useCallback, useEffect, useState } from 'react'
import { fetchSkillRepos, installSkillRepo, uninstallSkillRepo } from '@renderer/components/skills/skillsApi'
import { TASK_FINISHED_EVENT } from '@renderer/hooks/useTaskSync'
import { nudgeTasks } from '@renderer/stores/tasks'
import { SKILLS_CHANGED_EVENT } from '@renderer/components/skills/SkillReviewHost'
import type { RepoInfo } from '@renderer/components/skills/skillsTypes'
import { Add, FolderOpen } from '@icon-park/react'
import { ActionButton, Chip, SettingRow, SettingsCard, SettingsPage, StatusBadge } from '../../settings/kit'
import { TextInput } from '../knowledge/KnowledgePrimitives'
import { useTranslation } from 'react-i18next'

export function SkillsConfig() {
  const { t } = useTranslation('config')
  const [installed, setInstalled] = useState<RepoInfo[]>([])
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const repos = await fetchSkillRepos()
      // Dot-prefixed entries are the backend's own bookkeeping, not repos.
      setInstalled(repos.installed.filter((repo) => !repo.name.startsWith('.')))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load skills.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // An installation that ends in the background changes the list.
  useEffect(() => {
    const onFinished = () => void load()
    window.addEventListener(TASK_FINISHED_EVENT, onFinished)
    window.addEventListener(SKILLS_CHANGED_EVENT, onFinished)
    return () => {
      window.removeEventListener(TASK_FINISHED_EVENT, onFinished)
      window.removeEventListener(SKILLS_CHANGED_EVENT, onFinished)
    }
  }, [load])

  async function install(repoUrl: string) {
    setBusy('url')
    setMessage(null)
    try {
      const result = await installSkillRepo(repoUrl)
      setUrl('')
      nudgeTasks()
      // The download goes on in the background; the window of what the skills need opens when it ends.
      setMessage({ tone: 'ok', text: t('skills.skillsConfig.downloadingInBackground', { name: result.name }) })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not install this repository.' })
    } finally {
      setBusy(null)
    }
  }

  async function remove(repo: RepoInfo) {
    if (!window.confirm(t('skills.skillsConfig.confirmRemoveRepo', { name: repo.name, count: repo.skill_count }))) return
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
    if (!window.confirm(t('skills.skillsConfig.confirmRemoveAll', { count: installed.length }))) return
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
    setMessage(failed > 0 ? { tone: 'error', text: t('skills.skillsConfig.removeFailed', { count: failed }) } : { tone: 'ok', text: t('skills.skillsConfig.allRepositoriesRemoved') })
    setBusy(null)
  }

  if (loading) return <SettingsPage id="skills"><p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">{t('skills.skillsConfig.loading')}</p></SettingsPage>

  return (
    <SettingsPage id="skills" badge={<StatusBadge tone={installed.length > 0 ? 'ok' : 'muted'}>{`${installed.length} ${installed.length === 1 ? 'repository' : 'repositories'}`}</StatusBadge>}>
      {message && (
        <div className={[
          'rounded-xl border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      <SettingsCard title={t('skills.skillsConfig.addARepository')} icon={<Add theme="outline" size={16} />}>
        <SettingRow title={t('skills.skillsConfig.gitUrl')}>
          <TextInput className="h-9 w-[340px]" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/skills" />
          <ActionButton tone="primary" disabled={!url.trim() || busy === 'url'} onClick={() => void install(url.trim())}>
            {busy === 'url' ? t('skills.skillsConfig.installing') : t('skills.skillsConfig.install')}
          </ActionButton>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title={t('skills.skillsConfig.installed')}
        icon={<FolderOpen theme="outline" size={16} />}
        action={installed.length > 0 ? <ActionButton tone="danger" disabled={busy === 'all'} onClick={() => void removeAll()}>{busy === 'all' ? t('skills.skillsConfig.removing') : t('skills.skillsConfig.removeAll')}</ActionButton> : undefined}
      >
        {installed.length === 0 ? (
          <SettingRow title={t('skills.skillsConfig.noRepositoriesInstalled')} />
        ) : (
          installed.map((repo) => (
            <SettingRow key={repo.name} title={repo.name} hint={repo.url || undefined}>
              <Chip>{`${repo.skill_count} skill${repo.skill_count === 1 ? '' : 's'}`}</Chip>
              <ActionButton tone="danger" disabled={busy === repo.name || busy === 'all'} onClick={() => void remove(repo)}>
                {busy === repo.name ? t('skills.skillsConfig.removing') : t('skills.skillsConfig.remove')}
              </ActionButton>
            </SettingRow>
          ))
        )}
      </SettingsCard>
    </SettingsPage>
  )
}
