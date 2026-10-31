import { api } from '@renderer/api/client'
import type { CatalogEntry, InstallResult, RepoInfo, ScanResult, Skill, SkillSources, SkillSourcesChoice, TreeNode } from './skillsTypes'

export async function fetchSkills() {
  const result = await api.get<{ skills: Skill[] }>('/skills')
  return result.skills ?? []
}

export function setSkillEnabled(name: string, enabled: boolean) {
  return api.put(`/skills/${encodeURIComponent(name)}`, { enabled })
}

export function deleteSkill(name: string) {
  return api.delete(`/skills/${encodeURIComponent(name)}`)
}

export async function fetchSkillContent(name: string) {
  const result = await api.get<{ content: string }>(`/skills/${encodeURIComponent(name)}/content`)
  return result.content ?? ''
}

export async function fetchSkillTree(name: string) {
  const result = await api.get<{ tree: TreeNode[] }>(`/skills/${encodeURIComponent(name)}/tree`)
  return result.tree ?? []
}

export async function fetchSkillFile(name: string, path: string) {
  const result = await api.get<{ content: string }>(`/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`)
  return result.content ?? ''
}

// Admin-only on the backend - callers should treat a failure as "no
// repository management available" rather than an error to surface.
export async function fetchSkillRepos() {
  const result = await api.get<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>('/skills/repos')
  return { installed: result.installed ?? [], catalog: result.catalog ?? [] }
}

/** Clones the repository and reads what its skills need. Nothing is installed yet when a plan comes back (see prepareSkillEnvironment). */
export function installSkillRepo(url: string) {
  return api.post<InstallResult>('/skills/repos', { url })
}

/** Makes the private environment of a repository (its Python, its Node packages), once the person has agreed to the plan. */
export function prepareSkillEnvironment(name: string) {
  return api.post(`/skills/repos/${encodeURIComponent(name)}/environment`, {})
}

export function uninstallSkillRepo(name: string) {
  return api.delete(`/skills/repos/${encodeURIComponent(name)}`)
}

/** The skill folders of other tools and the folders the person added, as the agent reads them: in place, never copied. */
export function fetchSkillSources() {
  return api.get<SkillSources>('/skills/sources')
}

/** Folders (when given) and, by source, exactly the skills the person validated. Nothing is imported before this. */
export function saveSkillSources(choice: SkillSourcesChoice) {
  return api.put<SkillSources>('/skills/sources', choice)
}

/** Lists what a source holds, for review. Reads only. */
export function scanSkillSource(source: string) {
  return api.post<ScanResult>('/skills/sources/scan', { source })
}
