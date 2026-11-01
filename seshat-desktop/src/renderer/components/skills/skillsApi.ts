import { api } from '@renderer/api/client'
import type { TaskInfo } from '@renderer/lib/tasks'
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

/**
 * Starts the download of a repository, in the background: the answer is the task that follows it. When it ends, what its skills need is read
 * with fetchSkillPlan, and nothing is installed until the person agrees to it.
 */
export function installSkillRepo(url: string) {
  return api.post<{ name: string; task: TaskInfo }>('/skills/repos', { url })
}

/** What the skills of a downloaded repository need, and whether the person has to agree to it before they can be used. */
export function fetchSkillPlan(name: string) {
  return api.get<InstallResult>(`/skills/repos/${encodeURIComponent(name)}/plan`)
}

/**
 * Starts, in the backend, the private environment of a repository (its Python, its Node packages), once the person has agreed to the plan.
 * It answers at once: the installation goes on in the background and its task says where it is.
 */
export function startSkillEnvironment(name: string) {
  return api.post<{ name: string; task: TaskInfo }>(`/skills/repos/${encodeURIComponent(name)}/environment`, {})
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
